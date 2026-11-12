// The policy: one set of pure functions that every agent's hook calls.
// Input is a normalized action; output is a verdict:
//   { decision: 'allow' | 'ask' | 'deny', rule, reason }
//
// Every reason is written for the model that will read it: it says what was
// blocked, why, and what to do instead. A refusal with no next step makes the
// agent probe for a way around it.

import { analyze, commandName } from './shell.mjs';
import { matchAny, normalizePath } from './glob.mjs';

export const RULES = {
  'env-dump': {
    default: 'deny',
    reason:
      'Printing the whole environment can leak tokens into the transcript. Read one non-secret variable by name (for example `printenv NODE_ENV`), or ask the user for the value you need.',
  },
  'secret-echo': {
    default: 'deny',
    reason:
      'This prints a variable whose name looks like a credential. Use the variable without printing it, or test that it is set with `[ -n "$NAME" ] && echo set`.',
  },
  'secret-file': {
    default: 'deny',
    reason:
      'This path holds credentials. Do not read, copy or upload it. Read the example file (such as `.env.example`) for the variable names, or ask the user.',
  },
  'destructive-rm': {
    default: 'deny',
    reason:
      'Recursive forced delete of a root, home, repository or wildcard target. Delete the specific paths you created instead, by name.',
  },
  'git-force-push': {
    default: 'ask',
    reason: 'Force-pushing rewrites remote history that other people may have pulled. The user must confirm.',
  },
  'git-destructive': {
    default: 'ask',
    reason:
      'This discards work that git cannot restore (uncommitted changes, untracked files or unmerged commits). The user must confirm. Consider `git stash` first.',
  },
  'skip-verification': {
    default: 'deny',
    reason:
      'This bypasses the commit and push checks. Read the failure, fix its cause, and run the command again without the bypass.',
  },
  'pipe-to-shell': {
    default: 'ask',
    reason:
      'This runs a script straight from the network. Download it to a file, read it, and then run it, or let the user confirm.',
  },
  'protected-path': {
    default: 'ask',
    reason: 'This path is protected by the harness.',
  },
};

export const DEFAULT_POLICY = {
  rules: Object.fromEntries(Object.entries(RULES).map(([id, r]) => [id, r.default])),
  secretPaths: [
    '.env',
    '.env.*',
    '*.pem',
    '*.p12',
    '*.pfx',
    '*.keystore',
    'id_rsa',
    'id_dsa',
    'id_ecdsa',
    'id_ed25519',
    '.ssh/**',
    '.aws/credentials',
    '.azure/**',
    '.config/gcloud/**',
    '.kube/config',
    '.docker/config.json',
    '.npmrc',
    '.pypirc',
    '.netrc',
    '.git-credentials',
    '*.tfvars',
    'credentials.json',
    'service-account*.json',
    'secrets.json',
    'secrets.yaml',
    'secrets.yml',
  ],
  secretPathExceptions: ['.env.example', '.env.sample', '.env.template', '.env.dist', '.env.defaults', '*.pub', '.ssh/known_hosts', '.ssh/config'],
  // Checked for file-writing tools and shell redirects.
  protectedPaths: [
    { glob: '.git/**', decision: 'deny', reason: 'Do not write inside `.git/`. Use git commands.' },
    {
      glob: '{lockfile}',
      decision: 'deny',
      reason: 'Lockfiles are generated. Change the manifest and run the package manager instead of editing the lockfile.',
    },
    {
      glob: '{harness}',
      decision: 'ask',
      reason:
        'This file is part of the guardrails that supervise you. A change to it needs the user to confirm. Say what you want to change and why.',
    },
  ],
  lockfiles: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'Cargo.lock', 'poetry.lock', 'uv.lock', 'Gemfile.lock', 'composer.lock', 'go.sum'],
  harnessPaths: [
    '.agents/harness/**',
    '.agents/harness.json',
    '.claude/settings.json',
    '.claude/settings.local.json',
    '.cursor/hooks.json',
    '.github/hooks/**',
    '.codex/hooks.json',
    '.codex/config.toml',
    '.gemini/settings.json',
    '.opencode/plugins/**',
  ],
  custom: [],
};

const SEVERITY = { allow: 0, ask: 1, deny: 2 };
const SECRET_VAR = /\$\{?(?:env:)?[A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CREDENTIAL)[A-Za-z0-9_]*/i;
const READERS = new Set([
  'cat', 'tac', 'less', 'more', 'head', 'tail', 'nl', 'bat', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'awk', 'sed', 'cut', 'sort', 'uniq',
  'strings', 'xxd', 'od', 'hexdump', 'base64', 'openssl', 'jq', 'yq', 'cp', 'scp', 'rsync', 'curl', 'wget', 'tar', 'zip', 'gzip',
  'source', '.', 'type', 'get-content', 'gc', 'select-string', 'sls', 'copy-item', 'copy', 'vim', 'vi', 'nano', 'code', 'diff', 'wc',
  'python', 'python3', 'node', 'ruby', 'perl', 'dotenv', 'xargs', 'tee', 'ssh-add', 'gpg',
]);
const NET_FETCHERS = new Set(['curl', 'wget', 'iwr', 'invoke-webrequest', 'irm', 'invoke-restmethod', 'fetch']);
const INTERPRETERS = /^(sh|bash|zsh|dash|ksh|fish|python\d*(\.\d+)?|node|deno|bun|perl|ruby|php|pwsh|powershell|iex|invoke-expression|sudo)$/;
const RM_ROOTS = /^(\/|\/\*|~|~\/|~\/\*|\$home|\$home\/|\$home\/\*|\$\{home\}|\$env:userprofile|%userprofile%|\.|\.\/|\.\.|\.\.\/|\*|\.\/\*|\.\*|\.git|\.git\/|[a-z]:[\\/]?|[a-z]:[\\/]\*)$/i;

function expandProtected(policy) {
  return policy.protectedPaths.flatMap((p) => {
    if (p.glob === '{lockfile}') return policy.lockfiles.map((glob) => ({ ...p, glob }));
    if (p.glob === '{harness}') return policy.harnessPaths.map((glob) => ({ ...p, glob }));
    return [p];
  });
}

export function isSecretPath(path, policy) {
  const p = normalizePath(path);
  if (matchAny(p, policy.secretPathExceptions)) return false;
  return Boolean(matchAny(p, policy.secretPaths));
}

function shortFlags(args) {
  return args.filter((a) => /^-[A-Za-z]+$/.test(a)).join('');
}

function gitSubcommand(args) {
  const valueFlags = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);
  const globals = [];
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    globals.push(args[i]);
    if (valueFlags.has(args[i])) globals.push(args[++i] ?? '');
    i++;
  }
  return { sub: args[i], rest: args.slice(i + 1), globals };
}

// Each check returns a rule id (optionally with detail) or null.
function checkCommand(cmd, policy) {
  const hits = [];
  const hit = (rule, detail) => hits.push({ rule, detail });
  const { name, args } = cmd;
  const lower = args.map((a) => a.toLowerCase());
  const positional = args.filter((a) => !a.startsWith('-'));

  // --- env-dump
  if (name === 'env') hit('env-dump');
  if (name === 'printenv' && positional.length === 0) hit('env-dump');
  if (name === 'export' && (positional.length === 0 || lower.includes('-p'))) hit('env-dump');
  if ((name === 'declare' || name === 'typeset') && positional.length === 0 && /[xp]/.test(shortFlags(args))) hit('env-dump');
  if (name === 'set' && args.length === 0) hit('env-dump');
  if (name === 'compgen' && /[ev]/.test(shortFlags(args))) hit('env-dump');
  if (['get-childitem', 'gci', 'dir', 'ls', 'get-item', 'gi'].includes(name) && lower.some((a) => /^env:/.test(a))) hit('env-dump');
  if (lower.some((a) => a.includes('getenvironmentvariables'))) hit('env-dump');
  if (args.some((a) => /\/proc\/[^/]+\/environ/.test(a))) hit('env-dump');

  // --- secret-echo
  if (['echo', 'printf', 'write-host', 'write-output'].includes(name) && args.some((a) => SECRET_VAR.test(a))) hit('secret-echo');

  // --- secret-file
  const fileArgs = (list) => list.map((a) => a.replace(/^[^=@]*[=@]/, '').replace(/^@/, '')).concat(list);
  if (READERS.has(name)) {
    // For copy-like commands only the sources are read: `cp .env.example .env` is fine.
    const copyLike = ['cp', 'copy-item', 'copy', 'rsync', 'scp'].includes(name) && positional.length > 1;
    // For search and filter commands the first operand is a pattern or a script, not a file.
    const patternFirst = ['grep', 'egrep', 'fgrep', 'rg', 'ag', 'sed', 'awk', 'jq', 'yq', 'select-string', 'sls'].includes(name);
    const skip = copyLike ? positional[positional.length - 1] : patternFirst ? positional[0] : undefined;
    const read = skip === undefined ? args : args.filter((a, i) => i !== args.indexOf(skip));
    const found = fileArgs(read).find((a) => isSecretPath(a, policy));
    if (found) hit('secret-file', found);
  }
  for (const r of cmd.redirects) {
    if (r.op === '<' && isSecretPath(r.target, policy)) hit('secret-file', r.target);
  }

  // --- destructive-rm
  if (name === 'rm') {
    const f = shortFlags(args);
    const recursive = /[rR]/.test(f) || lower.includes('--recursive');
    const force = /f/.test(f) || lower.includes('--force');
    if (lower.includes('--no-preserve-root')) hit('destructive-rm');
    else if (recursive && force && positional.some((t) => RM_ROOTS.test(t))) hit('destructive-rm');
  }
  if (['remove-item', 'ri', 'rmdir', 'rd', 'del', 'erase'].includes(name)) {
    const recursive = lower.some((a) => /^-r(ecurse)?$|^\/s$/.test(a));
    const force = lower.some((a) => /^-fo(rce)?$|^-f$|^\/q$/.test(a));
    if (recursive && force && args.some((t) => RM_ROOTS.test(t))) hit('destructive-rm');
  }

  // --- git
  if (name === 'git') {
    const { sub, rest, globals } = gitSubcommand(args);
    const restLower = rest.map((a) => a.toLowerCase());
    if (globals.some((g) => /^core\.hookspath=/i.test(g))) hit('skip-verification');
    if (sub === 'push') {
      if (restLower.some((a) => a === '--force' || a === '-f' || a.startsWith('--force-with-lease') || a.startsWith('--force-if-includes') || /^\+\S/.test(a))) hit('git-force-push');
      if (restLower.includes('--no-verify')) hit('skip-verification');
    }
    if (['commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'am'].includes(sub)) {
      if (restLower.includes('--no-verify')) hit('skip-verification');
      else if (sub === 'commit' && rest.some((a) => /^-[A-Za-z]*n[A-Za-z]*$/.test(a))) hit('skip-verification');
    }
    if (sub === 'reset' && restLower.includes('--hard')) hit('git-destructive');
    if (sub === 'clean' && (/f/.test(shortFlags(rest)) || restLower.includes('--force'))) hit('git-destructive');
    if (sub === 'checkout' && (rest.includes('--') || rest.includes('.') || restLower.includes('--force') || /f/.test(shortFlags(rest)))) hit('git-destructive');
    if (sub === 'restore' && !restLower.includes('--staged')) hit('git-destructive');
    if (sub === 'branch' && (/D/.test(shortFlags(rest)) || (restLower.includes('--delete') && restLower.includes('--force')))) hit('git-destructive');
    if (sub === 'stash' && ['drop', 'clear'].includes(restLower[0])) hit('git-destructive');
  }
  if (cmd.assignments.some((a) => /^(HUSKY=0|HUSKY_SKIP_HOOKS=1|SKIP_HOOKS=1|LEFTHOOK=0|PRE_COMMIT_ALLOW_NO_CONFIG=1)$/i.test(a))) hit('skip-verification');

  // --- pipe-to-shell
  if (cmd.pipedFrom && INTERPRETERS.test(name) && NET_FETCHERS.has(cmd.pipedFrom.name)) hit('pipe-to-shell');

  // --- shell writes into protected paths
  const writeTargets = cmd.redirects.filter((r) => r.op.startsWith('>')).map((r) => r.target);
  if (name === 'tee' || name === 'set-content' || name === 'out-file' || name === 'add-content') writeTargets.push(...positional);
  if (name === 'sed' && args.some((a) => /^-[A-Za-z]*i/.test(a) || a === '--in-place')) writeTargets.push(...positional.slice(1));
  for (const t of writeTargets) {
    const p = protectedMatch(t, policy);
    if (p) hits.push({ rule: 'protected-path', detail: t, override: p });
  }

  return hits;
}

function protectedMatch(path, policy) {
  return expandProtected(policy).find((p) => matchAny(path, [p.glob])) ?? null;
}

function verdict(rule, policy, { detail, override } = {}) {
  if (policy.rules[rule] === 'off' || policy.rules[rule] === 'allow') return null;
  const decision = override?.decision && rule === 'protected-path' ? override.decision : policy.rules[rule] ?? RULES[rule]?.default ?? 'deny';
  if (decision === 'off' || decision === 'allow') return null;
  const base = override?.reason ?? RULES[rule]?.reason ?? '';
  const where = detail ? ` (${detail})` : '';
  const head = decision === 'deny' ? 'Blocked by harness policy' : 'Needs confirmation under harness policy';
  return { decision, rule, reason: `${head} [${rule}]${where}: ${base}` };
}

function worst(verdicts) {
  return verdicts.filter(Boolean).sort((a, b) => SEVERITY[b.decision] - SEVERITY[a.decision])[0] ?? { decision: 'allow', rule: null, reason: '' };
}

export function evaluateShell(command, policy = DEFAULT_POLICY) {
  const verdicts = [];
  for (const c of policy.custom ?? []) {
    if (new RegExp(c.pattern, c.flags ?? 'i').test(command)) {
      const head = c.decision === 'deny' ? 'Blocked by harness policy' : 'Needs confirmation under harness policy';
      verdicts.push({ decision: c.decision, rule: c.id, reason: `${head} [${c.id}]: ${c.reason}` });
    }
  }
  for (const cmd of analyze(command)) {
    for (const h of checkCommand(cmd, policy)) verdicts.push(verdict(h.rule, policy, h));
  }
  return worst(verdicts);
}

export function evaluatePaths(kind, paths, policy = DEFAULT_POLICY) {
  const verdicts = [];
  for (const path of paths) {
    if (isSecretPath(path, policy)) verdicts.push(verdict('secret-file', policy, { detail: normalizePath(path) }));
    if (kind === 'write') {
      const p = protectedMatch(path, policy);
      if (p) verdicts.push(verdict('protected-path', policy, { detail: normalizePath(path), override: p }));
    }
  }
  return worst(verdicts);
}

/** action: { kind: 'shell' | 'read' | 'write' | 'other', command?, paths? } */
export function evaluate(action, policy = DEFAULT_POLICY) {
  if (action.kind === 'shell') return evaluateShell(action.command ?? '', policy);
  if (action.kind === 'read' || action.kind === 'write') return evaluatePaths(action.kind, action.paths ?? [], policy);
  return { decision: 'allow', rule: null, reason: '' };
}

/** Merge user config over the defaults. Arrays extend, `rules` overrides. */
export function mergePolicy(user = {}) {
  const p = structuredClone(DEFAULT_POLICY);
  Object.assign(p.rules, user.rules ?? {});
  for (const key of ['secretPaths', 'secretPathExceptions', 'protectedPaths', 'lockfiles', 'harnessPaths', 'custom']) {
    if (Array.isArray(user[key])) p[key] = [...p[key], ...user[key]];
  }
  return p;
}

export function validatePolicy(user = {}) {
  const errors = [];
  const decisions = new Set(['allow', 'ask', 'deny', 'off']);
  for (const [id, d] of Object.entries(user.rules ?? {})) {
    if (!RULES[id]) errors.push(`policy.rules: unknown rule "${id}". Known rules: ${Object.keys(RULES).join(', ')}.`);
    if (!decisions.has(d)) errors.push(`policy.rules.${id}: "${d}" is not one of allow, ask, deny, off.`);
  }
  for (const c of user.custom ?? []) {
    if (!c.id || !c.pattern || !c.reason) errors.push('policy.custom: every entry needs `id`, `pattern`, `decision` and `reason`.');
    if (!['ask', 'deny'].includes(c.decision)) errors.push(`policy.custom.${c.id}: decision must be ask or deny.`);
    try {
      new RegExp(c.pattern, c.flags ?? 'i');
    } catch (e) {
      errors.push(`policy.custom.${c.id}: pattern does not compile (${e.message}).`);
    }
  }
  for (const p of user.protectedPaths ?? []) {
    if (!p.glob || !['ask', 'deny'].includes(p.decision) || !p.reason) errors.push('policy.protectedPaths: every entry needs `glob`, `decision` (ask or deny) and `reason`.');
  }
  return errors;
}

export { commandName };

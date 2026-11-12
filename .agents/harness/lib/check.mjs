// `harness check`: the sensors that watch the harness itself.
// Every finding names the file, the rule, and the fix, because the reader is
// usually an agent that will act on the message directly.

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';
import { matchAny } from './glob.mjs';
import { RULES, validatePolicy } from './policy.mjs';
import { isDir, loadConfig, read, rel, walk } from './util.mjs';
import { planSync, diffSync, KNOWN_AGENTS } from './sync.mjs';

const SKILL_FIELDS = new Set([
  'name', 'description', 'when_to_use', 'argument-hint', 'arguments', 'disable-model-invocation', 'user-invocable', 'allowed-tools',
  'disallowed-tools', 'model', 'effort', 'context', 'agent', 'background', 'hooks', 'paths', 'shell', 'metadata', 'license', 'compatibility',
]);
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TRIGGER = /\buse (it |this )?(when|for|after|before|whenever|to)\b/i;

export function loadSkills(root) {
  const base = join(root, '.agents', 'skills');
  if (!isDir(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const dir = join(base, e.name);
      const file = join(dir, 'SKILL.md');
      const exists = existsSync(file);
      const fm = exists ? parseFrontmatter(read(file)) : { data: {}, body: '', bodyLine: 1, error: null };
      return { name: e.name, dir, file, exists, ...fm, files: walk(dir) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const isModelInvocable = (skill) => skill.data['disable-model-invocation'] !== true;

/** Relative link targets in a Markdown file, ignoring code. */
export function markdownLinks(text) {
  const links = [];
  let fence = null;
  text.split('\n').forEach((line, idx) => {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      return;
    }
    if (fence) return;
    const clean = line.replace(/`[^`]*`/g, '');
    for (const m of clean.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const target = m[1];
      if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target) || /[<{$]/.test(target)) continue;
      let path = target.split('#')[0].split('?')[0];
      try {
        path = decodeURIComponent(path);
      } catch {}
      if (path) links.push({ target: path, line: idx + 1 });
    }
  });
  return links;
}

export function runChecks(root) {
  const findings = [];
  const add = (level, file, rule, message, line) => findings.push({ level, file, rule, message, ...(line ? { line } : {}) });
  const { config, user, error } = loadConfig(root);
  const ignored = (p) => Boolean(matchAny(p, config.ignore)) || Boolean(matchAny(`${p}/`, config.ignore));

  // ---------------------------------------------------------------- config
  if (error) add('error', '.agents/harness.json', 'config/json', error);
  for (const e of validatePolicy(user.policy)) add('error', '.agents/harness.json', 'config/policy', e);
  for (const a of config.agents) {
    if (!KNOWN_AGENTS.includes(a)) add('error', '.agents/harness.json', 'config/agents', `Unknown agent "${a}". Use any of: ${KNOWN_AGENTS.join(', ')}.`);
  }
  for (const s of config.sensors.postEdit ?? []) {
    if (!s.match || !s.run) add('error', '.agents/harness.json', 'config/sensors', 'Every `sensors.postEdit` entry needs `match` (a glob) and `run` (a command, with {file} for the edited path).');
  }

  // ---------------------------------------------------------------- skills
  const skills = loadSkills(root);
  const seenDescriptions = new Map();
  for (const s of skills) {
    const file = rel(root, s.file);
    if (!s.exists) {
      add('error', rel(root, s.dir), 'skill/missing', 'A skill folder must contain SKILL.md. Add it, or delete the folder.');
      continue;
    }
    if (s.error) {
      add('error', file, 'skill/frontmatter', s.error);
      continue;
    }
    const d = s.data;
    if (d.name !== s.name) add('error', file, 'skill/name', `\`name\` is "${d.name ?? ''}" but the folder is "${s.name}". They must match: agents resolve a skill by its folder.`);
    if (!NAME.test(s.name) || s.name.length > 64) add('error', file, 'skill/name', 'Skill names are 1-64 characters of lowercase letters, digits and single hyphens.');

    const desc = typeof d.description === 'string' ? d.description : '';
    if (!desc) add('error', file, 'skill/description', 'Add a `description`. It is the only text the model sees when it decides whether to load the skill.');
    else {
      if (desc.length > config.budgets.descriptionChars) add('error', file, 'skill/description', `Description is ${desc.length} characters; the limit is ${config.budgets.descriptionChars}. Every description is loaded into every session, so keep it tight.`);
      if (isModelInvocable(s) && !TRIGGER.test(desc)) add('error', file, 'skill/trigger', 'This skill can be invoked by the model, so its description must say when: add a sentence starting "Use when ...". Without a trigger the model guesses.');
      const twin = seenDescriptions.get(desc);
      if (twin) add('error', file, 'skill/duplicate-description', `Same description as "${twin}". The model cannot choose between two skills that describe themselves identically.`);
      seenDescriptions.set(desc, s.name);
    }
    if (typeof d['disable-model-invocation'] !== 'boolean') add('error', file, 'skill/invocation', 'Set `disable-model-invocation` explicitly. Use `true` for skills with side effects that only the user should start (planning, committing, opening pull requests).');
    for (const key of Object.keys(d)) {
      if (!SKILL_FIELDS.has(key)) add('warn', file, 'skill/unknown-field', `Unknown frontmatter field "${key}". Agents ignore it silently; put custom data under \`metadata\`.`);
    }
    if (!d.metadata?.group) add('error', file, 'skill/group', 'Add `metadata.group`. The README table and skills.sh.json are generated from it.');
    if (d.metadata && typeof d.metadata.version !== 'string') add('error', file, 'skill/version', 'Add `metadata.version` as a quoted string, for example "1.0".');

    const bodyLines = s.body.split('\n').length;
    if (bodyLines > config.budgets.skillBodyLines) add('error', file, 'skill/size', `SKILL.md body is ${bodyLines} lines; the budget is ${config.budgets.skillBodyLines}. Move detail into \`resources/\` files that the skill reads on demand.`);

    // Links stay inside the skill so it still works when installed alone.
    const mdFiles = s.files.filter((f) => f.endsWith('.md'));
    const referenced = new Set(['SKILL.md']);
    for (const f of mdFiles) {
      const abs = join(s.dir, f);
      const text = read(abs);
      for (const l of markdownLinks(text)) {
        const target = resolve(dirname(abs), l.target);
        const inside = rel(s.dir, target);
        if (inside.startsWith('..')) add('error', rel(root, abs), 'skill/self-contained', `Link "${l.target}" leaves the skill folder. Skills are installed one by one; copy the content into this skill or refer to the other skill by name.`, l.line);
        else if (!existsSync(target)) add('error', rel(root, abs), 'skill/broken-link', `Link "${l.target}" does not resolve.`, l.line);
        else referenced.add(inside);
      }
      for (const other of s.files) if (text.includes(other)) referenced.add(other);
    }
    for (const f of s.files) {
      if (!referenced.has(f)) add('warn', rel(root, join(s.dir, f)), 'skill/orphan-resource', 'Nothing in this skill refers to this file, so no agent will ever read it. Link it from SKILL.md or delete it.');
    }
  }

  // ---------------------------------------------------------------- subagents
  const agentsDir = join(root, '.agents', 'agents');
  if (isDir(agentsDir)) {
    for (const f of readdirSync(agentsDir).filter((n) => n.endsWith('.md'))) {
      const file = `.agents/agents/${f}`;
      const fm = parseFrontmatter(read(join(agentsDir, f)));
      if (fm.error) {
        add('error', file, 'agent/frontmatter', fm.error);
        continue;
      }
      if (fm.data.name !== f.replace(/\.md$/, '')) add('error', file, 'agent/name', `\`name\` is "${fm.data.name ?? ''}" but the file is "${f}". They must match.`);
      if (!fm.data.description) add('error', file, 'agent/description', 'Add a `description` that says when to delegate to this subagent.');
      if (!fm.data.tools) add('warn', file, 'agent/tools', 'No `tools` list: the subagent inherits every tool. List only the tools the role needs.');
    }
  }

  // ---------------------------------------------------------------- docs
  const agentsMd = join(root, 'AGENTS.md');
  if (!existsSync(agentsMd)) add('error', 'AGENTS.md', 'docs/agents-md', 'Add a root AGENTS.md: the map every agent reads first.');
  else {
    const n = read(agentsMd).split('\n').length;
    if (n > config.budgets.agentsMdLines) add('error', 'AGENTS.md', 'docs/agents-md-size', `AGENTS.md is ${n} lines; the budget is ${config.budgets.agentsMdLines}. It is loaded into every session. Keep it a map and move detail into docs/.`);
  }

  const generatedDirs = ['.claude/skills', '.claude/agents', '.cursor/skills', '.github/skills', '.codex/skills', '.gemini/skills', '.opencode/skills'];
  const files = walk(root, { ignore: (p) => ignored(p) || generatedDirs.some((g) => p === g || p.startsWith(`${g}/`)) });
  for (const f of files.filter((p) => p.endsWith('.md'))) {
    if (f.startsWith('.agents/skills/')) continue; // checked above, with stricter rules
    const abs = join(root, f);
    for (const l of markdownLinks(read(abs))) {
      const target = l.target.startsWith('/') ? join(root, l.target) : resolve(dirname(abs), l.target);
      if (!existsSync(target)) add('error', f, 'docs/broken-link', `Link "${l.target}" does not resolve. Fix the path or remove the link.`, l.line);
    }
  }

  const convDir = config.docs.conventions;
  for (const f of files.filter((p) => p.startsWith(`${convDir}/`) && p.endsWith('.md') && !/(^|\/)README\.md$/i.test(p))) {
    const headings = read(join(root, f))
      .split('\n')
      .filter((l) => /^##\s/.test(l))
      .map((l) => l.toLowerCase());
    for (const section of config.docs.requiredSections) {
      if (!headings.some((h) => h.includes(section.toLowerCase()))) add('error', f, 'docs/convention-sections', `Missing a "## ${section}" section. Every convention states its ${config.docs.requiredSections.join(', ')}.`);
    }
  }

  for (const f of files.filter((p) => p.endsWith('.json'))) {
    try {
      JSON.parse(read(join(root, f)));
    } catch (e) {
      add('error', f, 'json/parse', `Not valid JSON: ${e.message}`);
    }
  }

  // ---------------------------------------------------------------- evals
  const policyEvals = join(root, 'evals', 'policy.jsonl');
  if (existsSync(policyEvals)) {
    const text = read(policyEvals);
    for (const id of Object.keys(RULES)) {
      if (!text.includes(`"rule":"${id}"`)) add('error', 'evals/policy.jsonl', 'evals/policy-coverage', `No scenario exercises the "${id}" rule. Add one that must be blocked and one near-miss that must pass.`);
    }
  }
  const triggerEvals = join(root, 'evals', 'triggers.jsonl');
  if (existsSync(triggerEvals)) {
    const rows = read(triggerEvals).split('\n').filter((l) => l.trim()).map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        add('error', 'evals/triggers.jsonl', 'evals/json', 'Line is not valid JSON.', i + 1);
        return {};
      }
    });
    const names = new Set(skills.map((s) => s.name));
    for (const r of rows) {
      for (const n of [r.expect, ...(r.not ?? [])].filter(Boolean)) {
        if (!names.has(n)) add('error', 'evals/triggers.jsonl', 'evals/unknown-skill', `Case refers to skill "${n}", which does not exist.`);
      }
    }
    for (const s of skills.filter((x) => x.exists && !x.error && isModelInvocable(x))) {
      const pos = rows.filter((r) => r.expect === s.name).length;
      const neg = rows.filter((r) => (r.not ?? []).includes(s.name)).length;
      if (pos < 2 || neg < 1) add('error', 'evals/triggers.jsonl', 'evals/trigger-coverage', `Skill "${s.name}" can be invoked by the model but has ${pos} positive and ${neg} negative trigger cases. Add at least 2 prompts that should load it and 1 near-miss (\`"not": ["${s.name}"]\`) that should not.`);
    }
  }

  // ---------------------------------------------------------------- generated files
  for (const d of diffSync(root, planSync(root))) {
    // Mirrors are local, untracked output: a fresh clone has none until the first sync.
    add(d.mirror ? 'warn' : 'error', d.path, 'sync/drift', `${d.problem} Run \`node .agents/harness/cli.mjs sync\`; do not edit generated output by hand.`);
  }

  const order = { error: 0, warn: 1 };
  return findings.sort((a, b) => order[a.level] - order[b.level] || a.file.localeCompare(b.file));
}

export function formatFindings(findings) {
  const lines = findings.map((f) => `${f.level === 'error' ? 'error' : 'warn '}  ${f.file}${f.line ? `:${f.line}` : ''}  [${f.rule}]\n       ${f.message}`);
  const errors = findings.filter((f) => f.level === 'error').length;
  const warns = findings.length - errors;
  lines.push(errors || warns ? `\n${errors} error(s), ${warns} warning(s)` : 'harness check: ok');
  return lines.join('\n');
}

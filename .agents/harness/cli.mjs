#!/usr/bin/env node
// harness: lint, generate, evaluate and install the agent harness.
// Zero dependencies. Node 20 or newer.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { formatFindings, runChecks } from './lib/check.mjs';
import { evalPolicy, evalTriggers } from './lib/evals.mjs';
import { install } from './lib/install.mjs';
import { applySync, diffSync, planSync } from './lib/sync.mjs';
import { HARNESS_ROOT, findRoot, read, rel } from './lib/util.mjs';

const HELP = `harness <command>

  check [--json] [--for <file>]   Lint the harness: skills, subagents, docs, links, config, generated files.
                                  --for limits the report to findings about one file (used by the edit sensor).
  sync [--check]                  Generate every agent's wiring from .agents/. --check only reports drift.
  eval policy                     Run evals/policy.jsonl against the guard policy.
  eval triggers --live [--limit n]
                                  Send evals/triggers.jsonl prompts to headless Claude Code and
                                  compare the skill it loads. Uses your model quota.
  new-skill <name> [--group g]    Scaffold .agents/skills/<name>/SKILL.md.
  install <dir> [--skills a,b] [--agents claude,cursor] [--force]
                                  Install this harness into another repository.

  --root <dir>                    Operate on another project (default: nearest .agents/ above the cwd).
`;

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
  argv.splice(i, value === true ? 1 : 2);
  return value;
};
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);

const rootFlag = flag('--root');
const root = rootFlag ? resolve(String(rootFlag)) : findRoot();
const asJson = flag('--json');
const [command, ...rest] = argv;

function main() {
  switch (command) {
    case 'check': {
      const only = flag('--for');
      let findings = runChecks(root);
      if (typeof only === 'string') {
        const file = rel(root, resolve(root, only));
        const skillDir = /^\.agents\/skills\/[^/]+\//.exec(file)?.[0];
        findings = findings.filter((f) => f.level === 'error' && (f.file === file || (skillDir && f.file.startsWith(skillDir))));
      }
      console.log(asJson ? JSON.stringify(findings, null, 2) : formatFindings(findings));
      return findings.some((f) => f.level === 'error') ? 1 : 0;
    }
    case 'sync': {
      const plan = planSync(root);
      if (flag('--check')) {
        const drift = diffSync(root, plan);
        for (const d of drift) console.log(`drift  ${d.path}: ${d.problem}`);
        console.log(drift.length ? `\n${drift.length} generated item(s) out of date. Run: node .agents/harness/cli.mjs sync` : 'harness sync: up to date');
        return drift.some((d) => !d.mirror) ? 1 : 0;
      }
      const done = applySync(root, plan);
      for (const line of [...done, ...plan.notes.map((n) => `note: ${n}`)]) console.log(line);
      console.log(done.length ? `\n${done.length} change(s)` : 'harness sync: nothing to do');
      return done.some((d) => d.startsWith('failed')) ? 1 : 0;
    }
    case 'eval': {
      const suite = rest[0] ?? 'policy';
      let result;
      if (suite === 'policy') result = evalPolicy(root);
      else if (suite === 'triggers') {
        if (!flag('--live')) {
          console.log('Trigger evals call a model. Coverage of evals/triggers.jsonl is checked by `harness check`.\nTo run them: node .agents/harness/cli.mjs eval triggers --live [--limit n]');
          return 0;
        }
        const limit = Number(flag('--limit')) || Infinity;
        result = evalTriggers(root, { limit, log: console.log });
      } else {
        console.error(`Unknown eval suite "${suite}". Use: policy, triggers.`);
        return 2;
      }
      for (const f of result.failures) console.log(`FAIL  ${f}`);
      console.log(`${suite} evals: ${result.total - result.failures.length}/${result.total} passed`);
      return result.failures.length ? 1 : 0;
    }
    case 'new-skill': {
      const name = rest[0];
      if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
        console.error('Usage: harness new-skill <name>   (lowercase letters, digits, single hyphens)');
        return 2;
      }
      const file = join(root, '.agents', 'skills', name, 'SKILL.md');
      if (existsSync(file)) {
        console.error(`${rel(root, file)} already exists.`);
        return 1;
      }
      const group = flag('--group');
      const template = read(join(HARNESS_ROOT, '.agents', 'harness', 'templates', 'SKILL.md'));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, template.replaceAll('{{name}}', name).replaceAll('{{group}}', typeof group === 'string' ? group : 'other'));
      console.log(`created ${rel(root, file)}\nNext: write the description, add trigger cases to evals/triggers.jsonl if the model may invoke it, then run \`harness sync\` and \`harness check\`.`);
      return 0;
    }
    case 'install': {
      if (!rest[0]) {
        console.error('Usage: harness install <dir> [--skills a,b] [--agents claude,cursor] [--force]');
        return 2;
      }
      const log = install(HARNESS_ROOT, rest[0], { skills: list(flag('--skills')), agents: list(flag('--agents')), force: Boolean(flag('--force')) });
      for (const line of log) console.log(line);
      console.log(`\nInstalled into ${resolve(rest[0])}. Next: edit AGENTS.md and .agents/harness.json, then run \`node .agents/harness/cli.mjs check\` there.`);
      return 0;
    }
    case undefined:
    case 'help':
    case '--help':
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown command "${command}".\n\n${HELP}`);
      return 2;
  }
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(`harness: ${e.message}`);
  process.exitCode = 1;
}

// Evals: does the harness still behave the way we decided it should?
//
//   policy    deterministic. Every scenario in evals/policy.jsonl is judged by
//             the policy as configured for this project.
//   triggers  needs a model. Each prompt in evals/triggers.jsonl is sent to a
//             headless agent and we record which skill it loads.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate } from './policy.mjs';
import { loadConfig, read } from './util.mjs';

const rows = (file) => read(file).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

export function evalPolicy(root) {
  const file = join(root, 'evals', 'policy.jsonl');
  if (!existsSync(file)) return { total: 0, failures: ['No scenarios found at evals/policy.jsonl.'] };
  const { policy } = loadConfig(root);
  const failures = [];
  const cases = rows(file);
  for (const c of cases) {
    const v = evaluate(c, policy);
    const label = c.kind === 'shell' ? c.command : `${c.kind} ${c.paths.join(' ')}`;
    if (v.decision !== c.expect) failures.push(`expected ${c.expect}, got ${v.decision}${v.rule ? ` [${v.rule}]` : ''}: ${label}`);
    else if (c.rule && v.rule !== c.rule) failures.push(`expected rule ${c.rule}, got ${v.rule}: ${label}`);
  }
  return { total: cases.length, failures };
}

/** Which skills did a headless Claude Code run load? Reads its stream-json output. */
export function skillsInvoked(streamJson) {
  const found = [];
  for (const line of String(streamJson).split('\n')) {
    if (!line.includes('"tool_use"')) continue;
    try {
      const msg = JSON.parse(line);
      for (const block of msg.message?.content ?? []) {
        if (block.type !== 'tool_use') continue;
        if (block.name === 'Skill') found.push(String(block.input?.skill ?? block.input?.name ?? '').replace(/^.*:/, ''));
        // A model may also open the skill file itself instead of calling the Skill tool.
        const opened = /[\\/]skills[\\/]([^\\/]+)[\\/]SKILL\.md$/.exec(String(block.input?.file_path ?? ''));
        if (block.name === 'Read' && opened) found.push(opened[1]);
      }
    } catch {}
  }
  return found;
}

export function evalTriggers(root, { limit = Infinity, log = () => {} } = {}) {
  const file = join(root, 'evals', 'triggers.jsonl');
  if (!existsSync(file)) return { total: 0, failures: ['No cases found at evals/triggers.jsonl.'] };
  const cases = rows(file).slice(0, limit);
  const failures = [];
  for (const c of cases) {
    // The prompt goes in on stdin, so no shell ever has to quote it.
    // No permission flags: in headless mode anything that needs approval is denied, so a run cannot change the project.
    const res = spawnSync('claude -p --output-format stream-json --verbose --max-turns 4', {
      cwd: root,
      input: c.prompt,
      encoding: 'utf8',
      shell: true,
      timeout: 180000,
    });
    if (res.error || res.status === null) {
      failures.push(`could not run the agent for "${c.prompt}": ${res.error?.message ?? 'timed out'}`);
      continue;
    }
    const used = skillsInvoked(res.stdout ?? '');
    const ok = (c.expect ? used.includes(c.expect) : true) && !(c.not ?? []).some((n) => used.includes(n));
    log(`${ok ? 'pass' : 'FAIL'}  ${c.prompt}  ->  ${used.join(', ') || 'no skill'}`);
    if (!ok) failures.push(`"${c.prompt}": expected ${c.expect ?? 'no skill'}${c.not ? `, not ${c.not.join('/')}` : ''}; loaded ${used.join(', ') || 'none'}`);
  }
  return { total: cases.length, failures };
}

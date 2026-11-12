// What a new session should know before its first turn, in a few lines:
// the plan in progress, the previous session's handoff note, and whether the
// generated wiring is stale. Kept short on purpose; it is paid for every session.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { applySync, diffSync, planSync } from './sync.mjs';
import { isDir, read } from './util.mjs';

/** Plans with unchecked tasks, newest folder first. */
export function activePlans(root, plansDir) {
  const base = join(root, plansDir);
  if (!isDir(base)) return [];
  const out = [];
  for (const name of readdirSync(base).sort().reverse()) {
    const file = join(base, name, 'plan.md');
    if (!existsSync(file)) continue;
    const lines = read(file).split('\n');
    const open = lines.filter((l) => /^\s*- \[ \]/.test(l)).length;
    if (!open) continue;
    const done = lines.filter((l) => /^\s*- \[[xX]\]/.test(l)).length;
    let phase = null;
    for (const l of lines) {
      const h = /^###\s+(.*)$/.exec(l);
      if (h) phase = h[1];
      if (/^\s*- \[ \]/.test(l)) break;
    }
    out.push({ path: `${plansDir}/${name}/plan.md`, phase, done, total: done + open });
  }
  return out;
}

export function sessionContext(root, config) {
  const lines = [];
  let healed = false;

  const plan = planSync(root);
  const drift = diffSync(root, plan);
  if (drift.some((d) => d.mirror && d.state !== 'foreign')) {
    const done = applySync(root, plan, { mirrorsOnly: true });
    healed = done.some((d) => /^(linked|copied)/.test(d));
  }
  const stale = diffSync(root, plan);
  if (stale.length) {
    lines.push(`[harness] ${stale.length} generated file(s) are out of date (${stale.map((d) => d.path).slice(0, 4).join(', ')}). Run: node .agents/harness/cli.mjs sync`);
  }

  const plans = activePlans(root, config.session.plans);
  if (plans.length) {
    const p = plans[0];
    lines.push(`[harness] Plan in progress: ${p.path} (${p.done}/${p.total} tasks done). Current: ${p.phase ?? 'first unchecked task'}. Continue it only if the user asks.`);
    if (plans.length > 1) lines.push(`[harness] ${plans.length - 1} other plan(s) have open tasks under ${config.session.plans}/.`);
  }

  const handoff = join(root, config.session.handoff);
  if (existsSync(handoff)) {
    const when = statSync(handoff).mtime.toISOString().slice(0, 16).replace('T', ' ');
    lines.push(`[harness] The previous session left a handoff note (${when} UTC): ${config.session.handoff}. Read it before you start.`);
  }
  return { text: lines.join('\n'), healed };
}

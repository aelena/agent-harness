// `harness install <dir>`: put this harness into another repository.
// Copies the engine and the chosen skills, never overwrites the target's own
// files, then runs `sync` there so every agent is wired.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applySync, planSync, KNOWN_AGENTS } from './sync.mjs';
import { isDir, read } from './util.mjs';

const GITIGNORE = ['.agents/.state/', '.agents/handoff.md', '.claude/skills', '.claude/agents'];

export function install(source, targetDir, { skills = null, agents = null, force = false } = {}) {
  const target = resolve(targetDir);
  const log = [];
  if (!isDir(target)) throw new Error(`Target directory does not exist: ${target}`);
  if (target === resolve(source)) throw new Error('Target is the harness repository itself. Pass the path of the project to install into.');
  const bad = (agents ?? []).filter((a) => !KNOWN_AGENTS.includes(a));
  if (bad.length) throw new Error(`Unknown agent(s): ${bad.join(', ')}. Known: ${KNOWN_AGENTS.join(', ')}.`);

  // 1. The engine is vendored code: always replaced, so upgrades are one command.
  cpSync(join(source, '.agents', 'harness'), join(target, '.agents', 'harness'), { recursive: true, force: true });
  log.push('installed .agents/harness/ (engine, hooks, templates)');

  // 2. Skills and subagents: the target's own versions win unless --force.
  const available = readdirSync(join(source, '.agents', 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const unknown = (skills ?? []).filter((s) => !available.includes(s));
  if (unknown.length) throw new Error(`Unknown skill(s): ${unknown.join(', ')}. Available: ${available.join(', ')}.`);
  for (const name of skills ?? available) {
    const dest = join(target, '.agents', 'skills', name);
    if (existsSync(dest) && !force) {
      log.push(`kept existing skill ${name} (use --force to replace)`);
      continue;
    }
    cpSync(join(source, '.agents', 'skills', name), dest, { recursive: true, force: true });
    log.push(`installed skill ${name}`);
  }
  const agentsSrc = join(source, '.agents', 'agents');
  if (isDir(agentsSrc)) {
    for (const f of readdirSync(agentsSrc).filter((n) => n.endsWith('.md'))) {
      const dest = join(target, '.agents', 'agents', f);
      if (existsSync(dest) && !force) continue;
      mkdirSync(join(target, '.agents', 'agents'), { recursive: true });
      cpSync(join(agentsSrc, f), dest);
      log.push(`installed subagent ${f.replace(/\.md$/, '')}`);
    }
  }
  mkdirSync(join(target, '.agents', 'plans'), { recursive: true });

  // 3. Files the project owns: created once, never touched again.
  const config = join(target, '.agents', 'harness.json');
  if (!existsSync(config)) {
    writeFileSync(config, `${JSON.stringify({ agents: agents ?? ['claude', 'cursor', 'copilot', 'codex'], sensors: { postEdit: [], verify: null }, policy: { rules: {} } }, null, 2)}\n`);
    log.push('created .agents/harness.json (set sensors.verify to your test command)');
  }
  const agentsMd = join(target, 'AGENTS.md');
  if (!existsSync(agentsMd)) {
    writeFileSync(agentsMd, read(join(source, '.agents', 'harness', 'templates', 'AGENTS.md')));
    log.push('created AGENTS.md from the template (fill in the commands and the map)');
  }
  const gi = join(target, '.gitignore');
  const current = existsSync(gi) ? read(gi) : '';
  const missing = GITIGNORE.filter((l) => !current.split('\n').includes(l));
  if (missing.length) {
    writeFileSync(gi, `${current.replace(/\n*$/, current ? '\n\n' : '')}# agent-harness: local state and generated folders\n${missing.join('\n')}\n`);
    log.push('added harness entries to .gitignore');
  }

  // 4. Wire the agents.
  const plan = planSync(target);
  log.push(...applySync(target, plan), ...plan.notes.map((n) => `note: ${n}`));
  return log;
}

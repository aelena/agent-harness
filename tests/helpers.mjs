import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { install } from '../.agents/harness/lib/install.mjs';
import { HARNESS_ROOT } from '../.agents/harness/lib/util.mjs';

export { HARNESS_ROOT };

/** A throwaway project with the harness installed. */
export function makeProject(t, { agents = ['claude', 'cursor', 'copilot', 'codex'], config = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  install(HARNESS_ROOT, dir, { agents, skills: ['git-commit', 'rpi-plan'] });
  if (Object.keys(config).length) setConfig(dir, config);
  return dir;
}

export function setConfig(dir, patch) {
  const file = join(dir, '.agents', 'harness.json');
  const current = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...current, ...patch }, null, 2));
}

export function write(dir, path, content) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
}

/** Run a hook the way an agent does: JSON on stdin, verdict on stdout. */
export function runHook(dir, hook, agent, payload) {
  const env = { ...process.env };
  for (const k of ['CLAUDE_PROJECT_DIR', 'CURSOR_PROJECT_DIR', 'GEMINI_PROJECT_DIR', 'CURSOR_VERSION']) delete env[k];
  const res = spawnSync(process.execPath, [join(dir, '.agents', 'harness', 'hooks', `${hook}.mjs`), '--agent', agent], {
    cwd: dir,
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env,
  });
  let json = null;
  try {
    json = JSON.parse(res.stdout);
  } catch {}
  return { code: res.status, stdout: res.stdout.trim(), stderr: res.stderr.trim(), json };
}

// The sensors: fast checks after an edit, and the verification gate at the end.
// Kept free of any agent dialect so they can be tested directly.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { matchAny, matchPath } from './glob.mjs';
import { rel, tail, walk } from './util.mjs';

const SAFE_PATH = /^[\w .\/\\:@()+,=~-]+$/;

export function runSensors(root, sensors, paths) {
  const failures = [];
  for (const p of paths) {
    const abs = isAbsolute(p) ? p : join(root, p);
    const file = rel(root, abs);
    if (file.startsWith('..') || !SAFE_PATH.test(file)) continue;
    for (const s of sensors) {
      if (!matchPath(file, s.match)) continue;
      const res = spawnSync(s.run.replaceAll('{file}', `"${file}"`), { cwd: root, shell: true, encoding: 'utf8', timeout: (s.timeoutSec ?? 30) * 1000 });
      if (res.status === 0) continue;
      const why = res.error?.code === 'ETIMEDOUT' ? `timed out after ${s.timeoutSec ?? 30}s` : `exit ${res.status}`;
      failures.push(`[harness] check "${s.name ?? s.run}" failed for ${file} (${why}):\n${tail(`${res.stdout ?? ''}${res.stderr ?? ''}`, 2500)}`);
    }
  }
  return failures;
}

/** A cheap identity for "the code as it is now". */
export function fingerprint(root, ignore = []) {
  const h = createHash('sha1');
  const stat = (p) => {
    try {
      const s = statSync(join(root, p));
      return `${p}:${s.size}:${Math.floor(s.mtimeMs)}`;
    } catch {
      return `${p}:gone`;
    }
  };
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const head = git(['rev-parse', 'HEAD']);
  const status = git(['status', '--porcelain', '-uall']);
  if (status.status === 0) {
    h.update(head.stdout ?? '');
    const files = status.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).split(' -> ').pop().replace(/^"|"$/g, ''));
    for (const f of files.sort()) h.update(stat(f));
    return { id: h.digest('hex'), dirty: files.length > 0, git: true };
  }
  const files = walk(root, { ignore: (p) => Boolean(matchAny(p, ignore) || matchAny(`${p}/`, ignore)) }).slice(0, 20000);
  for (const f of files.sort()) h.update(stat(f));
  return { id: h.digest('hex'), dirty: true, git: false };
}

function loadState(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export function stopGate({ root, config, sessionId }) {
  const { verify, verifyTimeoutSec, maxStopBlocks } = config.sensors;
  if (!verify) return null;
  const dir = join(root, '.agents', '.state');
  const file = join(dir, 'stop-gate.json');
  const state = loadState(file);
  const save = (patch) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ ...state, ...patch }, null, 2));
  };

  const fp = fingerprint(root, config.ignore);
  if (fp.git && !fp.dirty) return null; // nothing uncommitted: nothing new to verify
  if (state.passed === fp.id) return null;

  const blocks = state.session === sessionId ? state.blocks ?? 0 : 0;
  if (blocks >= maxStopBlocks) {
    process.stderr.write(`[harness] verification still fails after ${blocks} attempts; letting the agent stop. Run: ${verify}\n`);
    save({ session: sessionId, blocks: 0 });
    return null;
  }

  const res = spawnSync(verify, { cwd: root, shell: true, encoding: 'utf8', timeout: verifyTimeoutSec * 1000 });
  // The verification may itself touch files (formatters, caches): fingerprint after it.
  const after = fingerprint(root, config.ignore);
  if (res.status === 0) {
    save({ passed: after.id, session: sessionId, blocks: 0 });
    return null;
  }
  save({ passed: null, session: sessionId, blocks: blocks + 1 });
  const why = res.error?.code === 'ETIMEDOUT' ? `timed out after ${verifyTimeoutSec}s` : `exit ${res.status}`;
  return [
    `You are not done: the verification command failed (${why}).`,
    `Command: ${verify}`,
    '',
    tail(`${res.stdout ?? ''}${res.stderr ?? ''}`, 4000),
    '',
    'Fix the cause and finish again. Do not weaken or delete a check to make it pass. If you cannot fix it, say exactly what fails and what you tried.',
    `(attempt ${blocks + 1} of ${maxStopBlocks})`,
  ].join('\n');
}

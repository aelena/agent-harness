// Shared entry for every hook: read stdin, find the project, never crash.
//
// A hook that throws must not take the agent down with it. Copilot treats a
// crashed preToolUse hook as a denial and Cursor blocks on invalid JSON, so a
// bug here would otherwise block every tool call. On any internal error the
// hook reports it on stderr and answers "no opinion".

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DIALECTS, neutralReply, normalize, parsePayload } from '../lib/dialects.mjs';
import { HARNESS_ROOT, findRoot, loadConfig, readStdin } from '../lib/util.mjs';

export function projectRoot(payload) {
  for (const key of ['CLAUDE_PROJECT_DIR', 'CURSOR_PROJECT_DIR', 'GEMINI_PROJECT_DIR']) {
    const dir = process.env[key];
    if (dir && existsSync(dir)) return resolve(dir);
  }
  const start = payload?.cwd && existsSync(payload.cwd) ? payload.cwd : process.cwd();
  const found = findRoot(start, null);
  if (found) return found;
  return existsSync(join(HARNESS_ROOT, '.agents', 'harness.json')) && resolve(start).startsWith(HARNESS_ROOT) ? HARNESS_ROOT : resolve(start);
}

function emit(reply) {
  if (reply.stderr) process.stderr.write(`${reply.stderr}\n`);
  if (reply.stdout) process.stdout.write(`${reply.stdout}\n`);
  process.exitCode = reply.code;
}

export function runHook(hook, handler) {
  const i = process.argv.indexOf('--agent');
  const dialect = DIALECTS.includes(process.argv[i + 1]) && i > 0 ? process.argv[i + 1] : 'claude';
  try {
    const payload = parsePayload(readStdin()) ?? {};
    const root = projectRoot(payload);
    const loaded = loadConfig(root);
    const action = normalize(payload);
    // Cursor also loads .claude/settings.json. When it has its own adapter,
    // the Claude-dialect copy of the hook stands down so nothing runs twice.
    if (dialect === 'claude' && action.viaCursor && loaded.config.agents.includes('cursor')) {
      process.exitCode = 0;
      return;
    }
    emit(handler({ dialect, payload, action, root, ...loaded }) ?? neutralReply(dialect, hook));
  } catch (e) {
    process.stderr.write(`[harness] ${hook} hook failed and was skipped: ${e?.stack ?? e}\n`);
    const reply = neutralReply(dialect, hook);
    if (reply.stdout) process.stdout.write(`${reply.stdout}\n`);
    process.exitCode = 0;
  }
}

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergePolicy } from './policy.mjs';

/** The harness lives at <root>/.agents/harness/lib/, so the root is three levels up. */
export const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function findRoot(start = process.cwd(), fallback = HARNESS_ROOT) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, '.agents', 'harness.json')) || existsSync(join(dir, '.agents', 'harness'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return fallback;
    dir = parent;
  }
}

export const DEFAULT_CONFIG = {
  // Agents to generate wiring for. Also available, opt-in: gemini, opencode.
  agents: ['claude', 'cursor', 'copilot', 'codex'],
  // How agent-specific skill folders are produced: auto | symlink | copy.
  sync: { mode: 'auto' },
  budgets: { agentsMdLines: 120, skillBodyLines: 300, descriptionChars: 1024 },
  docs: { conventions: 'docs/conventions', requiredSections: ['Rule', 'Why', 'Examples', 'Enforcement'] },
  ignore: ['node_modules/**', '.git/**', '_external-repos/**', 'graft/**', '.agents/.state/**'],
  policy: {},
  sensors: {
    // After an edit: [{ name, match, run }] where `run` may contain {file}.
    postEdit: [],
    // Before the agent may stop: one command that must exit 0.
    verify: null,
    verifyTimeoutSec: 180,
    maxStopBlocks: 3,
  },
  session: { handoff: '.agents/handoff.md', plans: '.agents/plans' },
};

function merge(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && !Array.isArray(out[k]) ? merge(out[k] ?? {}, v) : v;
  }
  return out;
}

export function loadConfig(root) {
  const file = join(root, '.agents', 'harness.json');
  let user = {};
  let error = null;
  if (existsSync(file)) {
    try {
      user = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      error = `.agents/harness.json is not valid JSON: ${e.message}`;
    }
  }
  const config = merge(DEFAULT_CONFIG, user);
  config.ignore = [...new Set([...DEFAULT_CONFIG.ignore, ...(user.ignore ?? [])])];
  return { config, user, policy: mergePolicy(user.policy), error };
}

export const rel = (root, p) => relative(root, p).split(sep).join('/');

export function walk(root, { ignore = () => false, dir = root, out = [] } = {}) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    const r = rel(root, full);
    if (ignore(r, e)) continue;
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      continue; // generated links point back into the tree; never follow them
    }
    if (isDir) walk(root, { ignore, dir: full, out });
    else out.push(r);
  }
  return out;
}

export const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

export const read = (p) => readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');

export function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** Keep the tail: the end of a failing command's output is where the error is. */
export function tail(text, maxChars = 4000) {
  const t = String(text ?? '').trimEnd();
  return t.length <= maxChars ? t : `[... ${t.length - maxChars} earlier characters omitted ...]\n${t.slice(-maxChars)}`;
}

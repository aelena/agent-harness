// Every agent speaks its own hook dialect: different payload fields on stdin,
// different JSON (or exit codes) on the way back. This file is the only place
// that knows those differences. The policy and the sensors never see them.
//
// Contracts verified against each vendor's docs on 2026-11-12; see
// docs/tutorial/08-portability.md for the table and the sources.

export const DIALECTS = ['claude', 'cursor', 'copilot', 'codex', 'gemini'];

const SHELL_TOOLS = new Set(['bash', 'powershell', 'shell', 'run_shell_command', 'exec_command', 'local_shell', 'terminal']);
const READ_TOOLS = new Set(['read', 'view', 'read_file', 'read_many_files', 'notebookread', 'grep']);
const WRITE_TOOLS = new Set(['edit', 'write', 'multiedit', 'notebookedit', 'create', 'str_replace_editor', 'write_file', 'replace', 'delete']);
const PATCH_TOOLS = new Set(['apply_patch', 'patch']);
const PATH_KEYS = ['file_path', 'path', 'filePath', 'notebook_path', 'target_file', 'absolute_path'];

function tryJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function parsePayload(text) {
  try {
    const p = JSON.parse(String(text ?? '').replace(/^﻿/, ''));
    return p && typeof p === 'object' ? p : null;
  } catch {
    return null;
  }
}

export function patchPaths(patch) {
  return [...String(patch ?? '').matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm)].map((m) => (m[1] ?? m[2]).trim());
}

/** Reduce any agent's hook payload to one shape. */
export function normalize(p) {
  const event = p.hook_event_name ?? '';
  const tool = String(p.tool_name ?? p.toolName ?? '');
  const input = tryJson(p.tool_input ?? p.toolArgs ?? {}) ?? {};
  const t = tool.toLowerCase();
  const base = {
    event,
    tool,
    cwd: p.cwd ?? input.working_directory ?? null,
    sessionId: p.session_id ?? p.sessionId ?? p.conversation_id ?? 'default',
    stopActive: Boolean(p.stop_hook_active) || Number(p.loop_count ?? 0) > 0,
    viaCursor: Boolean(p.cursor_version),
  };

  // Cursor's dedicated events carry their data at the top level.
  if (event === 'beforeShellExecution') return { ...base, kind: 'shell', command: String(p.command ?? '') };
  if (event === 'beforeReadFile') return { ...base, kind: 'read', paths: [p.file_path].filter(Boolean) };
  if (event === 'afterFileEdit') return { ...base, kind: 'write', paths: [p.file_path].filter(Boolean) };

  const paths = PATH_KEYS.map((k) => input[k]).filter((v) => typeof v === 'string' && v);
  if (PATCH_TOOLS.has(t)) return { ...base, kind: 'write', paths: patchPaths(input.command ?? input.patchText ?? input.patch ?? input.input) };
  if (SHELL_TOOLS.has(t)) return { ...base, kind: 'shell', command: String(input.command ?? input.cmd ?? '') };
  if (READ_TOOLS.has(t)) return { ...base, kind: 'read', paths };
  if (WRITE_TOOLS.has(t)) return { ...base, kind: 'write', paths };
  if (!tool && typeof input.command === 'string') return { ...base, kind: 'shell', command: input.command };
  return { ...base, kind: 'other', paths };
}

function canAsk(dialect, action) {
  if (dialect === 'claude' || dialect === 'copilot') return true;
  if (dialect === 'cursor') return action.event === 'beforeShellExecution';
  return false; // codex ignores "ask" and lets the call through; gemini has no "ask"
}

const out = (stdout = '', stderr = '', code = 0) => ({ stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout), stderr, code });

/** PreToolUse-style reply for a verdict. */
export function guardReply(dialect, verdict, action = {}) {
  let { decision, reason } = verdict;
  if (decision === 'ask' && !canAsk(dialect, action)) {
    decision = 'deny';
    reason = `${reason} This agent cannot ask for confirmation here, so the action is blocked: ask the user to approve it or to run it themselves.`;
  }
  switch (dialect) {
    case 'cursor':
      return decision === 'allow' ? out({ permission: 'allow' }) : out({ permission: decision, user_message: reason, agent_message: reason });
    case 'copilot':
      return decision === 'allow' ? out({}) : out({ permissionDecision: decision, permissionDecisionReason: reason });
    case 'gemini':
      return decision === 'allow' ? out({ decision: 'allow' }) : out({ decision: 'deny', reason });
    default: // claude, codex
      return decision === 'allow'
        ? out()
        : out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } });
  }
}

/** PostToolUse-style reply: text the model should read after an edit. */
export function feedbackReply(dialect, message) {
  if (!message) return dialect === 'claude' || dialect === 'codex' ? out() : out({});
  switch (dialect) {
    case 'cursor':
      return out({ additional_context: message });
    case 'copilot':
      return out({ additionalContext: message });
    case 'gemini':
      return out({ hookSpecificOutput: { hookEventName: 'AfterTool', additionalContext: message } });
    default:
      return out('', message, 2); // exit 2: stderr goes to the model
  }
}

/** Stop-style reply: a reason keeps the agent working, null lets it stop. */
export function stopReply(dialect, reason) {
  if (!reason) return out({});
  if (dialect === 'cursor') return out({ followup_message: reason });
  if (dialect === 'gemini') return out({ decision: 'deny', reason });
  return out({ decision: 'block', reason });
}

/** SessionStart-style reply: context for the first turn. */
export function sessionReply(dialect, text, { reloadSkills = false } = {}) {
  if (!text) return dialect === 'claude' || dialect === 'codex' ? out() : out({});
  switch (dialect) {
    case 'cursor':
      return out({ additional_context: text });
    case 'copilot':
      return out({ additionalContext: text });
    case 'gemini':
      return out({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } });
    case 'claude':
      return reloadSkills ? out({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text, reloadSkills: true } }) : out(text);
    default:
      return out(text);
  }
}

/** What to print when the hook itself fails: always "no opinion". */
export function neutralReply(dialect, hook) {
  if (dialect === 'cursor' && hook === 'guard') return out({ permission: 'allow' });
  if (dialect === 'gemini' && hook === 'guard') return out({ decision: 'allow' });
  return dialect === 'claude' || dialect === 'codex' ? out(hook === 'stop' ? {} : '') : out({});
}

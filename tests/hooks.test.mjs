// Integration tests: the real hook scripts, run as subprocesses, fed the
// payload each agent documents, and judged by the reply that agent expects.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, runHook, setConfig, write } from './helpers.mjs';

test('guard: Claude Code dialect', (t) => {
  const dir = makeProject(t);
  const deny = runHook(dir, 'guard', 'claude', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cat .env' } });
  assert.equal(deny.code, 0);
  assert.equal(deny.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(deny.json.hookSpecificOutput.permissionDecisionReason, /\[secret-file\].*\.env\.example/s);

  const allow = runHook(dir, 'guard', 'claude', { tool_name: 'Bash', tool_input: { command: 'npm test' } });
  assert.equal(allow.code, 0);
  assert.equal(allow.stdout, '');

  const ask = runHook(dir, 'guard', 'claude', { tool_name: 'Edit', tool_input: { file_path: join(dir, '.claude', 'settings.json') } });
  assert.equal(ask.json.hookSpecificOutput.permissionDecision, 'ask');

  const ps = runHook(dir, 'guard', 'claude', { tool_name: 'PowerShell', tool_input: { command: 'Get-ChildItem Env:' } });
  assert.equal(ps.json.hookSpecificOutput.permissionDecision, 'deny');

  const read = runHook(dir, 'guard', 'claude', { tool_name: 'Read', tool_input: { file_path: 'C:\\repo\\.env.local' } });
  assert.equal(read.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('guard: Cursor dialect always answers with valid JSON', (t) => {
  const dir = makeProject(t);
  const shell = runHook(dir, 'guard', 'cursor', { hook_event_name: 'beforeShellExecution', command: 'git push --force', cwd: dir });
  assert.equal(shell.json.permission, 'ask');
  assert.ok(shell.json.agent_message && shell.json.user_message);

  assert.deepEqual(runHook(dir, 'guard', 'cursor', { hook_event_name: 'beforeShellExecution', command: 'ls' }).json, { permission: 'allow' });
  assert.equal(runHook(dir, 'guard', 'cursor', { hook_event_name: 'beforeReadFile', file_path: '/repo/.env', content: 'X=1' }).json.permission, 'deny');

  // preToolUse cannot ask in Cursor, so "ask" degrades to the safe side.
  const edit = runHook(dir, 'guard', 'cursor', { hook_event_name: 'preToolUse', tool_name: 'Write', tool_input: { file_path: '.agents/harness.json' } });
  assert.equal(edit.json.permission, 'deny');
  assert.match(edit.json.agent_message, /cannot ask for confirmation/);
});

test('guard: Copilot dialect parses toolArgs given as a JSON string', (t) => {
  const dir = makeProject(t);
  const deny = runHook(dir, 'guard', 'copilot', { timestamp: 1, cwd: dir, toolName: 'bash', toolArgs: '{"command":"env | grep TOKEN"}' });
  assert.equal(deny.json.permissionDecision, 'deny');
  assert.match(deny.json.permissionDecisionReason, /env-dump/);
  assert.deepEqual(runHook(dir, 'guard', 'copilot', { toolName: 'bash', toolArgs: { command: 'ls' } }).json, {});
  assert.equal(runHook(dir, 'guard', 'copilot', { toolName: 'view', toolArgs: '{"path":"/repo/.env"}' }).json.permissionDecision, 'deny');
});

test('guard: Codex dialect reads paths out of apply_patch and never asks', (t) => {
  const dir = makeProject(t);
  const patch = '*** Begin Patch\n*** Update File: package-lock.json\n@@\n-a\n+b\n*** End Patch';
  const lock = runHook(dir, 'guard', 'codex', { hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { command: patch } });
  assert.equal(lock.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(lock.json.hookSpecificOutput.permissionDecisionReason, /package manager/);
  const push = runHook(dir, 'guard', 'codex', { tool_name: 'Bash', tool_input: { command: 'git push -f' } });
  assert.equal(push.json.hookSpecificOutput.permissionDecision, 'deny', 'Codex ignores "ask", so it becomes deny');
});

test('guard: Gemini dialect', (t) => {
  const dir = makeProject(t, { agents: ['gemini'] });
  assert.equal(runHook(dir, 'guard', 'gemini', { tool_name: 'run_shell_command', tool_input: { command: 'printenv' } }).json.decision, 'deny');
  assert.deepEqual(runHook(dir, 'guard', 'gemini', { tool_name: 'read_file', tool_input: { file_path: 'src/a.ts' } }).json, { decision: 'allow' });
});

test('guard: the project policy in .agents/harness.json is applied', (t) => {
  const dir = makeProject(t, { config: { policy: { rules: { 'git-force-push': 'off' }, custom: [{ id: 'no-prod', pattern: 'deploy --prod', decision: 'deny', reason: 'Deploy from CI.' }] } } });
  assert.equal(runHook(dir, 'guard', 'claude', { tool_name: 'Bash', tool_input: { command: 'git push -f' } }).stdout, '');
  const v = runHook(dir, 'guard', 'claude', { tool_name: 'Bash', tool_input: { command: 'npm run deploy --prod' } });
  assert.match(v.json.hookSpecificOutput.permissionDecisionReason, /\[no-prod\]: Deploy from CI\./);
});

test('guard: fails open, with a valid reply, on input it cannot read', (t) => {
  const dir = makeProject(t);
  for (const [agent, expected] of [['claude', ''], ['cursor', '{"permission":"allow"}'], ['copilot', '{}'], ['codex', '']]) {
    const r = runHook(dir, 'guard', agent, 'not json at all');
    assert.equal(r.code, 0, agent);
    assert.equal(r.stdout, expected, agent);
  }
  // A broken config must not turn every tool call into a failure either.
  write(dir, '.agents/harness.json', '{ broken');
  const r = runHook(dir, 'guard', 'copilot', { toolName: 'bash', toolArgs: { command: 'cat .env' } });
  assert.equal(r.code, 0);
  assert.equal(r.json.permissionDecision, 'deny', 'defaults still apply');
});

test('guard: stands down when Cursor loads the Claude hook config', (t) => {
  const dir = makeProject(t);
  const viaCursor = { hook_event_name: 'PreToolUse', cursor_version: '3.1.0', tool_name: 'Bash', tool_input: { command: 'cat .env' } };
  assert.equal(runHook(dir, 'guard', 'claude', viaCursor).stdout, '', 'the cursor adapter handles it');
  setConfig(dir, { agents: ['claude'] });
  assert.equal(runHook(dir, 'guard', 'claude', viaCursor).json.hookSpecificOutput.permissionDecision, 'deny', 'no cursor adapter: the claude one must act');
});

test('feedback: a failing sensor reaches the model in each dialect', (t) => {
  const dir = makeProject(t, { config: { sensors: { postEdit: [{ name: 'syntax', match: '**/*.mjs', run: 'node --check {file}' }] } } });
  write(dir, 'src/bad.mjs', 'const = ;\n');
  write(dir, 'src/good.mjs', 'export const a = 1;\n');

  const claude = runHook(dir, 'feedback', 'claude', { tool_name: 'Edit', tool_input: { file_path: join(dir, 'src', 'bad.mjs') } });
  assert.equal(claude.code, 2, 'exit 2 sends stderr to the model');
  assert.match(claude.stderr, /check "syntax" failed for src\/bad\.mjs/);
  assert.match(claude.stderr, /SyntaxError/);

  const ok = runHook(dir, 'feedback', 'claude', { tool_name: 'Write', tool_input: { file_path: join(dir, 'src', 'good.mjs') } });
  assert.equal(ok.code, 0);
  assert.equal(ok.stderr, '');

  assert.match(runHook(dir, 'feedback', 'cursor', { hook_event_name: 'postToolUse', tool_name: 'Write', tool_input: { file_path: 'src/bad.mjs' } }).json.additional_context, /syntax/);
  assert.match(runHook(dir, 'feedback', 'copilot', { toolName: 'edit', toolArgs: '{"path":"src/bad.mjs"}' }).json.additionalContext, /syntax/);
  const patch = '*** Begin Patch\n*** Update File: src/bad.mjs\n*** End Patch';
  assert.equal(runHook(dir, 'feedback', 'codex', { tool_name: 'apply_patch', tool_input: { command: patch } }).code, 2);
  // Not an edit, or a file no sensor matches: silence.
  assert.equal(runHook(dir, 'feedback', 'claude', { tool_name: 'Edit', tool_input: { file_path: join(dir, 'README.md') } }).code, 0);
});

test('stop gate: blocks while verification fails, then lets go', (t) => {
  const dir = makeProject(t, { config: { sensors: { verify: 'node verify.mjs', maxStopBlocks: 2 } } });
  write(dir, 'verify.mjs', "console.error('2 tests failed: totals.test'); process.exit(1);\n");

  const first = runHook(dir, 'stop-gate', 'claude', { hook_event_name: 'Stop', session_id: 's1' });
  assert.equal(first.json.decision, 'block');
  assert.match(first.json.reason, /2 tests failed: totals\.test/);
  assert.match(first.json.reason, /attempt 1 of 2/);
  assert.equal(runHook(dir, 'stop-gate', 'cursor', { hook_event_name: 'stop', conversation_id: 's1' }).json.followup_message.includes('attempt 2 of 2'), true);

  const third = runHook(dir, 'stop-gate', 'claude', { session_id: 's1' });
  assert.deepEqual(third.json, {}, 'after maxStopBlocks it stops insisting');
  assert.match(third.stderr, /still fails after 2 attempts/);

  write(dir, 'verify.mjs', 'process.exit(0);\n');
  assert.deepEqual(runHook(dir, 'stop-gate', 'copilot', { sessionId: 's2' }).json, {});
  // Unchanged tree since the last pass: the command is not run again.
  write(dir, '.agents/harness.json', JSON.stringify({ sensors: { verify: 'node does-not-exist.mjs' } }));
  assert.ok(existsSync(join(dir, '.agents', '.state', 'stop-gate.json')));
});

test('stop gate: does nothing when no verify command is configured', (t) => {
  const dir = makeProject(t);
  assert.deepEqual(runHook(dir, 'stop-gate', 'claude', { session_id: 's' }).json, {});
});

test('session start: reports the plan in progress and the handoff note', (t) => {
  const dir = makeProject(t);
  assert.equal(runHook(dir, 'session-start', 'claude', { hook_event_name: 'SessionStart', source: 'startup' }).stdout, '', 'nothing to say: say nothing');

  write(dir, '.agents/plans/2026-11-12-coupons/plan.md', '# Coupons\n\n### Phase 1: Apply a coupon\n\n- [x] a\n- [x] b\n\n### Phase 2: Expire coupons\n\n- [x] c\n- [ ] d\n- [ ] e\n');
  write(dir, '.agents/handoff.md', '# Handoff\n');
  const claude = runHook(dir, 'session-start', 'claude', { source: 'startup' });
  assert.match(claude.stdout, /Plan in progress: \.agents\/plans\/2026-11-12-coupons\/plan\.md \(3\/5 tasks done\)\. Current: Phase 2: Expire coupons/);
  assert.match(claude.stdout, /handoff note .*\.agents\/handoff\.md/);
  assert.match(runHook(dir, 'session-start', 'copilot', { source: 'startup' }).json.additionalContext, /Plan in progress/);
  assert.match(runHook(dir, 'session-start', 'cursor', { hook_event_name: 'sessionStart' }).json.additional_context, /Plan in progress/);
});

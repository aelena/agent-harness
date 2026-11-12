// Tests for the tooling: frontmatter, check, sync and install.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { markdownLinks, runChecks } from '../.agents/harness/lib/check.mjs';
import { skillsInvoked } from '../.agents/harness/lib/evals.mjs';
import { install } from '../.agents/harness/lib/install.mjs';
import { parseFrontmatter } from '../.agents/harness/lib/frontmatter.mjs';
import { matchPath } from '../.agents/harness/lib/glob.mjs';
import { applySync, diffSync, planSync } from '../.agents/harness/lib/sync.mjs';
import { HARNESS_ROOT, makeProject, setConfig, write } from './helpers.mjs';

const rules = (findings, level = 'error') => findings.filter((f) => f.level === level).map((f) => f.rule);
const json = (dir, path) => JSON.parse(readFileSync(join(dir, path), 'utf8'));

test('frontmatter: the YAML subset skills use', () => {
  const { data, body, error } = parseFrontmatter(
    ['---', 'name: demo', 'description: "Does X. Use when: Y"', 'disable-model-invocation: true', 'paths: [a, "b c"]', 'tags:', '  - one', '  - two', 'long: >', '  folded', '  text', 'metadata:', '  group: git', '  version: "1.0"', '---', '# Body', ''].join('\n'),
  );
  assert.equal(error, null);
  assert.deepEqual(data, { name: 'demo', description: 'Does X. Use when: Y', 'disable-model-invocation': true, paths: ['a', 'b c'], tags: ['one', 'two'], long: 'folded text', metadata: { group: 'git', version: '1.0' } });
  assert.equal(body, '# Body\n');
  assert.match(parseFrontmatter('# no frontmatter').error, /must start with/);
  assert.match(parseFrontmatter('---\nname: a\nname: b\n---\n').error, /line 3: duplicate key/);
  assert.match(parseFrontmatter('---\nname: a\n').error, /not closed/);
});

test('glob: suffix matching at directory boundaries', () => {
  assert.ok(matchPath('C:\\repo\\app\\.env', '.env'));
  assert.ok(!matchPath('/repo/my.env', '.env'));
  assert.ok(matchPath('/repo/.git/hooks/pre-commit', '.git/**'));
  assert.ok(!matchPath('/repo/.github/x', '.git/**'));
  assert.ok(matchPath('src/a/b.test.mjs', '**/*.mjs'));
  assert.ok(matchPath('b.mjs', '**/*.mjs'));
});

test('check: links inside code are ignored, nested fences are understood', () => {
  const md = ['[a](x.md)', '`[b](y.md)`', '````md', '```', '[c](z.md)', '```', '````', '[d](https://e.com) [e](#top) [f](w.md#s "t")'].join('\n');
  assert.deepEqual(markdownLinks(md).map((l) => l.target), ['x.md', 'w.md']);
});

test('check: this repository passes its own linter', () => {
  const errors = runChecks(HARNESS_ROOT).filter((f) => f.level === 'error');
  assert.deepEqual(errors.map((f) => `${f.file} [${f.rule}] ${f.message}`), []);
});

test('check: a freshly installed project is clean', (t) => {
  const dir = makeProject(t);
  assert.deepEqual(rules(runChecks(dir)), []);
});

test('check: reports the defects that make a skill fail in practice', (t) => {
  const dir = makeProject(t);
  write(dir, '.agents/skills/bad-skill/SKILL.md', ['---', 'name: other-name', 'description: Does a thing.', 'metadata:', '  author: me', '---', '', 'See [guide](resources/missing.md) and [other](../git-commit/SKILL.md).', ''].join('\n'));
  write(dir, '.agents/skills/bad-skill/resources/unused.md', '# never linked\n');
  write(dir, '.agents/skills/no-frontmatter/SKILL.md', '# nothing\n');
  write(dir, 'docs/conventions/api/thin-routes.md', '# Thin routes\n\n## Rule\n\nx\n\n## Examples\n\nx\n');
  write(dir, 'docs/guide.md', 'See [missing](nope.md).\n');
  write(dir, 'data.json', '{ nope');

  const findings = runChecks(dir);
  const got = new Set(rules(findings));
  for (const rule of ['skill/name', 'skill/trigger', 'skill/invocation', 'skill/group', 'skill/broken-link', 'skill/self-contained', 'skill/frontmatter', 'docs/convention-sections', 'docs/broken-link', 'json/parse']) {
    assert.ok(got.has(rule), `expected a ${rule} finding, got: ${[...got].join(', ')}`);
  }
  assert.ok(rules(findings, 'warn').includes('skill/orphan-resource'));
  const sections = findings.filter((f) => f.rule === 'docs/convention-sections').map((f) => f.message).join(' ');
  assert.match(sections, /"## Why"/);
  assert.match(sections, /"## Enforcement"/);
  // Every message tells the reader what to do.
  for (const f of findings) assert.ok(f.message.length > 25, `${f.rule} has no explanation`);
});

test('check: budgets and config errors', (t) => {
  const dir = makeProject(t);
  write(dir, 'AGENTS.md', Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n'));
  setConfig(dir, { agents: ['claude', 'emacs'], policy: { rules: { 'no-such-rule': 'deny' } } });
  const got = rules(runChecks(dir));
  assert.ok(got.includes('docs/agents-md-size'));
  assert.ok(got.includes('config/agents'));
  assert.ok(got.includes('config/policy'));
});

test('sync: generates each agent\'s wiring and is idempotent', (t) => {
  const dir = makeProject(t, { agents: ['claude', 'cursor', 'copilot', 'codex', 'gemini', 'opencode'] });
  applySync(dir, planSync(dir));
  assert.deepEqual(diffSync(dir, planSync(dir)), []);
  assert.deepEqual(applySync(dir, planSync(dir)), [], 'a second run changes nothing');

  const claude = json(dir, '.claude/settings.json');
  assert.deepEqual(claude.hooks.PreToolUse[0].hooks[0].args, ['${CLAUDE_PROJECT_DIR}/.agents/harness/hooks/guard.mjs', '--agent', 'claude']);
  assert.equal(claude.hooks.Stop, undefined, 'no verify command: no stop hook');
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8').includes('@AGENTS.md'), true);
  assert.ok(existsSync(join(dir, '.claude', 'skills', 'git-commit', 'SKILL.md')));
  assert.ok(existsSync(join(dir, '.claude', 'agents', 'explorer.md')));

  assert.equal(json(dir, '.cursor/hooks.json').version, 1);
  assert.match(json(dir, '.cursor/hooks.json').hooks.beforeShellExecution[0].command, /guard\.mjs --agent cursor/);
  assert.match(json(dir, '.github/hooks/harness.json').hooks.preToolUse[0].command, /--agent copilot/);
  assert.match(json(dir, '.codex/hooks.json').hooks.PreToolUse[0].hooks[0].command, /git rev-parse --show-toplevel/);
  assert.ok(json(dir, '.gemini/settings.json').context.fileName.includes('AGENTS.md'));
  assert.match(readFileSync(join(dir, '.opencode/plugins/harness-guard.js'), 'utf8'), /execute\.before/);
});

test('sync: sensors in the config add the feedback and stop hooks', (t) => {
  const dir = makeProject(t, { config: { sensors: { postEdit: [{ match: '**/*.ts', run: 'tsc --noEmit' }], verify: 'npm test', verifyTimeoutSec: 60 } } });
  applySync(dir, planSync(dir));
  const claude = json(dir, '.claude/settings.json');
  assert.equal(claude.hooks.PostToolUse[0].matcher, 'Edit|Write|MultiEdit|NotebookEdit');
  assert.equal(claude.hooks.Stop[0].hooks[0].timeout, 90);
  assert.ok(json(dir, '.github/hooks/harness.json').hooks.agentStop);
  assert.ok(json(dir, '.cursor/hooks.json').hooks.stop);
});

test('sync: keeps what the project already had', (t) => {
  const dir = makeProject(t);
  const mine = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] };
  write(dir, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(npm test)'] }, hooks: { PreToolUse: [mine], Notification: [mine] } }));
  write(dir, 'CLAUDE.md', '# My own notes\n');
  const plan = planSync(dir);
  applySync(dir, plan);
  applySync(dir, planSync(dir));
  const s = json(dir, '.claude/settings.json');
  assert.deepEqual(s.permissions, { allow: ['Bash(npm test)'] });
  assert.deepEqual(s.hooks.Notification, [mine]);
  assert.equal(s.hooks.PreToolUse.length, 2, 'theirs plus ours, with ours not duplicated on the second run');
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), '# My own notes\n');
  assert.ok(plan.notes.some((n) => /CLAUDE\.md.*does not import AGENTS\.md/.test(n)));
});

test('sync: detects drift, repairs mirrors, refuses to delete folders it does not own', (t) => {
  const dir = makeProject(t);
  // Force copies: a symlinked mirror can never go stale, a copied one can.
  setConfig(dir, { sync: { mode: 'copy' } });
  rmSync(join(dir, '.claude', 'skills'), { recursive: true, force: true });
  assert.ok(applySync(dir, planSync(dir)).some((d) => d.startsWith('copied .agents/skills')));
  write(dir, '.agents/skills/git-commit/SKILL.md', readFileSync(join(dir, '.agents/skills/git-commit/SKILL.md'), 'utf8') + '\nMore.\n');
  write(dir, '.cursor/hooks.json', '{}');
  const drift = diffSync(dir, planSync(dir)).map((d) => d.path).sort();
  assert.deepEqual(drift, ['.claude/skills', '.cursor/hooks.json']);
  applySync(dir, planSync(dir));
  assert.deepEqual(diffSync(dir, planSync(dir)), []);

  rmSync(join(dir, '.claude', 'skills'), { recursive: true, force: true });
  write(dir, '.claude/skills/hand-made/SKILL.md', '---\nname: hand-made\n---\n');
  const done = applySync(dir, planSync(dir));
  assert.ok(done.some((d) => /skipped \.claude\/skills/.test(d)));
  assert.ok(existsSync(join(dir, '.claude/skills/hand-made/SKILL.md')), 'the hand-made skill is still there');
});

test('sync: fills marked blocks and manifests from skill metadata', (t) => {
  const dir = makeProject(t);
  write(dir, 'README.md', '# P\n\n<!-- harness:skills:start -->\nold\n<!-- harness:skills:end -->\n\nfooter\n');
  write(dir, 'skills.sh.json', '{}');
  write(dir, '.claude-plugin/plugin.json', '{"name":"p","version":"2.0.0"}');
  write(dir, 'docs/conventions/api/thin-routes.md', '# 🎯 Thin routes\n\n## Rule\n\n## Why\n\n## Examples\n\n## Enforcement\n');
  applySync(dir, planSync(dir));
  const readme = readFileSync(join(dir, 'README.md'), 'utf8');
  assert.match(readme, /\| \[`git-commit`\]\(\.agents\/skills\/git-commit\/SKILL\.md\) \| Create one git commit.* \| you or the model \|/);
  assert.match(readme, /\| \[`rpi-plan`\].* \| you \|/);
  assert.match(readme, /footer/);
  assert.deepEqual(json(dir, 'skills.sh.json').groupings.map((g) => g.title), ['Git', 'Workflow']);
  const plugin = json(dir, '.claude-plugin/plugin.json');
  assert.equal(plugin.version, '2.0.0');
  assert.equal(plugin.skills, './.agents/skills');
  assert.deepEqual(plugin.agents, ['./.agents/agents/explorer.md', './.agents/agents/reviewer.md']);
  assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), /- `docs\/conventions\/api\/thin-routes\.md`: Thin routes/);
});

test('install: never overwrites the project\'s own files', (t) => {
  const dir = makeProject(t);
  write(dir, 'AGENTS.md', '# Mine\n');
  write(dir, '.agents/skills/git-commit/SKILL.md', 'mine');
  setConfig(dir, { agents: ['claude'] });
  const log = install(HARNESS_ROOT, dir, {});
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), '# Mine\n');
  assert.equal(readFileSync(join(dir, '.agents/skills/git-commit/SKILL.md'), 'utf8'), 'mine');
  assert.deepEqual(json(dir, '.agents/harness.json').agents, ['claude']);
  assert.ok(log.some((l) => /kept existing skill git-commit/.test(l)));
  assert.ok(existsSync(join(dir, '.agents/skills/fresh-review/SKILL.md')), 'missing skills are added');
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8').match(/\.agents\/\.state\//g).length, 1, 'gitignore entries are not duplicated');
  assert.throws(() => install(HARNESS_ROOT, dir, { skills: ['nope'] }), /Unknown skill/);
  assert.throws(() => install(HARNESS_ROOT, HARNESS_ROOT, {}), /harness repository itself/);
});

test('evals: reads the skill a headless run loaded', () => {
  const stream = [
    '{"type":"system","subtype":"init"}',
    '{"type":"assistant","message":{"content":[{"type":"text","text":"ok"},{"type":"tool_use","name":"Skill","input":{"skill":"agent-harness:git-commit"}}]}}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"git status"}}]}}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"C:\\\\repo\\\\.agents\\\\skills\\\\rpi-plan\\\\SKILL.md"}}]}}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/repo/src/skills/notes.md"}}]}}',
  ].join('\n');
  assert.deepEqual(skillsInvoked(stream), ['git-commit', 'rpi-plan']);
});

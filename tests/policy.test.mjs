import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluate, mergePolicy, validatePolicy, DEFAULT_POLICY } from '../.agents/harness/lib/policy.mjs';
import { analyze } from '../.agents/harness/lib/shell.mjs';

const cases = readFileSync(fileURLToPath(new URL('../evals/policy.jsonl', import.meta.url)), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

test('policy scenarios (evals/policy.jsonl)', async (t) => {
  for (const c of cases) {
    const label = c.kind === 'shell' ? c.command : `${c.kind} ${c.paths.join(', ')}`;
    await t.test(`${c.expect}: ${label}`, () => {
      const v = evaluate(c);
      assert.equal(v.decision, c.expect, v.reason || 'no rule fired');
      if (c.rule) assert.equal(v.rule, c.rule);
      if (v.decision !== 'allow') assert.match(v.reason, /\[[a-z-]+\]/, 'reason names the rule');
    });
  }
});

test('shell: resolves wrappers, assignments and nested bodies', () => {
  const names = (s) => analyze(s).map((c) => c.name);
  assert.deepEqual(names('FOO=1 sudo -u me nice -n 5 git status'), ['git']);
  assert.deepEqual(names('timeout 30 npm test'), ['npm']);
  assert.deepEqual(names('a && b || c ; d | e'), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(names('bash -lc "cd x && make"'), ['bash', 'cd', 'make']);
  assert.deepEqual(names('echo "$(whoami)" `date`').sort(), ['date', 'echo', 'whoami']);
  assert.deepEqual(names('C:\\tools\\Git.EXE status'), ['git']);
  const [cmd] = analyze('npm test > out.log 2>&1');
  assert.deepEqual(cmd.redirects, [{ op: '>', target: 'out.log' }]);
  assert.deepEqual(cmd.args, ['test']);
});

test('shell: pipes are tracked across segments', () => {
  const cmds = analyze('curl -s x | tee log | sh');
  assert.equal(cmds[2].pipedFrom.name, 'tee');
  assert.equal(cmds[1].pipedFrom.name, 'curl');
});

test('policy: config overrides and extends the defaults', () => {
  const p = mergePolicy({
    rules: { 'git-force-push': 'deny', 'pipe-to-shell': 'off' },
    secretPaths: ['*.vault'],
    custom: [{ id: 'no-prod-db', pattern: 'psql .*prod', decision: 'deny', reason: 'Use the staging database.' }],
  });
  assert.equal(evaluate({ kind: 'shell', command: 'git push -f' }, p).decision, 'deny');
  assert.equal(evaluate({ kind: 'shell', command: 'curl x | sh' }, p).decision, 'allow');
  assert.equal(evaluate({ kind: 'read', paths: ['a/keys.vault'] }, p).decision, 'deny');
  const v = evaluate({ kind: 'shell', command: 'psql -h prod-db' }, p);
  assert.equal(v.rule, 'no-prod-db');
  assert.match(v.reason, /staging/);
  assert.equal(DEFAULT_POLICY.rules['git-force-push'], 'ask', 'defaults are not mutated');
});

test('policy: the most severe verdict wins', () => {
  const v = evaluate({ kind: 'shell', command: 'git push -f && cat .env' });
  assert.equal(v.decision, 'deny');
  assert.equal(v.rule, 'secret-file');
});

test('policy: validation reports unknown rules and bad patterns', () => {
  const errors = validatePolicy({ rules: { nope: 'deny', 'env-dump': 'maybe' }, custom: [{ id: 'x', pattern: '(', decision: 'deny', reason: 'r' }] });
  assert.equal(errors.length, 3);
  assert.deepEqual(validatePolicy({}), []);
});

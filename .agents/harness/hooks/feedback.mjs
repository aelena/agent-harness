#!/usr/bin/env node
// Feedback: runs after an edit, runs the fast checks configured for that file
// (`sensors.postEdit` in .agents/harness.json), and hands failures to the model
// while the edit is still fresh.
//   node .agents/harness/hooks/feedback.mjs --agent <dialect>

import { feedbackReply } from '../lib/dialects.mjs';
import { runSensors } from '../lib/sensors.mjs';
import { runHook } from './run.mjs';

runHook('feedback', ({ dialect, action, root, config }) => {
  if (action.kind !== 'write' || !action.paths?.length) return feedbackReply(dialect, null);
  const failures = runSensors(root, config.sensors.postEdit ?? [], action.paths);
  return feedbackReply(dialect, failures.length ? `${failures.join('\n\n')}\n\nFix this now, before you continue with other work.` : null);
});

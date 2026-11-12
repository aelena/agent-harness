#!/usr/bin/env node
// Session start: repair the generated skill folders if needed and give the new
// session a few lines of state (plan in progress, handoff note, stale wiring).
//   node .agents/harness/hooks/session-start.mjs --agent <dialect>

import { sessionReply } from '../lib/dialects.mjs';
import { sessionContext } from '../lib/session.mjs';
import { runHook } from './run.mjs';

runHook('session', ({ dialect, root, config }) => {
  const { text, healed } = sessionContext(root, config);
  return sessionReply(dialect, text, { reloadSkills: healed });
});

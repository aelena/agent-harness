#!/usr/bin/env node
// Stop gate: when the agent says it is done, run the project's verification
// command (`sensors.verify`). If it fails, the agent does not get to stop: the
// failure is handed back as its next instruction.
//
// Guards against the two ways this goes wrong:
//  - cost: nothing runs when the tree is unchanged since the last passing run;
//  - loops: after `sensors.maxStopBlocks` blocks in one session, it lets go.
//   node .agents/harness/hooks/stop-gate.mjs --agent <dialect>

import { stopReply } from '../lib/dialects.mjs';
import { stopGate } from '../lib/sensors.mjs';
import { runHook } from './run.mjs';

runHook('stop', ({ dialect, action, root, config }) => stopReply(dialect, stopGate({ root, config, sessionId: action.sessionId })));

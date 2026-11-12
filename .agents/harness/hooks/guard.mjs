#!/usr/bin/env node
// Guard: runs before a tool call and answers allow, ask or deny.
//   node .agents/harness/hooks/guard.mjs --agent <claude|cursor|copilot|codex|gemini>

import { guardReply } from '../lib/dialects.mjs';
import { evaluate } from '../lib/policy.mjs';
import { runHook } from './run.mjs';

runHook('guard', ({ dialect, action, policy }) => guardReply(dialect, evaluate(action, policy), action));

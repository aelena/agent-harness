// A deliberately small shell reader. It does not execute or expand anything:
// it recovers just enough structure (commands, arguments, pipes, redirects,
// nested `$(...)` / `bash -c` bodies) for the policy to judge a command by
// what it runs instead of by substring matching.
//
// Works for POSIX shells and, approximately, for PowerShell and cmd.
// Known gaps are listed in docs/conventions/hooks/policy-rules.md.

const MAX_DEPTH = 4;

function matchParen(src, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return src.length;
}

const ESCAPABLE = new Set([' ', '\t', '\n', '"', "'", '$', '`', '\\', ';', '|', '&', '<', '>', '(', ')', '*', '?', '#', '!']);

/**
 * Split a command line into segments.
 * Each segment: { words: (string | {redir})[], op, pipedFrom }.
 * Bodies of command substitutions are returned as extra segments.
 */
export function splitCommands(src, depth = 0) {
  const top = [];
  const nested = [];
  if (depth > MAX_DEPTH) return top;

  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  let op = null;
  const heredocs = [];

  const endWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const endSegment = (nextOp) => {
    endWord();
    if (words.length) {
      const seg = { words, op, pipedFrom: op === '|' ? top[top.length - 1] ?? null : null };
      top.push(seg);
    }
    words = [];
    op = nextOp;
  };
  const substitution = (from, to, keepFrom, keepTo) => {
    nested.push(...splitCommands(src.slice(from, to), depth + 1));
    word += src.slice(keepFrom, keepTo);
    inWord = true;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (quote === "'") {
      if (c === "'") quote = null;
      else word += c;
      continue;
    }

    if (c === '\\') {
      const next = src[i + 1];
      if (next === '\n') i++;
      else if (next !== undefined && ESCAPABLE.has(next)) {
        word += next;
        inWord = true;
        i++;
      } else {
        word += c; // keep Windows path separators intact
        inWord = true;
      }
      continue;
    }

    if (c === '$' && src[i + 1] === '(') {
      const end = matchParen(src, i + 1);
      substitution(i + 2, end, i, end + 1);
      i = end;
      continue;
    }
    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        substitution(i + 1, end, i, end + 1);
        i = end;
        continue;
      }
    }

    if (quote === '"') {
      if (c === '"') quote = null;
      else word += c;
      continue;
    }

    if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
      continue;
    }

    if ((c === '<' || c === '>') && src[i + 1] === '(') {
      const end = matchParen(src, i + 1);
      substitution(i + 2, end, i, end + 1);
      i = end;
      continue;
    }

    if (c === '>' || c === '<') {
      if (/^\d+$/.test(word)) {
        word = '';
        inWord = false;
      } else {
        endWord();
      }
      let tok = c;
      if (src[i + 1] === c) {
        tok += c;
        i++;
      }
      if (tok === '<<' && src[i + 1] === '<') {
        i++; // here-string: the next word is plain data
        continue;
      }
      if (tok === '<<') {
        const m = /^-?\s*(['"]?)([A-Za-z_][\w.-]*)\1/.exec(src.slice(i + 1));
        if (m) {
          heredocs.push(m[2]);
          i += m[0].length;
        }
        continue;
      }
      if (src[i + 1] === '&') {
        i++;
        while (/[\d-]/.test(src[i + 1] ?? '')) i++;
        continue;
      }
      words.push({ redir: tok });
      continue;
    }

    if (c === '#' && !inWord) {
      while (i + 1 < src.length && src[i + 1] !== '\n') i++;
      continue;
    }

    if (c === '\n') {
      endSegment(';');
      while (heredocs.length) {
        const delim = heredocs.shift();
        const body = src.slice(i + 1);
        const m = new RegExp(`^[ \\t]*${delim.replace(/[.]/g, '\\.')}[ \\t]*$`, 'm').exec(body);
        i = m ? i + m.index + m[0].length : src.length;
      }
      continue;
    }
    if (c === ';') {
      endSegment(';');
      continue;
    }
    if (c === '&') {
      if (src[i + 1] === '&') {
        i++;
        endSegment('&&');
      } else if (src[i + 1] === '>') {
        endWord();
        i++;
        if (src[i + 1] === '>') i++;
        words.push({ redir: '>' });
      } else {
        endSegment('&');
      }
      continue;
    }
    if (c === '|') {
      if (src[i + 1] === '|') {
        i++;
        endSegment('||');
      } else {
        if (src[i + 1] === '&') i++;
        endSegment('|');
      }
      continue;
    }
    if (c === '(' || c === ')') {
      endSegment(';');
      continue;
    }
    if ((c === '{' || c === '}') && !inWord) {
      endSegment(';');
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
      continue;
    }

    word += c;
    inWord = true;
  }
  endSegment(null);
  return [...top, ...nested];
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell', 'cmd']);
// wrapper -> flags that consume the following word
const WRAPPERS = {
  sudo: ['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-T', '-U'],
  doas: ['-u', '-C'],
  command: [],
  builtin: [],
  exec: ['-a'],
  nohup: [],
  time: [],
  setsid: [],
  nice: ['-n'],
  ionice: ['-c', '-n', '-p'],
  stdbuf: ['-i', '-o', '-e'],
  timeout: ['-s', '-k', '--signal', '--kill-after'],
  xargs: ['-I', '-n', '-P', '-d', '-L', '-s', '-E', '-a'],
  env: ['-u', '-C', '-S', '--unset', '--chdir'],
};

export function commandName(word) {
  return String(word)
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .toLowerCase()
    .replace(/\.(exe|cmd|bat|ps1)$/, '');
}

function resolveSegment(seg, depth) {
  const redirects = [];
  const plain = [];
  for (let i = 0; i < seg.words.length; i++) {
    const w = seg.words[i];
    if (typeof w === 'object') {
      const target = seg.words[i + 1];
      if (typeof target === 'string') {
        redirects.push({ op: w.redir, target });
        i++;
      }
    } else {
      plain.push(w);
    }
  }

  const assignments = [];
  let rest = plain;
  const takeAssignments = () => {
    while (rest.length && ASSIGNMENT.test(rest[0])) {
      assignments.push(rest[0]);
      rest = rest.slice(1);
    }
  };

  takeAssignments();
  for (let guard = 0; guard < 8 && rest.length; guard++) {
    const name = commandName(rest[0]);
    const valueFlags = WRAPPERS[name];
    if (!valueFlags) break;
    let j = 1;
    while (j < rest.length && rest[j].startsWith('-')) {
      if (rest[j] === '--') {
        j++;
        break;
      }
      j += valueFlags.includes(rest[j]) ? 2 : 1;
    }
    if (name === 'timeout' && j < rest.length) j++; // the duration
    const after = rest.slice(j);
    if (name === 'env') {
      const before = after.length;
      rest = after;
      takeAssignments();
      if (!rest.length) {
        // `env`, `env -0`, or `env FOO=1` with no command: prints the environment
        return [{ name: 'env', args: [], assignments, redirects, assignedOnly: before > 0, pipedFrom: null, seg }];
      }
      continue;
    }
    if (!after.length) break; // bare wrapper, e.g. `time`
    rest = after;
    takeAssignments();
  }

  if (!rest.length) return [];
  const name = commandName(rest[0]);
  const args = rest.slice(1);
  const self = { name, args, assignments, redirects, pipedFrom: null, seg };
  const out = [self];

  if (depth < MAX_DEPTH) {
    let body = null;
    if (SHELLS.has(name)) {
      const idx = args.findIndex((a) => /^(-c|-lc|-ic|-command|\/c|\/k)$/i.test(a) || /^-[a-z]*c$/.test(a));
      if (idx >= 0 && args[idx + 1] !== undefined) {
        body = name === 'cmd' || /^-command$/i.test(args[idx]) ? args.slice(idx + 1).join(' ') : args[idx + 1];
      }
    } else if (name === 'eval' || name === 'invoke-expression' || name === 'iex') {
      body = args.join(' ');
    }
    if (body) out.push(...analyze(body, depth + 1));
  }
  return out;
}

/**
 * Turn a command line into the list of simple commands it would run.
 * Each: { name, args, assignments, redirects: [{op, target}], pipedFrom }.
 */
export function analyze(src, depth = 0) {
  const segments = splitCommands(String(src ?? ''), depth);
  const lastOf = new Map();
  const out = [];
  for (const seg of segments) {
    const cmds = resolveSegment(seg, depth);
    if (!cmds.length) continue;
    cmds[0].pipedFrom = seg.pipedFrom ? lastOf.get(seg.pipedFrom) ?? null : null;
    lastOf.set(seg, cmds[0]);
    out.push(...cmds);
  }
  return out;
}

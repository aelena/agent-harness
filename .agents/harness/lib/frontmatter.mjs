// YAML frontmatter reader for the subset skills and agents use:
// scalars, quoted strings, booleans, nested maps, block lists, inline lists,
// and `>` / `|` block scalars. No dependency, errors carry line numbers.

function scalar(raw) {
  const s = raw.trim();
  if (s === '') return '';
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.startsWith('"') ? s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n') : s.slice(1, -1).replace(/''/g, "'");
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    return inner ? inner.split(',').map((x) => scalar(x)) : [];
  }
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
  if (s === 'null' || s === '~') return null;
  return s.replace(/\s+#.*$/, '');
}

const indentOf = (line) => line.length - line.trimStart().length;

function parseBlock(lines, start, indent) {
  let i = start;
  let result = null;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.text.trim() || line.text.trim().startsWith('#')) {
      i++;
      continue;
    }
    const ind = indentOf(line.text);
    if (ind < indent) break;
    if (ind > indent) throw new Error(`line ${line.no}: unexpected indentation`);
    const body = line.text.trim();

    if (body.startsWith('- ') || body === '-') {
      result ??= [];
      if (!Array.isArray(result)) throw new Error(`line ${line.no}: list item inside a map`);
      result.push(scalar(body.slice(1)));
      i++;
      continue;
    }

    const m = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/.exec(body);
    if (!m) throw new Error(`line ${line.no}: expected "key: value", got "${body}"`);
    result ??= {};
    if (Array.isArray(result)) throw new Error(`line ${line.no}: key inside a list`);
    const [, key, rest = ''] = m;
    if (key in result) throw new Error(`line ${line.no}: duplicate key "${key}"`);

    if (/^[>|][+-]?$/.test(rest.trim())) {
      const folded = rest.trim().startsWith('>');
      const chunk = [];
      i++;
      while (i < lines.length && (!lines[i].text.trim() || indentOf(lines[i].text) > indent)) chunk.push(lines[i++].text.trim());
      result[key] = (folded ? chunk.join(' ').replace(/\s+/g, ' ') : chunk.join('\n')).trim();
      continue;
    }
    if (rest.trim() === '') {
      const next = lines.slice(i + 1).find((l) => l.text.trim() && !l.text.trim().startsWith('#'));
      if (next && indentOf(next.text) > indent) {
        const [value, end] = parseBlock(lines, i + 1, indentOf(next.text));
        result[key] = value;
        i = end;
      } else if (next && indentOf(next.text) === indent && next.text.trim().startsWith('- ')) {
        const [value, end] = parseBlock(lines, i + 1, indent);
        result[key] = value;
        i = end;
      } else {
        result[key] = '';
        i++;
      }
      continue;
    }
    result[key] = scalar(rest);
    i++;
  }
  return [result ?? {}, i];
}

/**
 * @returns {{ data: object, body: string, bodyLine: number, error: string | null }}
 */
export function parseFrontmatter(text) {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!src.startsWith('---\n')) return { data: {}, body: src, bodyLine: 1, error: 'missing frontmatter: the file must start with a `---` line' };
  const end = src.indexOf('\n---', 4);
  if (end < 0) return { data: {}, body: src, bodyLine: 1, error: 'frontmatter is not closed with a `---` line' };
  const yaml = src.slice(4, end);
  const afterFence = src.indexOf('\n', end + 1);
  const body = afterFence < 0 ? '' : src.slice(afterFence + 1);
  const bodyLine = src.slice(0, afterFence + 1).split('\n').length;
  const lines = yaml.split('\n').map((t, idx) => ({ text: t.replace(/\t/g, '  '), no: idx + 2 }));
  try {
    const [data] = parseBlock(lines, 0, 0);
    return { data: Array.isArray(data) ? {} : data, body, bodyLine, error: Array.isArray(data) ? 'frontmatter must be a map' : null };
  } catch (e) {
    return { data: {}, body, bodyLine, error: `frontmatter: ${e.message}` };
  }
}

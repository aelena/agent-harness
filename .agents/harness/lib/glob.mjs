// Tiny glob matcher. Supports `**`, `*`, `?`. Case-insensitive, slash-agnostic.
// A pattern matches a path when it matches the whole path or any suffix that
// starts at a directory boundary, so `.env` matches `/repo/app/.env` and
// `.git/**` matches `C:\repo\.git\config`.

export function normalizePath(p) {
  return String(p).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
}

export function globToRegExpSource(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return re;
}

const cache = new Map();

export function matchPath(path, glob) {
  let re = cache.get(glob);
  if (!re) {
    re = new RegExp(`(?:^|/)${globToRegExpSource(normalizePath(glob).toLowerCase())}$`);
    cache.set(glob, re);
  }
  return re.test(normalizePath(path).toLowerCase());
}

export function matchAny(path, globs) {
  return globs.find((g) => matchPath(path, g)) ?? null;
}

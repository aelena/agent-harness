# ts7-lsp

TypeScript and JavaScript code intelligence (go to definition, references, diagnostics) for Claude Code, through the LSP server built into the TypeScript 7 native compiler. On large monorepos it indexes much faster than `typescript-language-server` with `tsserver`.

Requires a TypeScript 7 or newer `tsc` on `PATH` (`npm install -g typescript`).

```
/plugin marketplace add aelena/agent-harness
/plugin install ts7-lsp@agent-harness
/plugin disable typescript-lsp@claude-plugins-official
```

The server definition lives in the marketplace entry (`.claude-plugin/marketplace.json`), so this folder holds only this file.

Carried over from [CodelyTV/agent-harness](https://github.com/CodelyTV/agent-harness). It has not been run as part of this repository's tests.

# controlled-english

An output style for Claude Code. It makes answers short, literal and active-voice, in the spirit of [ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/), the controlled language that aerospace uses for maintenance documentation. The result is easier to scan, easier to translate, and harder to misread.

It changes how the agent writes to you. It does not change the code it writes.

```
/plugin marketplace add aelena/agent-harness
/plugin install controlled-english@agent-harness
```

Then open `/config`, find **Output style**, and select `Controlled English`.

The idea comes from the `ste100` plugin of [CodelyTV/agent-harness](https://github.com/CodelyTV/agent-harness). The rules here are a rewrite, not the official standard.

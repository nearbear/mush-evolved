# Code map

Where each file lives, one line per file, split by package. Read only the part you need:

- `docs/code-map/shared.md`: rules engine, types, config, protocol (`shared/src/`).
- `docs/code-map/server.md`: worker, Matchmaker, GameRoom, bots (`server/src/`).
- `docs/code-map/tools.md`: build-time and dev tooling (`tools/src/`).
- `docs/code-map/web.md`: the React client (`web/src/`).

What the rules do is in `docs/rules/implemented-rules.md`; what is tested is in `docs/process/testing.md`; how the isometric view works is in `web/src/iso/CLAUDE.md`.

Tests live in a `tests/` folder next to `src/` in each package, mirroring the `src/` layout.

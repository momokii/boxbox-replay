# Contributing

Thanks for looking. This is a small, deliberately transparent F1 replay app; the
data and its limits are part of the product, not decoration.

## Setup

```bash
cp .env.example .env          # optional AI/OpenF1 credentials
chmod 600 .env
./scripts/setup.sh            # API + web, http://localhost:8501
```

The first open of a cold session builds ~20 per-driver OpenF1 location calls at
the free 30 requests/minute budget; later opens are instant. Use the in-app
progress card and do not raise the upstream rate limit.

## Checks

```bash
.venv/bin/ruff check .
.venv/bin/python -m pytest
cd web && npm test && npx tsc -b && npm run lint && npm run build
```

Keep the two test suites green. Add a regression test when fixing a bug or
changing a contract; pure helpers should stay separable from React and network
adapters.

## Data and AI rules

- Never invent a missing value. Use `—` and explain the gap; empty results must
  not be cached as a permanent answer.
- Keep OpenF1 and Jolpica budgets and attribution intact. Do not add a paid or
  live source without an explicit decision in `docs/` and `.claude/state/`.
- AI is server-side, on-demand, and grounded in server-built facts. The client
  must not send its own “facts”, and the AI must not recalculate the model.
- Driver images are remote F1 assets with a number fallback; do not rehost them.

## Docs and commits

Update the README and the relevant `docs/` file in the same change. State files
live in `.claude/state/`; record a decision when a choice affects future work.
Commits are conventional (`feat`, `fix`, `docs`, `ci`, `test`) and each release
gets a tag after CI is green.

## Review

Before a release, run the browser audit for replay, Battle, Duel, Telemetry,
Performance, Pit Wall, Strategy, Ask, Standings, Archive, Report, Download,
offline, mobile, and the 3D fallback. Private credentials must never appear in a
diff, screenshot, log, or issue.

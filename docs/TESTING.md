# Testing

The suite is deliberately small: 73 Python and 53 frontend tests. Every test
earns its place by protecting a behaviour someone could break.

## What we test

| Layer | Files | Why |
|---|---|---|
| Pure maths | `tests/test_analysis.py` | Laps, sectors, corner detection, gaps, pit model, duel alignment. These are invariants (e.g. the delta must close on the official lap time), not implementation details. |
| API contracts | `tests/test_api.py` | One happy path and one failure per endpoint that the UI depends on; the response shapes are the interface. |
| Fetch and cache | `tests/test_data_loader.py` | Caching, 404/empty handling, retries, concurrency, session windows. These are the bugs that reach users as "the app is broken". |
| Request budget | `tests/test_ratelimit.py` | Both OpenF1 limits, with a fake clock — no sleeping tests. |
| Strategy model | `tests/test_strategy.py` | Clean-lap filtering, pace/wear profile, ranked scenarios, SC windows, degenerate data. |
| AI boundary | `tests/test_ai.py` | Required provider headers, no key leakage, caching, the off-topic sentinel, prompt grounding. |
| Legacy coach | `tests/test_coach.py` | Prompt grounding, confidence thresholds, radio format. |
| Playback maths | `session`, `playback`, `duel`, `perf` tests | Interpolation, gap guards, tyre slopes, the duel's start/finish invariants. |
| Browser state | `recents`, `chatStore`, `throttle`, `inputs`, `sort` | localStorage/sessionStorage corruption, the click-throttle bug, DRS nulls, sorting semantics. |
| Share card | `shareCard` | The 1200×630 layout: fit, centring, empty outline. |
| Battles now | `battles` | Neighbour comparison, threshold, ordering, missing gaps. |

## What we do not test

- **Trivial wrappers and getters.** If deleting the function would only move a
  few lines, it does not get a test — the code gets deleted instead.
- **Cosmetic formatting**, except three-decimal lap times and signed gaps where
  the exact output is part of the product.
- **Implementation details** such as the CLI output header parser or the exact
  number of reducer calls.
- **Snapshots and rendering.** The UI is verified in a real browser with
  screenshots and interaction checks, not by asserting DOM trees.
- **Dead paths.** Removed endpoints and helpers are deleted rather than kept
  "for coverage": `/ai/ask`, lap-mode `/session/inputs`, `clamp_selection`,
  `format_lap_time`, `team_colors`.

## Rules for new tests

1. Every bug fix gets one regression test that fails before the fix.
2. Every endpoint gets one success case and one failure case; no matrix of
   parameter combinations unless the parameters change behaviour.
3. Prefer invariants ("delta(1) equals the official lap difference") over example
   values that will drift.
4. Mock the network, never the maths.
5. If a test needs more than ~30 lines of setup, the module under test likely
   needs a better seam — fix that first.

## Running

```bash
.venv/bin/python -m pytest          # 73 Python tests
cd web && npm test                  # 53 frontend tests
```

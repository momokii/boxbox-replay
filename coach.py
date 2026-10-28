"""LLM race-engineer coach: numbers -> prompt -> team-radio markdown. (M4)

M0 status: contract stub. Guardrails (binding, from the brief):
- The LLM explains measured numbers, never invents them.
- Delta < 0.05s is noise: the coach says "nothing to learn, ignore".
- Output is styled like a team-radio transcript with a confidence tag
  [HIGH/MED/LOW] and a "based on lap X vs ref Y" citation.
- The LLM token comes from the existing opencode-go env var (name TBD at M4);
  it never appears in code, logs, or the repo.
"""

from __future__ import annotations

__all__: list[str] = []

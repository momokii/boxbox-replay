"""LLM race-engineer coach: measured numbers -> prompt -> team-radio markdown. (M4)

Ground rules (binding):
- The LLM explains measured numbers, never invents them. Every prompt carries
  the exact figures; the model is told to say "noise, ignore it" below 0.05s.
- Output is styled like a team-radio transcript with a [HIGH/MED/LOW]
  confidence tag and a "based on lap X vs ref Y" citation.
- Auth uses the existing opencode setup on the machine (nothing in the repo).
  BOXBOX_MODEL optionally overrides the model. If the LLM is unreachable
  (e.g. inside a minimal container), ask_llm returns None and the UI shows
  the measured numbers with that note — never a fabricated answer.
"""

from __future__ import annotations

import os
import re
import subprocess

__all__ = ["build_prompt", "ask_llm", "render_radio", "confidence_for"]

LLM_TIMEOUT_S = 120
MODEL = os.getenv("BOXBOX_MODEL", "")


def confidence_for(loss_s: float | None) -> str:
    """HIGH >= 0.30s, MED 0.15-0.30s, LOW below (single-sample humility)."""
    if loss_s is None:
        return "LOW"
    if loss_s >= 0.30:
        return "HIGH"
    if loss_s >= 0.15:
        return "MED"
    return "LOW"


def build_prompt(
    driver: str,
    lap: int,
    ref_driver: str,
    ref_lap: int,
    corner: str,
    loss_s: float | None,
    lap_delta_s: float | None,
) -> str:
    """Grounded prompt: all numbers embedded, guardrails explicit."""
    return (
        "You are a Formula 1 race engineer on the pit wall. "
        "Explain ONLY the measured numbers below; never invent times, speeds, or events. "
        "If the corner loss is below 0.05s, say it is noise and there is nothing to learn. "
        "Keep it to 3 short radio-style sentences, then a line starting with "
        "'Advice:' with one concrete driving tip.\n"
        f"Driver: {driver} lap {lap} vs reference {ref_driver} lap {ref_lap}, {corner}.\n"
        f"Measured corner loss: {loss_s if loss_s is None else f'{loss_s:+.3f}s'} "
        f"(flagged only if > 0.15s).\n"
        f"Full-lap delta: {lap_delta_s if lap_delta_s is None else f'{lap_delta_s:+.3f}s'}.\n"
        "End with a confidence tag on its own line: [HIGH], [MED] or [LOW]."
    )


def _clean_output(text: str) -> str:
    """Strip ANSI codes and opencode session-header lines, keep the answer."""
    text = re.sub(r"\x1b\[[0-9;]*m", "", text)
    lines = [ln for ln in text.splitlines() if ln.strip()]
    while lines and (lines[0].startswith(">") or "·" in lines[0] or set(lines[0]) <= {"─", " "}):
        lines.pop(0)
    return "\n".join(lines).strip()


def ask_llm(prompt: str) -> str | None:
    """Run `opencode run` headless. None when unavailable/timed-out. Never raises."""
    try:
        cmd = ["opencode", "run"]
        if MODEL:
            cmd += ["-m", MODEL]
        proc = subprocess.run(
            [*cmd, prompt], capture_output=True, text=True, timeout=LLM_TIMEOUT_S
        )
        answer = _clean_output(proc.stdout)
        return answer or None
    except (OSError, subprocess.SubprocessError):
        return None


def render_radio(question: str, answer: str, confidence: str, basis: str) -> str:
    """Team-radio transcript markdown with confidence tag and basis citation."""
    return (
        f"**DRIVER:** {question}\n\n"
        f"**ENGINEER:** {answer}\n\n"
        f"`[{confidence}]` *{basis}*"
    )

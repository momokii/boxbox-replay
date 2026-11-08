"""Corner coach: measured numbers -> grounded prompt -> answer.

The prompt carries every figure and the 0.05 s noise floor. `ai.py` answers it
when configured; otherwise `fallback_answer` states the measurement in plain
language, so the corner button always returns something true.
"""

from __future__ import annotations

__all__ = ["build_prompt", "confidence_for", "fallback_answer"]


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
        "Do not add a confidence tag; the app shows its own."
    )


def fallback_answer(
    corner: str, loss_s: float | None, ref_driver: str, ref_lap: int
) -> str:
    """Plain, measured answer when the AI is unavailable. Never guesses."""
    if loss_s is None:
        return (
            f"No measured loss is available for {corner}. Compare the two laps "
            "directly before drawing a conclusion."
        )
    if abs(loss_s) < 0.05:
        return (
            f"{corner} cost {abs(loss_s):.3f}s against {ref_driver} on lap {ref_lap}. "
            "That is inside the 0.05s noise floor, so there is nothing reliable to fix."
        )
    if loss_s > 0:
        return (
            f"{corner} cost {loss_s:.3f}s against {ref_driver} on lap {ref_lap}. "
            "That is above the noise floor: compare your minimum speed and brake "
            "point with that lap."
        )
    return (
        f"You gained {abs(loss_s):.3f}s through {corner} against {ref_driver} on "
        f"lap {ref_lap}; that is a strength to keep."
    )

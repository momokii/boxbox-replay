"""M4: coach prompt grounding, confidence, radio format, LLM failure modes."""

import coach


def test_build_prompt_carries_numbers_and_guardrail():
    p = coach.build_prompt("#1 VER", 11, "#11 PER", 11, "T1", 0.234, -0.1)
    assert "+0.234s" in p and "lap 11 vs reference" in p and "T1" in p
    assert "0.05" in p and "never invent" in p


def test_confidence_thresholds():
    assert coach.confidence_for(0.45) == "HIGH"
    assert coach.confidence_for(0.20) == "MED"
    assert coach.confidence_for(0.04) == "LOW"
    assert coach.confidence_for(None) == "LOW"


def test_render_radio_format():
    md = coach.render_radio("What?", "Do this.", "MED", "based on lap 1 vs ref 1")
    assert md.startswith("**DRIVER:**") and "**ENGINEER:**" in md
    assert "`[MED]`" in md and "based on lap 1 vs ref 1" in md


def test_clean_output_strips_header():
    raw = "\x1b[0m\n> Model · stuff\n\nActual answer here."
    assert coach._clean_output(raw) == "Actual answer here."


def test_ask_llm_success_and_timeout(monkeypatch):
    import subprocess

    class Proc:
        stdout = "\x1b[0m\n> Model · x\n\nBrake later."

    monkeypatch.setattr(coach.subprocess, "run", lambda *a, **k: Proc())
    assert coach.ask_llm("hi") == "Brake later."

    def boom(*a, **k):
        raise subprocess.TimeoutExpired(cmd="x", timeout=1)

    monkeypatch.setattr(coach.subprocess, "run", boom)
    assert coach.ask_llm("hi") is None

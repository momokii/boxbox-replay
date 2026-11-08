"""Corner coach: grounded prompt, confidence, and the measured fallback."""

import coach


def test_build_prompt_carries_numbers_and_guardrail():
    prompt = coach.build_prompt("#1 VER", 11, "#11 PER", 11, "T1", 0.234, -0.1)
    assert "+0.234s" in prompt and "lap 11 vs reference" in prompt and "T1" in prompt
    assert "0.05" in prompt and "never invent" in prompt


def test_confidence_thresholds():
    assert coach.confidence_for(0.45) == "HIGH"
    assert coach.confidence_for(0.20) == "MED"
    assert coach.confidence_for(0.04) == "LOW"
    assert coach.confidence_for(None) == "LOW"


def test_fallback_answers_are_measured_and_honest():
    noise = coach.fallback_answer("T1", 0.02, "PER", 11)
    assert "noise floor" in noise and "0.020s" in noise
    real = coach.fallback_answer("T1", 0.234, "PER", 11)
    assert "0.234s" in real and "brake" in real
    gain = coach.fallback_answer("T1", -0.1, "PER", 11)
    assert "gained" in gain
    missing = coach.fallback_answer("T1", None, "PER", 11)
    assert "No measured loss" in missing

"""v3 strategy engine: clean laps, pace profile, scenarios, SC windows. Pure."""

import pandas as pd
import pytest

import strategy


def _frames():
    base = pd.Timestamp("2024-01-01T00:00:00+00:00")
    laps = []
    for lap in range(1, 21):
        if lap <= 10:
            duration = 90.0 + 0.05 * (lap - 1)
            pit_out = lap == 1
            if lap == 2:
                duration = 100.0  # slow lap
        else:
            duration = 89.0 + 0.04 * (lap - 11)
            pit_out = False
        laps.append(
            {
                "driver_number": 1,
                "lap_number": lap,
                "date_start": (base + pd.Timedelta(seconds=lap)).isoformat(),
                "lap_duration": duration,
                "is_pit_out_lap": pit_out,
            }
        )
    stints = pd.DataFrame(
        [
            {
                "driver_number": 1,
                "stint_number": 1,
                "lap_start": 1,
                "lap_end": 10,
                "compound": "SOFT",
                "tyre_age_at_start": 0,
            },
            {
                "driver_number": 1,
                "stint_number": 2,
                "lap_start": 11,
                "lap_end": 20,
                "compound": "HARD",
                "tyre_age_at_start": 0,
            },
        ]
    )
    pit = pd.DataFrame([{"driver_number": 1, "pit_duration": 21.0, "stop_duration": 2.5}])
    return pd.DataFrame(laps), stints, pit


def test_clean_laps_excludes_pit_out_and_slow():
    laps, stints, _ = _frames()
    clean, coverage = strategy.clean_stint_laps(laps, stints)
    assert 1 not in clean["lap_number"].tolist()  # pit out
    assert 2 not in clean["lap_number"].tolist()  # slow
    assert coverage["clean"] == 18
    assert coverage["reasons"]["slow"] == 1


def test_pace_profile_current_stint_and_compounds():
    laps, stints, _ = _frames()
    clean, _ = strategy.clean_stint_laps(laps, stints)
    profile = strategy.pace_profile(clean, stints)
    assert profile["measurable"] is True
    assert profile["compound"] == "HARD"
    assert profile["current_pace_s"] == pytest.approx(89.28, abs=0.05)
    assert profile["deg_s_per_lap"] == pytest.approx(0.04, abs=0.005)
    assert profile["fresh_pace_s"]["HARD"] < profile["fresh_pace_s"]["SOFT"]


def test_strategy_options_are_ranked_and_measured():
    laps, stints, pit = _frames()
    result = strategy.strategy_model(
        laps,
        stints,
        pit,
        strategy.StrategyOptions(driver=1, from_lap=12, laps_remaining=9, pit_loss_s=22.0),
        total_laps=20,
    )
    assert result["measurable"] is True
    assert result["pit_loss_source"] == "user"
    assert result["options"][0]["id"] == "stay"  # a 22s loss cannot pay back in 9 laps
    scores = [option["total_s"] for option in result["options"]]
    assert scores == sorted(scores)
    assert result["break_even_pit_loss_s"] < 22.0
    assert any("Wear is linear" in note for note in result["assumptions"])


def test_missing_driver_is_not_measurable_not_an_error():
    laps, stints, pit = _frames()
    result = strategy.strategy_model(
        laps, stints, pit, strategy.StrategyOptions(driver=99), total_laps=20
    )
    assert result["measurable"] is False
    assert result["options"] == []


def test_sc_windows_exclude_laps():
    laps, _, _ = _frames()
    base = pd.Timestamp("2024-01-01T00:00:00+00:00")
    control = pd.DataFrame(
        {
            "date": [
                (base + pd.Timedelta(seconds=3)).isoformat(),
                (base + pd.Timedelta(seconds=5)).isoformat(),
            ],
            "message": ["VSC DEPLOYED", "VSC ENDING"],
        }
    )
    excluded = strategy.sc_excluded_laps(laps, control, base, t0=0.0)
    assert excluded == {3, 4, 5}

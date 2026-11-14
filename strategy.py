"""v3 strategy engine: clean laps -> pace profile -> ranked scenarios. Pure.

Every number is measured or derived from the frames passed in; assumptions are
returned next to the totals. No network, no UI, no hidden constants beyond the
documented defaults.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

__all__ = [
    "LapFilterConfig",
    "StrategyOptions",
    "clean_stint_laps",
    "pace_profile",
    "simulate_strategies",
    "strategy_model",
    "sc_excluded_laps",
    "DEFAULT_PIT_LOSS_S",
]

DEFAULT_PIT_LOSS_S = 22.0
TRAFFIC_PENALTY_S = 5.0


@dataclass(frozen=True)
class LapFilterConfig:
    slow_lap_factor: float = 1.07
    min_clean_laps: int = 2


DEFAULT_FILTER = LapFilterConfig()


@dataclass(frozen=True)
class StrategyOptions:
    driver: int
    from_lap: int | None = None
    laps_remaining: int | None = None
    pit_loss_s: float | None = None
    gap_behind_s: float | None = None
    fuel_adj_s_per_lap: float = 0.0
    target_compound: str | None = None


def _num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def sc_excluded_laps(
    laps: pd.DataFrame, race_control: pd.DataFrame, session_start, t0: float
) -> set[int]:
    """Lap numbers that started inside a VSC/SC/red-flag window. Pure.

    Windows come from race-control messages: *DEPLOYED* opens, *ENDING* / *IN
    THIS LAP* / *TRACK CLEAR* closes. Missing closes are ignored rather than
    guessed.
    """
    if laps.empty or race_control.empty or "date" not in race_control.columns:
        return set()
    stamps = pd.to_datetime(race_control["date"], format="mixed", utc=True)
    messages = race_control["message"].fillna("").astype(str).str.upper()
    t = (stamps - session_start).dt.total_seconds() - t0
    opens = t[messages.str.contains("DEPLOYED", regex=False)].tolist()
    closes = t[
        messages.str.contains("ENDING|IN THIS LAP|TRACK CLEAR|GREEN", regex=True)
    ].tolist()
    if not opens:
        return set()
    windows = []
    for start in opens:
        later = [c for c in closes if c > start]
        if later:
            windows.append((start, min(later)))
    if "date_start" not in laps.columns:
        return set()
    lap_stamps = pd.to_datetime(laps["date_start"], format="mixed", utc=True)
    lap_t = (lap_stamps - session_start).dt.total_seconds() - t0
    out: set[int] = set()
    for window_start, window_end in windows:
        for lap_number, stamp in zip(laps["lap_number"], lap_t, strict=False):
            if window_start <= float(stamp) <= window_end:
                out.add(int(lap_number))
    return out


def clean_stint_laps(
    laps: pd.DataFrame,
    stints: pd.DataFrame,
    excluded_laps: set[int] | None = None,
    config: LapFilterConfig = DEFAULT_FILTER,
) -> tuple[pd.DataFrame, dict]:
    """Usable laps per stint with exclusion reasons. Pure."""
    if laps.empty or stints.empty or "lap_duration" not in laps.columns:
        return pd.DataFrame(), {"clean": 0, "excluded": 0, "reasons": ["no laps"]}
    frame = laps.copy()
    frame["lap_duration"] = _num(frame["lap_duration"])
    frame = frame.dropna(subset=["lap_duration"])
    if "is_pit_out_lap" in frame.columns:
        frame = frame[~frame["is_pit_out_lap"].astype(bool)]
    excluded = excluded_laps or set()
    frame = frame[~frame["lap_number"].astype(int).isin(excluded)]

    pieces = []
    for stint in stints.itertuples():
        start = getattr(stint, "lap_start", None)
        end = getattr(stint, "lap_end", None)
        if pd.isna(start) or pd.isna(end):
            continue
        segment = frame[(frame["lap_number"] >= int(start)) & (frame["lap_number"] <= int(end))]
        if segment.empty:
            continue
        segment = segment.copy()
        segment["stint_number"] = int(stint.stint_number)
        segment["lap_start"] = int(start)
        segment["lap_end"] = int(end)
        segment["compound"] = getattr(stint, "compound", None)
        segment["tyre_age_at_start"] = getattr(stint, "tyre_age_at_start", 0) or 0
        pieces.append(segment)
    merged = pd.concat(pieces, ignore_index=True) if pieces else pd.DataFrame()
    if merged.empty:
        return pd.DataFrame(), {"clean": 0, "excluded": len(frame), "reasons": ["no stint match"]}

    keep = []
    reasons: dict[str, int] = {}
    for _stint, rows in merged.groupby("stint_number"):
        median = float(rows["lap_duration"].median())
        limit = median * config.slow_lap_factor
        for row in rows.itertuples():
            if float(row.lap_duration) > limit:
                reasons["slow"] = reasons.get("slow", 0) + 1
                continue
            keep.append(row)
    clean = pd.DataFrame(keep)
    coverage = {
        "clean": int(len(clean)),
        "excluded": int(len(frame) - len(clean)),
        "reasons": reasons or {},
    }
    return clean, coverage


def pace_profile(
    clean: pd.DataFrame, stints: pd.DataFrame, config: LapFilterConfig = DEFAULT_FILTER
) -> dict:
    """Current pace, wear slope, per-compound fresh pace. Pure."""
    if clean.empty or stints.empty:
        return {"measurable": False, "reason": "no clean laps"}
    current_stint = int(clean["stint_number"].max())
    current_rows = clean[clean["stint_number"] == current_stint].sort_values("lap_number")
    compound = str(current_rows["compound"].iloc[-1] or "?")
    if len(current_rows) < config.min_clean_laps:
        return {"measurable": False, "reason": "not enough clean laps in the current stint"}

    # Current pace: median of the last few clean laps, not the whole stint, so
    # fuel/tyre age are closer to the moment being modelled.
    recent = current_rows.tail(5)
    current_pace = float(recent["lap_duration"].median())

    deg = 0.0
    deg_quality = None
    if len(current_rows) >= 3:
        x = (current_rows["lap_number"] - current_rows["lap_number"].min()).to_numpy(float)
        y = current_rows["lap_duration"].to_numpy(float)
        slope = float(np.polyfit(x, y, 1)[0])
        deg = max(0.0, min(1.5, slope))
        deg_quality = {"laps": int(len(current_rows)), "s_per_lap": round(deg, 4)}

    fresh: dict[str, float] = {}
    for stint, rows in clean.groupby("compound"):
        first = rows.sort_values("lap_number").head(3)
        if len(first) >= 2:
            fresh[str(stint)] = float(first["lap_duration"].median())
    overall_fresh = float(clean.sort_values("lap_number").head(5)["lap_duration"].median())
    fresh.setdefault(compound, overall_fresh)

    return {
        "measurable": True,
        "driver": int(clean["driver_number"].iloc[-1]),
        "current_stint": current_stint,
        "compound": compound,
        "current_pace_s": round(current_pace, 3),
        "deg_s_per_lap": round(deg, 4),
        "deg_quality": deg_quality,
        "fresh_pace_s": {k: round(v, 3) for k, v in fresh.items()},
        "current_tyre_age": int(
            current_rows["lap_number"].max()
            - current_rows["lap_start"].iloc[-1]
            + int(current_rows["tyre_age_at_start"].iloc[-1] or 0)
        ),
    }


def _sum_pace(base: float, deg: float, laps: int, fuel_adj: float = 0.0) -> float:
    """Sum of pace over `laps`, with linear wear and optional fuel gain."""
    return sum(base + deg * i - fuel_adj * i for i in range(laps))


def simulate_strategies(
    profile: dict,
    pit: pd.DataFrame,
    opts: StrategyOptions,
    total_laps: int,
) -> dict:
    """Ranked stay/pit scenarios with break-even and coverage. Pure."""
    if not profile.get("measurable"):
        return {
            "measurable": False,
            "reason": profile.get("reason", "not measurable"),
            "options": [],
            "assumptions": [],
            "coverage": {},
            "inputs_echo": asdict(opts),
        }

    from_lap = int(opts.from_lap or 1)
    remaining = opts.laps_remaining
    if remaining is None:
        remaining = max(1, int(total_laps) - from_lap + 1)
    remaining = max(1, int(remaining))

    pit_loss = opts.pit_loss_s
    pit_source = "user"
    if pit_loss is None:
        lane = None
        if not pit.empty and "pit_duration" in pit.columns:
            lane = _num(pit["pit_duration"]).dropna()
        if lane is not None and len(lane):
            pit_loss = float(lane.median())
            pit_source = "median pit-lane time"
        else:
            pit_loss = DEFAULT_PIT_LOSS_S
            pit_source = "default fallback"
    pit_loss = max(5.0, min(60.0, float(pit_loss)))

    traffic = opts.gap_behind_s is not None and float(opts.gap_behind_s) < pit_loss
    traffic_penalty = TRAFFIC_PENALTY_S if traffic else 0.0

    base = float(profile["current_pace_s"])
    deg = float(profile["deg_s_per_lap"])
    fuel = max(0.0, float(opts.fuel_adj_s_per_lap or 0.0))
    stay_total = _sum_pace(base, deg, remaining, fuel)

    options = [
        {
            "id": "stay",
            "label": f"Stay out on {profile['compound']}",
            "stops": 0,
            "compound_plan": [profile["compound"]],
            "total_s": round(stay_total, 2),
            "delta_to_best_s": 0.0,
            "rank": 1,
        }
    ]

    fresh = profile.get("fresh_pace_s", {})
    compounds = [c for c in fresh if c and c != "?"]
    if opts.target_compound:
        compounds = [c for c in compounds if c.upper() == opts.target_compound.upper()]
    for compound in compounds:
        pace = float(fresh[compound])
        total = pit_loss + traffic_penalty + _sum_pace(pace, deg, remaining)
        options.append(
            {
                "id": f"pit-now-{compound.lower()}",
                "label": f"Pit now for {compound}",
                "stops": 1,
                "compound_plan": [compound],
                "total_s": round(total, 2),
                "delta_to_best_s": 0.0,
                "rank": 1,
            }
        )

    # One delayed-stop alternative, only when there is enough room to matter.
    if remaining >= 6:
        wait = 3
        pace = float(fresh.get(profile["compound"], fresh[compounds[0]]))
        total = (
            _sum_pace(base, deg, wait, fuel)
            + pit_loss
            + traffic_penalty
            + _sum_pace(pace, deg, remaining - wait)
        )
        options.append(
            {
                "id": f"pit-in-{wait}",
                "label": f"Pit in {wait} laps ({profile['compound']})",
                "stops": 1,
                "compound_plan": [profile["compound"]],
                "total_s": round(total, 2),
                "delta_to_best_s": 0.0,
                "rank": 1,
            }
        )

    options.sort(key=lambda item: item["total_s"])
    best = options[0]["total_s"]
    for index, option in enumerate(options, start=1):
        option["rank"] = index
        option["delta_to_best_s"] = round(option["total_s"] - best, 2)

    pit_options = [o for o in options if o["id"] != "stay"]
    best_pit = min(pit_options, key=lambda item: item["total_s"]) if pit_options else None
    break_even = None
    if best_pit is not None:
        compound = best_pit["compound_plan"][0]
        break_even = round(
            remaining * (base - float(fresh[compound])) - traffic_penalty, 2
        )

    undercut = None
    gap = base - float(fresh.get(profile["compound"], base))
    if gap > 0.01:
        undercut = {
            "laps_needed": int(np.ceil(pit_loss / gap)),
            "note": "laps for fresh-tyre gain to repay the pit loss at current pace",
        }

    assumptions = [
        "Wear is linear per stint and floored at zero.",
        f"Pit loss {pit_loss:.1f}s from {pit_source}.",
        "Fresh-tyre pace is the median of the first clean laps on that compound for this driver.",
        "Staying out uses the current stint's recent clean-lap median.",
        "Fuel adjustment is off by default; no fuel load is published."
        if fuel == 0
        else f"Fuel adjustment {fuel:.3f}s/lap applied to the stay scenario only (assumption).",
    ]
    if traffic:
        assumptions.append(
            f"Traffic: {TRAFFIC_PENALTY_S:.1f}s penalty applied because the car "
            f"behind is within the pit loss."
        )
    assumptions.append(
        "No safety car, weather change, traffic evolution or rival strategy is simulated."
    )

    return {
        "measurable": True,
        "driver": int(opts.driver),
        "from_lap": from_lap,
        "laps_remaining": remaining,
        "pit_loss_s": round(pit_loss, 3),
        "pit_loss_source": pit_source,
        "traffic_on_exit": bool(traffic),
        "traffic_penalty_s": traffic_penalty,
        "options": options,
        "break_even_pit_loss_s": break_even,
        "undercut": undercut,
        "assumptions": assumptions,
        "coverage": profile.get("coverage", {}),
        "inputs_echo": {
            **asdict(opts),
            "pit_loss_s": round(pit_loss, 3),
            "laps_remaining": remaining,
            "compound": profile.get("compound"),
            "current_pace_s": profile.get("current_pace_s"),
            "deg_s_per_lap": profile.get("deg_s_per_lap"),
            "fresh_pace_s": profile.get("fresh_pace_s"),
        },
        "model": "v3",
        "toy": False,
    }


def strategy_model(
    laps: pd.DataFrame,
    stints: pd.DataFrame,
    pit: pd.DataFrame,
    opts: StrategyOptions,
    total_laps: int,
    excluded_laps: set[int] | None = None,
    config: LapFilterConfig = DEFAULT_FILTER,
) -> dict:
    """Orchestrator: filter -> profile -> simulate. Never raises on empty data."""
    if opts.driver not in set(laps.get("driver_number", [])):
        return {
            "measurable": False,
            "reason": "driver has no laps in this session",
            "options": [],
            "assumptions": [],
            "coverage": {},
            "inputs_echo": asdict(opts),
        }
    driver_laps = laps[laps["driver_number"] == opts.driver]
    driver_stints = stints[stints["driver_number"] == opts.driver]
    clean, coverage = clean_stint_laps(driver_laps, driver_stints, excluded_laps, config)
    profile = pace_profile(clean, driver_stints, config)
    result = simulate_strategies(profile, pit, opts, total_laps)
    result["coverage"] = coverage
    return result

"""Plotly builders: speed traces, gap chart (M2); animated map (M3).

Design language (binding): Night Pit-Wall — charcoal chrome, single amber
signal accent for playhead/primary actions, driver identity only on
lines/dots/labels, F1-standard sector colors elsewhere, tabular-nums for
times, mono for deltas.
"""

from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go

__all__ = ["speed_trace", "gap_chart", "PITWALL_TEMPLATE"]

PITWALL_TEMPLATE = {
    "layout": {
        "paper_bgcolor": "#161B24",
        "plot_bgcolor": "#0B0E13",
        "font": {"color": "#E8EDF3", "family": "monospace"},
        "xaxis": {"gridcolor": "#2A3342", "zerolinecolor": "#2A3342"},
        "yaxis": {"gridcolor": "#2A3342", "zerolinecolor": "#2A3342"},
        "margin": {"l": 48, "r": 16, "t": 32, "b": 40},
    }
}

#: Playhead / primary-action accent. Never used for driver identity.
AMBER = "#FFB224"


def _apply_theme(fig: go.Figure, title: str) -> go.Figure:
    fig.update_layout(title=title, **PITWALL_TEMPLATE["layout"])
    return fig


def speed_trace(
    series: dict[str, pd.DataFrame],
    colors: dict[str, str],
    playhead_s: float | None = None,
) -> go.Figure:
    """Overlaid speed (km/h) vs seconds-into-lap, one trace per `label -> df`.

    Each df needs `t` (seconds) and `speed` columns. Shared amber playhead
    cursor marks the one playhead time.
    """
    fig = go.Figure()
    for label, df in series.items():
        fig.add_trace(
            go.Scatter(
                x=df["t"],
                y=df["speed"],
                mode="lines",
                name=label,
                line={"color": colors.get(label, "#8A94A6"), "width": 2},
                hovertemplate=f"{label} %{{y:.0f}} km/h @ %{{x:.1f}}s<extra></extra>",
            )
        )
    if playhead_s is not None:
        fig.add_vline(x=playhead_s, line_color=AMBER, line_width=2)
    fig.update_xaxes(title_text="seconds into lap")
    fig.update_yaxes(title_text="km/h")
    return _apply_theme(fig, "Speed trace")


def gap_chart(intervals: pd.DataFrame, labels: dict[int, str]) -> go.Figure:
    """Gap-to-leader (s) vs session time, one line per driver.

    `labels` maps driver_number -> legend label. Expects `date`,
    `driver_number`, `gap_to_leader` columns; non-numeric gaps dropped.
    """
    df = intervals.copy()
    df["gap_to_leader"] = pd.to_numeric(df["gap_to_leader"], errors="coerce")
    df = df.dropna(subset=["gap_to_leader"]).sort_values("date")
    fig = go.Figure()
    for driver, g in df.groupby("driver_number"):
        fig.add_trace(
            go.Scatter(
                x=g["date"],
                y=g["gap_to_leader"],
                mode="lines",
                name=labels.get(int(driver), f"#{int(driver)}"),
                hovertemplate="%{y:.3f}s<extra></extra>",
            )
        )
    fig.update_yaxes(title_text="gap to leader (s)", autorange="reversed")
    return _apply_theme(fig, "Gap to leader")

"""M2: viz builders return themed figures with the expected traces."""

import pandas as pd

import viz


def test_speed_trace_overlays_and_playhead():
    a = pd.DataFrame({"t": [0.0, 1.0], "speed": [100, 300]})
    b = pd.DataFrame({"t": [0.0, 1.0], "speed": [110, 290]})
    colors = {"VER": "#3671C6", "LEC": "#E80020"}
    fig = viz.speed_trace({"VER": a, "LEC": b}, colors, playhead_s=0.5)
    assert [t.name for t in fig.data] == ["VER", "LEC"]
    assert fig.data[0].line.color == "#3671C6"
    assert any(s.x0 == s.x1 == 0.5 and s.line.color == viz.AMBER for s in fig.layout.shapes)
    assert fig.layout.paper_bgcolor == "#161B24"


def test_gap_chart_drops_bad_gaps():
    df = pd.DataFrame(
        {
            "date": pd.to_datetime(["2024-01-01", "2024-01-01", "2024-01-02"]),
            "driver_number": [1, 1, 2],
            "gap_to_leader": [0.0, "n/a", 1.234],
        }
    )
    fig = viz.gap_chart(df, {1: "VER", 2: "LEC"})
    assert {t.name for t in fig.data} == {"VER", "LEC"}

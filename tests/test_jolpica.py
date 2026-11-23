"""Jolpica archive adapter: pure parsing and honest empty fallbacks."""

import jolpica


def _mrdriver(position, code, name, points, team="Ferrari"):
    return {
        "position": str(position),
        "points": str(points),
        "wins": "1" if position == 1 else "0",
        "Driver": {"driverId": code.lower(), "code": code, "givenName": name, "familyName": "X"},
        "Constructors": [{"name": team}],
    }


def test_standings_parse(monkeypatch):
    fake = {
        "MRData": {
            "StandingsTable": {
                "StandingsLists": [
                    {
                        "DriverStandings": [_mrdriver(1, "VER", "Max", 25)],
                        "ConstructorStandings": [
                            {
                                "position": "1",
                                "points": "40",
                                "wins": "1",
                                "Constructor": {"constructorId": "ferrari", "name": "Ferrari"},
                            }
                        ],
                    }
                ]
            }
        }
    }
    monkeypatch.setattr(jolpica, "_get", lambda *a, **k: fake)
    got = jolpica.standings(2024, 1)
    assert got["drivers"][0]["code"] == "VER"
    assert got["drivers"][0]["points"] == 25.0
    assert got["constructors"][0]["name"] == "Ferrari"
    assert got["license"] == "CC BY-NC-SA 4.0"


def test_results_empty_is_honest(monkeypatch):
    monkeypatch.setattr(jolpica, "_get", lambda *a, **k: {"MRData": {"RaceTable": {"Races": []}}})
    got = jolpica.results(1950, 99)
    assert got["race"] is None
    assert got["results"] == []


def test_progression_aligns_missing_rounds(monkeypatch):
    rows = {
        1: [_mrdriver(1, "VER", "Max", 25), _mrdriver(2, "LEC", "Charles", 18)],
        2: [_mrdriver(1, "VER", "Max", 44), _mrdriver(2, "LEC", "Charles", 36)],
    }

    def fake_get(path, params=None, **kwargs):
        if "races.json" in path:
            return {"MRData": {"RaceTable": {"Races": []}}}
        round_no = int(path.split("/")[1])
        return {
            "MRData": {
                "StandingsTable": {
                    "StandingsLists": [{"DriverStandings": rows.get(round_no, [])}]
                }
            }
        }

    monkeypatch.setattr(jolpica, "_get", fake_get)
    got = jolpica.progression(2024, 3)
    # Round 3 has no data and is skipped, not fabricated.
    assert got["rounds"] == [1, 2]
    assert got["series"][0]["code"] == "VER"
    assert got["series"][0]["points"] == [25.0, 44.0]


def test_seasons_sorted(monkeypatch):
    fake = {"MRData": {"SeasonTable": {"Seasons": [{"season": "2024"}, {"season": "1950"}]}}}
    monkeypatch.setattr(jolpica, "_get", lambda *a, **k: fake)
    assert jolpica.seasons() == [1950, 2024]


def test_progression_carries_points_forward(monkeypatch):
    rows = {
        1: [_mrdriver(1, "VER", "Max", 25), _mrdriver(2, "LEC", "Charles", 18)],
        2: [_mrdriver(1, "VER", "Max", 44)],
    }

    def fake_get(path, params=None, **kwargs):
        if "races.json" in path:
            return {"MRData": {"RaceTable": {"Races": []}}}
        round_no = int(path.split("/")[1])
        return {
            "MRData": {
                "StandingsTable": {
                    "StandingsLists": [{"DriverStandings": rows.get(round_no, [])}]
                }
            }
        }

    monkeypatch.setattr(jolpica, "_get", fake_get)
    got = jolpica.progression(2024, 2)
    lec = next(s for s in got["series"] if s["code"] == "LEC")
    assert lec["points"] == [18.0, 18.0]


def test_progression_returns_race_context(monkeypatch):
    rows = {1: [_mrdriver(1, "VER", "Max", 25)]}

    def fake_get(path, params=None, **kwargs):
        if "races.json" in path:
            return {
                "MRData": {
                    "RaceTable": {
                        "Races": [
                            {
                                "round": "1",
                                "raceName": "Australian Grand Prix",
                                "date": "2024-03-10",
                            }
                        ]
                    }
                }
            }
        return {
            "MRData": {
                "StandingsTable": {"StandingsLists": [{"DriverStandings": rows[1]}]}
            }
        }

    monkeypatch.setattr(jolpica, "_get", fake_get)
    got = jolpica.progression(2024, 1)
    assert got["races"] == [
        {"round": 1, "race_name": "Australian Grand Prix", "date": "2024-03-10"}
    ]


def test_fetch_fails_fast_after_bounded_retries(monkeypatch):
    """The archive is bounded so the Grid cannot hang for ~100 seconds."""
    calls = []

    class FakeClient:
        def __init__(self, **kwargs):
            self.timeout = kwargs.get("timeout")

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, *args, **kwargs):
            calls.append(1)
            raise jolpica.httpx.ConnectTimeout("offline")

    monkeypatch.setattr(jolpica.httpx, "Client", FakeClient)
    monkeypatch.setattr(jolpica.time, "sleep", lambda _: None)
    try:
        jolpica._fetch("2026/driverstandings.json", {"limit": 100})
    except jolpica.JolpicaUnavailable:
        pass
    else:
        raise AssertionError("expected JolpicaUnavailable")
    assert len(calls) == jolpica.MAX_RETRIES
    assert jolpica.REQUEST_TIMEOUT_S <= 6
    assert jolpica.MAX_RETRIES <= 2

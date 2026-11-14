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

    def fake_get(path, params=None):
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

    def fake_get(path, params=None):
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

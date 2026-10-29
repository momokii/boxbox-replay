"""Headless Streamlit smoke: executes app.py top-to-bottom with real cached data.

Not part of tests/ (needs network on cold cache). Run: .venv/bin/python scripts/smoke_app.py
Fails loudly on any uncaught script exception.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from streamlit.testing.v1 import AppTest


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    at = AppTest.from_file(str(root / "app.py"), default_timeout=300)
    at.run()
    if at.exception:
        print("APP EXCEPTION:")
        for exc in at.exception:
            print(repr(exc))
        sys.exit(1)
    for widget in (*at.selectbox, *at.multiselect, *at.number_input, *at.checkbox):
        print(f"OK widget: {widget.label!r} -> {widget.value!r}")
    print(f"tables: {len(at.dataframe)} | subheaders: {[s.value for s in at.subheader]}")
    assert len(at.dataframe) >= 1, "lap table did not render"
    print("SMOKE PASS: script ran with no uncaught exception")


def rich_path() -> None:
    """Suzuka 2024 Race: exercises map, coach sections, and stint rendering."""
    root = Path(__file__).resolve().parent.parent
    at = AppTest.from_file(str(root / "app.py"), default_timeout=300)
    at.run()
    at.selectbox[0].set_value(2024).run()
    at.selectbox[1].set_value(1232).run()
    at.selectbox[2].set_value(9496).run()
    if at.exception:
        print("RICH PATH EXCEPTION:")
        for exc in at.exception:
            print(repr(exc))
        sys.exit(1)
    print(f"rich tables: {len(at.dataframe)} | subheaders: {[s.value for s in at.subheader]}")
    assert len(at.dataframe) >= 1
    print("RICH PATH PASS")


if __name__ == "__main__":
    main()
    rich_path()

"""Visual review harness: drive the app like a user, screenshot every state.

Usage: /tmp/vizvenv/bin/python scripts/viz_review.py [outdir]
Screenshots into /tmp/viz/ by default. Requires the stack up on :8501.
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8501"
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/viz")
OUT.mkdir(parents=True, exist_ok=True)


def shot(page, name: str, full: bool = True) -> None:
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path), full_page=full)
    print(f"saved {path}")


def select_by_label(page, label_text: str, value: str) -> None:
    page.get_by_label(label_text, exact=True).select_option(value)


def main() -> None:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(2500)
        shot(page, "01-initial")

        # picker <select>s in order: Season, Grand Prix, Session
        selects = page.locator(".pickers select")
        selects.nth(0).select_option("2024")
        page.wait_for_timeout(3000)
        gp = selects.nth(1)
        opts = {
            o.get_attribute("value"): (o.text_content() or "") for o in gp.locator("option").all()
        }
        key = next((v for v, t in opts.items() if v and "Japanese" in t), None)
        print("meetings:", [t.strip()[:40] for t in opts.values() if t.strip()][:6])
        assert key, "Japanese GP not found"
        gp.select_option(key)
        page.wait_for_timeout(3000)
        sess = selects.nth(2)
        sopts = {
            o.get_attribute("value"): (o.text_content() or "") for o in sess.locator("option").all()
        }
        print("sessions:", [t.strip()[:50] for t in sopts.values() if t.strip()][:8])
        race = next((v for v, t in sopts.items() if v and t.startswith("Race")), None)
        assert race, "Race session not found"
        sess.select_option(race)

        # wait for replay to load (geometry + drivers)
        page.wait_for_timeout(25000)
        shot(page, "02-replay-top", full=False)
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        shot(page, "03-replay-bottom", full=False)
        page.evaluate("window.scrollTo(0, 0)")

        # battle tab
        page.get_by_role("tab", name="battle").click()
        page.wait_for_timeout(8000)
        shot(page, "04-battle", full=False)

        # performance tab
        page.get_by_role("tab", name="performance").click()
        page.wait_for_timeout(8000)
        shot(page, "05-performance", full=False)

        # pit tab
        page.get_by_role("tab", name="Pit wall").click()
        page.wait_for_timeout(5000)
        shot(page, "06-pit", full=False)

        # console/page errors
        if errors:
            print("PAGE ERRORS:")
            for e in errors[:10]:
                print(" -", e[:300])
        else:
            print("no page errors")
        browser.close()


if __name__ == "__main__":
    main()

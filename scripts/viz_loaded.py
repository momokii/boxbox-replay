"""Capture the fully-loaded replay state: select Suzuka 2024 Race, wait for the
map bundle, press Play, screenshot the playing state + tower gaps."""


from playwright.sync_api import sync_playwright

BASE = "http://localhost:8501"

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(2000)
    selects = page.locator(".pickers select")
    selects.nth(0).select_option("2024")
    page.wait_for_timeout(2500)
    gp = selects.nth(1)
    key = next(
        v
        for v, t in (
            (o.get_attribute("value"), o.text_content() or "") for o in gp.locator("option").all()
        )
        if v and "Japanese" in t
    )
    gp.select_option(key)
    page.wait_for_timeout(2500)
    sess = selects.nth(2)
    race = next(
        v
        for v, t in (
            (o.get_attribute("value"), o.text_content() or "") for o in sess.locator("option").all()
        )
        if v and t.startswith("Race")
    )
    sess.select_option(race)
    # wait until the loading indicator is gone (cold cache can take minutes)
    try:
        page.wait_for_function(
            "() => !document.body.textContent.includes('Loading drivers')", timeout=240000
        )
    except Exception as e:
        print("still loading after 4min:", e)
    page.wait_for_timeout(2000)
    page.screenshot(path="/tmp/viz/10-loaded-idle.png")
    print("saved idle")
    # press play, let it run, screenshot mid-playback
    page.get_by_role("button", name="Play", exact=True).click()
    page.wait_for_timeout(6000)
    page.screenshot(path="/tmp/viz/11-playing.png")
    print("saved playing")
    # click the map center (likely a corner area) then screenshot engineer
    page.locator(".stage canvas").first.click(position={"x": 400, "y": 150})
    page.wait_for_timeout(2000)
    page.screenshot(path="/tmp/viz/12-corner.png")
    print("saved corner")
    if errors:
        print("PAGE ERRORS:")
        for e in errors[:10]:
            print(" -", e[:300])
    else:
        print("no page errors")
    browser.close()

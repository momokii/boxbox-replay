"""Deterministic tests for the OpenF1 request budget (no real sleeping)."""

from __future__ import annotations

import pytest

from ratelimit import TokenBucket


class FakeTime:
    def __init__(self, start: float = 1_000.0) -> None:
        self.now = start
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def test_idle_bucket_does_not_wait():
    fake = FakeTime()
    bucket = TokenBucket(3, 30, clock=fake.monotonic, sleep=fake.sleep)
    bucket.acquire()
    assert fake.sleeps == []


def test_minimum_gap_between_calls():
    fake = FakeTime()
    bucket = TokenBucket(3, 30, clock=fake.monotonic, sleep=fake.sleep)
    bucket.acquire()
    bucket.acquire()
    assert fake.sleeps == [pytest.approx(1 / 3)]


def test_calls_are_capped_per_rolling_minute():
    fake = FakeTime()
    bucket = TokenBucket(1e9, 30, clock=fake.monotonic, sleep=fake.sleep)
    for _ in range(30):
        bucket.acquire()
    assert fake.sleeps == []

    started = fake.now
    bucket.acquire()
    # The 31st call has to wait for the first stamp to leave the 60s window.
    assert fake.now - started >= 59.9


def test_window_slides_after_sixty_seconds():
    fake = FakeTime()
    bucket = TokenBucket(1e9, 5, clock=fake.monotonic, sleep=fake.sleep)
    for _ in range(5):
        bucket.acquire()
    fake.now += 61
    bucket.acquire()
    assert fake.sleeps == []


def test_rejects_non_positive_limits():
    with pytest.raises(ValueError):
        TokenBucket(0, 30)
    with pytest.raises(ValueError):
        TokenBucket(3, 0)


def test_sponsor_tier_limits_can_be_raised():
    fake = FakeTime()
    bucket = TokenBucket(1e9, 60, clock=fake.monotonic, sleep=fake.sleep)
    for _ in range(60):
        bucket.acquire()
    assert fake.sleeps == []

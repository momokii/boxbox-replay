"""Request budget for the free OpenF1 tier.

The public tier allows 3 requests/second and 30 requests/minute per IP. A fixed
inter-request gap only enforces the first number — 0.4 s spacing is 150/min —
so retries used to absorb a steady stream of 429s while the UI just looked
slow. This module enforces both limits with one bucket.

The clock and sleep are injectable so tests run instantly and deterministically.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable

WINDOW_S = 60.0
EPSILON = 1e-6


class TokenBucket:
    """Sliding-window limiter: minimum gap plus N calls per rolling minute."""

    def __init__(
        self,
        per_second: float,
        per_minute: int,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if per_second <= 0 or per_minute <= 0:
            raise ValueError("rate limits must be positive")
        self.min_gap = 1.0 / per_second
        self.per_minute = int(per_minute)
        self._clock = clock
        self._sleep = sleep
        self._last = 0.0
        self._stamps: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        """Block until one request fits inside both limits, then record it."""
        with self._lock:
            while True:
                now = self._clock()
                while self._stamps and now - self._stamps[0] >= WINDOW_S - EPSILON:
                    self._stamps.popleft()

                wait = 0.0
                if self._last:
                    wait = max(wait, self.min_gap - (now - self._last))
                if len(self._stamps) >= self.per_minute:
                    # Absolute target avoids a residual sub-microsecond sleep loop
                    # when the clock lands a hair short of the window edge.
                    wait = max(wait, self._stamps[0] + WINDOW_S - now)

                if wait <= EPSILON:
                    self._last = now
                    self._stamps.append(now)
                    return
                self._sleep(wait)

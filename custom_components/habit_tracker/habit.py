"""Habit data model and persistence."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    ALL_DAYS,
    CONF_COLOR,
    CONF_DAYS,
    CONF_HABIT_TYPE,
    CONF_PER_WEEK,
    CONF_ICON,
    CONF_TARGET,
    DOMAIN,
    SIGNAL_UPDATED,
    STORAGE_VERSION,
    TYPE_BOOLEAN,
)


def today() -> date:
    """Return today's date in the Home Assistant time zone."""
    return dt_util.now().date()


def week_start(day: date) -> date:
    """Return the Monday of the week containing day."""
    return day - timedelta(days=day.weekday())


class Habit:
    """One tracked habit, backed by its own storage file."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}.{entry.entry_id}"
        )
        self.log: dict[str, int] = {}

    @property
    def entry_id(self) -> str:
        return self.entry.entry_id

    @property
    def name(self) -> str:
        return self.entry.title

    @property
    def options(self) -> dict[str, Any]:
        return {**self.entry.data, **self.entry.options}

    @property
    def habit_type(self) -> str:
        return self.options.get(CONF_HABIT_TYPE, TYPE_BOOLEAN)

    @property
    def target(self) -> int:
        if self.habit_type == TYPE_BOOLEAN:
            return 1
        return max(1, int(self.options.get(CONF_TARGET) or 1))

    @property
    def days(self) -> list[int]:
        """Planned weekdays, Monday = 0."""
        days = self.options.get(CONF_DAYS) or ALL_DAYS
        return sorted(int(d) for d in days)

    @property
    def weekly_goal(self) -> int:
        """Done days needed per week: the set count, else one per planned day."""
        per_week = self.options.get(CONF_PER_WEEK)
        if per_week:
            return max(1, min(7, int(per_week)))
        return len(self.days)

    @property
    def is_daily(self) -> bool:
        return self.weekly_goal == 7

    @property
    def color(self) -> str | None:
        """The color the user picked, as #rrggbb, or None."""
        return self.options.get(CONF_COLOR) or None

    @property
    def icon(self) -> str | None:
        return self.options.get(CONF_ICON) or None

    async def async_load(self) -> None:
        data = await self._store.async_load()
        self.log = dict((data or {}).get("log", {}))

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def value(self, day: date) -> int:
        return self.log.get(day.isoformat(), 0)

    def is_done(self, day: date) -> bool:
        return self.value(day) >= self.target

    async def async_set_value(self, day: date, value: int) -> None:
        key = day.isoformat()
        value = max(0, int(value))
        if self.habit_type == TYPE_BOOLEAN:
            value = min(value, 1)
        if value:
            self.log[key] = value
        else:
            self.log.pop(key, None)
        await self._store.async_save({"log": self.log})
        async_dispatcher_send(self.hass, SIGNAL_UPDATED, self.entry_id)

    async def async_toggle(self, day: date) -> None:
        if self.habit_type == TYPE_BOOLEAN:
            await self.async_set_value(day, 0 if self.value(day) else 1)
        else:
            # Toggling a count habit jumps between empty and the target.
            await self.async_set_value(day, 0 if self.value(day) else self.target)

    def streak(self, until: date | None = None) -> int:
        """Daily habits: consecutive done days ending today (or yesterday).

        Other habits: consecutive weeks that met the weekly goal, counting the
        current week once it is met.
        """
        day = until or today()
        if self.is_daily:
            if not self.is_done(day):
                day -= timedelta(days=1)
            count = 0
            while self.is_done(day):
                count += 1
                day -= timedelta(days=1)
            return count
        start = week_start(day)
        if self.week_done(start) < self.weekly_goal:
            start -= timedelta(days=7)
        count = 0
        while self.week_done(start) >= self.weekly_goal:
            count += 1
            start -= timedelta(days=7)
        return count

    def week_done(self, start: date) -> int:
        return sum(1 for i in range(7) if self.is_done(start + timedelta(days=i)))

    def week_percent(self, start: date, now: date | None = None) -> int:
        """Progress in the week.

        Daily habits count only the days up to today. Other habits show how
        far the week is toward its goal (3 of 3 done = 100 %).
        """
        now = now or today()
        if not self.is_daily:
            return min(100, round(self.week_done(start) * 100 / self.weekly_goal))
        days = [start + timedelta(days=i) for i in range(7)]
        elapsed = [d for d in days if d <= now]
        if not elapsed:
            return 0
        done = sum(1 for d in elapsed if self.is_done(d))
        return round(done * 100 / len(elapsed))

    def range_values(self, start: date, end: date) -> dict[str, int]:
        """Logged values from start to end inclusive, only days with a value."""
        first, last = start.isoformat(), end.isoformat()
        return {day: value for day, value in self.log.items() if first <= day <= last}

    def week_values(self, start: date) -> dict[str, int]:
        return {
            (start + timedelta(days=i)).isoformat(): self.value(start + timedelta(days=i))
            for i in range(7)
        }

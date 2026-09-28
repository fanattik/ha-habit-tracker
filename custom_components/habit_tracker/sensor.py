"""Sensor for each habit: this week's completion in percent."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import PERCENTAGE
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_change

from .const import DOMAIN, SIGNAL_UPDATED
from .habit import Habit, today, week_start


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([HabitSensor(hass.data[DOMAIN][entry.entry_id])])


class HabitSensor(SensorEntity):
    """Weekly completion of one habit, with today's value and streak."""

    _attr_has_entity_name = True
    _attr_name = None
    _attr_native_unit_of_measurement = PERCENTAGE
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_should_poll = False

    def __init__(self, habit: Habit) -> None:
        self._habit = habit
        self._attr_unique_id = habit.entry_id
        self._attr_icon = habit.icon or "mdi:checkbox-marked-circle-outline"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, habit.entry_id)},
            name=habit.name,
            manufacturer="Habit Tracker",
            entry_type=DeviceEntryType.SERVICE,
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATED, self._handle_update)
        )
        # A new day changes the percent and streak without any user action.
        self.async_on_remove(
            async_track_time_change(
                self.hass, self._handle_midnight, hour=0, minute=0, second=1
            )
        )

    @callback
    def _handle_update(self, entry_id: str) -> None:
        if entry_id == self._habit.entry_id:
            self.async_write_ha_state()

    @callback
    def _handle_midnight(self, _now: datetime) -> None:
        self.async_write_ha_state()

    @property
    def native_value(self) -> int:
        return self._habit.week_percent(week_start(today()))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        day = today()
        return {
            "habit_type": self._habit.habit_type,
            "target": self._habit.target,
            "today": self._habit.value(day),
            "done_today": self._habit.is_done(day),
            "streak": self._habit.streak(day),
            "weekly_goal": self._habit.weekly_goal,
            "done_this_week": self._habit.week_done(week_start(day)),
            "days": self._habit.days,
        }

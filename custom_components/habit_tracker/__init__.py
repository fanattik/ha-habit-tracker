"""Habit Tracker: track daily habits in Home Assistant."""

from __future__ import annotations

from datetime import date
import logging
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_ENTITY_ID, Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv, entity_registry as er
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from .const import (
    ATTR_DATE,
    ATTR_VALUE,
    CARD_FILENAME,
    CARD_URL,
    DOMAIN,
    SERVICE_SET_VALUE,
    SERVICE_TOGGLE,
)
from .habit import Habit, today, week_start

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SENSOR]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

TOGGLE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_ids,
        vol.Optional(ATTR_DATE): cv.date,
    }
)
SET_VALUE_SCHEMA = TOGGLE_SCHEMA.extend(
    {vol.Required(ATTR_VALUE): vol.All(vol.Coerce(int), vol.Range(min=0))}
)


def _habits(hass: HomeAssistant) -> dict[str, Habit]:
    return hass.data.setdefault(DOMAIN, {})


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the card, services and websocket commands once."""
    integration = await async_get_integration(hass, DOMAIN)
    card_path = Path(__file__).parent / "frontend" / CARD_FILENAME
    await hass.http.async_register_static_paths(
        [StaticPathConfig(CARD_URL, str(card_path), True)]
    )
    card_url = f"{CARD_URL}?v={integration.version}"
    add_extra_js_url(hass, card_url)
    # Older devices (e.g. iOS before 18.4) get the legacy frontend build.
    add_extra_js_url(hass, card_url, es5=True)
    # The companion apps can keep serving a cached index page without the extra
    # JS URL, so also register the card as a dashboard resource (fetched fresh).
    await _async_register_resource(hass, card_url)

    def habits_for_call(call: ServiceCall) -> list[Habit]:
        registry = er.async_get(hass)
        found = []
        for entity_id in call.data[ATTR_ENTITY_ID]:
            entity = registry.async_get(entity_id)
            habit = _habits(hass).get(entity.config_entry_id) if entity else None
            if habit is None:
                raise ServiceValidationError(f"{entity_id} is not a habit")
            found.append(habit)
        return found

    async def handle_toggle(call: ServiceCall) -> None:
        day = call.data.get(ATTR_DATE) or today()
        for habit in habits_for_call(call):
            await habit.async_toggle(day)

    async def handle_set_value(call: ServiceCall) -> None:
        day = call.data.get(ATTR_DATE) or today()
        for habit in habits_for_call(call):
            await habit.async_set_value(day, call.data[ATTR_VALUE])

    hass.services.async_register(DOMAIN, SERVICE_TOGGLE, handle_toggle, TOGGLE_SCHEMA)
    hass.services.async_register(
        DOMAIN, SERVICE_SET_VALUE, handle_set_value, SET_VALUE_SCHEMA
    )

    websocket_api.async_register_command(hass, ws_week)
    websocket_api.async_register_command(hass, ws_set)
    return True


async def _async_register_resource(hass: HomeAssistant, url: str) -> None:
    """Add or update the card in the dashboard resources (storage mode only)."""
    data = hass.data.get("lovelace")
    resources = (
        data.get("resources") if isinstance(data, dict) else getattr(data, "resources", None)
    )
    if resources is None or not hasattr(resources, "async_create_item"):
        return  # YAML resources: the extra JS URL has to do.
    try:
        if not resources.loaded:
            await resources.async_load()
            resources.loaded = True
        for item in resources.async_items():
            if item.get("url", "").split("?")[0] == CARD_URL:
                if item["url"] != url:
                    await resources.async_update_item(
                        item["id"], {"res_type": "module", "url": url}
                    )
                return
        await resources.async_create_item({"res_type": "module", "url": url})
    except Exception:  # noqa: BLE001 - never block setup on the dashboard resource
        _LOGGER.exception("Could not register the Habit Tracker card resource")


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    habit = Habit(hass, entry)
    await habit.async_load()
    _habits(hass)[entry.entry_id] = habit
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        _habits(hass).pop(entry.entry_id, None)
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await Habit(hass, entry).async_remove()


def _parse_date(value: str | None) -> date:
    if not value:
        return today()
    try:
        return date.fromisoformat(value)
    except ValueError as err:
        raise vol.Invalid(f"Invalid date: {value}") from err


@websocket_api.websocket_command(
    {vol.Required("type"): "habit_tracker/week", vol.Optional("date"): str}
)
@callback
def ws_week(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return every habit with its values for the week containing date."""
    try:
        start = week_start(_parse_date(msg.get("date")))
    except vol.Invalid as err:
        connection.send_error(msg["id"], "invalid_date", str(err))
        return
    registry = er.async_get(hass)
    result = []
    for habit in _habits(hass).values():
        entity_id = registry.async_get_entity_id("sensor", DOMAIN, habit.entry_id)
        result.append(
            {
                "entry_id": habit.entry_id,
                "entity_id": entity_id,
                "name": habit.name,
                "icon": habit.icon,
                "type": habit.habit_type,
                "target": habit.target,
                "values": habit.week_values(start),
                "percent": habit.week_percent(start),
                "streak": habit.streak(),
                "streak_unit": "day" if habit.is_daily else "week",
                "days": habit.days,
                "weekly_goal": habit.weekly_goal,
                "week_done": habit.week_done(start),
            }
        )
    result.sort(key=lambda h: h["name"].lower())
    connection.send_result(
        msg["id"],
        {"week_start": start.isoformat(), "today": today().isoformat(), "habits": result},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "habit_tracker/set",
        vol.Required("entry_id"): str,
        vol.Required("date"): str,
        vol.Required("value"): vol.All(vol.Coerce(int), vol.Range(min=0)),
    }
)
@websocket_api.async_response
async def ws_set(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Set a habit's value for one day."""
    habit = _habits(hass).get(msg["entry_id"])
    if habit is None:
        connection.send_error(msg["id"], "not_found", "Unknown habit")
        return
    try:
        day = _parse_date(msg["date"])
    except vol.Invalid as err:
        connection.send_error(msg["id"], "invalid_date", str(err))
        return
    if day > today():
        connection.send_error(msg["id"], "future_date", "Cannot log a future day")
        return
    await habit.async_set_value(day, msg["value"])
    connection.send_result(msg["id"])

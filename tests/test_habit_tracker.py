from datetime import timedelta

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

from custom_components.habit_tracker.const import DOMAIN


async def _add(hass: HomeAssistant, name: str, habit_type: str, target: int = 1):
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {"name": name, "habit_type": habit_type, "target": target, "icon": "mdi:run"},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    return result["result"]


async def test_full_flow(hass: HomeAssistant, hass_ws_client, hass_client) -> None:
    assert await async_setup_component(hass, "http", {})
    assert await async_setup_component(hass, DOMAIN, {})
    plants = await _add(hass, "Zalít kytky", "boolean")
    pushups = await _add(hass, "Kliky", "count", 20)

    state = hass.states.get("sensor.zalit_kytky")
    assert state is not None and state.state == "0"
    assert state.attributes["habit_type"] == "boolean"

    today = dt_util.now().date()
    ws = await hass_ws_client(hass)

    await ws.send_json({"id": 1, "type": "habit_tracker/set", "entry_id": plants.entry_id,
                        "date": today.isoformat(), "value": 1})
    assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()
    state = hass.states.get("sensor.zalit_kytky")
    assert state.attributes["done_today"] is True
    assert int(state.state) > 0

    # Partial count is not done; reaching the target is.
    await ws.send_json({"id": 2, "type": "habit_tracker/set", "entry_id": pushups.entry_id,
                        "date": today.isoformat(), "value": 10})
    assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()
    assert hass.states.get("sensor.kliky").attributes["done_today"] is False
    await hass.services.async_call(DOMAIN, "set_value",
        {"entity_id": "sensor.kliky", "value": 25}, blocking=True)
    assert hass.states.get("sensor.kliky").attributes["today"] == 25
    assert hass.states.get("sensor.kliky").attributes["done_today"] is True

    # Future days are rejected.
    await ws.send_json({"id": 3, "type": "habit_tracker/set", "entry_id": pushups.entry_id,
                        "date": (today + timedelta(days=1)).isoformat(), "value": 5})
    assert not (await ws.receive_json())["success"]

    # Streak across yesterday and today.
    await hass.services.async_call(DOMAIN, "toggle",
        {"entity_id": "sensor.zalit_kytky", "date": (today - timedelta(days=1)).isoformat()},
        blocking=True)
    assert hass.states.get("sensor.zalit_kytky").attributes["streak"] == 2

    await ws.send_json({"id": 4, "type": "habit_tracker/week"})
    week = (await ws.receive_json())["result"]
    assert week["today"] == today.isoformat()
    names = [h["name"] for h in week["habits"]]
    assert names == ["Kliky", "Zalít kytky"]
    kliky = week["habits"][0]
    assert kliky["type"] == "count" and kliky["target"] == 20
    assert kliky["values"][today.isoformat()] == 25
    assert len(kliky["values"]) == 7

    # Toggle off clears today.
    await hass.services.async_call(DOMAIN, "toggle", {"entity_id": "sensor.zalit_kytky"}, blocking=True)
    assert hass.states.get("sensor.zalit_kytky").attributes["done_today"] is False

    # Options flow: rename and change type; data survives the reload.
    result = await hass.config_entries.options.async_init(pushups.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"name": "Kliky ráno", "habit_type": "count", "target": 30})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    assert pushups.title == "Kliky ráno"
    state = hass.states.get("sensor.kliky")
    assert state.attributes["target"] == 30
    assert state.attributes["today"] == 25
    assert state.attributes["done_today"] is False

    # The card is served.
    client = await hass_client()
    resp = await client.get("/habit_tracker/habit-tracker-card.js")
    assert resp.status == 200
    assert "habit-tracker-card" in await resp.text()

    # Removing a habit removes its entity.
    assert await hass.config_entries.async_remove(plants.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get("sensor.zalit_kytky") is None


async def test_empty_name(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "  ", "habit_type": "boolean"})
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"name": "empty_name"}

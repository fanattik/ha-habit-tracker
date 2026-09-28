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


async def test_card_resource_registered(hass: HomeAssistant) -> None:
    assert await async_setup_component(hass, "http", {})
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    resources = hass.data["lovelace"].resources
    urls = [r["url"] for r in resources.async_items()]
    assert len([u for u in urls if u.startswith("/habit_tracker/habit-tracker-card.js?v=")]) == 1
    # Setting up again does not duplicate it.
    from custom_components.habit_tracker import _async_register_resource
    await _async_register_resource(hass, "/habit_tracker/habit-tracker-card.js?v=9.9.9")
    urls = [r["url"] for r in resources.async_items()]
    assert urls.count("/habit_tracker/habit-tracker-card.js?v=9.9.9") == 1
    assert len([u for u in urls if u.startswith("/habit_tracker/")]) == 1


async def test_weekly_goal(hass: HomeAssistant) -> None:
    assert await async_setup_component(hass, "http", {})
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {
        "name": "Cvičení", "habit_type": "boolean", "days": ["0", "2", "4"]})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    entry = result["result"]
    await hass.async_block_till_done()
    habit = hass.data[DOMAIN][entry.entry_id]
    assert habit.days == [0, 2, 4] and habit.weekly_goal == 3 and not habit.is_daily

    from custom_components.habit_tracker.habit import week_start
    monday = week_start(dt_util.now().date()) - timedelta(days=14)
    # Two weeks ago: Mon, Wed, Fri done. Last week: Tue, Thu, Sat done (off days count too).
    for offset in (0, 2, 4, 8, 10, 12):
        await habit.async_set_value(monday + timedelta(days=offset), 1)
    assert habit.week_percent(monday) == 100
    assert habit.week_percent(monday + timedelta(days=7)) == 100
    assert habit.streak() == 2

    # 3x a week on any day, then cleared back to "every planned day".
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(result["flow_id"], {
        "name": "Cvičení", "habit_type": "boolean", "days": ["0", "1", "2", "3", "4", "5", "6"], "per_week": 3})
    await hass.async_block_till_done()
    habit = hass.data[DOMAIN][entry.entry_id]
    assert habit.weekly_goal == 3
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(result["flow_id"], {
        "name": "Cvičení", "habit_type": "boolean", "days": ["0", "1", "2", "3", "4", "5", "6"]})
    await hass.async_block_till_done()
    habit = hass.data[DOMAIN][entry.entry_id]
    assert habit.weekly_goal == 7 and habit.is_daily

    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(result["flow_id"], {
        "name": "Cvičení", "habit_type": "boolean", "days": []})
    assert result["errors"] == {"days": "no_days"}


async def test_color_and_month(hass: HomeAssistant, hass_ws_client) -> None:
    assert await async_setup_component(hass, "http", {})
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {
        "name": "Běh", "habit_type": "boolean", "days": ["0", "1", "2", "3", "4", "5", "6"],
        "color": [255, 0, 128]})
    run = result["result"]
    other = await _add(hass, "Zalít kytky", "boolean")
    await hass.async_block_till_done()

    today = dt_util.now().date()
    first = today.replace(day=1)
    await hass.data[DOMAIN][run.entry_id].async_set_value(first, 1)
    await hass.data[DOMAIN][run.entry_id].async_set_value(first - timedelta(days=1), 1)

    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "habit_tracker/month"})
    res = (await ws.receive_json())["result"]
    assert res["month_start"] == first.isoformat()
    assert res["month_end"] >= res["month_start"]
    by_name = {h["name"]: h for h in res["habits"]}
    assert by_name["Běh"]["color"] == "#ff0080"
    assert by_name["Běh"]["display_color"] == "#ff0080"
    assert by_name["Běh"]["values"] == {first.isoformat(): 1}  # previous month excluded
    assert by_name["Zalít kytky"]["color"] is None
    assert by_name["Zalít kytky"]["display_color"].startswith("#")

    # Clearing the color in the options falls back to the palette.
    result = await hass.config_entries.options.async_init(run.entry_id)
    result = await hass.config_entries.options.async_configure(result["flow_id"], {
        "name": "Běh", "habit_type": "boolean", "days": ["0", "1", "2", "3", "4", "5", "6"]})
    await hass.async_block_till_done()
    assert hass.data[DOMAIN][run.entry_id].color is None
    assert other.entry_id in hass.data[DOMAIN]

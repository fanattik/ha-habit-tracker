<img src="custom_components/habit_tracker/brand/icon.png" alt="" width="96" align="right">

# Habit Tracker for Home Assistant

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=fanattik&repository=ha-habit-tracker&category=integration)
[![Add a habit](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=habit_tracker)

A weekly habit tracker: habits in rows, Monday to Sunday in columns, click a day to mark it done.

- **Habits are managed in the UI.** Each habit is added in *Settings → Devices & services → Add integration → Habit Tracker* and can be edited (name, type, daily target, icon) or deleted like any other integration.
- **Two habit types:** *done / not done*, or *count* with a daily target (e.g. 20 pushups). A count below the target shows orange, at or above the target green.
- **Weekly goals.** Pick the planned days (e.g. Mon, Wed, Fri) and/or how many times a week counts as success (e.g. 3×). Days outside the plan are dimmed but can still be ticked.
- **Colors.** Each habit can have its own color (otherwise one is assigned automatically).
- **Two cards included**, registered automatically: the weekly grid `habit-tracker-card` and the month calendar `habit-tracker-calendar-card`, where each done habit shows as a colored dot under the day and clicking a day lists all habits to tick off.
- **Sensors for automations.** Each habit gets a sensor whose state is this week's completion in %, with attributes `today`, `done_today`, `streak`, `weekly_goal`, `done_this_week`, `days`, `habit_type` and `target`.
- **Services:** `habit_tracker.toggle` and `habit_tracker.set_value` (optional `date`, defaults to today), usable from automations, scripts or voice.

## Install (HACS)

1. Click **Open in HACS** above (or HACS → ⋮ → *Custom repositories* → add `https://github.com/fanattik/ha-habit-tracker`, type *Integration*).
2. Download **Habit Tracker** and restart Home Assistant.
3. Click **Add a habit** above (or *Settings → Devices & services → Add integration → Habit Tracker*), once per habit.

New versions are published as GitHub releases, so HACS offers them under *Settings → Updates* like any other update. The integration icon shows in Home Assistant 2026.3 and newer.
4. Add the card to a dashboard:

```yaml
type: custom:habit-tracker-card
title: Návyky          # optional
entities:              # optional: which habits and in what order (default: all, by name)
  - sensor.kliky
  - sensor.zalit_kytky
show_streak: true      # optional
```

Month calendar:

```yaml
type: custom:habit-tracker-calendar-card
title: Kalendář návyků # optional
entities:              # optional, same as above
  - sensor.cviceni
```

The card is loaded by the integration, so it only exists after Home Assistant was restarted **and at least one habit was added**. If the card is still reported as missing, reload the browser (or clear the app cache in the companion app).

### Manual install (without HACS)

In the Terminal add-on:

```sh
cd /config && mkdir -p custom_components \
  && curl -sL https://github.com/fanattik/ha-habit-tracker/archive/refs/heads/main.tar.gz | tar xz \
  && rm -rf custom_components/habit_tracker \
  && cp -r ha-habit-tracker-main/custom_components/habit_tracker custom_components/ \
  && rm -rf ha-habit-tracker-main
```

Then restart Home Assistant and continue with step 3.

## How it counts

- A day is *done* when its value reaches the target (1 for done / not done).
- Daily habits: the weekly % counts only days up to today, so on Wednesday 3 of 3 days is 100 %, and the streak is the number of consecutive done days ending today (or yesterday, if today is still open).
- Habits with a weekly goal below 7: the % is progress toward the goal (2 of 3 = 67 %), and the streak counts consecutive weeks that met it.
- Future days cannot be logged. Past weeks can be edited with the arrows in the card.

Data is stored in `.storage/habit_tracker.<entry_id>` and is removed when the habit is deleted.

## Development

The card source is `src/habit-tracker-card.js`. Run `./build.sh` after changing it: it writes the served file, compiled so it also runs on older iPads and phones (Safari 12+).

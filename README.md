# Habit Tracker for Home Assistant

A weekly habit tracker: habits in rows, Monday to Sunday in columns, click a day to mark it done.

- **Habits are managed in the UI.** Each habit is added in *Settings → Devices & services → Add integration → Habit Tracker* and can be edited (name, type, daily target, icon) or deleted like any other integration.
- **Two habit types:** *done / not done*, or *count* with a daily target (e.g. 20 pushups). A count below the target shows orange, at or above the target green.
- **Card included.** The integration registers the `habit-tracker-card` Lovelace card automatically, no extra resource to add.
- **Sensors for automations.** Each habit gets a sensor whose state is this week's completion in %, with attributes `today`, `done_today`, `streak`, `habit_type` and `target`.
- **Services:** `habit_tracker.toggle` and `habit_tracker.set_value` (optional `date`, defaults to today), usable from automations, scripts or voice.

## Install (HACS)

1. HACS → ⋮ → *Custom repositories* → add `https://github.com/fanattik/ha-habit-tracker`, type *Integration*.
2. Install **Habit Tracker** and restart Home Assistant.
3. *Settings → Devices & services → Add integration → Habit Tracker*, once per habit.
4. Add the card to a dashboard:

```yaml
type: custom:habit-tracker-card
title: Návyky          # optional
entities:              # optional: which habits and in what order (default: all, by name)
  - sensor.kliky
  - sensor.zalit_kytky
show_streak: true      # optional
```

If the card does not show up right after installing, reload the browser (or clear the app cache in the companion app).

## How it counts

- A day is *done* when its value reaches the target (1 for done / not done).
- The weekly % counts only days up to today, so on Wednesday 3 of 3 days is 100 %.
- The streak is the number of consecutive done days ending today (or yesterday, if today is still open).
- Future days cannot be logged. Past weeks can be edited with the arrows in the card.

Data is stored in `.storage/habit_tracker.<entry_id>` and is removed when the habit is deleted.

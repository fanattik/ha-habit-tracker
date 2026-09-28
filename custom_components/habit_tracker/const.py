"""Constants for Habit Tracker."""

DOMAIN = "habit_tracker"

CONF_HABIT_TYPE = "habit_type"
CONF_TARGET = "target"
CONF_ICON = "icon"

TYPE_BOOLEAN = "boolean"
TYPE_COUNT = "count"
HABIT_TYPES = [TYPE_BOOLEAN, TYPE_COUNT]

STORAGE_VERSION = 1

ATTR_DATE = "date"
ATTR_VALUE = "value"

SERVICE_TOGGLE = "toggle"
SERVICE_SET_VALUE = "set_value"

SIGNAL_UPDATED = f"{DOMAIN}_updated"

CARD_URL = "/habit_tracker/habit-tracker-card.js"
CARD_FILENAME = "habit-tracker-card.js"

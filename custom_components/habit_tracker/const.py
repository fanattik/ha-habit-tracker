"""Constants for Habit Tracker."""

DOMAIN = "habit_tracker"

CONF_HABIT_TYPE = "habit_type"
CONF_TARGET = "target"
CONF_ICON = "icon"
CONF_DAYS = "days"
CONF_PER_WEEK = "per_week"
CONF_COLOR = "color"

# Used in order for habits without their own color.
DEFAULT_COLORS = [
    "#43a047", "#1e88e5", "#fb8c00", "#8e24aa",
    "#e53935", "#00acc1", "#fdd835", "#6d4c41",
]

ALL_DAYS = ["0", "1", "2", "3", "4", "5", "6"]  # Monday = "0"

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

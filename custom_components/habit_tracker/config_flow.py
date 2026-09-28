"""Config flow: each habit is one config entry, editable from the UI."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.const import CONF_NAME
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    ALL_DAYS,
    CONF_COLOR,
    CONF_DAYS,
    CONF_HABIT_TYPE,
    CONF_PER_WEEK,
    CONF_ICON,
    CONF_TARGET,
    DOMAIN,
    HABIT_TYPES,
    TYPE_BOOLEAN,
    TYPE_COUNT,
)


def _hex_to_rgb(value: Any) -> list[int] | None:
    if isinstance(value, str) and len(value) == 7 and value.startswith("#"):
        return [int(value[i : i + 2], 16) for i in (1, 3, 5)]
    return None


def _rgb_to_hex(value: Any) -> str | None:
    if isinstance(value, (list, tuple)) and len(value) == 3:
        return "#{:02x}{:02x}{:02x}".format(*(max(0, min(255, int(c))) for c in value))
    return None


def _schema(defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(CONF_NAME, default=defaults.get(CONF_NAME, "")): str,
            vol.Required(
                CONF_HABIT_TYPE, default=defaults.get(CONF_HABIT_TYPE, TYPE_BOOLEAN)
            ): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=HABIT_TYPES,
                    translation_key=CONF_HABIT_TYPE,
                    mode=selector.SelectSelectorMode.LIST,
                )
            ),
            vol.Optional(
                CONF_TARGET, default=defaults.get(CONF_TARGET, 1)
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=1, max=100000, step=1, mode=selector.NumberSelectorMode.BOX
                )
            ),
            vol.Required(
                CONF_DAYS, default=defaults.get(CONF_DAYS, ALL_DAYS)
            ): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=ALL_DAYS,
                    translation_key=CONF_DAYS,
                    multiple=True,
                    mode=selector.SelectSelectorMode.LIST,
                )
            ),
            vol.Optional(
                CONF_PER_WEEK,
                description={"suggested_value": defaults.get(CONF_PER_WEEK)},
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=1, max=7, step=1, mode=selector.NumberSelectorMode.BOX
                )
            ),
            vol.Optional(
                CONF_COLOR,
                description={"suggested_value": _hex_to_rgb(defaults.get(CONF_COLOR))},
            ): selector.ColorRGBSelector(),
            vol.Optional(
                CONF_ICON, description={"suggested_value": defaults.get(CONF_ICON)}
            ): selector.IconSelector(),
        }
    )


def _clean(user_input: dict[str, Any]) -> dict[str, Any]:
    data = {
        CONF_HABIT_TYPE: user_input[CONF_HABIT_TYPE],
        CONF_TARGET: int(user_input.get(CONF_TARGET) or 1),
    }
    if user_input[CONF_HABIT_TYPE] != TYPE_COUNT:
        data[CONF_TARGET] = 1
    data[CONF_DAYS] = sorted(user_input.get(CONF_DAYS) or ALL_DAYS, key=int)
    # Always store these keys, so clearing a field in the options overrides
    # the value the habit was created with.
    per_week = user_input.get(CONF_PER_WEEK)
    data[CONF_PER_WEEK] = int(per_week) if per_week else None
    data[CONF_ICON] = user_input.get(CONF_ICON) or None
    data[CONF_COLOR] = _rgb_to_hex(user_input.get(CONF_COLOR))
    return data


class HabitTrackerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Add a habit."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            name = user_input[CONF_NAME].strip()
            if not name:
                errors[CONF_NAME] = "empty_name"
            elif not user_input.get(CONF_DAYS):
                errors[CONF_DAYS] = "no_days"
            else:
                return self.async_create_entry(title=name, data=_clean(user_input))
        return self.async_show_form(
            step_id="user", data_schema=_schema(user_input or {}), errors=errors
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return HabitOptionsFlow()


class HabitOptionsFlow(OptionsFlow):
    """Edit a habit's name, type, target and icon."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        entry = self.config_entry
        if user_input is not None:
            name = user_input[CONF_NAME].strip()
            if not name:
                errors[CONF_NAME] = "empty_name"
            elif not user_input.get(CONF_DAYS):
                errors[CONF_DAYS] = "no_days"
            else:
                if name != entry.title:
                    self.hass.config_entries.async_update_entry(entry, title=name)
                return self.async_create_entry(data=_clean(user_input))
        current = {CONF_NAME: entry.title, **entry.data, **entry.options}
        return self.async_show_form(
            step_id="init", data_schema=_schema(current), errors=errors
        )

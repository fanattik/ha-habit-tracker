/* Generated from src/habit-tracker-card.js by build.sh; do not edit. */
const STRINGS = {
  en: {
    title: "Habits",
    days: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
    empty: "No habits yet. Add one in Settings \u2192 Devices & services \u2192 Add integration \u2192 Habit Tracker.",
    thisWeek: "This week",
    streak: "Streak",
    perWeek: (done, n) => "".concat(done, "/").concat(n, " this week"),
    weeks: "wk",
    save: "Save",
    clear: "Clear",
    cancel: "Cancel",
    error: "Could not load habits",
    calendarTitle: "Habit calendar",
    future: "This day has not come yet.",
    overviewTitle: "Week overview",
    doneGoal: "Done",
    notDone: (n) => "".concat(n, " to go")
  },
  cs: {
    title: "N\xE1vyky",
    days: ["Po", "\xDAt", "St", "\u010Ct", "P\xE1", "So", "Ne"],
    empty: "Zat\xEDm \u017E\xE1dn\xE9 n\xE1vyky. P\u0159idej je v Nastaven\xED \u2192 Za\u0159\xEDzen\xED a slu\u017Eby \u2192 P\u0159idat integraci \u2192 Habit Tracker.",
    thisWeek: "Tento t\xFDden",
    streak: "S\xE9rie",
    perWeek: (done, n) => "".concat(done, "/").concat(n, " tento t\xFDden"),
    weeks: "t\xFDd.",
    save: "Ulo\u017Eit",
    clear: "Vymazat",
    cancel: "Zru\u0161it",
    error: "N\xE1vyky se nepoda\u0159ilo na\u010D\xEDst",
    calendarTitle: "Kalend\xE1\u0159 n\xE1vyk\u016F",
    future: "Tento den je\u0161t\u011B nenastal.",
    overviewTitle: "P\u0159ehled t\xFDdne",
    doneGoal: "Spln\u011Bno",
    notDone: (n) => "Zb\xFDv\xE1 ".concat(n, "\xD7")
  }
};
const NARROW_WIDTH = 560;
const addDays = (iso, n) => {
  const d = new Date("".concat(iso, "T12:00:00"));
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const shortDate = (iso) => {
  const [, m, d] = iso.split("-");
  return "".concat(Number(d), ".").concat(Number(m), ".");
};
const esc = (s) => String(s != null ? s : "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
class HabitTrackerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._data = null;
    this._error = null;
    this._weekDate = null;
    this._editing = null;
    this._signature = null;
    this._loading = false;
    this._narrow = false;
  }
  connectedCallback() {
    if (!this._resizeObserver && window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver((entries) => {
        const narrow = entries[0].contentRect.width < NARROW_WIDTH;
        if (narrow !== this._narrow) {
          this._narrow = narrow;
          this._render();
        }
      });
    }
    if (this._resizeObserver) this._resizeObserver.observe(this);
    this._subscribe();
  }
  disconnectedCallback() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._unsubscribe();
  }
  // Every change to any habit (from this card, another card or another device)
  // reloads the card. Sensor changes alone miss ticks in past weeks.
  _subscribe() {
    var _a;
    if (this._unsub || !((_a = this._hass) == null ? void 0 : _a.connection) || !this.isConnected) return;
    this._unsub = this._hass.connection.subscribeMessage(() => this._load(), { type: "habit_tracker/subscribe" }).catch(() => {
      this._unsub = null;
    });
  }
  _unsubscribe() {
    const unsub = this._unsub;
    this._unsub = null;
    if (unsub) unsub.then((fn) => fn && fn()).catch(() => {
    });
  }
  static getStubConfig() {
    return {};
  }
  setConfig(config) {
    this._config = { show_streak: true, ...config || {} };
    this._render();
  }
  getCardSize() {
    var _a;
    return 1 + (((_a = this._data) == null ? void 0 : _a.habits.length) || 2);
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }
  set hass(hass) {
    this._hass = hass;
    this._subscribe();
    const sig = Object.values(hass.states).filter((s) => s.attributes && s.attributes.habit_type !== void 0).map((s) => "".concat(s.entity_id, ":").concat(s.last_updated)).sort().join("|");
    if (sig !== this._signature) {
      this._signature = sig;
      this._load();
    }
  }
  get _t() {
    var _a, _b, _c;
    const lang = (((_b = (_a = this._hass) == null ? void 0 : _a.locale) == null ? void 0 : _b.language) || ((_c = this._hass) == null ? void 0 : _c.language) || "en").split("-")[0];
    return STRINGS[lang] || STRINGS.en;
  }
  async _load() {
    if (!this._hass || this._loading) {
      this._reloadPending = true;
      return;
    }
    this._loading = true;
    this._reloadPending = false;
    try {
      this._data = await this._hass.callWS(this._request());
      this._error = null;
    } catch (err) {
      this._error = (err == null ? void 0 : err.message) || String(err);
    } finally {
      this._loading = false;
    }
    this._render();
    if (this._reloadPending) this._load();
  }
  _request() {
    const msg = { type: "habit_tracker/week" };
    if (this._weekDate) msg.date = this._weekDate;
    return msg;
  }
  async _setValue(entryId, date, value) {
    try {
      await this._hass.callWS({ type: "habit_tracker/set", entry_id: entryId, date, value });
    } catch (err) {
      this._error = (err == null ? void 0 : err.message) || String(err);
      this._render();
    }
    this._load();
  }
  _habits() {
    var _a, _b;
    const habits = ((_a = this._data) == null ? void 0 : _a.habits) || [];
    const only = (_b = this._config) == null ? void 0 : _b.entities;
    if (!Array.isArray(only) || !only.length) return habits;
    return only.map((e) => habits.find((h) => h.entity_id === (typeof e === "string" ? e : e.entity))).filter(Boolean);
  }
  _ring(percent) {
    const r = 16;
    const c = 2 * Math.PI * r;
    const hue = Math.round(percent / 100 * 120);
    return '\n      <svg class="ring" viewBox="0 0 40 40" aria-label="'.concat(percent, '%">\n        <circle cx="20" cy="20" r="').concat(r, '" class="ring-bg"></circle>\n        <circle cx="20" cy="20" r="').concat(r, '" class="ring-fg" style="stroke:hsl(').concat(hue, ' 65% 50%)"\n          stroke-dasharray="').concat(c * percent / 100, " ").concat(c, '" transform="rotate(-90 20 20)"></circle>\n        <text x="20" y="21">').concat(percent, "%</text>\n      </svg>");
  }
  _cell(habit, date, today) {
    const value = habit.values[date] || 0;
    const future = date > today;
    const done = value >= habit.target;
    let cls = "empty";
    let label = "\u2717";
    if (done) {
      cls = "done";
      label = habit.type === "count" ? value : "\u2713";
    } else if (value > 0) {
      cls = "partial";
      label = value;
    }
    if (future) {
      cls = "future";
      label = "";
    }
    const isToday = date === today ? " today" : "";
    const weekday = (new Date("".concat(date, "T12:00:00")).getDay() + 6) % 7;
    if (habit.days && habit.days.indexOf(weekday) === -1 && !done) cls += " off";
    const color = done && habit.color ? ' style="background:'.concat(esc(habit.color), '"') : "";
    return '<button class="cell '.concat(cls).concat(isToday, '"').concat(color, ' data-entry="').concat(esc(habit.entry_id), '" data-date="').concat(date, '"\n      ').concat(future ? "disabled" : "", ' title="').concat(shortDate(date), '"><span>').concat(esc(label), "</span></button>");
  }
  _editor(habit) {
    const ed = this._editing;
    const t = this._t;
    return '\n      <div class="editor">\n        <span class="ed-date">'.concat(shortDate(ed.date), '</span>\n        <button class="step" data-step="-1">\u2212</button>\n        <input type="number" min="0" inputmode="numeric" value="').concat(ed.value, '">\n        <button class="step" data-step="1">+</button>\n        <span class="target">/ ').concat(habit.target, '</span>\n        <span class="spacer"></span>\n        <button class="act" data-act="clear">').concat(t.clear, '</button>\n        <button class="act" data-act="cancel">').concat(t.cancel, '</button>\n        <button class="act primary" data-act="save">').concat(t.save, "</button>\n      </div>");
  }
  _render() {
    var _a;
    if (!this._config) return;
    const t = this._t;
    const data = this._data;
    const title = (_a = this._config.title) != null ? _a : t.title;
    let body = "";
    if (this._error && !data) {
      body = '<div class="msg">'.concat(t.error, ": ").concat(esc(this._error), "</div>");
    } else if (!data) {
      body = '<div class="msg">\u2026</div>';
    } else {
      const start = data.week_start;
      const today = data.today;
      const days = [...Array(7).keys()].map((i) => addDays(start, i));
      const habits = this._habits();
      const isCurrent = today >= start && today <= addDays(start, 6);
      const head = days.map(
        (d, i) => '<div class="day'.concat(d === today ? " today" : "", '"><b>').concat(t.days[i], "</b><span>").concat(shortDate(d), "</span></div>")
      ).join("");
      const rows = habits.map((h) => {
        const cells = days.map((d) => this._cell(h, d, today)).join("");
        const icon = h.icon ? '<ha-icon icon="'.concat(esc(h.icon), '"></ha-icon>') : "";
        const weekly = h.streak_unit === "week";
        const streak = this._config.show_streak && h.streak > (weekly ? 0 : 1) ? '<span class="streak" title="'.concat(t.streak, '">\u{1F525} ').concat(h.streak).concat(weekly ? " ".concat(t.weeks) : "", "</span>") : "";
        const goal = h.weekly_goal && h.weekly_goal < 7 ? '<span class="goal">'.concat(esc(t.perWeek(h.week_done, h.weekly_goal)), "</span>") : "";
        const editing = this._editing && this._editing.entryId === h.entry_id ? this._editor(h) : "";
        return '\n            <div class="row">\n              <div class="info">'.concat(this._ring(h.percent), '<div class="name">').concat(icon, "<span>").concat(esc(h.name), "</span>").concat(goal).concat(streak, '</div></div>\n              <div class="cells">').concat(cells, "</div>\n              ").concat(editing, "\n            </div>");
      }).join("");
      body = '\n        <div class="nav">\n          <button class="navbtn" data-nav="-7" aria-label="previous week">\u2039</button>\n          <span class="week">'.concat(isCurrent ? t.thisWeek : "".concat(shortDate(start), " \u2013 ").concat(shortDate(addDays(start, 6))), '</span>\n          <button class="navbtn" data-nav="7" aria-label="next week" ').concat(isCurrent ? "disabled" : "", ">\u203A</button>\n        </div>\n        ").concat(habits.length ? '<div class="row header"><div class="info"></div><div class="cells">'.concat(head, "</div></div>").concat(rows) : '<div class="msg">'.concat(t.empty, "</div>"), "\n        ").concat(this._error ? '<div class="msg err">'.concat(esc(this._error), "</div>") : "");
    }
    this.shadowRoot.innerHTML = "\n      <style>".concat(STYLE, "</style>\n      <ha-card>\n        ").concat(title ? '<div class="title">'.concat(esc(title), "</div>") : "", '\n        <div class="content').concat(this._narrow ? " narrow" : "", '">').concat(body, "</div>\n      </ha-card>");
    this._bind();
  }
  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll(".navbtn").forEach(
      (b) => b.addEventListener("click", () => {
        const next = addDays(this._data.week_start, Number(b.dataset.nav));
        this._weekDate = next > this._data.today ? null : next;
        this._editing = null;
        this._load();
      })
    );
    root.querySelectorAll(".cell").forEach(
      (b) => b.addEventListener("click", () => {
        var _a;
        const habit = this._data.habits.find((h) => h.entry_id === b.dataset.entry);
        const date = b.dataset.date;
        const value = habit.values[date] || 0;
        if (habit.type === "count") {
          this._editing = { entryId: habit.entry_id, date, value: value || habit.target };
          this._render();
          (_a = root.querySelector(".editor input")) == null ? void 0 : _a.select();
        } else {
          habit.values[date] = value ? 0 : 1;
          this._render();
          this._setValue(habit.entry_id, date, value ? 0 : 1);
        }
      })
    );
    const editor = root.querySelector(".editor");
    if (!editor) return;
    const input = editor.querySelector("input");
    const commit = (value) => {
      const { entryId, date } = this._editing;
      this._editing = null;
      const habit = this._data.habits.find((h) => h.entry_id === entryId);
      if (habit) habit.values[date] = value;
      this._render();
      this._setValue(entryId, date, value);
    };
    editor.querySelectorAll(".step").forEach(
      (b) => b.addEventListener("click", () => {
        input.value = Math.max(0, (Number(input.value) || 0) + Number(b.dataset.step));
      })
    );
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit(Math.max(0, Math.round(Number(input.value) || 0)));
      if (e.key === "Escape") {
        this._editing = null;
        this._render();
      }
    });
    editor.querySelectorAll(".act").forEach(
      (b) => b.addEventListener("click", () => {
        if (b.dataset.act === "save") commit(Math.max(0, Math.round(Number(input.value) || 0)));
        else if (b.dataset.act === "clear") commit(0);
        else {
          this._editing = null;
          this._render();
        }
      })
    );
  }
}
const STYLE = "\n  :host { display: block; --ht-done: var(--success-color, #43a047); --ht-partial: var(--warning-color, #ffa000);\n    --ht-empty: var(--secondary-background-color, #e0e0e0); --ht-cell: 36px; }\n  ha-card { display: block; padding: 12px 16px 16px; }\n  .title { font-size: 1.25rem; font-weight: 500; padding: 4px 0 8px; color: var(--primary-text-color); }\n  .nav { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 8px; color: var(--secondary-text-color); }\n  .navbtn { border: none; background: none; font-size: 1.4rem; line-height: 1; cursor: pointer; color: var(--primary-text-color); padding: 4px 10px; border-radius: 8px; }\n  .navbtn:disabled { opacity: .25; cursor: default; }\n  .navbtn:not(:disabled):hover { background: var(--ht-empty); }\n  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 12px;\n    padding: 8px 10px; margin-bottom: 8px; border-radius: 14px; background: var(--card-background-color);\n    box-shadow: 0 0 0 1px var(--divider-color, rgba(0,0,0,.12)); }\n  .row.header { box-shadow: none; background: none; padding-top: 0; padding-bottom: 0; margin-bottom: 4px; }\n  .info { display: flex; align-items: center; gap: 10px; min-width: 0; }\n  .name { display: flex; align-items: center; gap: 6px; min-width: 0; font-weight: 500; font-size: 1.05rem; color: var(--primary-text-color); }\n  .name span:first-of-type { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }\n  .name ha-icon { --mdc-icon-size: 22px; color: var(--state-icon-color, var(--primary-color)); flex: none; }\n  .goal { font-size: .8rem; font-weight: 400; color: var(--secondary-text-color); white-space: nowrap; }\n  .cells .cell.off { opacity: .35; }\n  .streak { font-size: .8rem; font-weight: 400; color: var(--secondary-text-color); white-space: nowrap; }\n  .ring { width: 40px; height: 40px; flex: none; }\n  .ring-bg { fill: none; stroke: var(--ht-empty); stroke-width: 4; }\n  .ring-fg { fill: none; stroke-width: 4; stroke-linecap: round; transition: stroke-dasharray .3s; }\n  .ring text { font-size: 9.5px; letter-spacing: -.3px; text-anchor: middle; dominant-baseline: middle; fill: var(--primary-text-color); }\n  .cells { display: grid; grid-template-columns: repeat(7, var(--ht-cell)); gap: 6px; }\n  .day { display: flex; flex-direction: column; align-items: center; font-size: .75rem; color: var(--secondary-text-color); line-height: 1.2; }\n  .day b { font-size: .85rem; color: var(--primary-text-color); }\n  .day.today b, .day.today span { color: var(--primary-color); }\n  .cell { width: var(--ht-cell); height: var(--ht-cell); border-radius: 50%; border: none; padding: 0; cursor: pointer;\n    font: 600 .9rem/1 var(--paper-font-body1_-_font-family, sans-serif); display: flex; align-items: center; justify-content: center;\n    transition: transform .1s, background .2s; }\n  .cell:not(:disabled):active { transform: scale(.9); }\n  .cell.empty { background: var(--ht-empty); color: var(--secondary-text-color); opacity: .8; }\n  .cell.done { background: var(--ht-done); color: #fff; }\n  .cell.partial { background: var(--ht-partial); color: #fff; }\n  .cell.future { background: transparent; box-shadow: inset 0 0 0 2px var(--ht-empty); cursor: default; }\n  .cell.today { outline: 2px solid var(--primary-color); outline-offset: 2px; }\n  .editor { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding-top: 4px; }\n  .editor input { width: 72px; padding: 6px 8px; font-size: 1rem; border-radius: 8px; border: 1px solid var(--divider-color);\n    background: var(--card-background-color); color: var(--primary-text-color); }\n  .editor .ed-date, .editor .target { color: var(--secondary-text-color); }\n  .editor .spacer { flex: 1; }\n  .editor button { border: none; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: .95rem;\n    background: var(--ht-empty); color: var(--primary-text-color); }\n  .editor .step { width: 34px; padding: 6px 0; font-size: 1.1rem; }\n  .editor .primary { background: var(--primary-color); color: var(--text-primary-color, #fff); }\n  .msg { color: var(--secondary-text-color); padding: 8px 0; }\n  .msg.err { color: var(--error-color, #db4437); }\n  /* Narrow cards put the name on its own line above the days. Toggled from\n     JS rather than a container query, which older Safari does not support. */\n  .narrow .row { grid-template-columns: 1fr; }\n  .narrow .cells { gap: 4px; justify-content: space-between; grid-template-columns: repeat(7, minmax(28px, var(--ht-cell))); }\n  .narrow .cell { width: 100%; height: auto; padding-top: 100%; position: relative; }\n  .narrow .cell > span { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; }\n  .narrow .row.header .info { display: none; }\n";
class HabitCalendarCard extends HabitTrackerCard {
  constructor() {
    super();
    this._monthDate = null;
    this._selected = null;
  }
  getCardSize() {
    return 9;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }
  _request() {
    const msg = { type: "habit_tracker/month" };
    if (this._monthDate) msg.date = this._monthDate;
    return msg;
  }
  get _lang() {
    var _a, _b, _c;
    return (((_b = (_a = this._hass) == null ? void 0 : _a.locale) == null ? void 0 : _b.language) || ((_c = this._hass) == null ? void 0 : _c.language) || "en").split("-")[0];
  }
  _format(iso, options) {
    const text = new Date("".concat(iso, "T12:00:00")).toLocaleDateString(this._lang, options);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  _dots(habits, date) {
    return habits.map((h) => {
      const value = h.values[date] || 0;
      if (!value) return "";
      const done = value >= h.target;
      const color = esc(h.display_color);
      return '<i class="dot'.concat(done ? "" : " part", '" style="').concat(done ? "background:".concat(color) : "border-color:".concat(color), '" title="').concat(esc(h.name), '"></i>');
    }).join("");
  }
  _dayPanel(habits, date, today) {
    const t = this._t;
    const heading = this._format(date, { weekday: "long", day: "numeric", month: "numeric" });
    if (date > today) {
      return '<div class="panel"><div class="panel-title">'.concat(esc(heading), '</div><div class="msg">').concat(t.future, "</div></div>");
    }
    const rows = habits.map((h) => {
      const value = h.values[date] || 0;
      const done = value >= h.target;
      const color = esc(h.display_color);
      const icon = h.icon ? '<ha-icon icon="'.concat(esc(h.icon), '"></ha-icon>') : "";
      const control = h.type === "count" ? '<div class="counter">\n                 <button class="step" data-entry="'.concat(esc(h.entry_id), '" data-step="-1">\u2212</button>\n                 <span class="count').concat(done ? " ok" : "", '" style="').concat(done ? "color:".concat(color) : "", '">').concat(value, "<small>/").concat(h.target, '</small></span>\n                 <button class="step" data-entry="').concat(esc(h.entry_id), '" data-step="1">+</button>\n               </div>') : '<button class="toggle'.concat(done ? " on" : "", '" data-entry="').concat(esc(h.entry_id), '"\n                 style="').concat(done ? "background:".concat(color, ";border-color:").concat(color) : "border-color:".concat(color), '"\n                 aria-pressed="').concat(done, '">').concat(done ? "\u2713" : "", "</button>");
      return '\n          <div class="habit">\n            <i class="dot big" style="background:'.concat(color, '"></i>\n            <div class="hname">').concat(icon, "<span>").concat(esc(h.name), "</span></div>\n            ").concat(control, "\n          </div>");
    }).join("");
    return '<div class="panel"><div class="panel-title">'.concat(esc(heading), "</div>").concat(rows, "</div>");
  }
  _render() {
    var _a;
    if (!this._config) return;
    const t = this._t;
    const data = this._data;
    const title = (_a = this._config.title) != null ? _a : t.calendarTitle;
    let body = "";
    if (this._error && !data) {
      body = '<div class="msg">'.concat(t.error, ": ").concat(esc(this._error), "</div>");
    } else if (!data) {
      body = '<div class="msg">\u2026</div>';
    } else {
      const habits = this._habits();
      const { month_start: first, month_end: last, today } = data;
      if (!this._selected || this._selected < first || this._selected > last) {
        this._selected = today >= first && today <= last ? today : first;
      }
      const isCurrent = today >= first && today <= last;
      const offset = (new Date("".concat(first, "T12:00:00")).getDay() + 6) % 7;
      const count = Number(last.slice(8, 10));
      let cells = "";
      for (let i = 0; i < offset; i++) cells += '<div class="blank"></div>';
      for (let i = 0; i < count; i++) {
        const date = addDays(first, i);
        const cls = [
          "mday",
          date === today ? "today" : "",
          date === this._selected ? "selected" : "",
          date > today ? "future" : ""
        ].join(" ");
        cells += '<button class="'.concat(cls, '" data-date="').concat(date, '"><span class="num">').concat(i + 1, '</span><span class="dots">').concat(this._dots(habits, date), "</span></button>");
      }
      const head = t.days.map((d) => '<div class="wd">'.concat(d, "</div>")).join("");
      body = '\n        <div class="nav">\n          <button class="navbtn" data-nav="-1" aria-label="previous month">\u2039</button>\n          <span class="week">'.concat(esc(this._format(first, { month: "long", year: "numeric" })), '</span>\n          <button class="navbtn" data-nav="1" aria-label="next month" ').concat(isCurrent ? "disabled" : "", ">\u203A</button>\n        </div>\n        ").concat(habits.length ? '<div class="month">'.concat(head).concat(cells, "</div>").concat(this._dayPanel(habits, this._selected, today)) : '<div class="msg">'.concat(t.empty, "</div>"), "\n        ").concat(this._error ? '<div class="msg err">'.concat(esc(this._error), "</div>") : "");
    }
    this.shadowRoot.innerHTML = "\n      <style>".concat(STYLE).concat(CAL_STYLE, "</style>\n      <ha-card>\n        ").concat(title ? '<div class="title">'.concat(esc(title), "</div>") : "", '\n        <div class="content').concat(this._narrow ? " narrow" : "", '">').concat(body, "</div>\n      </ha-card>");
    this._bind();
  }
  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll(".navbtn").forEach(
      (b) => b.addEventListener("click", () => {
        const d = new Date("".concat(this._data.month_start, "T12:00:00"));
        d.setMonth(d.getMonth() + Number(b.dataset.nav));
        const next = d.toISOString().slice(0, 10);
        this._monthDate = next > this._data.today ? null : next;
        this._selected = null;
        this._load();
      })
    );
    root.querySelectorAll(".mday").forEach(
      (b) => b.addEventListener("click", () => {
        this._selected = b.dataset.date;
        this._render();
      })
    );
    const change = (entryId, value) => {
      const habit = this._data.habits.find((h) => h.entry_id === entryId);
      if (!habit) return;
      value = Math.max(0, value);
      habit.values[this._selected] = value;
      this._render();
      this._setValue(entryId, this._selected, value);
    };
    root.querySelectorAll(".toggle").forEach(
      (b) => b.addEventListener("click", () => {
        const habit = this._data.habits.find((h) => h.entry_id === b.dataset.entry);
        change(b.dataset.entry, habit.values[this._selected] || 0 ? 0 : 1);
      })
    );
    root.querySelectorAll(".counter .step").forEach(
      (b) => b.addEventListener("click", () => {
        const habit = this._data.habits.find((h) => h.entry_id === b.dataset.entry);
        change(b.dataset.entry, (habit.values[this._selected] || 0) + Number(b.dataset.step));
      })
    );
  }
}
const CAL_STYLE = "\n  .month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }\n  .wd { text-align: center; font-size: .8rem; font-weight: 600; color: var(--secondary-text-color); padding-bottom: 4px; }\n  .mday { border: none; background: none; border-radius: 10px; padding: 6px 2px 4px; min-height: 52px; cursor: pointer;\n    display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--primary-text-color);\n    font: inherit; }\n  .mday:hover { background: var(--ht-empty); }\n  .mday .num { font-size: .95rem; line-height: 1; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }\n  .mday.today .num { background: var(--primary-color); color: var(--text-primary-color, #fff); font-weight: 600; }\n  .mday.selected { background: var(--ht-empty); box-shadow: inset 0 0 0 2px var(--primary-color); }\n  .mday.future { opacity: .4; }\n  .dots { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; max-width: 100%; min-height: 7px; }\n  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex: none; }\n  .dot.part { background: none; border: 1.5px solid; width: 4px; height: 4px; }\n  .dot.big { width: 12px; height: 12px; }\n  .panel { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--divider-color); }\n  .panel-title { font-weight: 600; margin-bottom: 8px; color: var(--primary-text-color); }\n  .habit { display: flex; align-items: center; gap: 10px; padding: 6px 0; }\n  .hname { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; color: var(--primary-text-color); }\n  .hname span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n  .hname ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); flex: none; }\n  .toggle { width: 34px; height: 34px; border-radius: 50%; border: 2px solid; background: none; cursor: pointer;\n    color: #fff; font-size: 1rem; font-weight: 700; flex: none; }\n  .counter { display: flex; align-items: center; gap: 6px; flex: none; }\n  .counter .step { width: 32px; height: 32px; border-radius: 8px; border: none; background: var(--ht-empty);\n    color: var(--primary-text-color); font-size: 1.1rem; cursor: pointer; }\n  .count { min-width: 48px; text-align: center; font-weight: 600; color: var(--primary-text-color); }\n  .count small { font-weight: 400; color: var(--secondary-text-color); }\n";
class HabitOverviewCard extends HabitTrackerCard {
  getCardSize() {
    var _a;
    return 2 + Math.ceil((((_a = this._data) == null ? void 0 : _a.habits.length) || 2) / 3) * 2;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 3 };
  }
  _tile(habit, days, today) {
    const t = this._t;
    const color = esc(habit.display_color);
    const goal = habit.weekly_goal || 7;
    const met = habit.week_done >= goal;
    const icon = habit.icon ? '<ha-icon icon="'.concat(esc(habit.icon), '"></ha-icon>') : "";
    const strip = days.map((d, i) => {
      const value = habit.values[d] || 0;
      const weekday = i;
      let cls = "sq";
      let style = "";
      if (value >= habit.target) {
        cls += " done";
        style = met ? "" : ' style="background:'.concat(color, '"');
      } else if (value > 0) {
        cls += " part";
      } else if (d > today) {
        cls += " future";
      }
      if (habit.days && habit.days.indexOf(weekday) === -1 && value < habit.target) cls += " off";
      return '<i class="'.concat(cls, '"').concat(style, ' title="').concat(t.days[i], '"></i>');
    }).join("");
    return '\n      <div class="tile'.concat(met ? " met" : "", '" style="').concat(met ? "background:".concat(color, ";border-color:").concat(color) : "border-color:".concat(color), '">\n        <div class="thead">').concat(icon, '<span class="tname">').concat(esc(habit.name), '</span></div>\n        <div class="tstate">\n          <span class="badge">').concat(met ? "\u2713" : "".concat(habit.week_done, "/").concat(goal), '</span>\n          <span class="tlabel">').concat(met ? t.doneGoal : esc(t.notDone(goal - habit.week_done)), '</span>\n        </div>\n        <div class="strip">').concat(strip, "</div>\n      </div>");
  }
  _render() {
    var _a;
    if (!this._config) return;
    const t = this._t;
    const data = this._data;
    const title = (_a = this._config.title) != null ? _a : t.overviewTitle;
    let body = "";
    if (this._error && !data) {
      body = '<div class="msg">'.concat(t.error, ": ").concat(esc(this._error), "</div>");
    } else if (!data) {
      body = '<div class="msg">\u2026</div>';
    } else {
      const start = data.week_start;
      const today = data.today;
      const days = [...Array(7).keys()].map((i) => addDays(start, i));
      const habits = this._habits();
      const isCurrent = today >= start && today <= addDays(start, 6);
      const met = habits.filter((h) => h.week_done >= (h.weekly_goal || 7)).length;
      body = '\n        <div class="nav">\n          <button class="navbtn" data-nav="-7" aria-label="previous week">\u2039</button>\n          <span class="week">'.concat(isCurrent ? t.thisWeek : "".concat(shortDate(start), " \u2013 ").concat(shortDate(addDays(start, 6)))).concat(habits.length ? " \xB7 ".concat(met, "/").concat(habits.length) : "", '</span>\n          <button class="navbtn" data-nav="7" aria-label="next week" ').concat(isCurrent ? "disabled" : "", ">\u203A</button>\n        </div>\n        ").concat(habits.length ? '<div class="tiles">'.concat(habits.map((h) => this._tile(h, days, today)).join(""), "</div>") : '<div class="msg">'.concat(t.empty, "</div>"), "\n        ").concat(this._error ? '<div class="msg err">'.concat(esc(this._error), "</div>") : "");
    }
    this.shadowRoot.innerHTML = "\n      <style>".concat(STYLE).concat(OVERVIEW_STYLE, "</style>\n      <ha-card>\n        ").concat(title ? '<div class="title">'.concat(esc(title), "</div>") : "", '\n        <div class="content">').concat(body, "</div>\n      </ha-card>");
    this._bind();
  }
}
const OVERVIEW_STYLE = "\n  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }\n  .tile { border: 2px solid; border-radius: 14px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;\n    min-width: 0; color: var(--primary-text-color); background: var(--card-background-color); }\n  .tile.met { color: #fff; }\n  .thead { display: flex; align-items: center; gap: 6px; min-width: 0; font-weight: 600; }\n  .thead ha-icon { --mdc-icon-size: 20px; flex: none; }\n  .tname { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; line-height: 1.25; }\n  .tstate { display: flex; align-items: center; gap: 8px; }\n  .badge { min-width: 34px; height: 34px; padding: 0 6px; box-sizing: border-box; border-radius: 17px; display: flex; align-items: center;\n    justify-content: center; font-weight: 700; background: var(--ht-empty); color: var(--primary-text-color); }\n  .met .badge { background: rgba(255,255,255,.25); color: #fff; font-size: 1.1rem; }\n  .tlabel { font-size: .85rem; color: var(--secondary-text-color); }\n  .met .tlabel { color: rgba(255,255,255,.9); }\n  .strip { display: flex; gap: 3px; }\n  .sq { flex: 1; height: 6px; border-radius: 3px; background: var(--ht-empty); }\n  .sq.future { background: none; box-shadow: inset 0 0 0 1px var(--ht-empty); }\n  .sq.part { background: var(--ht-partial); }\n  .sq.off { opacity: .4; }\n  .met .sq { background: rgba(255,255,255,.3); box-shadow: none; }\n  .met .sq.done { background: #fff; }\n";
if (!customElements.get("habit-tracker-card")) {
  customElements.define("habit-tracker-card", HabitTrackerCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "habit-tracker-card",
    name: "Habit Tracker",
    description: "Weekly grid of habits you can tick off.",
    preview: true
  });
}
if (!customElements.get("habit-tracker-calendar-card")) {
  customElements.define("habit-tracker-calendar-card", HabitCalendarCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "habit-tracker-calendar-card",
    name: "Habit Tracker: calendar",
    description: "Month calendar with a colored dot per done habit.",
    preview: true
  });
}
if (!customElements.get("habit-tracker-overview-card")) {
  customElements.define("habit-tracker-overview-card", HabitOverviewCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "habit-tracker-overview-card",
    name: "Habit Tracker: week overview",
    description: "One box per habit showing whether this week's goal is met.",
    preview: true
  });
}

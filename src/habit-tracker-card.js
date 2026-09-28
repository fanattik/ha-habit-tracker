/* Habit Tracker card: a Monday-to-Sunday grid of habits you can tick off. */

const STRINGS = {
  en: {
    title: "Habits",
    days: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
    empty: "No habits yet. Add one in Settings → Devices & services → Add integration → Habit Tracker.",
    thisWeek: "This week",
    streak: "Streak",
    perWeek: (done, n) => `${done}/${n} this week`,
    weeks: "wk",
    save: "Save",
    clear: "Clear",
    cancel: "Cancel",
    error: "Could not load habits",
    calendarTitle: "Habit calendar",
    future: "This day has not come yet.",
  },
  cs: {
    title: "Návyky",
    days: ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"],
    empty: "Zatím žádné návyky. Přidej je v Nastavení → Zařízení a služby → Přidat integraci → Habit Tracker.",
    thisWeek: "Tento týden",
    streak: "Série",
    perWeek: (done, n) => `${done}/${n} tento týden`,
    weeks: "týd.",
    save: "Uložit",
    clear: "Vymazat",
    cancel: "Zrušit",
    error: "Návyky se nepodařilo načíst",
    calendarTitle: "Kalendář návyků",
    future: "Tento den ještě nenastal.",
  },
};

// Below this card width the name moves above the days.
const NARROW_WIDTH = 560;

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const shortDate = (iso) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}.`;
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

class HabitTrackerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._data = null;
    this._error = null;
    this._weekDate = null; // any day inside the shown week; null = current week
    this._editing = null; // { entryId, date, value }
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
  }

  disconnectedCallback() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = { show_streak: true, ...(config || {}) };
    this._render();
  }

  getCardSize() {
    return 1 + (this._data?.habits.length || 2);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  set hass(hass) {
    this._hass = hass;
    // Reload when any habit sensor changes (a tick from another device, a new day, a new habit).
    const sig = Object.values(hass.states)
      .filter((s) => s.attributes && s.attributes.habit_type !== undefined)
      .map((s) => `${s.entity_id}:${s.last_updated}`)
      .sort()
      .join("|");
    if (sig !== this._signature) {
      this._signature = sig;
      this._load();
    }
  }

  get _t() {
    const lang = (this._hass?.locale?.language || this._hass?.language || "en").split("-")[0];
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
      this._error = err?.message || String(err);
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
      this._error = err?.message || String(err);
      this._render();
    }
    // The sensor update triggers a reload; load anyway for past weeks, which do not change the sensor.
    this._load();
  }

  _habits() {
    const habits = this._data?.habits || [];
    const only = this._config?.entities;
    if (!Array.isArray(only) || !only.length) return habits;
    return only
      .map((e) => habits.find((h) => h.entity_id === (typeof e === "string" ? e : e.entity)))
      .filter(Boolean);
  }

  _ring(percent) {
    const r = 16;
    const c = 2 * Math.PI * r;
    const hue = Math.round((percent / 100) * 120);
    return `
      <svg class="ring" viewBox="0 0 40 40" aria-label="${percent}%">
        <circle cx="20" cy="20" r="${r}" class="ring-bg"></circle>
        <circle cx="20" cy="20" r="${r}" class="ring-fg" style="stroke:hsl(${hue} 65% 50%)"
          stroke-dasharray="${(c * percent) / 100} ${c}" transform="rotate(-90 20 20)"></circle>
        <text x="20" y="21">${percent}%</text>
      </svg>`;
  }

  _cell(habit, date, today) {
    const value = habit.values[date] || 0;
    const future = date > today;
    const done = value >= habit.target;
    let cls = "empty";
    let label = "✗";
    if (done) {
      cls = "done";
      label = habit.type === "count" ? value : "✓";
    } else if (value > 0) {
      cls = "partial";
      label = value;
    }
    if (future) {
      cls = "future";
      label = "";
    }
    const isToday = date === today ? " today" : "";
    // Days outside the plan can still be ticked, they are just dimmed.
    const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    if (habit.days && habit.days.indexOf(weekday) === -1 && !done) cls += " off";
    const color = done && habit.color ? ` style="background:${esc(habit.color)}"` : "";
    return `<button class="cell ${cls}${isToday}"${color} data-entry="${esc(habit.entry_id)}" data-date="${date}"
      ${future ? "disabled" : ""} title="${shortDate(date)}"><span>${esc(label)}</span></button>`;
  }

  _editor(habit) {
    const ed = this._editing;
    const t = this._t;
    return `
      <div class="editor">
        <span class="ed-date">${shortDate(ed.date)}</span>
        <button class="step" data-step="-1">−</button>
        <input type="number" min="0" inputmode="numeric" value="${ed.value}">
        <button class="step" data-step="1">+</button>
        <span class="target">/ ${habit.target}</span>
        <span class="spacer"></span>
        <button class="act" data-act="clear">${t.clear}</button>
        <button class="act" data-act="cancel">${t.cancel}</button>
        <button class="act primary" data-act="save">${t.save}</button>
      </div>`;
  }

  _render() {
    if (!this._config) return;
    const t = this._t;
    const data = this._data;
    const title = this._config.title ?? t.title;
    let body = "";

    if (this._error && !data) {
      body = `<div class="msg">${t.error}: ${esc(this._error)}</div>`;
    } else if (!data) {
      body = `<div class="msg">…</div>`;
    } else {
      const start = data.week_start;
      const today = data.today;
      const days = [...Array(7).keys()].map((i) => addDays(start, i));
      const habits = this._habits();
      const isCurrent = today >= start && today <= addDays(start, 6);
      const head = days
        .map(
          (d, i) =>
            `<div class="day${d === today ? " today" : ""}"><b>${t.days[i]}</b><span>${shortDate(d)}</span></div>`
        )
        .join("");
      const rows = habits
        .map((h) => {
          const cells = days.map((d) => this._cell(h, d, today)).join("");
          const icon = h.icon ? `<ha-icon icon="${esc(h.icon)}"></ha-icon>` : "";
          const weekly = h.streak_unit === "week";
          const streak =
            this._config.show_streak && h.streak > (weekly ? 0 : 1)
              ? `<span class="streak" title="${t.streak}">🔥 ${h.streak}${weekly ? ` ${t.weeks}` : ""}</span>`
              : "";
          const goal =
            h.weekly_goal && h.weekly_goal < 7
              ? `<span class="goal">${esc(t.perWeek(h.week_done, h.weekly_goal))}</span>`
              : "";
          const editing = this._editing && this._editing.entryId === h.entry_id ? this._editor(h) : "";
          return `
            <div class="row">
              <div class="info">${this._ring(h.percent)}<div class="name">${icon}<span>${esc(h.name)}</span>${goal}${streak}</div></div>
              <div class="cells">${cells}</div>
              ${editing}
            </div>`;
        })
        .join("");
      body = `
        <div class="nav">
          <button class="navbtn" data-nav="-7" aria-label="previous week">‹</button>
          <span class="week">${isCurrent ? t.thisWeek : `${shortDate(start)} – ${shortDate(addDays(start, 6))}`}</span>
          <button class="navbtn" data-nav="7" aria-label="next week" ${isCurrent ? "disabled" : ""}>›</button>
        </div>
        ${habits.length ? `<div class="row header"><div class="info"></div><div class="cells">${head}</div></div>${rows}` : `<div class="msg">${t.empty}</div>`}
        ${this._error ? `<div class="msg err">${esc(this._error)}</div>` : ""}`;
    }

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        ${title ? `<div class="title">${esc(title)}</div>` : ""}
        <div class="content${this._narrow ? " narrow" : ""}">${body}</div>
      </ha-card>`;
    this._bind();
  }

  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll(".navbtn").forEach((b) =>
      b.addEventListener("click", () => {
        const next = addDays(this._data.week_start, Number(b.dataset.nav));
        this._weekDate = next > this._data.today ? null : next;
        this._editing = null;
        this._load();
      })
    );
    root.querySelectorAll(".cell").forEach((b) =>
      b.addEventListener("click", () => {
        const habit = this._data.habits.find((h) => h.entry_id === b.dataset.entry);
        const date = b.dataset.date;
        const value = habit.values[date] || 0;
        if (habit.type === "count") {
          this._editing = { entryId: habit.entry_id, date, value: value || habit.target };
          this._render();
          root.querySelector(".editor input")?.select();
        } else {
          habit.values[date] = value ? 0 : 1; // optimistic
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
    editor.querySelectorAll(".step").forEach((b) =>
      b.addEventListener("click", () => {
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
    editor.querySelectorAll(".act").forEach((b) =>
      b.addEventListener("click", () => {
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

const STYLE = `
  :host { display: block; --ht-done: var(--success-color, #43a047); --ht-partial: var(--warning-color, #ffa000);
    --ht-empty: var(--secondary-background-color, #e0e0e0); --ht-cell: 36px; }
  ha-card { display: block; padding: 12px 16px 16px; }
  .title { font-size: 1.25rem; font-weight: 500; padding: 4px 0 8px; color: var(--primary-text-color); }
  .nav { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 8px; color: var(--secondary-text-color); }
  .navbtn { border: none; background: none; font-size: 1.4rem; line-height: 1; cursor: pointer; color: var(--primary-text-color); padding: 4px 10px; border-radius: 8px; }
  .navbtn:disabled { opacity: .25; cursor: default; }
  .navbtn:not(:disabled):hover { background: var(--ht-empty); }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 12px;
    padding: 8px 10px; margin-bottom: 8px; border-radius: 14px; background: var(--card-background-color);
    box-shadow: 0 0 0 1px var(--divider-color, rgba(0,0,0,.12)); }
  .row.header { box-shadow: none; background: none; padding-top: 0; padding-bottom: 0; margin-bottom: 4px; }
  .info { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .name { display: flex; align-items: center; gap: 6px; min-width: 0; font-weight: 500; font-size: 1.05rem; color: var(--primary-text-color); }
  .name span:first-of-type { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
  .name ha-icon { --mdc-icon-size: 22px; color: var(--state-icon-color, var(--primary-color)); flex: none; }
  .goal { font-size: .8rem; font-weight: 400; color: var(--secondary-text-color); white-space: nowrap; }
  .cells .cell.off { opacity: .35; }
  .streak { font-size: .8rem; font-weight: 400; color: var(--secondary-text-color); white-space: nowrap; }
  .ring { width: 40px; height: 40px; flex: none; }
  .ring-bg { fill: none; stroke: var(--ht-empty); stroke-width: 4; }
  .ring-fg { fill: none; stroke-width: 4; stroke-linecap: round; transition: stroke-dasharray .3s; }
  .ring text { font-size: 9.5px; letter-spacing: -.3px; text-anchor: middle; dominant-baseline: middle; fill: var(--primary-text-color); }
  .cells { display: grid; grid-template-columns: repeat(7, var(--ht-cell)); gap: 6px; }
  .day { display: flex; flex-direction: column; align-items: center; font-size: .75rem; color: var(--secondary-text-color); line-height: 1.2; }
  .day b { font-size: .85rem; color: var(--primary-text-color); }
  .day.today b, .day.today span { color: var(--primary-color); }
  .cell { width: var(--ht-cell); height: var(--ht-cell); border-radius: 50%; border: none; padding: 0; cursor: pointer;
    font: 600 .9rem/1 var(--paper-font-body1_-_font-family, sans-serif); display: flex; align-items: center; justify-content: center;
    transition: transform .1s, background .2s; }
  .cell:not(:disabled):active { transform: scale(.9); }
  .cell.empty { background: var(--ht-empty); color: var(--secondary-text-color); opacity: .8; }
  .cell.done { background: var(--ht-done); color: #fff; }
  .cell.partial { background: var(--ht-partial); color: #fff; }
  .cell.future { background: transparent; box-shadow: inset 0 0 0 2px var(--ht-empty); cursor: default; }
  .cell.today { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .editor { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding-top: 4px; }
  .editor input { width: 72px; padding: 6px 8px; font-size: 1rem; border-radius: 8px; border: 1px solid var(--divider-color);
    background: var(--card-background-color); color: var(--primary-text-color); }
  .editor .ed-date, .editor .target { color: var(--secondary-text-color); }
  .editor .spacer { flex: 1; }
  .editor button { border: none; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: .95rem;
    background: var(--ht-empty); color: var(--primary-text-color); }
  .editor .step { width: 34px; padding: 6px 0; font-size: 1.1rem; }
  .editor .primary { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .msg { color: var(--secondary-text-color); padding: 8px 0; }
  .msg.err { color: var(--error-color, #db4437); }
  /* Narrow cards put the name on its own line above the days. Toggled from
     JS rather than a container query, which older Safari does not support. */
  .narrow .row { grid-template-columns: 1fr; }
  .narrow .cells { gap: 4px; justify-content: space-between; grid-template-columns: repeat(7, minmax(28px, var(--ht-cell))); }
  .narrow .cell { width: 100%; height: auto; padding-top: 100%; position: relative; }
  .narrow .cell > span { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; }
  .narrow .row.header .info { display: none; }
`;


/* Habit calendar card: a month grid with a dot per done habit; pick a day to tick habits off. */
class HabitCalendarCard extends HabitTrackerCard {
  constructor() {
    super();
    this._monthDate = null; // any day inside the shown month; null = current month
    this._selected = null; // ISO date of the open day
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
    return (this._hass?.locale?.language || this._hass?.language || "en").split("-")[0];
  }

  _format(iso, options) {
    const text = new Date(`${iso}T12:00:00`).toLocaleDateString(this._lang, options);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  _dots(habits, date) {
    return habits
      .map((h) => {
        const value = h.values[date] || 0;
        if (!value) return "";
        const done = value >= h.target;
        const color = esc(h.display_color);
        return `<i class="dot${done ? "" : " part"}" style="${done ? `background:${color}` : `border-color:${color}`}" title="${esc(h.name)}"></i>`;
      })
      .join("");
  }

  _dayPanel(habits, date, today) {
    const t = this._t;
    const heading = this._format(date, { weekday: "long", day: "numeric", month: "numeric" });
    if (date > today) {
      return `<div class="panel"><div class="panel-title">${esc(heading)}</div><div class="msg">${t.future}</div></div>`;
    }
    const rows = habits
      .map((h) => {
        const value = h.values[date] || 0;
        const done = value >= h.target;
        const color = esc(h.display_color);
        const icon = h.icon ? `<ha-icon icon="${esc(h.icon)}"></ha-icon>` : "";
        const control =
          h.type === "count"
            ? `<div class="counter">
                 <button class="step" data-entry="${esc(h.entry_id)}" data-step="-1">−</button>
                 <span class="count${done ? " ok" : ""}" style="${done ? `color:${color}` : ""}">${value}<small>/${h.target}</small></span>
                 <button class="step" data-entry="${esc(h.entry_id)}" data-step="1">+</button>
               </div>`
            : `<button class="toggle${done ? " on" : ""}" data-entry="${esc(h.entry_id)}"
                 style="${done ? `background:${color};border-color:${color}` : `border-color:${color}`}"
                 aria-pressed="${done}">${done ? "✓" : ""}</button>`;
        return `
          <div class="habit">
            <i class="dot big" style="background:${color}"></i>
            <div class="hname">${icon}<span>${esc(h.name)}</span></div>
            ${control}
          </div>`;
      })
      .join("");
    return `<div class="panel"><div class="panel-title">${esc(heading)}</div>${rows}</div>`;
  }

  _render() {
    if (!this._config) return;
    const t = this._t;
    const data = this._data;
    const title = this._config.title ?? t.calendarTitle;
    let body = "";

    if (this._error && !data) {
      body = `<div class="msg">${t.error}: ${esc(this._error)}</div>`;
    } else if (!data) {
      body = `<div class="msg">…</div>`;
    } else {
      const habits = this._habits();
      const { month_start: first, month_end: last, today } = data;
      if (!this._selected || this._selected < first || this._selected > last) {
        this._selected = today >= first && today <= last ? today : first;
      }
      const isCurrent = today >= first && today <= last;
      const offset = (new Date(`${first}T12:00:00`).getDay() + 6) % 7;
      const count = Number(last.slice(8, 10));
      let cells = "";
      for (let i = 0; i < offset; i++) cells += `<div class="blank"></div>`;
      for (let i = 0; i < count; i++) {
        const date = addDays(first, i);
        const cls = [
          "mday",
          date === today ? "today" : "",
          date === this._selected ? "selected" : "",
          date > today ? "future" : "",
        ].join(" ");
        cells += `<button class="${cls}" data-date="${date}"><span class="num">${i + 1}</span><span class="dots">${this._dots(habits, date)}</span></button>`;
      }
      const head = t.days.map((d) => `<div class="wd">${d}</div>`).join("");
      body = `
        <div class="nav">
          <button class="navbtn" data-nav="-1" aria-label="previous month">‹</button>
          <span class="week">${esc(this._format(first, { month: "long", year: "numeric" }))}</span>
          <button class="navbtn" data-nav="1" aria-label="next month" ${isCurrent ? "disabled" : ""}>›</button>
        </div>
        ${habits.length
          ? `<div class="month">${head}${cells}</div>${this._dayPanel(habits, this._selected, today)}`
          : `<div class="msg">${t.empty}</div>`}
        ${this._error ? `<div class="msg err">${esc(this._error)}</div>` : ""}`;
    }

    this.shadowRoot.innerHTML = `
      <style>${STYLE}${CAL_STYLE}</style>
      <ha-card>
        ${title ? `<div class="title">${esc(title)}</div>` : ""}
        <div class="content${this._narrow ? " narrow" : ""}">${body}</div>
      </ha-card>`;
    this._bind();
  }

  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll(".navbtn").forEach((b) =>
      b.addEventListener("click", () => {
        const d = new Date(`${this._data.month_start}T12:00:00`);
        d.setMonth(d.getMonth() + Number(b.dataset.nav));
        const next = d.toISOString().slice(0, 10);
        this._monthDate = next > this._data.today ? null : next;
        this._selected = null;
        this._load();
      })
    );
    root.querySelectorAll(".mday").forEach((b) =>
      b.addEventListener("click", () => {
        this._selected = b.dataset.date;
        this._render();
      })
    );
    const change = (entryId, value) => {
      const habit = this._data.habits.find((h) => h.entry_id === entryId);
      if (!habit) return;
      value = Math.max(0, value);
      habit.values[this._selected] = value; // optimistic
      this._render();
      this._setValue(entryId, this._selected, value);
    };
    root.querySelectorAll(".toggle").forEach((b) =>
      b.addEventListener("click", () => {
        const habit = this._data.habits.find((h) => h.entry_id === b.dataset.entry);
        change(b.dataset.entry, (habit.values[this._selected] || 0) ? 0 : 1);
      })
    );
    root.querySelectorAll(".counter .step").forEach((b) =>
      b.addEventListener("click", () => {
        const habit = this._data.habits.find((h) => h.entry_id === b.dataset.entry);
        change(b.dataset.entry, (habit.values[this._selected] || 0) + Number(b.dataset.step));
      })
    );
  }
}

const CAL_STYLE = `
  .month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .wd { text-align: center; font-size: .8rem; font-weight: 600; color: var(--secondary-text-color); padding-bottom: 4px; }
  .mday { border: none; background: none; border-radius: 10px; padding: 6px 2px 4px; min-height: 52px; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--primary-text-color);
    font: inherit; }
  .mday:hover { background: var(--ht-empty); }
  .mday .num { font-size: .95rem; line-height: 1; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .mday.today .num { background: var(--primary-color); color: var(--text-primary-color, #fff); font-weight: 600; }
  .mday.selected { background: var(--ht-empty); box-shadow: inset 0 0 0 2px var(--primary-color); }
  .mday.future { opacity: .4; }
  .dots { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; max-width: 100%; min-height: 7px; }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex: none; }
  .dot.part { background: none; border: 1.5px solid; width: 4px; height: 4px; }
  .dot.big { width: 12px; height: 12px; }
  .panel { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--divider-color); }
  .panel-title { font-weight: 600; margin-bottom: 8px; color: var(--primary-text-color); }
  .habit { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
  .hname { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; color: var(--primary-text-color); }
  .hname span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hname ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); flex: none; }
  .toggle { width: 34px; height: 34px; border-radius: 50%; border: 2px solid; background: none; cursor: pointer;
    color: #fff; font-size: 1rem; font-weight: 700; flex: none; }
  .counter { display: flex; align-items: center; gap: 6px; flex: none; }
  .counter .step { width: 32px; height: 32px; border-radius: 8px; border: none; background: var(--ht-empty);
    color: var(--primary-text-color); font-size: 1.1rem; cursor: pointer; }
  .count { min-width: 48px; text-align: center; font-weight: 600; color: var(--primary-text-color); }
  .count small { font-weight: 400; color: var(--secondary-text-color); }
`;

if (!customElements.get("habit-tracker-card")) {
  customElements.define("habit-tracker-card", HabitTrackerCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "habit-tracker-card",
    name: "Habit Tracker",
    description: "Weekly grid of habits you can tick off.",
    preview: true,
  });
}

if (!customElements.get("habit-tracker-calendar-card")) {
  customElements.define("habit-tracker-calendar-card", HabitCalendarCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "habit-tracker-calendar-card",
    name: "Habit Tracker: calendar",
    description: "Month calendar with a colored dot per done habit.",
    preview: true,
  });
}

import { useEffect, useState } from "react";

// ----------------------------------------------------------------------------
// SAMPLE DATA — replace with the real Google Calendar + platform mapping.
// ----------------------------------------------------------------------------

type OOOEntry = { person: string; start: string; end: string };
type Holiday = { date: string; name: string };
type Block = { id: string; label: string; start: string; end: string };
type PlanEntry = { sp: string; why: string };
type Ev = { label: string; start: Date; end: Date; kind: "ooo" | "holiday" };

const VELOCITY_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/REPLACE_WITH_YOUR_SHEET";

const PLATFORM_PEOPLE: Record<string, string[]> = {
  iOS: ["Paweł", "Emil"],
  Android: ["Maciej"],
  Backend: ["Natalia", "Tomek"],
  Frontend: ["Zofia", "Kuba"],
};

const NUM_BLOCKS = 4;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

// ----------------------------------------------------------------------------
// Date helpers (timezone-safe via explicit y/m/d).
// ----------------------------------------------------------------------------

function parse(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function isWeekend(d: Date): boolean {
  const g = d.getDay();
  return g === 0 || g === 6;
}
function fmtShort(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
function fmtFull(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
function dayOffset(d: Date, from: Date): number {
  return Math.round((d.getTime() - from.getTime()) / DAY_MS);
}
function mondayOf(d: Date): Date {
  const g = d.getDay();
  return addDays(d, g === 0 ? -6 : 1 - g);
}

// Anchor the horizon to the current week so "today" is always visible.
const _now = new Date();
const TODAY = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
const START_DATE = mondayOf(TODAY);
const offDay = (n: number): string => iso(addDays(START_DATE, n));

// Sample OOO + holidays, relative to the current week so the demo lines up.
const OOO: OOOEntry[] = [
  { person: "Natalia", start: offDay(0), end: offDay(2) },
  { person: "Paweł", start: offDay(8), end: offDay(9) },
  { person: "Emil", start: offDay(14), end: offDay(20) },
];
const HOLIDAYS: Holiday[] = [{ date: offDay(16), name: "Holiday" }];
const HOLIDAY_SET = new Set(HOLIDAYS.map((h) => h.date));

function buildBlocks(): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < NUM_BLOCKS; i++) {
    const s = addDays(START_DATE, i * 14);
    const e = addDays(s, 13);
    blocks.push({
      id: `b${i}`,
      label: `${fmtShort(s)} – ${fmtShort(e)}`,
      start: iso(s),
      end: iso(e),
    });
  }
  return blocks;
}

function workingDays(block: Block): Date[] {
  const out: Date[] = [];
  let cur = parse(block.start);
  const end = parse(block.end);
  while (cur.getTime() <= end.getTime()) {
    if (!isWeekend(cur) && !HOLIDAY_SET.has(iso(cur))) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function containsToday(block: Block): boolean {
  return (
    TODAY.getTime() >= parse(block.start).getTime() &&
    TODAY.getTime() <= parse(block.end).getTime()
  );
}

function blockEvents(block: Block, people: string[]): Ev[] {
  const bs = parse(block.start);
  const be = parse(block.end);
  const evs: Ev[] = [];
  for (const e of OOO) {
    if (!people.includes(e.person)) continue;
    const s = parse(e.start);
    const en = parse(e.end);
    if (en.getTime() < bs.getTime() || s.getTime() > be.getTime()) continue;
    evs.push({ label: `${e.person} OOO`, start: s, end: en, kind: "ooo" });
  }
  for (const h of HOLIDAYS) {
    const d = parse(h.date);
    if (d.getTime() < bs.getTime() || d.getTime() > be.getTime()) continue;
    evs.push({ label: h.name, start: d, end: d, kind: "holiday" });
  }
  return evs;
}

// ----------------------------------------------------------------------------
// Persisted state
// ----------------------------------------------------------------------------

function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

type ScheduleRow = {
  block: Block;
  cap: number;
  before: number;
  consumed: number;
  after: number;
  due: Date | null;
  fraction: number;
  current: boolean;
};

// ----------------------------------------------------------------------------

export default function App() {
  const [platform, setPlatform] = usePersisted<string>("ddp_platform", "iOS");
  const [epic, setEpic] = usePersisted<string>("ddp_epic", "");
  const [remainingRaw, setRemainingRaw] = usePersisted<string>("ddp_remaining", "20");
  const [plan, setPlan] = usePersisted<Record<string, PlanEntry>>("ddp_plan", {
    b0: { sp: "14", why: "" },
    b1: { sp: "12", why: "" },
    b2: { sp: "8", why: "" },
    b3: { sp: "14", why: "" },
  });
  const [sent, setSent] = useState<string>("");

  const blocks = buildBlocks();
  const people = PLATFORM_PEOPLE[platform] ?? [];
  const remainingSP = Math.max(0, Number(remainingRaw) || 0);
  const currentBlock = blocks.find((b) => containsToday(b)) ?? null;

  const spFor = (id: string): number => Math.max(0, Number(plan[id]?.sp) || 0);

  const setBlockField = (id: string, field: keyof PlanEntry, val: string): void => {
    setPlan((prev) => ({
      ...prev,
      [id]: {
        sp: prev[id]?.sp ?? "",
        why: prev[id]?.why ?? "",
        [field]: val,
      },
    }));
  };

  // Burn remaining SP through the blocks; placement respects "today".
  let remaining = remainingSP;
  const rows: ScheduleRow[] = blocks.map((block) => {
    const wd = workingDays(block).filter((d) => d.getTime() >= TODAY.getTime());
    const cap = spFor(block.id);
    const before = remaining;
    let consumed = 0;
    let due: Date | null = null;
    let fraction = 0;
    if (before > 0) {
      consumed = Math.min(cap, before);
      if (cap > 0 && before <= cap && wd.length > 0) {
        fraction = before / cap;
        const idx = Math.min(wd.length, Math.max(1, Math.ceil(fraction * wd.length)));
        due = wd[idx - 1];
      }
    }
    remaining = Math.max(0, before - consumed);
    return {
      block,
      cap,
      before,
      consumed,
      after: remaining,
      due,
      fraction,
      current: containsToday(block),
    };
  });

  const dueRow = rows.find((r) => r.due) ?? null;
  const finalDue = dueRow?.due ?? null;
  const totalPlannedThrough = remainingSP - remaining;

  const onSend = (): void => {
    const dueStr = finalDue ? fmtFull(finalDue) : "no date (SP unplanned)";
    const planLines = rows
      .filter((r) => r.before > 0)
      .map(
        (r) =>
          `• ${r.block.label}: ${r.cap} SP${
            plan[r.block.id]?.why ? ` — ${plan[r.block.id]?.why}` : ""
          }`,
      )
      .join("\n");
    const text =
      `Due date: ${dueStr}\n` +
      `Epic: ${epic || "—"} · Platform: ${platform} · Remaining: ${remainingSP} SP\n` +
      `Capacity plan:\n${planLines}`;
    setSent(text);
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const renderWeek = (weekStart: Date, events: Ev[], keyPrefix: string) => {
    const we = addDays(weekStart, 6);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));
    const inWeek = events.filter(
      (ev) =>
        ev.end.getTime() >= weekStart.getTime() &&
        ev.start.getTime() <= we.getTime(),
    );
    return (
      <div className="week">
        <div className="grid7">
          {days.map((d) => {
            const hol = HOLIDAY_SET.has(iso(d));
            const isToday = d.getTime() === TODAY.getTime();
            const cls = [
              "daycell",
              isToday ? "today" : "",
              hol ? "holiday" : "",
              isWeekend(d) ? "weekend" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div key={iso(d)} className={cls}>
                <span className="dow">{WEEKDAYS[d.getDay()]}</span>
                <span className="dnum">{d.getDate()}</span>
                <span className="tlabel">{isToday ? "TODAY" : ""}</span>
              </div>
            );
          })}
        </div>
        {inWeek.map((ev, i) => {
          const startIdx = Math.max(0, dayOffset(ev.start, weekStart));
          const endIdx = Math.min(6, dayOffset(ev.end, weekStart));
          return (
            <div key={`${keyPrefix}-${ev.label}-${i}`} className="grid7 lane">
              <div
                className={`bar ${ev.kind}`}
                style={{ gridColumn: `${startIdx + 1} / ${endIdx + 2}` }}
              >
                {ev.label}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="app">
      <header className="head">
        <h1>Due Date Planner</h1>
        <ol className="steps">
          <li>
            Choose velocity from{" "}
            <a href={VELOCITY_SHEET_URL} target="_blank" rel="noreferrer">
              historical data
            </a>
          </li>
          <li>Set expected SP burned per 2 weeks, accounting for OOO</li>
          <li>The tool burns down the remaining SP and shows the due date below</li>
        </ol>
        <p className="today">
          Today: {fmtFull(TODAY)}
          {currentBlock ? ` · current sprint ${currentBlock.label}` : ""}
        </p>
      </header>

      <section className="config">
        <label>
          <span>Platform</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {Object.keys(PLATFORM_PEOPLE).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Remaining SP</span>
          <input
            type="number"
            value={remainingRaw}
            onChange={(e) => setRemainingRaw(e.target.value)}
            placeholder="e.g. 20"
          />
        </label>
        <label className="grow">
          <span>Jira epic</span>
          <input
            value={epic}
            onChange={(e) => setEpic(e.target.value)}
            placeholder="attach epic, e.g. MOTO-123"
          />
        </label>
      </section>

      <p className="muted">
        Showing OOO for: {people.join(", ")} <span className="dim">({platform})</span>
      </p>

      <h2>Plan by 2-week block</h2>
      <div className="blocks">
        {rows.map((r) => {
          const active = r.before > 0;
          const evs = blockEvents(r.block, people);
          const ws0 = parse(r.block.start);
          const ws1 = addDays(ws0, 7);
          return (
            <div key={r.block.id} className={`card ${r.current ? "current" : ""}`}>
              <div className="card-head">
                <span>{r.block.label}</span>
                {r.current && <span className="tag">current sprint</span>}
              </div>
              <div className="card-body">
                {active ? (
                  <>
                    <div className="cal">
                      {renderWeek(ws0, evs, `${r.block.id}-w0`)}
                      {renderWeek(ws1, evs, `${r.block.id}-w1`)}
                    </div>
                    <div className="inputs">
                      <label className="sp">
                        <span>SP this block</span>
                        <input
                          type="number"
                          value={plan[r.block.id]?.sp ?? ""}
                          onChange={(e) => setBlockField(r.block.id, "sp", e.target.value)}
                          placeholder="SP"
                        />
                      </label>
                      <label className="why">
                        <span>Why this number</span>
                        <input
                          value={plan[r.block.id]?.why ?? ""}
                          onChange={(e) => setBlockField(r.block.id, "why", e.target.value)}
                          placeholder="e.g. Emil OOO 5d; ~10 SP historically"
                        />
                      </label>
                    </div>
                    <p className="muted small">
                      {r.consumed} SP consumed here · {r.after} SP left after this block
                      {r.due ? " · project completes in this block" : ""}
                    </p>
                  </>
                ) : (
                  <p className="muted small">
                    Not needed — the project completes before this block.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {finalDue && dueRow ? (
        <div className="result">
          <div>
            <div className="muted small">Projected due date</div>
            <div className="due">{fmtFull(finalDue)}</div>
          </div>
          <div className="result-meta">
            <div className="muted small">
              lands {Math.round(dueRow.fraction * 100)}% into {dueRow.block.label}
            </div>
            <div className="dim small">
              {totalPlannedThrough} of {remainingSP} SP consumed
            </div>
          </div>
        </div>
      ) : (
        <div className="warn">
          {remainingSP} SP remaining, but only {totalPlannedThrough} SP is covered by
          the blocks above. Raise the SP in a block or extend the horizon.
        </div>
      )}

      <div className="send">
        <button className="btn" onClick={onSend}>
          Send to Jira as comment
        </button>
        {finalDue && (
          <span className="pill">
            {epic ? epic : "no epic attached"} → {fmtFull(finalDue)}
          </span>
        )}
      </div>
      {sent && (
        <div className="sent">
          <div className="muted small">Comment (copied to clipboard):</div>
          <pre>{sent}</pre>
        </div>
      )}

      <p className="footnote">
        Prototype with sample calendar data anchored to the current week. Wire the
        platform→people mapping and OOO/holidays to the shared Google Calendar, and the
        velocity link to your sheet.
      </p>
    </div>
  );
}

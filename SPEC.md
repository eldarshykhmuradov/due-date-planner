# Due Date Planner — Working Spec

> Purpose of this file: give an agent (or human) starting in a **fresh context
> window** everything needed to keep improving this tool without re-deriving the
> reasoning. Read this top-to-bottom before changing code.

---

## 1. What this tool is (and is not)

A **decision-support tool for an engineering lead** to derive a project's
**due date** from velocity + capacity, instead of guessing a calendar date.

- **It is NOT auto-scheduling.** The human keeps the judgment. The lead reads
  velocity history + OOO/holidays and decides **how many story points (SP) the
  team will burn in each 2-week block**. The tool only does the burn-down
  arithmetic and surfaces the resulting date.
- **Why this shape:** the team works in a **2-week cadence (not sprints)** with a
  **roadmap of projects (epics)**. Many initiatives are short (1–3 weeks), so the
  due date must land **mid-block**, not snapped to a cadence boundary.
- **Output is a date + a rationale**, posted to Jira as a comment, so the
  decision (and the per-block reasoning) is captured for later reflection.

### Context that lives only here (not in code)
- Team: 7 devs — 2 iOS, 1 Android, 2 Backend, 2 Frontend. Platforms work on
  separate, mostly independent projects; velocity is tracked **per platform**.
- Conceptual model from the design discussion (not all implemented yet):
  - **T0 baseline**: a frozen date from quarter-planning week estimates, never
    changed; used only for a final **reflection** at completion.
  - **Expected date**: the continuous, recalculated delivery date (what this tool
    computes). `No-Later-Than` and `calibration_factor` were **deliberately
    dropped** — do not reintroduce them without discussing with the user.
  - **Reflection loop**: at completion, compare actual vs. T0; if slip exceeds a
    threshold, classify the cause (scope vs. underestimation).

---

## 2. Current state (as of initial publish)

- Standalone **Vite + React 18 + TypeScript** SPA. No backend.
- **All logic is real; all data inputs are stubs** (see §6).
- Single-component app: nearly everything is in `src/App.tsx`.
- State persists to `localStorage` (keys prefixed `ddp_`).
- Published: GitHub repo `eldarshykhmuradov/due-date-planner` (public), live at
  `https://eldarshykhmuradov.github.io/due-date-planner/` via GitHub Pages
  (Actions workflow in `.github/workflows/deploy.yml`, deploys on push to `main`).

---

## 3. Project layout

```
due-date-planner/
├── index.html
├── package.json            # scripts: dev / build / preview
├── vite.config.ts          # base: "./" (relative assets, works under any subpath)
├── tsconfig.json           # strict, noUnusedLocals/Params ON
├── tsconfig.node.json
├── .github/workflows/deploy.yml   # build + deploy to GitHub Pages
├── README.md               # user-facing overview + stub table
├── SPEC.md                 # this file
└── src/
    ├── main.tsx            # React root
    ├── App.tsx             # ALL logic + UI (data model, burn-down, calendar, render)
    └── styles.css          # plain CSS, light theme, CSS variables
```

Run locally: `npm install && npm run dev`. Verify before pushing: `npm run build`
(runs `tsc -b` then `vite build`; strict TS must pass).

---

## 4. Data model (`src/App.tsx`)

```ts
type OOOEntry = { person: string; start: string; end: string }; // ISO yyyy-mm-dd, inclusive
type Holiday  = { date: string; name: string };
type Block    = { id: string; label: string; start: string; end: string }; // a 2-week window
type PlanEntry = { sp: string; why: string };   // lead's input per block (strings from inputs)
type Ev = { label: string; start: Date; end: Date; kind: "ooo" | "holiday" };
```

Key constants/stubs: `VELOCITY_SHEET_URL`, `PLATFORM_PEOPLE` (platform → people),
`NUM_BLOCKS` (horizon length, default 4), `OOO`, `HOLIDAYS`.

Anchoring: `TODAY` is normalized to local midnight; `START_DATE = mondayOf(TODAY)`.
Sample `OOO`/`HOLIDAYS` are generated **relative to the current week** via
`offDay(n)` so the demo always lines up with "today".

Date helpers are timezone-safe (build dates from explicit y/m/d, never
`new Date(isoString)`): `parse`, `addDays`, `iso`, `isWeekend`, `fmtShort`,
`fmtFull`, `dayOffset`, `mondayOf`. **Keep using these** to avoid TZ drift.

Persisted state (`usePersisted` hook): `ddp_platform`, `ddp_epic`,
`ddp_remaining`, `ddp_plan` (Record<blockId, PlanEntry>).

---

## 5. The burn-down algorithm (the core — change carefully)

Given `remainingSP` and a per-block capacity `cap = plan[block].sp`:

1. Build `NUM_BLOCKS` consecutive 2-week `blocks` starting at `START_DATE`.
2. Walk blocks in order, carrying `remaining` SP:
   - `workingDays(block)` = weekdays in the block minus holidays, **filtered to
     `>= TODAY`** (so the current block only counts days from today onward).
   - `consumed = min(cap, remaining)`.
   - If the project **finishes in this block** (`remaining <= cap` and there are
     working days): `fraction = remaining / cap`; pick the working day at index
     `ceil(fraction * workingDays.length)` → that day is the **projected due
     date**. This is what makes the date land **mid-block**.
   - Subtract and continue.
3. `finalDue` = the first block where a due date was produced.
4. If SP remain after all blocks → show the **warning** (under-planned horizon).

Note: OOO is **not** auto-subtracted from capacity. By design the lead's per-block
SP number *already accounts for* OOO (they see it on the calendar). OOO/holidays
are shown for **judgment**, and holidays additionally remove working days from the
mid-block fraction math.

---

## 6. Stubs to wire to real data (the obvious next work)

| Stub (`src/App.tsx`) | Replace with |
| --- | --- |
| `PLATFORM_PEOPLE` | real platform → people mapping |
| `OOO` / `HOLIDAYS` | shared **Google Calendar** (team OOO + Polish holidays) |
| `VELOCITY_SHEET_URL` | the real velocity **Google Sheet** link |
| `START_DATE` / blocks | real cadence start if it must not be "this Monday" |
| "Send to Jira as comment" (`onSend`) | real **Jira API** call posting to the epic |

User-stated preferences for the data sources:
- Velocity: **link out** to the Google Sheet; do **not** copy sheet contents in.
- OOO + Polish holidays: both come from **one shared Google Calendar**.
- Remaining SP: manual input (for now).
- Platform mapping is known by people; "Platform" select drives which people's
  OOO is shown.

---

## 7. Improvement backlog (not prioritized — confirm with user)

Functional:
- Live data: Google Calendar (OOO/holidays) + velocity Sheet integration.
- Jira: real "post comment to epic" (and read `remaining SP` / epic metadata).
  - **Org rule:** any Jira ticket / GitLab MR created must carry labels
    `ai-assisted` and `ai-cursor`. (Posting a comment is not a ticket/MR, but keep
    this in mind if scope grows to creating issues.)
- Multi-person staggered capacity (e.g. 1 dev now, a 2nd joins in 2 weeks) — was
  discussed; currently the lead expresses this implicitly via per-block SP.
- T0 baseline capture + completion-time reflection (slip vs. baseline, cause tag).
- Editable horizon (`NUM_BLOCKS`) / "add another block" when under-planned.
- Shareable state via URL (so a plan can be sent without relying on localStorage).

UX / quality:
- Dark mode (CSS variables already in place).
- Validation/empty states; clearer warning when horizon is too short.
- Accessibility pass (labels, focus, contrast on calendar bars).
- Tests for the burn-down math (pure functions are easy to unit test; none yet).

### Open questions for the user before building
1. Google Calendar + Sheet access: OAuth in-app, a small backend, or a pre-exported
   JSON the tool fetches? (No backend exists today.)
2. Should "Send to Jira" post directly (needs auth/CORS/proxy) or keep copying a
   formatted comment to clipboard?
3. Is "this Monday" the right cadence anchor, or is there a fixed cadence origin?
4. Do we implement the T0 baseline + reflection loop here, or keep that in Jira?

---

## 8. Conventions / gotchas

- TS is **strict** with `noUnusedLocals`/`noUnusedParameters` — dead code fails
  the build. `npm run build` is the gate.
- `vite.config.ts` `base: "./"` is intentional for Pages/subpath hosting; the app
  has **no client-side routing**, so relative base is safe. Don't change to an
  absolute base unless you add routing and a known path.
- Pushing to `main` triggers the Pages deploy automatically.
- Sample names were genericized to `Dev A…G` specifically because the repo is
  **public**. Do not reintroduce real names into committed sample data.
```

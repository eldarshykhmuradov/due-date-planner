# Due Date Planner

A lightweight decision-support tool for engineering leads. Instead of guessing a
calendar deadline, the lead reads velocity + OOO/holidays and sets the **story
points they expect to burn per 2-week block**. The tool burns down the remaining
SP across the blocks and computes the **projected due date** — landing mid-block,
not snapped to a sprint boundary.

The human keeps the judgment (how much capacity, accounting for OOO); the tool
only does the burn-down arithmetic and surfaces the date.

## How it works

1. **Choose velocity** from your historical data (linked Google Sheet).
2. **Set expected SP per 2-week block**, accounting for OOO shown on the calendar.
3. The tool **burns down the remaining SP** and shows the **due date**.
4. **Send to Jira as comment** — produces a comment summarizing the decision
   (date + per-block capacity plan + reasons).

"Today" is marked on the calendar so the lead knows how much of the current
sprint is already gone and can set a realistic number for the rest of it.

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

## Wiring real data (currently sample)

The calculation logic is real; only the inputs are stubbed in `src/App.tsx`:

| Stub | Replace with |
| --- | --- |
| `PLATFORM_PEOPLE` | your real platform → people mapping |
| `OOO` / `HOLIDAYS` | the shared Google Calendar (OOO + Polish holidays) |
| `VELOCITY_SHEET_URL` | your velocity Google Sheet link |
| start anchor / blocks | your real sprint cadence start |
| "Send to Jira as comment" | a real Jira API call posting the comment to the epic |

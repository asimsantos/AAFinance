# Phase 1 — UX Hotfixes & Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship every Phase 1 item from the approved design spec (`docs/superpowers/specs/2026-07-06-aafinance-improvements-design.md` §10/§14): two trust-trap hotfixes, calendar legend/legibility, mobile Today briefing, mobile add-transaction sheet fixes, the "Plan" rename, and the polish list.

**Architecture:** Pure frontend + one fetch-window tweak. No schema changes, no new dependencies (spec §14: Phase 1 is UI-only; the test harness and Recharts arrive in Phase 2). Edits touch the five existing components plus one new `TodayBriefing.jsx`, `useLedger.js`, `index.html`, and a new `public/favicon.svg`.

**Tech Stack:** React 18, Tailwind (inline utility classes), dayjs, Vite dev server (`npm run dev` → Express :3001 + Vite :5173, `/api` proxied).

## Global Constraints

- **No schema changes** and **no new npm dependencies** in Phase 1 (spec §14).
- **No automated test harness yet** — spec §14 schedules Vitest bootstrap for Phase 2.1. Every task ends with a manual browser verification step instead (app at `http://localhost:5173`, desktop 1440px and mobile 390px).
- Match existing code idiom: inline Tailwind classes, `text-[Npx]` sizing, hex colors from the existing palette, 2-space indent, no semicolons where the file omits them.
- Copy strings exactly as specified: right-panel tab and panel header say **"Plan"**; mobile nav container stays **"Manage"**.
- Never commit `node_modules/**` changes (the repo vendors node_modules; `node_modules/.vite/deps/_metadata.json` churns — leave it unstaged).
- Work on branch `feature/phase-1-ux-hotfixes` (created off `feature/improvements-design`).

---

### Task 0: Branch + dev server

**Files:** none (setup)

- [ ] **Step 1: Create the working branch**

```bash
cd ~/workspace/claude-code/personal/AAFinance
git checkout -b feature/phase-1-ux-hotfixes
```

- [ ] **Step 2: Start the app in the background**

Run: `npm run dev` (background)
Expected: Express on :3001, Vite on :5173. Open `http://localhost:5173` and confirm the calendar renders with seeded demo data.

---

### Task 1: FundModal — pre-fill today's value (trust-trap hotfix)

The modal pre-fills the **selected day's** projected value (`fund.value`, passed from App) but always saves a snapshot for **today**. Viewing a future day and tapping Save writes that day's projection over today's reconciliation.

**Files:**
- Modify: `src/components/FundModal.jsx:8`

**Interfaces:**
- Consumes: `ledger` prop (already passed); `todayLd = ledger[today] || {}` already exists at line 7.
- Produces: input pre-filled from `todayLd[fund.key]`; empty input when today isn't in the loaded ledger. `fund.value` is no longer read (prop still passed by App — harmless).

- [ ] **Step 1: Change the `val` initializer**

Replace line 8:

```js
const [val,        setVal]        = useState(String(Math.round(fund.value)))
```

with:

```js
const [val,        setVal]        = useState(
  todayLd[fund.key] != null ? String(Math.round(todayLd[fund.key])) : ''
)
```

- [ ] **Step 2: Verify in browser**

Click a **future** day on the calendar, then a fund tile. The modal input must show **today's** value for that fund (compare against the Today tile / today's cell), not the future day's projection. Copy under the title already says "Saves a snapshot for today (…)".

- [ ] **Step 3: Commit**

```bash
git add src/components/FundModal.jsx
git commit -m "fix: FundModal pre-fills today's value, matching what Save writes"
```

---

### Task 2: FundModal — real reconcile checkbox (trust-trap hotfix)

The unchecked state renders ☑️ — reads as checked. Replace both emoji states with a real drawn checkbox.

**Files:**
- Modify: `src/components/FundModal.jsx:88` (the `<span>` inside the reconcile button)

- [ ] **Step 1: Replace the emoji span**

Replace:

```jsx
<span className="text-base flex-shrink-0">{reconcile ? '✅' : '☑️'}</span>
```

with:

```jsx
<span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 text-[12px] font-bold transition-colors
  ${reconcile ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-transparent'}`}>
  ✓
</span>
```

- [ ] **Step 2: Verify in browser**

Open any fund modal: unchecked = empty white box with grey border; tap → filled teal box with white ✓. No emoji.

- [ ] **Step 3: Commit**

```bash
git add src/components/FundModal.jsx
git commit -m "fix: reconcile toggle renders a real checkbox, unambiguous when off"
```

---

### Task 3: Calendar legend + labeled day balance

Spec §10: compact legend in the calendar header explaining dot colors, plus a single "cash at close" label (not per cell).

**Files:**
- Modify: `src/components/Calendar.jsx` (add `LEGEND` const after `DAYS`, render legend row before the day-of-week headers)

- [ ] **Step 1: Add the legend constant** (after the `DAYS` const, line 4)

```js
const LEGEND = [
  { color: 'bg-emerald-500', label: 'In' },
  { color: 'bg-red-400',     label: 'Out' },
  { color: 'bg-blue-400',    label: 'Transfer' },
  { color: 'bg-violet-400',  label: 'Lend' },
  { color: 'bg-amber-500',   label: 'Auto-cover' },
  { color: 'bg-teal-600',    label: 'Reconciled' },
]
```

- [ ] **Step 2: Render the legend row** — insert directly above the `{/* Day-of-week headers */}` block:

```jsx
{/* Legend */}
<div className="flex items-center gap-x-3 gap-y-1 flex-wrap mb-1.5 px-0.5 flex-shrink-0">
  {LEGEND.map(l => (
    <span key={l.label} className="flex items-center gap-1 text-[9px] font-semibold text-slate-500">
      <span className={`w-[5px] h-[5px] rounded-full ${l.color}`} />{l.label}
    </span>
  ))}
  <span className="ml-auto text-[9px] font-semibold text-slate-500">bottom figure = cash at close</span>
</div>
```

- [ ] **Step 3: Verify in browser**

Desktop: legend row sits above the weekday headers, one line, colors match the day-cell dots. Mobile 390px: legend wraps to two lines, calendar still fits.

- [ ] **Step 4: Commit**

```bash
git add src/components/Calendar.jsx
git commit -m "feat: calendar legend for dot colors + single cash-close label"
```

---

### Task 4: Chip legibility + sign prefix

Spec §10: chips ≥11px, max 2 per cell + "+n more", and a +/− prefix so type survives colorblindness.

**Files:**
- Modify: `src/components/Calendar.jsx:96-114` (Row 2 block)

- [ ] **Step 1: Replace the Row 2 block** with:

```jsx
{/* Row 2: event name labels — hidden on mobile, visible on sm+ */}
<div className="flex-1 hidden sm:flex flex-col gap-[2px] overflow-hidden">
  {(() => {
    const visible = events.filter(e => e.type !== 'autocover' && e.type !== 'autocoverrepay')
    return (
      <>
        {visible.slice(0, 2).map((ev, j) => (
          <div key={j}
            className={`text-[11px] rounded-[3px] px-1 py-[1px] font-semibold truncate leading-tight flex-shrink-0
              ${ev.type === 'income'  ? 'bg-emerald-100 text-emerald-800' :
                ev.type === 'borrow'  ? 'bg-orange-100 text-orange-800' :
                ev.type === 'expense' && ev.amt > 1000 ? 'bg-red-600 text-white' :
                ev.type === 'expense' ? 'bg-red-100 text-red-700' :
                ev.type === 'fund'    ? 'bg-blue-100 text-blue-700' :
                                        'bg-violet-100 text-violet-700'}`}>
            {(ev.type === 'income' || ev.type === 'borrow') ? '+' : '−'} {ev.name}
          </div>
        ))}
        {visible.length > 2 && (
          <span className="text-[9px] text-slate-400 pl-0.5 hidden sm:inline">
            +{visible.length - 2} more
          </span>
        )}
      </>
    )
  })()}
</div>
```

- [ ] **Step 2: Verify in browser**

Desktop: chips readable at 11px, income chips start with `+`, expense/transfer/lend with `−`, busy days show 2 chips + "+n more". No cell overflows its box.

- [ ] **Step 3: Commit**

```bash
git add src/components/Calendar.jsx
git commit -m "feat: 11px calendar chips with +/- prefix, max 2 per cell"
```

---

### Task 5: "Fund Management" → "Plan" rename

**Files:**
- Modify: `src/App.jsx:450` (right-panel tab label)
- Modify: `src/components/SettingsPanel.jsx:478` (panel header)

- [ ] **Step 1: App.jsx** — in the right-panel tab array change:

```js
{ key: 'rules', label: 'Fund Management' },
```

to:

```js
{ key: 'rules', label: 'Plan' },
```

- [ ] **Step 2: SettingsPanel.jsx** — change the header:

```jsx
<p className="font-bold text-slate-800 text-sm">Fund Management</p>
```

to:

```jsx
<p className="font-bold text-slate-800 text-sm">Plan</p>
```

- [ ] **Step 3: Verify in browser**

Desktop right panel: tabs read "Day detail" / "Plan"; opening Plan shows header "Plan". Mobile: bottom nav still reads "Manage".

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/SettingsPanel.jsx
git commit -m "feat: rename Fund Management panel to Plan"
```

---

### Task 6: Polish batch — (Sam) suffix, zero-balance sort, context-label transition, favicon

**Files:**
- Modify: `src/components/SettingsPanel.jsx:43` (RuleRow person suffix)
- Modify: `src/App.jsx` (FundCards + drawer fund grid ordering; FundCards context label)
- Create: `public/favicon.svg`
- Modify: `index.html` (favicon link)

- [ ] **Step 1: Suppress duplicate person suffix** — in `RuleRow` (SettingsPanel.jsx) change:

```jsx
{rule.person && <span className="text-[10px] text-slate-400 ml-1">({rule.person})</span>}
```

to:

```jsx
{rule.person && !rule.name.includes(rule.person) && <span className="text-[10px] text-slate-400 ml-1">({rule.person})</span>}
```

(Seed rules have `name='Salary (Sam)'` **and** `person='Sam'`, rendering "(Sam) (Sam)".)

- [ ] **Step 2: Zero-balance funds sort last** — in `App.jsx`, add directly above the `FundCards` component definition:

```js
// Cash first, then funded funds in declared order, zero-balance funds last
const orderedFunds = dayData => [
  ...FUNDS.filter(f => f.key === 'cash'),
  ...FUNDS.filter(f => f.key !== 'cash' && Math.round(dayData[f.key] ?? 0) !== 0),
  ...FUNDS.filter(f => f.key !== 'cash' && Math.round(dayData[f.key] ?? 0) === 0),
]
```

Then in `FundCards` change `{FUNDS.map(f => {` to `{orderedFunds(dayData).map(f => {`, and in the drawer's fund grid change `{FUNDS.map(f => {` to `{orderedFunds(selData).map(f => {`.

- [ ] **Step 3: Bolder context-label transition** — in `FundCards`, change the label `<p>`:

```jsx
<p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-0.5 select-none">
```

to:

```jsx
<p className={`text-[9px] font-bold uppercase tracking-widest pb-0.5 select-none transition-colors duration-300
  ${dateStr === todayStr ? 'text-slate-400' : 'text-amber-600'}`}>
```

- [ ] **Step 4: Favicon** — create `public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#064E3B"/><text x="16" y="21.5" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" fill="#A7F3D0" text-anchor="middle">A&amp;A</text></svg>
```

and in `index.html` add inside `<head>` after the viewport meta:

```html
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

- [ ] **Step 5: Verify in browser**

Plan → Income tab: "Salary (Sam)" shows one suffix only. Left rail: zero-balance funds render below funded ones, cash always on top. Click a non-today day: the small caps label flips slate→amber with a smooth transition. Browser tab shows the green A&A icon; no favicon 404 in the network log.

- [ ] **Step 6: Commit**

```bash
git add src/components/SettingsPanel.jsx src/App.jsx public/favicon.svg index.html
git commit -m "polish: dedupe person suffix, zero-balance fund sort, context-label transition, favicon"
```

---

### Task 7: Mobile drawer — remove duplicate date header

The drawer header (App.jsx) and SidePanel both print the date. Hide SidePanel's date line when rendered inside the sheet; badges and day summary stay.

**Files:**
- Modify: `src/components/SidePanel.jsx` (new `isSheet` prop; conditional date line)
- Modify: `src/App.jsx` (drawer's `<SidePanel …>` gets `isSheet`)

**Interfaces:**
- Produces: `SidePanel({ dateStr, ledger, onUpdate, isSheet = false, onFormOpenChange })` — `isSheet` also gates Task 8's sheet-only behavior; `onFormOpenChange` is added in Task 8.

- [ ] **Step 1: Add the prop** — change the SidePanel signature:

```js
export default function SidePanel({ dateStr, ledger, onUpdate }) {
```

to:

```js
export default function SidePanel({ dateStr, ledger, onUpdate, isSheet = false }) {
```

- [ ] **Step 2: Make the date line conditional** — change:

```jsx
<p className="font-bold text-slate-800 text-sm leading-tight">{d.format('dddd, D MMMM YYYY')}</p>
```

to:

```jsx
{!isSheet && <p className="font-bold text-slate-800 text-sm leading-tight">{d.format('dddd, D MMMM YYYY')}</p>}
```

- [ ] **Step 3: Pass the prop from the drawer** — in App.jsx the drawer instance (inside the drawer panel, ~line 414) becomes:

```jsx
<SidePanel
  dateStr={selectedDay}
  ledger={ledger}
  lends={lends}
  isSheet
  onUpdate={() => { setDrawerOpen(false); refresh() }} />
```

(Desktop instance unchanged.)

- [ ] **Step 4: Verify in browser**

Mobile 390px → Calendar → tap a day: sheet shows the date once (drawer header only), badges and Open/In/Out/Close box still present. Desktop day panel unchanged (date still shown).

- [ ] **Step 5: Commit**

```bash
git add src/components/SidePanel.jsx src/App.jsx
git commit -m "fix: single date header in mobile day sheet"
```

---

### Task 8: Mobile add-transaction sheet — collapse, pinned save, quick-add

Spec §10: when the form opens in the sheet, the fund chips grid and day summary collapse and the action bar pins to the sheet bottom; a one-line quick-add (amount + name; defaults Out / selected day) covers the common case.

**Files:**
- Modify: `src/components/SidePanel.jsx` (form-open signal, day-summary collapse, sticky action bar, `QuickAdd` component)
- Modify: `src/App.jsx` (collapse the drawer fund grid while the form is open)

**Interfaces:**
- Consumes: `isSheet` prop from Task 7.
- Produces: `onFormOpenChange(open: boolean)` optional callback prop on SidePanel, fired whenever the add/edit form opens or closes. App stores it in `sheetFormOpen` state.

- [ ] **Step 1: Import useEffect** — SidePanel.jsx line 1:

```js
import React, { useState, useEffect } from 'react'
```

- [ ] **Step 2: Signal form-open state** — extend the signature and add the effect at the top of `SidePanel` (before the `if (!dateStr)` return):

```js
export default function SidePanel({ dateStr, ledger, onUpdate, isSheet = false, onFormOpenChange }) {
  const [adding,    setAdding]    = useState(false)
  const [editEvent, setEditEvent] = useState(null)

  const formOpen = adding || !!editEvent
  useEffect(() => { onFormOpenChange?.(formOpen) }, [formOpen])
```

- [ ] **Step 3: Collapse the day summary in the sheet while the form is open** — change:

```jsx
{hasData && (
```

to:

```jsx
{hasData && !(isSheet && formOpen) && (
```

- [ ] **Step 4: Pin the TxForm action bar** — in `TxForm`, change the button row:

```jsx
<div className="flex gap-2 pt-0.5">
```

to:

```jsx
<div className="flex gap-2 pt-2 sticky bottom-0 bg-slate-50 pb-1">
```

(The form's `bg-slate-50` container plus this background keeps content from showing through as it scrolls beneath; sticky works against SidePanel's `overflow-y-auto` content div.)

- [ ] **Step 5: Add the QuickAdd component** — insert above `// ── Main side panel ──` :

```jsx
// ── One-line quick add: amount + name, defaults Out / selected day ─
function QuickAdd({ dateStr, onSaved }) {
  const [amt,    setAmt]    = useState('')
  const [name,   setName]   = useState('')
  const [saving, setSaving] = useState(false)

  const add = async () => {
    const a = parseFloat(amt)
    if (!a || !name.trim()) return
    setSaving(true)
    try {
      await api.addTransaction({ type: 'expense', name: name.trim(), amt: a, date: dateStr, fund_target: '' })
      setAmt(''); setName(''); onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div className="flex gap-1.5">
      <input className={`${inp} w-24 flex-shrink-0`} type="number" inputMode="decimal" placeholder="$"
        value={amt} onChange={e => setAmt(e.target.value)} />
      <input className={inp} placeholder="Quick add (Out)" value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add() }} />
      <button onClick={add} disabled={saving || !parseFloat(amt) || !name.trim()}
        className="px-3 rounded-lg text-xs font-bold text-white disabled:opacity-40 flex-shrink-0"
        style={{ background: '#DC2626' }}>
        Add
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Render QuickAdd in the sheet** — directly above the `{/* Add transaction button */}` block's button, insert:

```jsx
{isSheet && !adding && !editEvent && (
  <QuickAdd dateStr={dateStr} onSaved={handleSaved} />
)}
```

- [ ] **Step 7: Collapse the drawer fund grid** — in App.jsx add state next to `drawerOpen`:

```js
const [sheetFormOpen, setSheetFormOpen] = useState(false)
```

Wrap the drawer's fund-grid section (the `{/* ── Fund balances: 3-column grid ── */}` div) in a conditional:

```jsx
{!sheetFormOpen && (
  <div className="flex-shrink-0 border-b border-slate-100 px-3 py-2.5">
    …existing grid content unchanged…
  </div>
)}
```

and pass the callback on the drawer's SidePanel:

```jsx
<SidePanel
  dateStr={selectedDay}
  ledger={ledger}
  lends={lends}
  isSheet
  onFormOpenChange={setSheetFormOpen}
  onUpdate={() => { setDrawerOpen(false); refresh() }} />
```

- [ ] **Step 8: Verify in browser**

Mobile 390px → Calendar → tap a day: quick-add row visible above "+ Add transaction". Type 12 / "coffee" → Add: sheet closes, calendar shows the new expense on that day (delete it afterwards via the day sheet). Tap "+ Add transaction": fund grid and day-summary box collapse, Save/Cancel pinned at the sheet bottom while scrolling the form. Desktop day panel: no quick-add row, form behaves as before.

- [ ] **Step 9: Commit**

```bash
git add src/components/SidePanel.jsx src/App.jsx
git commit -m "feat: mobile sheet quick-add, pinned save bar, collapse chrome while form open"
```

---

### Task 9: Ledger window always covers today + 7 days

`useLedger` fetches 3 months back through the viewed month's end. The Today briefing (Task 10) needs today+7 regardless of the viewed month.

**Files:**
- Modify: `src/hooks/useLedger.js:11-15`

**Interfaces:**
- Produces: ledger object guaranteed to contain entries for `today … today+7` (and the viewed month), whatever month is displayed.

- [ ] **Step 1: Widen the window** — replace the body of `load` between `setLoading(true)` and `const data =`:

```js
const monthEnd       = dayjs(new Date(year, month + 1, 0))
const horizon        = dayjs().add(7, 'day')
const to             = (horizon.isAfter(monthEnd, 'day') ? horizon : monthEnd).format('YYYY-MM-DD')
// Load from 3 months back so running balance is accurate; never later than today's month
const base           = dayjs(new Date(year, month - 3, 1))
const todayMonth     = dayjs().startOf('month')
const realFrom       = (todayMonth.isBefore(base) ? todayMonth : base).format('YYYY-MM-DD')
const data = await api.getLedger(realFrom, to)
```

(The unused `from` variable is removed.)

- [ ] **Step 2: Verify in browser**

Network tab: `/api/ledger?from=…&to=…` — `to` ≥ today+7 even for the current month; navigate to a future month and back, no errors, balances unchanged for the visible month.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useLedger.js
git commit -m "feat: ledger fetch window always spans today through today+7"
```

---

### Task 10: Mobile Today briefing

Spec §10: today's events and a 7-day upcoming strip render above the fund tiles on the mobile Today tab. This surface later hosts the AI alert chips (Phase 2.4).

**Files:**
- Create: `src/components/TodayBriefing.jsx`
- Modify: `src/App.jsx` (import + render in the Today tab)

**Interfaces:**
- Consumes: `ledger` (day-keyed map with `.events[]` `{type,name,amt}` and `.cash`), `todayStr`, guaranteed today+7 coverage from Task 9.
- Produces: `TodayBriefing({ ledger, todayStr, onDayTap })` — `onDayTap(ds)` fires when an upcoming-day card is tapped.

- [ ] **Step 1: Create `src/components/TodayBriefing.jsx`**

```jsx
import React from 'react'
import dayjs from 'dayjs'

const EVENT_META = {
  income:         { sign: '+', color: 'text-emerald-700', dot: 'bg-emerald-500' },
  borrow:         { sign: '+', color: 'text-orange-700',  dot: 'bg-orange-500' },
  expense:        { sign: '−', color: 'text-red-600',     dot: 'bg-red-400' },
  fund:           { sign: '−', color: 'text-blue-700',    dot: 'bg-blue-400' },
  lend:           { sign: '−', color: 'text-violet-700',  dot: 'bg-violet-400' },
  autocover:      { sign: '−', color: 'text-amber-700',   dot: 'bg-amber-500' },
  autocoverrepay: { sign: '+', color: 'text-teal-700',    dot: 'bg-teal-500' },
  debtpay:        { sign: '−', color: 'text-blue-700',    dot: 'bg-blue-600' },
}

function fmt(n) {
  const abs = Math.abs(Math.round(n))
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-AU')
}

export default function TodayBriefing({ ledger, todayStr, onDayTap }) {
  const todayEvents = (ledger[todayStr]?.events) || []
  const upcoming = Array.from({ length: 7 }, (_, i) => {
    const d  = dayjs(todayStr).add(i + 1, 'day')
    const ds = d.format('YYYY-MM-DD')
    const ld = ledger[ds] || {}
    return { ds, d, events: ld.events || [], cash: ld.cash ?? null }
  })

  return (
    <div className="p-3 pb-0 space-y-3">
      {/* Today's events */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-1 select-none">
          Today · {dayjs(todayStr).format('dddd D MMMM')}
        </p>
        {todayEvents.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic px-0.5">Nothing due today</p>
        ) : (
          <div className="space-y-1">
            {todayEvents.map((ev, i) => {
              const m = EVENT_META[ev.type] || EVENT_META.expense
              return (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-100 bg-white">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.dot}`} />
                  <span className="flex-1 text-[12px] font-semibold text-slate-700 truncate">{ev.name}</span>
                  <span className={`text-[12px] font-bold flex-shrink-0 ${m.color}`}>{m.sign}{fmt(ev.amt)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 7-day upcoming strip */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-1 select-none">Next 7 days</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3">
          {upcoming.map(u => {
            const neg     = u.cash !== null && u.cash < 0
            const visible = u.events.filter(e => e.type !== 'autocover' && e.type !== 'autocoverrepay')
            return (
              <button key={u.ds} onClick={() => onDayTap(u.ds)}
                className={`flex-shrink-0 w-[104px] rounded-xl border px-2 py-1.5 text-left
                  ${neg ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                <p className="text-[9px] font-bold text-slate-500">{u.d.format('ddd D MMM')}</p>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                  {visible.length === 0 ? '—' : visible.length === 1 ? visible[0].name : `${visible.length} events`}
                </p>
                {u.cash !== null && (
                  <p className={`text-[11px] font-extrabold mt-0.5 ${neg ? 'text-red-600' : 'text-slate-700'}`}>{fmt(u.cash)}</p>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-t border-slate-100" />
    </div>
  )
}
```

- [ ] **Step 2: Wire into App** — add the import:

```js
import TodayBriefing from './components/TodayBriefing'
```

and change the mobile Today tab block:

```jsx
{mobileTab === 'today' && (
  <div className="absolute inset-0 overflow-y-auto bg-white">
    <TodayBriefing
      ledger={ledger}
      todayStr={todayStr}
      onDayTap={ds => { setDay(ds); setMobileTab('calendar'); setDrawerOpen(true) }} />
    <LeftPanelContent dayData={todayData} dateStr={todayStr} />
  </div>
)}
```

- [ ] **Step 3: Verify in browser**

Mobile 390px → Today tab: today's events listed (or "Nothing due today"), horizontally scrollable 7-day strip with per-day cash close, fund tiles below. Tapping an upcoming card jumps to the calendar tab with that day's sheet open. Cards past the current month's end still show data (Task 9). Desktop layout untouched.

- [ ] **Step 4: Commit**

```bash
git add src/components/TodayBriefing.jsx src/App.jsx
git commit -m "feat: mobile Today briefing — today's events + 7-day upcoming strip"
```

---

### Task 11: Full-pass verification

**Files:** none

- [ ] **Step 1: Desktop pass (1440px)** — legend, 11px signed chips, Plan tab/header, fund modal pre-fill from a future day, reconcile checkbox states, zero-balance fund ordering, amber context label on day select, favicon loads.

- [ ] **Step 2: Mobile pass (390px)** — Today briefing renders and navigates; day sheet has single date header; quick-add works end-to-end (then delete the test transaction); full form collapses chrome and pins Save; all three tabs swipe correctly.

- [ ] **Step 3: Console/network check** — no errors in the console, no 404s (favicon fixed), `/api/ledger` window spans today+7.

- [ ] **Step 4: Update the brain** — vault note `projects/aafinance-improvements.md`: status → Phase 1 implemented on `feature/phase-1-ux-hotfixes`, list commits, note pending decisions (publish route; Phase 2.1 next).

# AAFinance Improvements — Design

**Date:** 2026-07-06
**Status:** Approved pending final review
**Scope:** Feature definition for the next generation of AAFinance: configurable funds, source-tagged view layers, multi-format bank import, pluggable AI (predictions + insights), FY dashboard, and trust/reconciliation surfacing.

## 1. Goals

AAFinance today is a calendar-centric cashflow projector: recurring rules + one-off transactions produce day-by-day projected balances across cash and four hardcoded funds, with snapshots for reconciliation and auto-cover when cash goes negative.

Pain points this design addresses:

- **Data entry friction** — no bank import; everything typed by hand
- **Forecast trust** — hard to tell actual from planned; drift goes unnoticed
- **Insight** — no answers to "where does money go?" or "are we on track this FY?"
- **Rigidity** — fund names, colors, and auto-cover priority are hardcoded

Audience is a single household. No multi-user, no auth, no hosting changes. Local-first stays.

## 2. Architecture: source-tagged unified ledger

Chosen over independent overlay stores and an event-sourced rewrite.

Every transaction carries a `source` tag: `manual` | `import` | `ai`. One transactions store, one ledger engine. A **view layer** is simply the set of sources the engine includes when computing balances:

```
GET /api/ledger?from=…&to=…&sources=manual,import,ai
```

Toggling a layer re-runs the projection with that source included or excluded. Recurring rules always belong to the manual (plan) layer. Imported rows and AI-predicted rows are ordinary transactions with their tag plus a batch id, flowing through the same engine.

Why unified: every requested feature is cross-layer. Reconciliation compares import against plan; AI learns from imports; the dashboard shows actual vs plan. With one source-tagged store, each of those is a query instead of a subsystem.

### Cross-layer dedup

- When an import row is matched to a rule occurrence, the row stores that `rule_id` + date — the engine's existing override mechanism then suppresses the rule firing for that day. The import wins as the actual.
- When an import row is matched to a manual transaction (`matched_txn_id`), the engine counts the import row and suppresses the manual one while both layers are enabled. UI shows the actual with a "planned $X" note.
- Unmatched import rows stand alone as their own events.
- AI rows are generated only for future dates and only for spending not covered by rules or planned transactions; the engine additionally excludes any `ai` row dated on or before the later of today and the last import-covered day (so stale predictions vanish as reality arrives). They can never double-count or rewrite the past.

## 3. Data model

New tables:

```sql
funds(
  id TEXT PRIMARY KEY, key TEXT UNIQUE, label TEXT, color TEXT,
  sort_order INTEGER, autocover_priority INTEGER,  -- NULL = never auto-drawn
  target REAL,                                     -- NULL = no goal line
  archived INTEGER DEFAULT 0
)

snapshot_balances(
  snapshot_id TEXT, fund_id TEXT, amount REAL,
  PRIMARY KEY (snapshot_id, fund_id)
)

batches(
  id TEXT PRIMARY KEY, type TEXT,          -- 'import' | 'ai'
  filename TEXT, profile_id TEXT,          -- import batches
  provider TEXT, model TEXT, horizon_days INTEGER,  -- ai batches
  created_at TEXT, row_count INTEGER
)

bank_profiles(
  id TEXT PRIMARY KEY, name TEXT,
  config TEXT   -- JSON: delimiter, header_row, date_format, sign_convention,
                --       column map {date, amount, debit, credit, description}
)

categories(id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER)

category_overrides(pattern TEXT PRIMARY KEY, category_id TEXT)  -- learned corrections

app_settings(key TEXT PRIMARY KEY, value TEXT)  -- ai provider, model, ollama url, enabled layers default
```

`transactions` gains:

```sql
source TEXT DEFAULT 'manual',      -- manual | import | ai
category_id TEXT DEFAULT '',
batch_id TEXT DEFAULT '',
raw_desc TEXT DEFAULT '',          -- original bank description
row_hash TEXT DEFAULT '',          -- dedup key: hash(date|amount|normalized desc)
matched_txn_id TEXT DEFAULT '',
match_status TEXT DEFAULT ''       -- '' | auto | confirmed | review | standalone
```

(`rule_id` already exists and doubles as the rule-match link for import rows.)

`snapshots` slims to `id, date, cash, cash_set, cash_pinned, reconciled` — per-fund amounts move to `snapshot_balances`. A snapshot anchors cash iff `cash_set`, and anchors exactly the funds that have balance rows. A snapshot covering cash plus every active fund is "full" and resets auto-cover debt, preserving current semantics.

### Migration

One idempotent migration script, run automatically at server start:

1. Copy `data/finance.db` → `data/backups/finance-<timestamp>.db` before any change.
2. Seed `funds` from the four hardcoded funds (car, emergency, debt, home) with current colors and auto-cover priority (emergency → debt → home → car).
3. Explode existing snapshot fund columns into `snapshot_balances`; translate `partial_funds` into row presence and `cash_set`.
4. Default `source='manual'` on all existing transactions.
5. Seed default categories (groceries, transport, dining, utilities, subscriptions, health, entertainment, other).

API keys are never stored in the database — the db file gets backed up and moved around. Keys live in `.env` only; `app_settings` stores provider choice, model name, and Ollama URL. The Settings UI shows which keys are detected in the environment.

## 4. Configurable funds

- Manage → **Funds**: add, edit (label, color, optional savings target), archive, drag-to-reorder display order and auto-cover priority.
- Cash is not a fund — it remains the special operating balance with pinning and reconcile semantics.
- Auto-cover draws from funds in `autocover_priority` order (repayment in reverse order, as today). A fund with NULL priority is never auto-drawn.
- Archiving hides a fund from tiles and forms; history and past ledger math are unaffected. Deleting is only allowed for funds never referenced.
- Fund tiles, FundModal, rule/transaction fund pickers all render from the `funds` table instead of hardcoded arrays.

## 5. View layers (UI)

- Three pill toggles in the calendar header: **Manual ✓ · Imports ✓ · AI ✓**, persisted per-device in localStorage.
- Visual identity: manual events solid (as today); import events carry a small badge and solid "actual" styling; AI events render ghosted/dashed — a guess should look like one.
- Toggling refetches the ledger with the new `sources` set; balances, month totals, and fund tiles all reflect exactly the enabled layers.
- Day detail panel groups events by layer with the same styling.

## 6. Bank import

Manage → **Import**. Pipeline: **sniff → map → preview → dedup → match → commit**.

1. **Sniff** — detect encoding, delimiter, header row. OFX and QIF parse directly; CSV proceeds to mapping.
2. **Map** — try saved `bank_profiles` first (header signature match). No match: if an AI provider is configured, send the header + first 20 rows, receive a proposed mapping; the user confirms/adjusts in the mapping UI. No provider: manual mapping UI. Confirmed mappings save as a new profile — later exports from that bank import in one click.
3. **Preview** — parsed rows in a table before anything is written; per-row include/exclude; parse failures shown per-row with reasons, never silently dropped.
4. **Dedup** — `row_hash` = hash(date | amount | normalized description). Rows whose hash already exists are skipped and reported. Re-exporting overlapping date ranges is safe.
5. **Match** — each surviving row is scored against rule occurrences and manual transactions. **Auto-match** (`match_status='auto'`): amount within ±1% and date within ±1 day of exactly one candidate. **Review queue**: amount within ±5% and date within ±3 days, or multiple candidates ("Is this your **Rent** rule? [Yes] [No, keep separate]"). **No candidate** → `standalone`. Ties never auto-match.
6. **Commit** — an atomic write: batch row + transaction rows (`source='import'`, `batch_id`, `raw_desc`, `row_hash`). Post-commit summary: *42 rows — 31 matched to plan, 8 new, 3 need review.*

Batches are listed in Manage with date, bank, and counts. Deleting a batch removes its transactions and their match effects — full undo.

## 7. AI: pluggable providers + four capabilities

### Provider abstraction

`server/ai/` exposes a single interface:

```js
completeJSON(task, payload) -> Promise<object>   // task: mapping | categorise | suggest_rules | forecast | narrate
```

Adapters: **claude**, **openai**, **gemini**, **ollama**. Provider/model chosen in Settings; keys from `.env` (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OLLAMA_URL`). Each call has a timeout and one retry; on failure the caller degrades gracefully (below). All prompts request strict JSON and responses are schema-validated before use — a malformed response is treated as a failure, never written to the db.

**Heuristics fallback** when no provider is configured or a call fails: recurrence detection by amount/date statistics, categorisation via keyword map + learned `category_overrides`. NL insights and AI mapping assist hide when unavailable.

**Privacy:** only the minimum rows/aggregates needed per task are sent; Ollama keeps everything on-machine.

### Capability 1 — Categorisation

Imported rows are auto-categorised at commit. User corrections write a `category_overrides` pattern that wins over the model on future imports. Manual transactions can be categorised too (optional field). Categories power dashboard breakdowns.

### Capability 2 — Rule suggestions

After each import, recurring patterns with no matching rule surface as suggestions: *"Netflix $22.99 monthly on the 14th — add as rule?"* Accept creates the rule and back-matches its history; dismiss is remembered (per pattern) and not re-asked.

### Capability 3 — Forecast layer

On demand ("Refresh predictions"): the provider receives category-level history aggregates and existing rule coverage, and returns predicted transactions for the next 90 days covering *variable* spending not already represented by rules — groceries drift, irregular fuel, annual-ish costs. Written as `source='ai'` rows in a single batch; each refresh atomically replaces the previous AI batch. Rendered ghosted on the calendar; excluded from balances the instant the AI layer is off.

### Capability 4 — Insights & alerts

The server computes **deterministic facts first**: cash-below-zero dates (from the engine), category month-over-month deltas, rule-vs-actual drift, fund trajectories vs targets, upcoming large one-offs. The AI only narrates these facts and answers ad-hoc questions ("can we afford a $3k trip in October?" — answered by running the engine with a hypothetical transaction, then narrating the result). Alerts render as chips on the dashboard and calendar: *"⚠ Cash dips −$340 on Aug 14."* Numbers always come from the engine, never from the model.

## 8. FY dashboard

New top-level view — third desktop tab, fourth mobile tab. Defaults to Australian financial year (1 July – 30 June); selector for FY / calendar year / custom range.

Widgets (all fed by a server-side aggregates endpoint over the same engine + categories):

- **Income vs spend vs transfers** by month — bars across the FY
- **Category breakdown** — actuals by category, month drill-down
- **Fund balances over time** — line per fund, goal lines where a fund has a target
- **Net position trend** — cash + funds − outstanding borrows
- **Plan vs actual variance** — rule-projected vs import-backed, by month and category
- **Lends/debts outstanding** and the alerts strip

Charting: **Recharts** — the only new frontend dependency in this design.

## 9. Trust surfacing

1. **Actuals marker** — calendar days fully backed by imports render solid; unbacked/future days render as projection styling. A "reconciled through *date*" indicator marks where reality ends and forecast begins.
2. **Drift detection** — when a rule's matched actuals consistently differ (*"Rent rule is $480, actuals average $495 — update rule?"*), one-tap rule update.
3. **Snapshot demotion** — imports become the primary reconciliation mechanism; manual snapshots remain for fund balances no bank export covers.

## 10. API surface (delta)

```
GET    /api/ledger?from&to&sources=manual,import,ai
CRUD   /api/funds
CRUD   /api/categories
GET    /api/batches            DELETE /api/batches/:id
POST   /api/import/preview     (multipart file → sniffed + mapped preview)
POST   /api/import/commit      (mapping + included rows → batch)
CRUD   /api/import/profiles
POST   /api/match/:txnId       (confirm | reject | rematch)
POST   /api/ai/forecast        (refresh AI batch)
GET    /api/insights           POST /api/insights/ask
GET    /api/dashboard?from&to  (aggregates for all widgets)
GET/PUT /api/settings          (provider config, defaults)
```

## 11. Error handling

- **Import:** per-row parse errors surfaced in preview with reasons; commit is all-or-nothing per batch; batch delete = clean undo.
- **AI:** timeouts/malformed responses degrade to heuristics or hide the feature; a failed forecast refresh leaves the previous AI batch untouched; provider errors surface as a toast, never a broken screen.
- **Migration:** automatic timestamped backup before running; each step idempotent; failure aborts startup with the backup path printed.
- **Engine:** unknown `sources` values rejected with 400; empty `sources` returns rules-off, transactions-off empty projection rather than erroring.

## 12. Testing

The repo currently has no tests. This design introduces **Vitest** with:

- **Engine unit tests** — source filtering, cross-layer dedup (import-over-rule, import-over-manual), configurable auto-cover priority order and repayment, snapshot anchoring via `snapshot_balances`.
- **Parser fixture tests** — real-shape CSV fixtures for the household's banks plus OFX/QIF samples; sign conventions; dedup hashing.
- **Matcher tests** — confidence tiers, ±5% amount / ±3-day window, review-queue boundaries.
- **Migration test** — run against a copy of a seeded pre-migration db; assert lossless conversion.
- **API integration** — supertest over the Express app with a throwaway in-memory db.
- AI adapters tested against recorded JSON responses; schema validation rejects malformed payloads.

## 13. Rollout phases

Each phase independently shippable, in order:

1. **Configurable funds** + schema migration + test harness bootstrap
2. **Source tags + layer toggles** (engine `sources` support, UI pills)
3. **Import pipeline** — sniff/map/preview/dedup/match/commit + trust surfacing
4. **AI** — provider abstraction, categorisation, rule suggestions, forecast layer, insights & alerts
5. **FY dashboard**

Out of scope (explicitly): multi-user/auth, hosting/Supabase migration, budgets/envelopes beyond existing funds, mobile apps, bank API connections (import is file-based only).

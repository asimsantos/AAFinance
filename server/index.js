import express from 'express'
import cors from 'cors'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../data')
const DB_PATH  = join(DATA_DIR, 'finance.db')

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

// ── SQL.JS SETUP (pure JS, no compilation needed) ───────────────
const initSqlJs = require('sql.js')
const SQL = await initSqlJs()

let db
if (existsSync(DB_PATH)) {
  db = new SQL.Database(readFileSync(DB_PATH))
} else {
  db = new SQL.Database()
}

function persist() {
  writeFileSync(DB_PATH, Buffer.from(db.export()))
}

function run(sql, params = []) {
  db.run(sql, params)
  persist()
}

function all(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function get(sql, params = []) {
  return all(sql, params)[0] || null
}

// ── SCHEMA ──────────────────────────────────────────────────────
db.run(`
  CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    amt REAL NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT DEFAULT '',
    recur TEXT NOT NULL DEFAULT 'once',
    fund_target TEXT DEFAULT '',
    person TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    amt REAL NOT NULL,
    date TEXT NOT NULL,
    rule_id TEXT DEFAULT '',
    skip INTEGER DEFAULT 0,
    fund_target TEXT DEFAULT '',
    return_date TEXT DEFAULT '',
    note TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    cash REAL DEFAULT 0,
    car REAL DEFAULT 0,
    emergency REAL DEFAULT 0,
    debt REAL DEFAULT 0,
    home REAL DEFAULT 0,
    cash_pinned INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS lends (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    amt REAL NOT NULL,
    given_date TEXT NOT NULL,
    return_date TEXT DEFAULT '',
    note TEXT DEFAULT '',
    returned INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    amt REAL NOT NULL,
    borrowed_date TEXT NOT NULL,
    due_date TEXT DEFAULT '',
    note TEXT DEFAULT '',
    repaid INTEGER DEFAULT 0,
    paid_amt REAL DEFAULT 0
  );
`)

// ── MIGRATIONS ──────────────────────────────────────────────────
try { db.run("ALTER TABLE snapshots ADD COLUMN cash_pinned INTEGER DEFAULT 0") } catch(e) {}
try { db.run("ALTER TABLE snapshots ADD COLUMN partial_funds TEXT DEFAULT ''") } catch(e) {}
try { db.run("ALTER TABLE snapshots ADD COLUMN reconciled INTEGER DEFAULT 0") } catch(e) {}
try { db.run("ALTER TABLE debts ADD COLUMN paid_amt REAL DEFAULT 0") } catch(e) {}

// ── SEED (demo data — not real personal information) ─────────────
const existing = get('SELECT COUNT(*) as c FROM rules')
if (!existing || existing.c === 0) {
  const ruleStmt = `INSERT INTO rules(id,type,name,amt,start_date,end_date,recur,fund_target,person) VALUES(?,?,?,?,?,?,?,?,?)`
  const rules = [
    // Income
    ['r1', 'income',  'Salary (Alex)',          4500, '2026-07-15', '',           'monthly',     '', 'Alex'],
    ['r2', 'income',  'Salary (Sam)',            1100, '2026-07-07', '',           'fortnightly', '', 'Sam'],
    ['r3', 'income',  'Freelance (Sam)',          400, '2026-07-14', '',           'fortnightly', '', 'Sam'],
    // Expenses
    ['r4', 'expense', 'Rent',                    480, '2026-07-05', '',           'weekly',      '', ''],
    ['r5', 'expense', 'Groceries',               200, '2026-07-05', '',           'weekly',      '', ''],
    ['r6', 'expense', 'Transport',                90, '2026-07-07', '',           'weekly',      '', ''],
    ['r7', 'expense', 'Dining out',               70, '2026-07-05', '',           'weekly',      '', ''],
    ['r8', 'expense', 'Personal spending',       130, '2026-07-07', '',           'weekly',      '', ''],
    ['r9', 'expense', 'Phone & subscriptions',   120, '2026-07-10', '',           'monthly',     '', ''],
    ['r10','expense', 'Clothing & household',    250, '2026-07-10', '',           'monthly',     '', ''],
    // Fund transfers
    ['r11','fund',    'Debt repayment',          1000, '2026-07-20', '',           'monthly', 'debt',      ''],
    ['r12','fund',    'Car savings',              600, '2026-07-20', '',           'monthly', 'car',       ''],
    ['r13','fund',    'Tuition reserve',          500, '2026-07-20', '',           'monthly', 'home',      ''],
    ['r14','fund',    'Emergency top-up',         250, '2026-07-20', '',           'monthly', 'emergency', ''],
  ]
  rules.forEach(r => db.run(ruleStmt, r))

  // Starting balances as of end of June
  db.run(`INSERT INTO snapshots(id,date,cash,car,emergency,debt,home) VALUES(?,?,?,?,?,?,?)`,
    ['s1', '2026-06-30', 1200, 2800, 1500, 6400, 0])

  // Outstanding lend
  db.run(`INSERT INTO lends(id,name,amt,given_date,return_date) VALUES(?,?,?,?,?)`,
    ['l1', 'Jordan', 600, '2026-07-01', '2026-09-01'])

  // Outstanding debt (borrowed)
  db.run(`INSERT INTO debts(id,name,amt,borrowed_date,due_date,note) VALUES(?,?,?,?,?,?)`,
    ['d1', 'Parent loan', 2000, '2026-05-01', '2026-12-01', ''])
  // Matching borrow transaction so the ledger reflects the debt
  db.run(`INSERT INTO transactions(id,type,name,amt,date) VALUES(?,?,?,?,?)`,
    ['t0', 'borrow', 'Parent loan', 2000, '2026-05-01'])

  // Planned one-off transactions
  db.run(`INSERT INTO transactions(id,type,name,amt,date) VALUES(?,?,?,?,?)`,
    ['t1', 'income',  'Tax refund',           2800, '2026-08-20'])
  db.run(`INSERT INTO transactions(id,type,name,amt,date) VALUES(?,?,?,?,?)`,
    ['t2', 'expense', 'Annual insurance',      950, '2026-09-10'])
  db.run(`INSERT INTO transactions(id,type,name,amt,date) VALUES(?,?,?,?,?)`,
    ['t3', 'expense', 'Car registration',      720, '2026-10-15'])
  db.run(`INSERT INTO transactions(id,type,name,amt,date) VALUES(?,?,?,?,?)`,
    ['t4', 'expense', 'Tuition – Semester 1', 5500, '2026-09-20'])
  db.run(`INSERT INTO transactions(id,type,name,amt,date) VALUES(?,?,?,?,?)`,
    ['t5', 'expense', 'Tuition – Semester 2', 5500, '2027-02-20'])

  persist()
  console.log('✅ Database seeded with demo data')
}

// ── HELPERS ─────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2,10) }

// ── LEDGER ENGINE ───────────────────────────────────────────────
function computeLedger(from, to) {
  const rules   = all('SELECT * FROM rules')
  const allTxns = all('SELECT * FROM transactions')
  const snaps   = all('SELECT * FROM snapshots ORDER BY date')

  const baseSnap = snaps.filter(s => s.date <= from).sort((a,b) => b.date.localeCompare(a.date))[0]
    || { cash:0, car:0, emergency:0, debt:0, home:0 }

  // Determine the earliest date we must loop from so no events are ever dropped
  // between the last known balance and the requested period.
  //
  // Case A — a snapshot exists before 'from': start the loop from that snapshot
  //   date so every rule firing and transaction between snapshot→from is applied
  //   (e.g. debt payments made in months that fall outside the 3-month lookback).
  //
  // Case B — no prior snapshot: anchor to the first in-range snapshot to avoid
  //   balance values jumping from zero when the snapshot appears mid-loop.
  let loopFrom = from
  if (baseSnap.date) {
    loopFrom = baseSnap.date
  } else {
    const firstInRange = snaps.filter(s => s.date >= from && s.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date))[0]
    if (firstInRange) loopFrom = firstInRange.date
  }

  // Fetch transactions for the full computation window (loopFrom → to)
  const txns = all('SELECT * FROM transactions WHERE date>=? AND date<=?', [loopFrom, to])
  // Debts with due dates that are still outstanding — used to auto-generate repayment events
  const debtsWithDueDate = all("SELECT * FROM debts WHERE due_date != '' AND repaid = 0")

  const overrides = new Set(allTxns.filter(t => t.rule_id && !t.skip).map(t => `${t.rule_id}_${t.date}`))
  const skips     = new Set(allTxns.filter(t => t.skip).map(t => `${t.rule_id}_${t.date}`))

  function ruleFiresOn(rule, dateStr) {
    if (dateStr < rule.start_date) return false
    if (rule.end_date && dateStr > rule.end_date) return false
    const start  = new Date(rule.start_date + 'T12:00:00')
    const target = new Date(dateStr + 'T12:00:00')
    const diff   = Math.round((target - start) / 86400000)
    if (diff < 0) return false
    switch (rule.recur) {
      case 'once':        return dateStr === rule.start_date
      case 'daily':       return true
      case 'weekly':      return diff % 7 === 0
      case 'fortnightly': return diff % 14 === 0
      case 'monthly':     return target.getDate() === start.getDate()
      case 'yearly':      return target.getDate() === start.getDate() && target.getMonth() === start.getMonth()
      default:            return false
    }
  }

  let cash = baseSnap.cash, car = baseSnap.car,
      emergency = baseSnap.emergency, debt = baseSnap.debt, home = baseSnap.home

  // Track how much each fund has lent to cash via auto-cover so it can be repaid.
  let autocoverOwed = { emergency: 0, home: 0, car: 0 }

  const ledger = {}
  const d = new Date(loopFrom + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')

  while (d <= end) {
    const ds = d.toISOString().slice(0, 10)

    // Apply snapshot for this exact date.
    // partial_funds: comma-separated list of funds set by this snapshot.
    // An empty partial_funds means all funds are anchored (full snapshot).
    const daySnap = snaps.find(s => s.date === ds)
    if (daySnap) {
      const partial = daySnap.partial_funds ? daySnap.partial_funds.split(',').filter(Boolean) : []
      const full = partial.length === 0
      if (full || partial.includes('cash'))      cash      = daySnap.cash
      if (full || partial.includes('car'))       car       = daySnap.car
      if (full || partial.includes('emergency')) emergency = daySnap.emergency
      if (full || partial.includes('debt'))      debt      = daySnap.debt
      if (full || partial.includes('home'))      home      = daySnap.home
      // A full snapshot represents ground-truth — reset any outstanding auto-cover debt
      if (full) autocoverOwed = { emergency: 0, home: 0, car: 0 }
    }

    const openCash = cash   // cash before today's events

    const events = []

    // One-off transactions for this date
    txns.filter(t => t.date === ds && !t.skip).forEach(t =>
      events.push({ ...t, source: 'tx' })
    )

    // Recurring rules
    rules.forEach(rule => {
      if (skips.has(`${rule.id}_${ds}`)) return
      if (overrides.has(`${rule.id}_${ds}`)) return
      if (ruleFiresOn(rule, ds)) {
        events.push({
          id: `rule_${rule.id}_${ds}`, rule_id: rule.id,
          type: rule.type, name: rule.name, amt: rule.amt,
          date: ds, fund_target: rule.fund_target,
          recur: rule.recur, source: 'rule'
        })
      }
    })

    // Auto-repay borrowed debts on their due date
    debtsWithDueDate.forEach(debtRecord => {
      if (debtRecord.due_date === ds) {
        const remaining = Math.max(0, debtRecord.amt - (debtRecord.paid_amt || 0))
        if (remaining > 0) {
          events.push({
            id: `debtpay_${debtRecord.id}_${ds}`,
            type: 'fund',
            name: `Auto-repay – ${debtRecord.name}`,
            amt: remaining,
            fund_target: 'debt',
            date: ds,
            source: 'autopay'
          })
        }
      }
    })

    // Apply events to balances
    events.forEach(ev => {
      if      (ev.type === 'income')  { cash += ev.amt }
      else if (ev.type === 'expense') { cash -= ev.amt }
      else if (ev.type === 'borrow')  { cash += ev.amt; debt += ev.amt }
      else if (ev.type === 'fund') {
        cash -= ev.amt
        if      (ev.fund_target === 'car')       car += ev.amt
        else if (ev.fund_target === 'emergency') emergency += ev.amt
        else if (ev.fund_target === 'debt')      debt = Math.max(0, debt - ev.amt)
        else if (ev.fund_target === 'home')      home += ev.amt
      }
      else if (ev.type === 'lend') { cash -= ev.amt }
    })

    // If cash is pinned on this snapshot, override any event-computed value
    if (daySnap?.cash_pinned) cash = daySnap.cash

    // Auto-cover: when cash goes negative, draw from reserves in priority order.
    // Each draw is tracked in autocoverOwed so it can be repaid later.
    if (cash < 0 && !daySnap?.cash_pinned) {
      const fromEmergency = Math.min(emergency, -cash)
      if (fromEmergency > 0) {
        emergency -= fromEmergency; cash += fromEmergency
        autocoverOwed.emergency += fromEmergency
        events.push({ id: `ac_em_${ds}`, type: 'autocover', name: 'Emergency fund', amt: fromEmergency, fund_target: 'emergency', date: ds, source: 'autocover' })
      }
      if (cash < 0) {
        const fromHome = Math.min(home, -cash)
        if (fromHome > 0) {
          home -= fromHome; cash += fromHome
          autocoverOwed.home += fromHome
          events.push({ id: `ac_home_${ds}`, type: 'autocover', name: 'Tuition reserve', amt: fromHome, fund_target: 'home', date: ds, source: 'autocover' })
        }
      }
      if (cash < 0) {
        const fromCar = Math.min(car, -cash)
        if (fromCar > 0) {
          car -= fromCar; cash += fromCar
          autocoverOwed.car += fromCar
          events.push({ id: `ac_car_${ds}`, type: 'autocover', name: 'Car fund', amt: fromCar, fund_target: 'car', date: ds, source: 'autocover' })
        }
      }
    }

    // Auto-cover recovery: when cash ends positive, repay borrowed fund amounts
    // in REVERSE draw order (car first, emergency last) so the last-resort fund
    // is restored before the primary buffer, matching the user's expectation that
    // the most recently borrowed reserve is the first to be topped back up.
    if (cash > 0 && !daySnap?.cash_pinned &&
        (autocoverOwed.emergency > 0 || autocoverOwed.home > 0 || autocoverOwed.car > 0)) {
      const repayCar = Math.min(autocoverOwed.car, cash)
      if (repayCar > 0) {
        car += repayCar; cash -= repayCar; autocoverOwed.car -= repayCar
        events.push({ id: `acr_car_${ds}`, type: 'autocoverrepay', name: 'Car fund', amt: repayCar, fund_target: 'car', date: ds, source: 'autocover' })
      }
      if (cash > 0) {
        const repayHome = Math.min(autocoverOwed.home, cash)
        if (repayHome > 0) {
          home += repayHome; cash -= repayHome; autocoverOwed.home -= repayHome
          events.push({ id: `acr_home_${ds}`, type: 'autocoverrepay', name: 'Tuition reserve', amt: repayHome, fund_target: 'home', date: ds, source: 'autocover' })
        }
      }
      if (cash > 0) {
        const repayEm = Math.min(autocoverOwed.emergency, cash)
        if (repayEm > 0) {
          emergency += repayEm; cash -= repayEm; autocoverOwed.emergency -= repayEm
          events.push({ id: `acr_em_${ds}`, type: 'autocoverrepay', name: 'Emergency fund', amt: repayEm, fund_target: 'emergency', date: ds, source: 'autocover' })
        }
      }
    }

    // daySpend: actual money leaving the household (expenses + lends)
    // dayTransfer: money moved into own funds (fund events)
    // borrow is a cash inflow — included in dayIn alongside income
    const dayIn       = events.filter(e => e.type === 'income' || e.type === 'borrow').reduce((s, e) => s + e.amt, 0)
    const daySpend    = events.filter(e => e.type === 'expense' || e.type === 'lend').reduce((s, e) => s + e.amt, 0)
    const dayTransfer = events.filter(e => e.type === 'fund').reduce((s, e) => s + e.amt, 0)

    ledger[ds] = {
      cash, car, emergency, debt, home,
      openCash,
      hasSnapshot:  !!daySnap,
      cash_pinned:  !!(daySnap?.cash_pinned),
      reconciled:   !!(daySnap?.reconciled),
      autocoverOwed: { ...autocoverOwed },
      events,
      dayIn,
      daySpend,
      dayTransfer,
      dayOut: daySpend + dayTransfer,
    }

    d.setDate(d.getDate() + 1)
  }

  return ledger
}

// ── EXPRESS ─────────────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json())

// Ledger
app.get('/api/ledger', (req, res) => {
  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from and to required' })
  res.json(computeLedger(from, to))
})

// Rules
app.get('/api/rules', (_, res) => res.json(all('SELECT * FROM rules ORDER BY start_date')))
app.post('/api/rules', (req, res) => {
  const { type,name,amt,start_date,end_date,recur,fund_target,person } = req.body
  const id = uid()
  run(`INSERT INTO rules(id,type,name,amt,start_date,end_date,recur,fund_target,person) VALUES(?,?,?,?,?,?,?,?,?)`,
    [id,type,name,amt,start_date,end_date||'',recur,fund_target||'',person||''])
  res.json({ id })
})
app.put('/api/rules/:id', (req, res) => {
  const { name,amt,start_date,end_date,recur,fund_target,person } = req.body
  run(`UPDATE rules SET name=?,amt=?,start_date=?,end_date=?,recur=?,fund_target=?,person=? WHERE id=?`,
    [name,amt,start_date,end_date||'',recur,fund_target||'',person||'',req.params.id])
  res.json({ ok: true })
})
app.delete('/api/rules/:id', (req, res) => {
  run('DELETE FROM rules WHERE id=?', [req.params.id])
  res.json({ ok: true })
})

// Transactions
app.get('/api/transactions', (req, res) => {
  const { from, to } = req.query
  let q = 'SELECT * FROM transactions WHERE 1=1', p = []
  if (from) { q += ' AND date>=?'; p.push(from) }
  if (to)   { q += ' AND date<=?'; p.push(to) }
  res.json(all(q + ' ORDER BY date', p))
})
app.post('/api/transactions', (req, res) => {
  const { type,name,amt,date,rule_id,skip,fund_target,return_date,note } = req.body
  const id = uid()
  run(`INSERT INTO transactions(id,type,name,amt,date,rule_id,skip,fund_target,return_date,note) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [id,type,name,amt,date,rule_id||'',skip?1:0,fund_target||'',return_date||'',note||''])
  res.json({ id })
})
app.put('/api/transactions/:id', (req, res) => {
  const { type,name,amt,date,fund_target,return_date,note } = req.body
  run(`UPDATE transactions SET type=?,name=?,amt=?,date=?,fund_target=?,return_date=?,note=? WHERE id=?`,
    [type,name,amt,date,fund_target||'',return_date||'',note||'',req.params.id])
  res.json({ ok: true })
})
app.delete('/api/transactions/:id', (req, res) => {
  run('DELETE FROM transactions WHERE id=?', [req.params.id])
  res.json({ ok: true })
})

// Snapshots
app.get('/api/snapshots', (_, res) => res.json(all('SELECT * FROM snapshots ORDER BY date')))
app.post('/api/snapshots', (req, res) => {
  const { date, cash, car, emergency, debt, home, cash_pinned, fund_key, reconciled } = req.body
  const VALID_FUNDS = ['cash', 'car', 'emergency', 'debt', 'home']
  const existing = get('SELECT * FROM snapshots WHERE date=?', [date])
  const pinned = cash_pinned !== undefined ? (cash_pinned ? 1 : 0) : (existing?.cash_pinned ?? 0)
  const rec = reconciled ? 1 : (existing?.reconciled ?? 0)

  if (fund_key && VALID_FUNDS.includes(fund_key) && !reconciled) {
    // Partial snapshot: only update the specific fund
    if (existing) {
      const partialSet = new Set((existing.partial_funds || '').split(',').filter(Boolean))
      partialSet.add(fund_key)
      const newPartial = [...partialSet].join(',')
      run(`UPDATE snapshots SET ${fund_key}=?,partial_funds=?,cash_pinned=? WHERE date=?`,
        [req.body[fund_key], newPartial, pinned, date])
      res.json({ id: existing.id })
    } else {
      const id = uid()
      run(`INSERT INTO snapshots(id,date,${fund_key},partial_funds,cash_pinned) VALUES(?,?,?,?,?)`,
        [id, date, req.body[fund_key], fund_key, pinned])
      res.json({ id })
    }
  } else {
    // Full snapshot (all funds provided, or reconcile action)
    if (existing) {
      run('UPDATE snapshots SET cash=?,car=?,emergency=?,debt=?,home=?,cash_pinned=?,partial_funds=?,reconciled=? WHERE date=?',
        [cash,car,emergency,debt,home,pinned,'',rec,date])
      res.json({ id: existing.id })
    } else {
      const id = uid()
      run('INSERT INTO snapshots(id,date,cash,car,emergency,debt,home,cash_pinned,partial_funds,reconciled) VALUES(?,?,?,?,?,?,?,?,?,?)',
        [id,date,cash,car,emergency,debt,home,pinned,'',rec])
      res.json({ id })
    }
  }
})

// Debts (money borrowed — parallel to lends)
app.get('/api/debts', (_, res) => res.json(all('SELECT * FROM debts ORDER BY borrowed_date DESC')))
app.post('/api/debts', (req, res) => {
  const { name, amt, borrowed_date, due_date, note } = req.body
  const id = uid()
  run('INSERT INTO debts(id,name,amt,borrowed_date,due_date,note) VALUES(?,?,?,?,?,?)',
    [id, name, amt, borrowed_date, due_date||'', note||''])
  res.json({ id })
})
app.put('/api/debts/:id', (req, res) => {
  const { name, amt, borrowed_date, due_date, note, repaid, paid_amt } = req.body
  run('UPDATE debts SET name=?,amt=?,borrowed_date=?,due_date=?,note=?,repaid=?,paid_amt=? WHERE id=?',
    [name, amt, borrowed_date, due_date||'', note||'', repaid?1:0, paid_amt||0, req.params.id])
  res.json({ ok: true })
})
app.delete('/api/debts/:id', (req, res) => {
  run('DELETE FROM debts WHERE id=?', [req.params.id])
  res.json({ ok: true })
})

// Lends
app.get('/api/lends', (_, res) => res.json(all('SELECT * FROM lends ORDER BY given_date DESC')))
app.post('/api/lends', (req, res) => {
  const { name,amt,given_date,return_date,note } = req.body
  const id = uid()
  run(`INSERT INTO lends(id,name,amt,given_date,return_date,note) VALUES(?,?,?,?,?,?)`,
    [id,name,amt,given_date,return_date||'',note||''])
  res.json({ id })
})
app.put('/api/lends/:id', (req, res) => {
  const { name,amt,given_date,return_date,note,returned } = req.body
  run('UPDATE lends SET name=?,amt=?,given_date=?,return_date=?,note=?,returned=? WHERE id=?',
    [name,amt,given_date,return_date||'',note||'',returned?1:0,req.params.id])
  res.json({ ok: true })
})
app.delete('/api/lends/:id', (req, res) => {
  run('DELETE FROM lends WHERE id=?', [req.params.id])
  res.json({ ok: true })
})

app.listen(3001, () => console.log('✅ API server running on http://localhost:3001'))

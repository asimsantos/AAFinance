import express from 'express'
import cors from 'cors'
import { computeLedger } from './engine.js'
import { migrate } from './migrate.js'
import { rows } from './db.js'
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
  return rows(db, sql, params)
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
try { db.run("ALTER TABLE transactions ADD COLUMN source_fund TEXT DEFAULT ''") } catch(e) {}
try { db.run("ALTER TABLE rules ADD COLUMN source_fund TEXT DEFAULT ''") } catch(e) {}

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
  // debt column = debt repayment fund (savings pool), starts at 0
  db.run(`INSERT INTO snapshots(id,date,cash,car,emergency,debt,home) VALUES(?,?,?,?,?,?,?)`,
    ['s1', '2026-06-30', 1200, 2800, 1500, 0, 0])

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

// ── FUNDS MIGRATION (one-shot, backs up the db file first) ──────
const migration = migrate(db, { dbPath: DB_PATH, backupsDir: join(DATA_DIR, 'backups') })
if (migration.ran) {
  persist()
  console.log(`✅ Migrated to funds schema${migration.backupPath ? ` (backup: ${migration.backupPath})` : ''}`)
}

// ── HELPERS ─────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2,10) }

// ── EXPRESS ─────────────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json())

// Ledger
app.get('/api/ledger', (req, res) => {
  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from and to required' })
  res.json(computeLedger({
    from, to,
    rules:            all('SELECT * FROM rules'),
    transactions:     all('SELECT * FROM transactions'),
    snapshots:        all('SELECT * FROM snapshots ORDER BY date'),
    snapshotBalances: all('SELECT * FROM snapshot_balances'),
    funds:            all('SELECT * FROM funds ORDER BY sort_order'),
  }))
})

// Funds
// Day objects spread fund balances by key, so keys may never collide
// with the ledger's own fields.
const RESERVED_FUND_KEYS = ['cash', 'openCash', 'events', 'dayIn', 'daySpend', 'dayTransfer', 'dayOut', 'hasSnapshot', 'cash_anchored', 'cash_pinned', 'reconciled', 'autocoverOwed']

function fundReferenced(id, key) {
  return !!(
    get('SELECT 1 x FROM rules WHERE fund_target=? OR source_fund=? LIMIT 1', [key, key]) ||
    get('SELECT 1 x FROM transactions WHERE fund_target=? OR source_fund=? LIMIT 1', [key, key]) ||
    get('SELECT 1 x FROM snapshot_balances WHERE fund_id=? LIMIT 1', [id])
  )
}

function slugKey(label) {
  let base = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'fund'
  if (RESERVED_FUND_KEYS.includes(base)) base = base + '_fund'
  let key = base, i = 2
  while (get('SELECT 1 x FROM funds WHERE key=?', [key])) key = `${base}_${i++}`
  return key
}

app.get('/api/funds', (_, res) => {
  const funds = all('SELECT * FROM funds ORDER BY sort_order')
  // Grouped reference lookup — constant query count regardless of fund count
  const refKeys = new Set(all(`
    SELECT fund_target k FROM rules        WHERE fund_target != ''
    UNION SELECT source_fund FROM rules        WHERE source_fund != ''
    UNION SELECT fund_target FROM transactions WHERE fund_target != ''
    UNION SELECT source_fund FROM transactions WHERE source_fund != ''
  `).map(r => r.k))
  const refIds = new Set(all('SELECT DISTINCT fund_id i FROM snapshot_balances').map(r => r.i))
  res.json(funds.map(f => ({ ...f, referenced: (refKeys.has(f.key) || refIds.has(f.id)) ? 1 : 0 })))
})
app.post('/api/funds', (req, res) => {
  const { label, color, target, autocover_priority } = req.body
  if (!label || !String(label).trim()) return res.status(400).json({ error: 'label required' })
  const key = slugKey(label)
  const id = uid()
  const maxSort = get('SELECT MAX(sort_order) m FROM funds')?.m
  run('INSERT INTO funds(id,key,label,color,sort_order,autocover_priority,target,archived) VALUES(?,?,?,?,?,?,?,0)',
    [id, key, String(label).trim(), color || '#1D4ED8', (maxSort ?? -1) + 1, autocover_priority ?? null, target ?? null])
  res.json({ id, key })
})
app.put('/api/funds/:id', (req, res) => {
  const f = get('SELECT * FROM funds WHERE id=?', [req.params.id])
  if (!f) return res.status(404).json({ error: 'fund not found' })
  const { label, color, target, autocover_priority, archived } = req.body
  run('UPDATE funds SET label=?,color=?,target=?,autocover_priority=?,archived=? WHERE id=?',
    [label ?? f.label, color ?? f.color,
     target === undefined ? f.target : target,
     autocover_priority === undefined ? f.autocover_priority : autocover_priority,
     archived === undefined ? f.archived : (archived ? 1 : 0),
     req.params.id])
  res.json({ ok: true })
})
app.post('/api/funds/reorder', (req, res) => {
  const { ids } = req.body
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' })
  ids.forEach((id, i) => db.run('UPDATE funds SET sort_order=? WHERE id=?', [i, id]))
  persist()
  res.json({ ok: true })
})
app.delete('/api/funds/:id', (req, res) => {
  const f = get('SELECT * FROM funds WHERE id=?', [req.params.id])
  if (!f) return res.status(404).json({ error: 'fund not found' })
  if (fundReferenced(f.id, f.key)) {
    return res.status(409).json({ error: 'Fund is referenced by rules, transactions or snapshots — archive it instead.' })
  }
  run('DELETE FROM funds WHERE id=?', [req.params.id])
  res.json({ ok: true })
})

// Rules
app.get('/api/rules', (_, res) => res.json(all('SELECT * FROM rules ORDER BY start_date')))
app.post('/api/rules', (req, res) => {
  const { type,name,amt,start_date,end_date,recur,fund_target,person,source_fund } = req.body
  const id = uid()
  run(`INSERT INTO rules(id,type,name,amt,start_date,end_date,recur,fund_target,person,source_fund) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [id,type,name,amt,start_date,end_date||'',recur,fund_target||'',person||'',source_fund||''])
  res.json({ id })
})
app.put('/api/rules/:id', (req, res) => {
  const { name,amt,start_date,end_date,recur,fund_target,person,source_fund } = req.body
  run(`UPDATE rules SET name=?,amt=?,start_date=?,end_date=?,recur=?,fund_target=?,person=?,source_fund=? WHERE id=?`,
    [name,amt,start_date,end_date||'',recur,fund_target||'',person||'',source_fund||'',req.params.id])
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
  const { type,name,amt,date,rule_id,skip,fund_target,return_date,note,source_fund } = req.body
  const id = uid()
  run(`INSERT INTO transactions(id,type,name,amt,date,rule_id,skip,fund_target,return_date,note,source_fund) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [id,type,name,amt,date,rule_id||'',skip?1:0,fund_target||'',return_date||'',note||'',source_fund||''])
  res.json({ id })
})
app.put('/api/transactions/:id', (req, res) => {
  const { type,name,amt,date,fund_target,return_date,note,source_fund } = req.body
  run(`UPDATE transactions SET type=?,name=?,amt=?,date=?,fund_target=?,return_date=?,note=?,source_fund=? WHERE id=?`,
    [type,name,amt,date,fund_target||'',return_date||'',note||'',source_fund||'',req.params.id])
  res.json({ ok: true })
})
app.delete('/api/transactions/:id', (req, res) => {
  run('DELETE FROM transactions WHERE id=?', [req.params.id])
  res.json({ ok: true })
})

// Snapshots
app.get('/api/snapshots', (_, res) => {
  const snaps = all('SELECT * FROM snapshots ORDER BY date')
  const keyById = Object.fromEntries(all('SELECT id,key FROM funds').map(f => [f.id, f.key]))
  const grouped = {}
  all('SELECT * FROM snapshot_balances').forEach(r => {
    const k = keyById[r.fund_id]
    if (k) (grouped[r.snapshot_id] ||= {})[k] = r.amount
  })
  res.json(snaps.map(s => ({ ...s, balances: grouped[s.id] || {} })))
})
// Upsert a snapshot for a date. `cash` present anchors cash (cash_set);
// `balances` {fundKey: amount} anchors exactly those funds.
app.post('/api/snapshots', (req, res) => {
  const { date, cash, cash_pinned, reconciled, balances } = req.body
  if (!date) return res.status(400).json({ error: 'date required' })
  const existing = get('SELECT * FROM snapshots WHERE date=?', [date])
  const pinned  = cash_pinned !== undefined ? (cash_pinned ? 1 : 0) : (existing?.cash_pinned ?? 0)
  const rec     = reconciled ? 1 : (existing?.reconciled ?? 0)
  const cashSet = cash !== undefined ? 1 : (existing?.cash_set ?? 0)
  const cashVal = cash !== undefined ? cash : (existing?.cash ?? 0)

  let snapId = existing?.id
  if (existing) {
    db.run('UPDATE snapshots SET cash=?,cash_set=?,cash_pinned=?,reconciled=? WHERE date=?',
      [cashVal, cashSet, pinned, rec, date])
  } else {
    snapId = uid()
    db.run('INSERT INTO snapshots(id,date,cash,cash_set,cash_pinned,reconciled) VALUES(?,?,?,?,?,?)',
      [snapId, date, cashVal, cashSet, pinned, rec])
  }

  if (balances && typeof balances === 'object') {
    const byKey = Object.fromEntries(all('SELECT id,key FROM funds').map(f => [f.key, f.id]))
    Object.entries(balances).forEach(([key, amount]) => {
      if (!byKey[key]) return
      db.run('INSERT OR REPLACE INTO snapshot_balances(snapshot_id,fund_id,amount) VALUES(?,?,?)',
        [snapId, byKey[key], Number(amount) || 0])
    })
  }

  // Freeze fullness at write time: anchors cash + every currently-active
  // fund → ground truth that resets auto-cover debt. Frozen here so later
  // fund additions can't retroactively demote this snapshot.
  const active = all('SELECT id FROM funds WHERE archived=0')
  const have = new Set(all('SELECT fund_id FROM snapshot_balances WHERE snapshot_id=?', [snapId]).map(r => r.fund_id))
  const isFull = (cashSet && active.every(f => have.has(f.id))) ? 1 : 0
  db.run('UPDATE snapshots SET is_full=? WHERE id=?', [isFull, snapId])

  persist()
  res.json({ id: snapId })
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

// Pay off a borrow from the debt fund
app.post('/api/debts/:id/pay', (req, res) => {
  const { amount, date } = req.body
  const record = get('SELECT * FROM debts WHERE id=?', [req.params.id])
  if (!record) return res.status(404).json({ error: 'Debt not found' })
  const newPaid  = (record.paid_amt || 0) + amount
  const isRepaid = newPaid >= record.amt
  run('UPDATE debts SET paid_amt=?, repaid=? WHERE id=?', [newPaid, isRepaid ? 1 : 0, req.params.id])
  const txId  = uid()
  const today = date || new Date().toISOString().slice(0, 10)
  run(`INSERT INTO transactions(id,type,name,amt,date,fund_target) VALUES(?,?,?,?,?,?)`,
      [txId, 'debtpay', record.name, amount, today, req.params.id])
  res.json({ id: txId, repaid: isRepaid })
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

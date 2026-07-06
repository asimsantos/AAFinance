// ── FUNDS MIGRATION ─────────────────────────────────────────────
// One-shot, idempotent: runs only when the `funds` table is absent.
// Creates funds + snapshot_balances, seeds the four legacy funds
// (colors and auto-cover order exactly as previously hardcoded), and
// explodes legacy snapshot fund columns into snapshot_balances rows.
// The db file is backed up before any change; the caller persists
// the mutated in-memory db afterwards.
//
// Legacy snapshot columns (car/emergency/debt/home/partial_funds)
// remain physically in the table but are never read or written again.

import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'

const FUND_SEED = [
  // id, key, label, color, sort_order, autocover_priority
  ['f_car',       'car',       'Car fund',        '#1D4ED8', 0, 4],
  ['f_emergency', 'emergency', 'Emergency',       '#047857', 1, 1],
  ['f_debt',      'debt',      'Debt Fund',       '#1E40AF', 2, 2],
  ['f_home',      'home',      'Tuition reserve', '#6D28D9', 3, 3],
]

const KEY_TO_ID = Object.fromEntries(FUND_SEED.map(f => [f[1], f[0]]))

function all(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

export function migrate(db, { dbPath = null, backupsDir = null } = {}) {
  const has = all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='funds'")
  if (has.length > 0) return { ran: false }

  let backupPath = null
  if (dbPath && backupsDir && existsSync(dbPath)) {
    mkdirSync(backupsDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    backupPath = join(backupsDir, `finance-${stamp}.db`)
    copyFileSync(dbPath, backupPath)
  }

  db.run(`
    CREATE TABLE funds (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#1D4ED8',
      sort_order INTEGER NOT NULL DEFAULT 0,
      autocover_priority INTEGER,
      target REAL,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE snapshot_balances (
      snapshot_id TEXT NOT NULL,
      fund_id TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (snapshot_id, fund_id)
    );
  `)
  try { db.run("ALTER TABLE snapshots ADD COLUMN cash_set INTEGER DEFAULT 0") } catch (e) {}

  FUND_SEED.forEach(f =>
    db.run('INSERT INTO funds(id,key,label,color,sort_order,autocover_priority) VALUES(?,?,?,?,?,?)', f))

  // Explode legacy snapshot fund columns.
  // partial_funds='' means a full snapshot (cash + every fund anchored).
  const snaps = all(db, 'SELECT * FROM snapshots')
  snaps.forEach(s => {
    const partial = (s.partial_funds || '').split(',').filter(Boolean)
    const full = partial.length === 0
    Object.keys(KEY_TO_ID).forEach(key => {
      if (full || partial.includes(key)) {
        db.run('INSERT OR REPLACE INTO snapshot_balances(snapshot_id,fund_id,amount) VALUES(?,?,?)',
          [s.id, KEY_TO_ID[key], s[key] ?? 0])
      }
    })
    db.run('UPDATE snapshots SET cash_set=? WHERE id=?',
      [(full || partial.includes('cash')) ? 1 : 0, s.id])
  })

  return { ran: true, backupPath }
}

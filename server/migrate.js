// ── FUNDS MIGRATION ─────────────────────────────────────────────
// Idempotent, runs at server start. Two steps, each self-gating:
//
// 1. Funds schema (runs when the `funds` table is absent): creates
//    funds + snapshot_balances, seeds the four legacy funds (colors
//    and auto-cover order exactly as previously hardcoded), and
//    explodes legacy snapshot fund columns into snapshot_balances
//    rows.
// 2. Frozen fullness flag (runs when snapshots lacks `is_full`):
//    adds the column and stamps it. A snapshot's "full" status
//    (anchors cash + every active fund → resets auto-cover debt) is
//    decided when the snapshot is WRITTEN, never recomputed at read
//    time — otherwise adding a fund later would retroactively demote
//    every historical reconcile.
//
// The db file is backed up before any change; the caller persists
// the mutated in-memory db afterwards.
//
// Legacy snapshot columns (car/emergency/debt/home/partial_funds)
// remain physically in the table but are never read or written again.

import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import { rows } from './db.js'

const FUND_SEED = [
  // id, key, label, color, sort_order, autocover_priority
  ['f_car',       'car',       'Car fund',        '#1D4ED8', 0, 4],
  ['f_emergency', 'emergency', 'Emergency',       '#047857', 1, 1],
  ['f_debt',      'debt',      'Debt Fund',       '#1E40AF', 2, 2],
  ['f_home',      'home',      'Tuition reserve', '#6D28D9', 3, 3],
]

const KEY_TO_ID = Object.fromEntries(FUND_SEED.map(f => [f[1], f[0]]))

function tableExists(db, name) {
  return rows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name]).length > 0
}

function hasColumn(db, table, col) {
  return rows(db, `PRAGMA table_info(${table})`).some(r => r.name === col)
}

// Stamp is_full structurally: cash anchored AND a balance row for every
// currently-active fund. Only used for dbs migrated before the flag
// existed; fresh migrations stamp it during the explosion below.
function backfillIsFull(db) {
  const active = rows(db, 'SELECT id FROM funds WHERE archived=0')
  const balRows = rows(db, 'SELECT snapshot_id, fund_id FROM snapshot_balances')
  const bySnap = {}
  balRows.forEach(r => (bySnap[r.snapshot_id] ||= new Set()).add(r.fund_id))
  rows(db, 'SELECT id, cash_set FROM snapshots').forEach(s => {
    const have = bySnap[s.id] || new Set()
    const isFull = s.cash_set && active.every(f => have.has(f.id)) ? 1 : 0
    db.run('UPDATE snapshots SET is_full=? WHERE id=?', [isFull, s.id])
  })
}

export function migrate(db, { dbPath = null, backupsDir = null } = {}) {
  const needsFunds = !tableExists(db, 'funds')
  const needsFull  = tableExists(db, 'snapshots') && !hasColumn(db, 'snapshots', 'is_full')
  if (!needsFunds && !needsFull) return { ran: false }

  let backupPath = null
  if (dbPath && backupsDir && existsSync(dbPath)) {
    mkdirSync(backupsDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    backupPath = join(backupsDir, `finance-${stamp}.db`)
    copyFileSync(dbPath, backupPath)
  }

  if (needsFull) {
    db.run('ALTER TABLE snapshots ADD COLUMN is_full INTEGER DEFAULT 0')
  }

  if (needsFunds) {
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
    // partial_funds='' meant a full snapshot (cash + every fund anchored),
    // which is exactly what is_full freezes.
    const snaps = rows(db, 'SELECT * FROM snapshots')
    snaps.forEach(s => {
      const partial = (s.partial_funds || '').split(',').filter(Boolean)
      const full = partial.length === 0
      Object.keys(KEY_TO_ID).forEach(key => {
        if (full || partial.includes(key)) {
          db.run('INSERT OR REPLACE INTO snapshot_balances(snapshot_id,fund_id,amount) VALUES(?,?,?)',
            [s.id, KEY_TO_ID[key], s[key] ?? 0])
        }
      })
      db.run('UPDATE snapshots SET cash_set=?, is_full=? WHERE id=?',
        [(full || partial.includes('cash')) ? 1 : 0, full ? 1 : 0, s.id])
    })
  } else if (needsFull) {
    // Already on the funds schema, just missing the frozen flag.
    backfillIsFull(db)
  }

  return { ran: true, backupPath }
}

import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs from 'sql.js'
import { migrate } from './migrate.js'

let SQL
beforeAll(async () => { SQL = await initSqlJs() })

function all(db, sql) {
  const stmt = db.prepare(sql)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function makeLegacyDb() {
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY, date TEXT NOT NULL UNIQUE,
      cash REAL DEFAULT 0, car REAL DEFAULT 0, emergency REAL DEFAULT 0,
      debt REAL DEFAULT 0, home REAL DEFAULT 0,
      cash_pinned INTEGER DEFAULT 0, partial_funds TEXT DEFAULT '', reconciled INTEGER DEFAULT 0
    );
  `)
  db.run(`INSERT INTO snapshots VALUES ('s1','2026-06-30',1200,2800,1500,0,50,0,'',1)`)      // full
  db.run(`INSERT INTO snapshots VALUES ('s2','2026-07-10',0,9999,0,0,0,0,'car',0)`)          // partial: car only
  db.run(`INSERT INTO snapshots VALUES ('s3','2026-07-12',777,0,0,0,0,1,'cash',0)`)          // partial: cash only
  return db
}

describe('funds migration', () => {
  it('seeds the four legacy funds with the hardcoded auto-cover order', () => {
    const db = makeLegacyDb()
    const result = migrate(db)
    expect(result.ran).toBe(true)

    const funds = all(db, 'SELECT * FROM funds ORDER BY sort_order')
    expect(funds.map(f => f.key)).toEqual(['car', 'emergency', 'debt', 'home'])
    const prio = Object.fromEntries(funds.map(f => [f.key, f.autocover_priority]))
    expect(prio).toEqual({ emergency: 1, debt: 2, home: 3, car: 4 })
    expect(funds.every(f => f.archived === 0)).toBe(true)
  })

  it('explodes a full snapshot into one balance row per fund with cash_set=1', () => {
    const db = makeLegacyDb()
    migrate(db)
    const rows = all(db, "SELECT * FROM snapshot_balances WHERE snapshot_id='s1' ORDER BY fund_id")
    expect(rows).toHaveLength(4)
    const byFund = Object.fromEntries(rows.map(r => [r.fund_id, r.amount]))
    expect(byFund).toEqual({ f_car: 2800, f_emergency: 1500, f_debt: 0, f_home: 50 })
    expect(all(db, "SELECT cash_set FROM snapshots WHERE id='s1'")[0].cash_set).toBe(1)
  })

  it('explodes a fund-partial snapshot into only that row with cash_set=0', () => {
    const db = makeLegacyDb()
    migrate(db)
    const rows = all(db, "SELECT * FROM snapshot_balances WHERE snapshot_id='s2'")
    expect(rows).toEqual([{ snapshot_id: 's2', fund_id: 'f_car', amount: 9999 }])
    expect(all(db, "SELECT cash_set FROM snapshots WHERE id='s2'")[0].cash_set).toBe(0)
  })

  it('cash-partial snapshot gets cash_set=1 and no balance rows', () => {
    const db = makeLegacyDb()
    migrate(db)
    expect(all(db, "SELECT * FROM snapshot_balances WHERE snapshot_id='s3'")).toHaveLength(0)
    expect(all(db, "SELECT cash_set FROM snapshots WHERE id='s3'")[0].cash_set).toBe(1)
  })

  it('is idempotent — second run is a no-op', () => {
    const db = makeLegacyDb()
    expect(migrate(db).ran).toBe(true)
    const fundCount = all(db, 'SELECT COUNT(*) c FROM funds')[0].c
    const balCount  = all(db, 'SELECT COUNT(*) c FROM snapshot_balances')[0].c

    expect(migrate(db).ran).toBe(false)
    expect(all(db, 'SELECT COUNT(*) c FROM funds')[0].c).toBe(fundCount)
    expect(all(db, 'SELECT COUNT(*) c FROM snapshot_balances')[0].c).toBe(balCount)
  })
})

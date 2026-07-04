// One-time migration: reads data/finance.db (SQLite) → Supabase (PostgreSQL)
// Usage: DATABASE_URL="postgresql://..." node scripts/migrate-to-supabase.js

import initSqlJs from 'sql.js'
import postgres from 'postgres'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH   = path.join(__dirname, '../data/finance.db')

if (!fs.existsSync(DB_PATH)) {
  console.error(`ERROR: SQLite file not found at ${DB_PATH}`)
  process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 })

async function main() {
  console.log('Reading SQLite database...')
  const SQL    = await initSqlJs()
  const db     = new SQL.Database(fs.readFileSync(DB_PATH))

  const readAll = (query) => {
    const stmt = db.prepare(query)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  }

  const rules        = readAll('SELECT * FROM rules')
  const transactions = readAll('SELECT * FROM transactions')
  const snapshots    = readAll('SELECT * FROM snapshots')
  const lends        = readAll('SELECT * FROM lends')
  const debts        = readAll('SELECT * FROM debts')

  console.log(`Found: ${rules.length} rules, ${transactions.length} transactions, ${snapshots.length} snapshots, ${lends.length} lends, ${debts.length} debts`)
  console.log('Migrating to Supabase...\n')

  // Rules
  await sql`DELETE FROM rules`
  for (const r of rules) {
    await sql`
      INSERT INTO rules(id,type,name,amt,start_date,end_date,recur,fund_target,person)
      VALUES (${r.id},${r.type},${r.name},${r.amt},${r.start_date},${r.end_date||''},${r.recur||'once'},${r.fund_target||''},${r.person||''})`
  }
  console.log(`✓ ${rules.length} rules`)

  // Transactions
  await sql`DELETE FROM transactions`
  for (const t of transactions) {
    await sql`
      INSERT INTO transactions(id,type,name,amt,date,rule_id,fund_target,return_date,skip)
      VALUES (${t.id},${t.type},${t.name},${t.amt},${t.date},${t.rule_id||''},${t.fund_target||''},${t.return_date||''},${t.skip||0})`
  }
  console.log(`✓ ${transactions.length} transactions`)

  // Snapshots
  await sql`DELETE FROM snapshots`
  for (const s of snapshots) {
    await sql`
      INSERT INTO snapshots(id,date,cash,car,emergency,debt,home,cash_pinned,partial_funds,reconciled)
      VALUES (${s.id},${s.date},${s.cash||0},${s.car||0},${s.emergency||0},${s.debt||0},${s.home||0},${s.cash_pinned||0},${s.partial_funds||''},${s.reconciled||0})`
  }
  console.log(`✓ ${snapshots.length} snapshots`)

  // Lends
  await sql`DELETE FROM lends`
  for (const l of lends) {
    await sql`
      INSERT INTO lends(id,name,amt,given_date,return_date,note,returned)
      VALUES (${l.id},${l.name},${l.amt},${l.given_date},${l.return_date||''},${l.note||''},${l.returned||0})`
  }
  console.log(`✓ ${lends.length} lends`)

  // Debts
  await sql`DELETE FROM debts`
  for (const d of debts) {
    await sql`
      INSERT INTO debts(id,name,amt,borrowed_date,due_date,note,repaid,paid_amt)
      VALUES (${d.id},${d.name},${d.amt},${d.borrowed_date},${d.due_date||''},${d.note||''},${d.repaid||0},${d.paid_amt||0})`
  }
  console.log(`✓ ${debts.length} debts`)

  await sql.end()
  console.log('\nMigration complete! All data is now in Supabase.')
}

main().catch(err => {
  console.error('\nMigration failed:', err.message)
  process.exit(1)
})

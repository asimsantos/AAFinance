import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import postgres from 'postgres'

const app = express()
app.use(cors())
app.use(express.json())

// ── DB connection ─────────────────────────────────────────────────
const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  prepare: false,   // required for Supabase transaction pooler
  max: 3,
})

function uid() { return Math.random().toString(36).slice(2, 10) }

// ── LEDGER ENGINE ────────────────────────────────────────────────
async function computeLedger(from, to) {
  const [rules, allTxns, snaps, debtsWithDueDate] = await Promise.all([
    sql`SELECT * FROM rules`,
    sql`SELECT * FROM transactions`,
    sql`SELECT * FROM snapshots ORDER BY date`,
    sql`SELECT * FROM debts WHERE due_date != '' AND repaid = 0`,
  ])

  const baseSnap = [...snaps].filter(s => s.date <= from)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
    || { cash: 0, car: 0, emergency: 0, debt: 0, home: 0 }

  let loopFrom = from
  if (baseSnap.date) {
    loopFrom = baseSnap.date
  } else {
    const firstInRange = [...snaps].filter(s => s.date >= from && s.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date))[0]
    if (firstInRange) loopFrom = firstInRange.date
  }

  const txns = await sql`SELECT * FROM transactions WHERE date >= ${loopFrom} AND date <= ${to}`

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
  let autocoverOwed = { emergency: 0, home: 0, car: 0 }

  const ledger = {}
  const d   = new Date(loopFrom + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')

  while (d <= end) {
    const ds = d.toISOString().slice(0, 10)

    const daySnap = snaps.find(s => s.date === ds)
    if (daySnap) {
      const partial = daySnap.partial_funds ? daySnap.partial_funds.split(',').filter(Boolean) : []
      const full = partial.length === 0
      if (full || partial.includes('cash'))      cash      = daySnap.cash
      if (full || partial.includes('car'))       car       = daySnap.car
      if (full || partial.includes('emergency')) emergency = daySnap.emergency
      if (full || partial.includes('debt'))      debt      = daySnap.debt
      if (full || partial.includes('home'))      home      = daySnap.home
      if (full) autocoverOwed = { emergency: 0, home: 0, car: 0 }
    }

    const openCash = cash

    const events = []

    txns.filter(t => t.date === ds && !t.skip).forEach(t =>
      events.push({ ...t, source: 'tx' })
    )

    rules.forEach(rule => {
      if (skips.has(`${rule.id}_${ds}`)) return
      if (overrides.has(`${rule.id}_${ds}`)) return
      if (ruleFiresOn(rule, ds)) {
        events.push({
          id: `rule_${rule.id}_${ds}`, rule_id: rule.id,
          type: rule.type, name: rule.name, amt: rule.amt,
          date: ds, fund_target: rule.fund_target,
          recur: rule.recur, source: 'rule',
        })
      }
    })

    debtsWithDueDate.forEach(debtRecord => {
      if (debtRecord.due_date === ds) {
        const remaining = Math.max(0, debtRecord.amt - (debtRecord.paid_amt || 0))
        if (remaining > 0) {
          events.push({
            id: `debtpay_${debtRecord.id}_${ds}`,
            type: 'fund', name: `Auto-repay – ${debtRecord.name}`,
            amt: remaining, fund_target: 'debt', date: ds, source: 'autopay',
          })
        }
      }
    })

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

    if (daySnap?.cash_pinned) cash = daySnap.cash

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

    const dayIn       = events.filter(e => e.type === 'income' || e.type === 'borrow').reduce((s, e) => s + e.amt, 0)
    const daySpend    = events.filter(e => e.type === 'expense' || e.type === 'lend').reduce((s, e) => s + e.amt, 0)
    const dayTransfer = events.filter(e => e.type === 'fund').reduce((s, e) => s + e.amt, 0)

    ledger[ds] = {
      cash, car, emergency, debt, home,
      openCash,
      hasSnapshot:   !!daySnap,
      cash_pinned:   !!(daySnap?.cash_pinned),
      reconciled:    !!(daySnap?.reconciled),
      autocoverOwed: { ...autocoverOwed },
      events,
      dayIn, daySpend, dayTransfer,
      dayOut: daySpend + dayTransfer,
    }

    d.setDate(d.getDate() + 1)
  }

  return ledger
}

// ── ROUTES ───────────────────────────────────────────────────────

// Ledger
app.get('/api/ledger', async (req, res) => {
  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from and to required' })
  try {
    res.json(await computeLedger(from, to))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Rules
app.get('/api/rules', async (_, res) => {
  res.json(await sql`SELECT * FROM rules ORDER BY start_date`)
})
app.post('/api/rules', async (req, res) => {
  const { type, name, amt, start_date, end_date, recur, fund_target, person } = req.body
  const id = uid()
  await sql`INSERT INTO rules(id,type,name,amt,start_date,end_date,recur,fund_target,person)
    VALUES (${id},${type},${name},${amt},${start_date},${end_date||''},${recur},${fund_target||''},${person||''})`
  res.json({ id })
})
app.put('/api/rules/:id', async (req, res) => {
  const { name, amt, start_date, end_date, recur, fund_target, person } = req.body
  await sql`UPDATE rules SET name=${name},amt=${amt},start_date=${start_date},end_date=${end_date||''},
    recur=${recur},fund_target=${fund_target||''},person=${person||''} WHERE id=${req.params.id}`
  res.json({ ok: true })
})
app.delete('/api/rules/:id', async (req, res) => {
  await sql`DELETE FROM rules WHERE id = ${req.params.id}`
  res.json({ ok: true })
})

// Transactions
app.get('/api/transactions', async (req, res) => {
  const { from, to } = req.query
  let rows
  if (from && to)   rows = await sql`SELECT * FROM transactions WHERE date >= ${from} AND date <= ${to} ORDER BY date`
  else if (from)    rows = await sql`SELECT * FROM transactions WHERE date >= ${from} ORDER BY date`
  else              rows = await sql`SELECT * FROM transactions ORDER BY date`
  res.json(rows)
})
app.post('/api/transactions', async (req, res) => {
  const { type, name, amt, date, rule_id, skip, fund_target, return_date, note } = req.body
  const id = uid()
  await sql`INSERT INTO transactions(id,type,name,amt,date,rule_id,skip,fund_target,return_date,note)
    VALUES (${id},${type},${name},${amt},${date},${rule_id||''},${skip?1:0},${fund_target||''},${return_date||''},${note||''})`
  res.json({ id })
})
app.put('/api/transactions/:id', async (req, res) => {
  const { type, name, amt, date, fund_target, return_date, note } = req.body
  await sql`UPDATE transactions SET type=${type},name=${name},amt=${amt},date=${date},
    fund_target=${fund_target||''},return_date=${return_date||''},note=${note||''} WHERE id=${req.params.id}`
  res.json({ ok: true })
})
app.delete('/api/transactions/:id', async (req, res) => {
  await sql`DELETE FROM transactions WHERE id = ${req.params.id}`
  res.json({ ok: true })
})

// Snapshots
app.get('/api/snapshots', async (_, res) => {
  res.json(await sql`SELECT * FROM snapshots ORDER BY date`)
})
app.post('/api/snapshots', async (req, res) => {
  const { date, cash, car, emergency, debt, home, cash_pinned, fund_key, reconciled } = req.body
  const VALID_FUNDS = ['cash', 'car', 'emergency', 'debt', 'home']
  const [existing] = await sql`SELECT * FROM snapshots WHERE date = ${date}`
  const pinned = cash_pinned !== undefined ? (cash_pinned ? 1 : 0) : (existing?.cash_pinned ?? 0)
  const rec    = reconciled ? 1 : (existing?.reconciled ?? 0)

  if (fund_key && VALID_FUNDS.includes(fund_key) && !reconciled) {
    const value      = req.body[fund_key]
    const partialSet = new Set((existing?.partial_funds || '').split(',').filter(Boolean))
    partialSet.add(fund_key)
    const newPartial = [...partialSet].join(',')
    if (existing) {
      await sql`UPDATE snapshots SET ${sql(fund_key)} = ${value}, partial_funds = ${newPartial}, cash_pinned = ${pinned} WHERE date = ${date}`
      res.json({ id: existing.id })
    } else {
      const id = uid()
      await sql`INSERT INTO snapshots(id,date,${sql(fund_key)},partial_funds,cash_pinned) VALUES (${id},${date},${value},${fund_key},${pinned})`
      res.json({ id })
    }
  } else {
    if (existing) {
      await sql`UPDATE snapshots SET cash=${cash},car=${car},emergency=${emergency},debt=${debt},home=${home},
        cash_pinned=${pinned},partial_funds='',reconciled=${rec} WHERE date=${date}`
      res.json({ id: existing.id })
    } else {
      const id = uid()
      await sql`INSERT INTO snapshots(id,date,cash,car,emergency,debt,home,cash_pinned,partial_funds,reconciled)
        VALUES (${id},${date},${cash},${car},${emergency},${debt},${home},${pinned},'',${rec})`
      res.json({ id })
    }
  }
})

// Debts
app.get('/api/debts', async (_, res) => {
  res.json(await sql`SELECT * FROM debts ORDER BY borrowed_date DESC`)
})
app.post('/api/debts', async (req, res) => {
  const { name, amt, borrowed_date, due_date, note } = req.body
  const id = uid()
  await sql`INSERT INTO debts(id,name,amt,borrowed_date,due_date,note) VALUES (${id},${name},${amt},${borrowed_date},${due_date||''},${note||''})`
  res.json({ id })
})
app.put('/api/debts/:id', async (req, res) => {
  const { name, amt, borrowed_date, due_date, note, repaid, paid_amt } = req.body
  await sql`UPDATE debts SET name=${name},amt=${amt},borrowed_date=${borrowed_date},due_date=${due_date||''},
    note=${note||''},repaid=${repaid?1:0},paid_amt=${paid_amt||0} WHERE id=${req.params.id}`
  res.json({ ok: true })
})
app.delete('/api/debts/:id', async (req, res) => {
  await sql`DELETE FROM debts WHERE id = ${req.params.id}`
  res.json({ ok: true })
})

// Lends
app.get('/api/lends', async (_, res) => {
  res.json(await sql`SELECT * FROM lends ORDER BY given_date DESC`)
})
app.post('/api/lends', async (req, res) => {
  const { name, amt, given_date, return_date, note } = req.body
  const id = uid()
  await sql`INSERT INTO lends(id,name,amt,given_date,return_date,note) VALUES (${id},${name},${amt},${given_date},${return_date||''},${note||''})`
  res.json({ id })
})
app.put('/api/lends/:id', async (req, res) => {
  const { name, amt, given_date, return_date, note, returned } = req.body
  await sql`UPDATE lends SET name=${name},amt=${amt},given_date=${given_date},return_date=${return_date||''},
    note=${note||''},returned=${returned?1:0} WHERE id=${req.params.id}`
  res.json({ ok: true })
})
app.delete('/api/lends/:id', async (req, res) => {
  await sql`DELETE FROM lends WHERE id = ${req.params.id}`
  res.json({ ok: true })
})

// ── START ────────────────────────────────────────────────────────
if (!process.env.VERCEL) {
  app.listen(3001, () => console.log('✅ API server on http://localhost:3001'))
}

export default app

// ── LEDGER ENGINE ───────────────────────────────────────────────
// Pure function: rows in, ledger out. No database access — callers
// (the API route, tests) pass table rows. `snapshotBalances` and
// `funds` are accepted for the funds-table transition (Task 3).

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

export function computeLedger({ from, to, rules = [], transactions = [], snapshots = [], snapshotBalances = [], funds = [] }) {
  const allTxns = transactions
  const snaps   = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))

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

  // Transactions for the full computation window (loopFrom → to)
  const txns = allTxns.filter(t => t.date >= loopFrom && t.date <= to)

  const overrides = new Set(allTxns.filter(t => t.rule_id && !t.skip).map(t => `${t.rule_id}_${t.date}`))
  const skips     = new Set(allTxns.filter(t => t.skip).map(t => `${t.rule_id}_${t.date}`))

  let cash = baseSnap.cash, car = baseSnap.car,
      emergency = baseSnap.emergency, debt = baseSnap.debt, home = baseSnap.home

  // Track how much each fund has lent to cash via auto-cover so it can be repaid.
  let autocoverOwed = { emergency: 0, debt: 0, home: 0, car: 0 }

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
      if (full) autocoverOwed = { emergency: 0, debt: 0, home: 0, car: 0 }
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
          source_fund: rule.source_fund || '',
          recur: rule.recur, source: 'rule'
        })
      }
    })

    // Apply events to balances
    events.forEach(ev => {
      if (ev.type === 'income') {
        cash += ev.amt
      } else if (ev.type === 'expense') {
        // If a source fund is nominated, draw from it first then spill to cash
        if (ev.source_fund) {
          let remaining = ev.amt
          const deductFrom = (key) => {
            const bal = { car, emergency, debt, home }[key] || 0
            const take = Math.min(bal, remaining)
            if (take > 0) {
              if (key === 'car')       car       -= take
              if (key === 'emergency') emergency -= take
              if (key === 'debt')      debt      -= take
              if (key === 'home')      home      -= take
              remaining -= take
            }
          }
          deductFrom(ev.source_fund)
          cash -= remaining   // remainder (can be 0 if fund covered it all)
        } else {
          cash -= ev.amt
        }
      } else if (ev.type === 'borrow') {
        cash += ev.amt                               // cash in; debt fund unaffected
      } else if (ev.type === 'fund') {
        cash -= ev.amt
        if      (ev.fund_target === 'car')       car += ev.amt
        else if (ev.fund_target === 'emergency') emergency += ev.amt
        else if (ev.fund_target === 'debt')      debt += ev.amt   // accumulates (like car/emergency)
        else if (ev.fund_target === 'home')      home += ev.amt
      } else if (ev.type === 'lend') {
        cash -= ev.amt
      } else if (ev.type === 'debtpay') {
        debt -= ev.amt                               // payment from debt fund to creditor
      }
    })

    // If cash is pinned on this snapshot, override any event-computed value
    if (daySnap?.cash_pinned) cash = daySnap.cash

    // Auto-cover: when cash goes negative, draw from reserves in priority order:
    //   1. Emergency  2. Debt fund  3. Tuition reserve  4. Car fund
    if (cash < 0 && !daySnap?.cash_pinned) {
      const fromEmergency = Math.min(emergency, -cash)
      if (fromEmergency > 0) {
        emergency -= fromEmergency; cash += fromEmergency
        autocoverOwed.emergency += fromEmergency
        events.push({ id: `ac_em_${ds}`, type: 'autocover', name: 'Emergency fund', amt: fromEmergency, fund_target: 'emergency', date: ds, source: 'autocover' })
      }
      if (cash < 0) {
        const fromDebt = Math.min(debt, -cash)
        if (fromDebt > 0) {
          debt -= fromDebt; cash += fromDebt
          autocoverOwed.debt += fromDebt
          events.push({ id: `ac_debt_${ds}`, type: 'autocover', name: 'Debt fund', amt: fromDebt, fund_target: 'debt', date: ds, source: 'autocover' })
        }
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

    // Auto-cover recovery: repay in reverse draw order (Car → Home → Debt → Emergency)
    if (cash > 0 && !daySnap?.cash_pinned &&
        (autocoverOwed.emergency > 0 || autocoverOwed.debt > 0 || autocoverOwed.home > 0 || autocoverOwed.car > 0)) {
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
        const repayDebt = Math.min(autocoverOwed.debt, cash)
        if (repayDebt > 0) {
          debt += repayDebt; cash -= repayDebt; autocoverOwed.debt -= repayDebt
          events.push({ id: `acr_debt_${ds}`, type: 'autocoverrepay', name: 'Debt fund', amt: repayDebt, fund_target: 'debt', date: ds, source: 'autocover' })
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

// ── LEDGER ENGINE ───────────────────────────────────────────────
// Pure function: rows in, ledger out. No database access.
//
// Funds are data: `funds` rows drive balance keys, auto-cover order
// (ascending autocover_priority, NULL = never drawn, ties by
// sort_order) and repayment (exact reverse). Snapshots anchor cash
// when `cash_set` (or pinned) and anchor exactly the funds that have
// `snapshot_balances` rows. A snapshot that sets cash plus every
// non-archived fund is "full" and resets outstanding auto-cover debt.
//
// Day objects expose one balance per fund key at the top level
// (dayData[fund.key]) — fund keys are validated against a reserved
// list at the API layer so they can never collide with these fields.

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

  const fundById    = Object.fromEntries(funds.map(f => [f.id, f]))
  const fundKeys    = funds.map(f => f.key)
  const activeFunds = funds.filter(f => !f.archived)

  // Balance rows grouped per snapshot: { snapshot_id: { fundKey: amount } }
  const balsBySnap = {}
  snapshotBalances.forEach(r => {
    const f = fundById[r.fund_id]
    if (!f) return
    ;(balsBySnap[r.snapshot_id] ||= {})[f.key] = r.amount
  })

  // Auto-cover draw order; archived funds never participate.
  const coverFunds = funds
    .filter(f => f.autocover_priority != null && !f.archived)
    .sort((a, b) => (a.autocover_priority - b.autocover_priority) || (a.sort_order - b.sort_order))
  const repayFunds = [...coverFunds].reverse()

  const baseSnap = snaps.filter(s => s.date <= from).at(-1) || null

  // Loop start: see Case A/B — never drop events between the last known
  // balance and the requested window.
  let loopFrom = from
  if (baseSnap) {
    loopFrom = baseSnap.date
  } else {
    const firstInRange = snaps.find(s => s.date >= from && s.date <= to)
    if (firstInRange) loopFrom = firstInRange.date
  }

  const txns = allTxns.filter(t => t.date >= loopFrom && t.date <= to)

  const overrides = new Set(allTxns.filter(t => t.rule_id && !t.skip).map(t => `${t.rule_id}_${t.date}`))
  const skips     = new Set(allTxns.filter(t => t.skip).map(t => `${t.rule_id}_${t.date}`))

  // Seed balances: overlay every snapshot at-or-before loopFrom in date
  // order, so each fund starts from its nearest anchored value even when
  // the most recent snapshot was partial.
  let cash = 0
  const bal = {}
  fundKeys.forEach(k => { bal[k] = 0 })
  snaps.filter(s => s.date <= loopFrom).forEach(s => {
    if (s.cash_set || s.cash_pinned) cash = s.cash
    const b = balsBySnap[s.id]
    if (b) Object.entries(b).forEach(([k, v]) => { bal[k] = v })
  })

  let autocoverOwed = {}
  fundKeys.forEach(k => { autocoverOwed[k] = 0 })

  const ledger = {}
  const d = new Date(loopFrom + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')

  while (d <= end) {
    const ds = d.toISOString().slice(0, 10)

    // Apply snapshot for this exact date.
    const daySnap = snaps.find(s => s.date === ds)
    if (daySnap) {
      if (daySnap.cash_set || daySnap.cash_pinned) cash = daySnap.cash
      const b = balsBySnap[daySnap.id] || {}
      Object.entries(b).forEach(([k, v]) => { bal[k] = v })
      // Full snapshot (cash + every active fund) is ground-truth — reset auto-cover debt
      const full = !!daySnap.cash_set && activeFunds.every(f => b[f.key] !== undefined)
      if (full) fundKeys.forEach(k => { autocoverOwed[k] = 0 })
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
        if (ev.source_fund && ev.source_fund in bal) {
          const take = Math.min(bal[ev.source_fund], ev.amt)
          if (take > 0) bal[ev.source_fund] -= take
          cash -= (ev.amt - take)   // remainder (can be 0 if fund covered it all)
        } else {
          cash -= ev.amt
        }
      } else if (ev.type === 'borrow') {
        cash += ev.amt                               // cash in; funds unaffected
      } else if (ev.type === 'fund') {
        cash -= ev.amt
        if (ev.fund_target in bal) bal[ev.fund_target] += ev.amt
      } else if (ev.type === 'lend') {
        cash -= ev.amt
      } else if (ev.type === 'debtpay') {
        // Payment from the debt fund to a creditor; falls back to cash
        // if no 'debt'-keyed fund exists.
        if ('debt' in bal) bal.debt -= ev.amt
        else cash -= ev.amt
      }
    })

    // If cash is pinned on this snapshot, override any event-computed value
    if (daySnap?.cash_pinned) cash = daySnap.cash

    // Auto-cover: when cash goes negative, draw from reserves in priority order
    if (cash < 0 && !daySnap?.cash_pinned) {
      for (const f of coverFunds) {
        if (cash >= 0) break
        const take = Math.min(bal[f.key], -cash)
        if (take > 0) {
          bal[f.key] -= take; cash += take
          autocoverOwed[f.key] += take
          events.push({ id: `ac_${f.key}_${ds}`, type: 'autocover', name: f.label, amt: take, fund_target: f.key, date: ds, source: 'autocover' })
        }
      }
    }

    // Auto-cover recovery: repay in reverse draw order
    if (cash > 0 && !daySnap?.cash_pinned) {
      for (const f of repayFunds) {
        if (cash <= 0) break
        const pay = Math.min(autocoverOwed[f.key] || 0, cash)
        if (pay > 0) {
          bal[f.key] += pay; cash -= pay; autocoverOwed[f.key] -= pay
          events.push({ id: `acr_${f.key}_${ds}`, type: 'autocoverrepay', name: f.label, amt: pay, fund_target: f.key, date: ds, source: 'autocover' })
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
      cash,
      ...Object.fromEntries(fundKeys.map(k => [k, bal[k]])),
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

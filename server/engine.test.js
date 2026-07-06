import { describe, it, expect } from 'vitest'
import { computeLedger } from './engine.js'

// ── Fixtures: post-migration shape (funds table + snapshot_balances) ──
const FUNDS = [
  { id: 'f_car',       key: 'car',       label: 'Car fund',        color: '#1D4ED8', sort_order: 0, autocover_priority: 4, target: null, archived: 0 },
  { id: 'f_emergency', key: 'emergency', label: 'Emergency',       color: '#047857', sort_order: 1, autocover_priority: 1, target: null, archived: 0 },
  { id: 'f_debt',      key: 'debt',      label: 'Debt Fund',       color: '#1E40AF', sort_order: 2, autocover_priority: 2, target: null, archived: 0 },
  { id: 'f_home',      key: 'home',      label: 'Tuition reserve', color: '#6D28D9', sort_order: 3, autocover_priority: 3, target: null, archived: 0 },
]

// Full snapshot: cash + one balance row per fund
function fullSnap(id, date, cash, balances, extra = {}) {
  return {
    snapshot: { id, date, cash, cash_set: 1, cash_pinned: 0, reconciled: 0, ...extra },
    balances: Object.entries(balances).map(([key, amount]) => ({ snapshot_id: id, fund_id: `f_${key}`, amount })),
  }
}

const SEED = fullSnap('s1', '2026-06-30', 1200, { car: 2800, emergency: 1500, debt: 0, home: 0 })

const SEED_RULES = [
  { id: 'r2', type: 'income',  name: 'Salary (Sam)',      amt: 1100, start_date: '2026-07-07', end_date: '', recur: 'fortnightly', fund_target: '', source_fund: '' },
  { id: 'r4', type: 'expense', name: 'Rent',              amt: 480,  start_date: '2026-07-05', end_date: '', recur: 'weekly',      fund_target: '', source_fund: '' },
  { id: 'r5', type: 'expense', name: 'Groceries',         amt: 200,  start_date: '2026-07-05', end_date: '', recur: 'weekly',      fund_target: '', source_fund: '' },
  { id: 'r6', type: 'expense', name: 'Transport',         amt: 90,   start_date: '2026-07-07', end_date: '', recur: 'weekly',      fund_target: '', source_fund: '' },
  { id: 'r7', type: 'expense', name: 'Dining out',        amt: 70,   start_date: '2026-07-05', end_date: '', recur: 'weekly',      fund_target: '', source_fund: '' },
  { id: 'r8', type: 'expense', name: 'Personal spending', amt: 130,  start_date: '2026-07-07', end_date: '', recur: 'weekly',      fund_target: '', source_fund: '' },
]

const run = (over = {}) => computeLedger({
  from: '2026-07-01', to: '2026-07-31',
  rules: SEED_RULES, transactions: [],
  snapshots: [SEED.snapshot], snapshotBalances: SEED.balances,
  funds: FUNDS,
  ...over,
})

describe('characterization: seed scenario', () => {
  it('reproduces the known July balances', () => {
    const ledger = run()
    expect(ledger['2026-07-05'].cash).toBe(450)      // 1200 − 480 − 200 − 70
    expect(ledger['2026-07-07'].openCash).toBe(450)
    expect(ledger['2026-07-07'].cash).toBe(1330)     // 450 + 1100 − 90 − 130
    expect(ledger['2026-07-07'].dayIn).toBe(1100)
    expect(ledger['2026-07-07'].daySpend).toBe(220)
  })

  it('anchors all funds from the full snapshot', () => {
    const ledger = run()
    expect(ledger['2026-07-01'].car).toBe(2800)
    expect(ledger['2026-07-01'].emergency).toBe(1500)
    expect(ledger['2026-07-01'].debt).toBe(0)
    expect(ledger['2026-07-01'].home).toBe(0)
  })
})

describe('characterization: fund transfers', () => {
  it('moves cash into the target fund', () => {
    const ledger = run({
      rules: [],
      transactions: [{ id: 't1', type: 'fund', name: 'Car savings', amt: 600, date: '2026-07-10', rule_id: '', skip: 0, fund_target: 'car', source_fund: '' }],
    })
    expect(ledger['2026-07-10'].cash).toBe(600)   // 1200 − 600
    expect(ledger['2026-07-10'].car).toBe(3400)   // 2800 + 600
    expect(ledger['2026-07-10'].dayTransfer).toBe(600)
  })

  it('unknown fund_target still debits cash without crashing', () => {
    const ledger = run({
      rules: [],
      transactions: [{ id: 't1', type: 'fund', name: 'Ghost', amt: 600, date: '2026-07-10', rule_id: '', skip: 0, fund_target: 'ghost', source_fund: '' }],
    })
    expect(ledger['2026-07-10'].cash).toBe(600)
  })
})

describe('auto-cover', () => {
  const bigExpense = { id: 't1', type: 'expense', name: 'Huge bill', amt: 4000, date: '2026-07-10', rule_id: '', skip: 0, fund_target: '', source_fund: '' }
  const SNAP = fullSnap('s1', '2026-06-30', 1000, { car: 500, emergency: 800, debt: 700, home: 600 })

  it('draws emergency → debt → home → car (seeded priorities) until covered', () => {
    const ledger = run({ rules: [], transactions: [bigExpense], snapshots: [SNAP.snapshot], snapshotBalances: SNAP.balances })
    const day = ledger['2026-07-10']
    // shortfall 3000: emergency 800, debt 700, home 600, car 500 → still −400
    const covers = day.events.filter(e => e.type === 'autocover').map(e => [e.fund_target, e.amt])
    expect(covers).toEqual([['emergency', 800], ['debt', 700], ['home', 600], ['car', 500]])
    expect(day.cash).toBe(-400)
    expect(day.emergency).toBe(0); expect(day.debt).toBe(0); expect(day.home).toBe(0); expect(day.car).toBe(0)
    expect(day.autocoverOwed).toEqual({ emergency: 800, debt: 700, home: 600, car: 500 })
  })

  it('repays in reverse order when cash recovers', () => {
    const income = { id: 't2', type: 'income', name: 'Bonus', amt: 5500, date: '2026-07-12', rule_id: '', skip: 0, fund_target: '', source_fund: '' }
    const ledger = run({ rules: [], transactions: [bigExpense, income], snapshots: [SNAP.snapshot], snapshotBalances: SNAP.balances })
    const day = ledger['2026-07-12']
    const repays = day.events.filter(e => e.type === 'autocoverrepay').map(e => [e.fund_target, e.amt])
    expect(repays).toEqual([['car', 500], ['home', 600], ['debt', 700], ['emergency', 800]])
    expect(day.autocoverOwed).toEqual({ emergency: 0, debt: 0, home: 0, car: 0 })
    expect(day.cash).toBe(2500)
  })

  it('respects a custom priority order from the funds table', () => {
    const customFunds = FUNDS.map(f => ({
      ...f,
      autocover_priority: { car: 1, emergency: 2, debt: null, home: null }[f.key],
    }))
    const ledger = run({ funds: customFunds, rules: [], transactions: [bigExpense], snapshots: [SNAP.snapshot], snapshotBalances: SNAP.balances })
    const day = ledger['2026-07-10']
    const covers = day.events.filter(e => e.type === 'autocover').map(e => [e.fund_target, e.amt])
    // car first (prio 1), then emergency; debt/home NULL → never drawn
    expect(covers).toEqual([['car', 500], ['emergency', 800]])
    expect(day.debt).toBe(700)
    expect(day.home).toBe(600)
    expect(day.cash).toBe(-1700)   // 3000 shortfall − 1300 covered
  })

  it('never draws from an archived fund even with a priority', () => {
    const customFunds = FUNDS.map(f => f.key === 'emergency' ? { ...f, archived: 1 } : f)
    const ledger = run({ funds: customFunds, rules: [], transactions: [bigExpense], snapshots: [SNAP.snapshot], snapshotBalances: SNAP.balances })
    const day = ledger['2026-07-10']
    expect(day.emergency).toBe(800)   // untouched
    expect(day.events.filter(e => e.type === 'autocover').map(e => e.fund_target)).toEqual(['debt', 'home', 'car'])
  })

  it('full snapshot resets outstanding auto-cover debt', () => {
    const reset = fullSnap('s2', '2026-07-15', 2000, { car: 500, emergency: 800, debt: 700, home: 600 })
    const ledger = run({
      rules: [], transactions: [bigExpense],
      snapshots: [SNAP.snapshot, reset.snapshot],
      snapshotBalances: [...SNAP.balances, ...reset.balances],
    })
    expect(ledger['2026-07-14'].autocoverOwed.emergency).toBe(800)
    expect(ledger['2026-07-15'].autocoverOwed).toEqual({ emergency: 0, debt: 0, home: 0, car: 0 })
  })

  it('a snapshot missing an active fund does NOT reset auto-cover debt', () => {
    const partialReset = {
      snapshot: { id: 's2', date: '2026-07-15', cash: 2000, cash_set: 1, cash_pinned: 1, reconciled: 0 },
      balances: [
        { snapshot_id: 's2', fund_id: 'f_car', amount: 500 },
        { snapshot_id: 's2', fund_id: 'f_emergency', amount: 800 },
        { snapshot_id: 's2', fund_id: 'f_debt', amount: 700 },
        // home missing → not a full snapshot
      ],
    }
    const ledger = run({
      rules: [], transactions: [bigExpense],
      snapshots: [SNAP.snapshot, partialReset.snapshot],
      snapshotBalances: [...SNAP.balances, ...partialReset.balances],
    })
    expect(ledger['2026-07-15'].autocoverOwed.emergency).toBe(800)
  })
})

describe('snapshots', () => {
  it('partial snapshot moves only the listed fund', () => {
    const partial = {
      snapshot: { id: 's2', date: '2026-07-10', cash: 0, cash_set: 0, cash_pinned: 0, reconciled: 0 },
      balances: [{ snapshot_id: 's2', fund_id: 'f_car', amount: 9999 }],
    }
    const ledger = run({ rules: [], snapshots: [SEED.snapshot, partial.snapshot], snapshotBalances: [...SEED.balances, ...partial.balances] })
    expect(ledger['2026-07-10'].car).toBe(9999)
    expect(ledger['2026-07-10'].cash).toBe(1200)       // untouched
    expect(ledger['2026-07-10'].emergency).toBe(1500)  // untouched
  })

  it('pinned cash overrides event math for the day', () => {
    const pinned = { id: 's2', date: '2026-07-10', cash: 777, cash_set: 1, cash_pinned: 1, reconciled: 0 }
    const spend = { id: 't1', type: 'expense', name: 'Ignored', amt: 300, date: '2026-07-10', rule_id: '', skip: 0, fund_target: '', source_fund: '' }
    const ledger = run({ rules: [], transactions: [spend], snapshots: [SEED.snapshot, pinned] })
    expect(ledger['2026-07-10'].cash).toBe(777)
  })

  it('expense with source_fund draws from the fund first, spills to cash', () => {
    const spend = { id: 't1', type: 'expense', name: 'Car repair', amt: 3000, date: '2026-07-10', rule_id: '', skip: 0, fund_target: '', source_fund: 'car' }
    const ledger = run({ rules: [], transactions: [spend] })
    expect(ledger['2026-07-10'].car).toBe(0)          // 2800 drained
    expect(ledger['2026-07-10'].cash).toBe(1000)      // 1200 − 200 spill
  })

  it('base seeding pulls each fund from its nearest anchored value when the latest snapshot is partial', () => {
    const older = fullSnap('s1', '2026-05-01', 1000, { car: 2000, emergency: 900, debt: 100, home: 50 })
    const partialNewer = {
      snapshot: { id: 's2', date: '2026-06-20', cash: 0, cash_set: 0, cash_pinned: 0, reconciled: 0 },
      balances: [{ snapshot_id: 's2', fund_id: 'f_car', amount: 5555 }],
    }
    const ledger = run({
      rules: [],
      snapshots: [older.snapshot, partialNewer.snapshot],
      snapshotBalances: [...older.balances, ...partialNewer.balances],
    })
    // Base snapshot is the 06-20 partial; other funds and cash must carry the 05-01 values
    expect(ledger['2026-07-01'].car).toBe(5555)
    expect(ledger['2026-07-01'].emergency).toBe(900)
    expect(ledger['2026-07-01'].cash).toBe(1000)
  })
})

describe('debt payments', () => {
  const pay = { id: 't1', type: 'debtpay', name: 'Parent loan', amt: 400, date: '2026-07-10', rule_id: '', skip: 0, fund_target: 'd1', source_fund: '' }

  it('deducts from the debt-keyed fund', () => {
    const snap = fullSnap('s1', '2026-06-30', 1200, { car: 0, emergency: 0, debt: 1000, home: 0 })
    const ledger = run({ rules: [], transactions: [pay], snapshots: [snap.snapshot], snapshotBalances: snap.balances })
    expect(ledger['2026-07-10'].debt).toBe(600)
    expect(ledger['2026-07-10'].cash).toBe(1200)   // cash untouched
  })

  it('falls back to cash when no debt-keyed fund exists', () => {
    const noDebtFunds = FUNDS.filter(f => f.key !== 'debt')
    const snap = {
      snapshot: { id: 's1', date: '2026-06-30', cash: 1200, cash_set: 1, cash_pinned: 0, reconciled: 0 },
      balances: [
        { snapshot_id: 's1', fund_id: 'f_car', amount: 0 },
        { snapshot_id: 's1', fund_id: 'f_emergency', amount: 0 },
        { snapshot_id: 's1', fund_id: 'f_home', amount: 0 },
      ],
    }
    const ledger = run({ funds: noDebtFunds, rules: [], transactions: [pay], snapshots: [snap.snapshot], snapshotBalances: snap.balances })
    expect(ledger['2026-07-10'].cash).toBe(800)
  })
})

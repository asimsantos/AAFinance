import { describe, it, expect } from 'vitest'
import { computeLedger } from './engine.js'

// ── Characterization fixtures: mirror the demo seed ──────────────
const SEED_SNAPSHOT = { id: 's1', date: '2026-06-30', cash: 1200, car: 2800, emergency: 1500, debt: 0, home: 0, cash_pinned: 0, partial_funds: '', reconciled: 0 }

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
  rules: SEED_RULES, transactions: [], snapshots: [SEED_SNAPSHOT],
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
})

describe('characterization: auto-cover', () => {
  const bigExpense = { id: 't1', type: 'expense', name: 'Huge bill', amt: 4000, date: '2026-07-10', rule_id: '', skip: 0, fund_target: '', source_fund: '' }
  const snap = { ...SEED_SNAPSHOT, cash: 1000, car: 500, emergency: 800, debt: 700, home: 600 }

  it('draws emergency → debt → home → car until covered', () => {
    const ledger = run({ rules: [], transactions: [bigExpense], snapshots: [snap] })
    const day = ledger['2026-07-10']
    // shortfall 3000: emergency 800, debt 700, home 600, car 500 → still −400
    const covers = day.events.filter(e => e.type === 'autocover').map(e => [e.fund_target, e.amt])
    expect(covers).toEqual([['emergency', 800], ['debt', 700], ['home', 600], ['car', 500]])
    expect(day.cash).toBe(-400)
    expect(day.emergency).toBe(0); expect(day.debt).toBe(0); expect(day.home).toBe(0); expect(day.car).toBe(0)
    expect(day.autocoverOwed).toEqual({ emergency: 800, debt: 700, home: 600, car: 500 })
  })

  it('repays in reverse order (car → home → debt → emergency) when cash recovers', () => {
    const income = { id: 't2', type: 'income', name: 'Bonus', amt: 5500, date: '2026-07-12', rule_id: '', skip: 0, fund_target: '', source_fund: '' }
    const ledger = run({ rules: [], transactions: [bigExpense, income], snapshots: [snap] })
    const day = ledger['2026-07-12']
    const repays = day.events.filter(e => e.type === 'autocoverrepay').map(e => [e.fund_target, e.amt])
    // 5500 income onto −400 cash → 5100 available: car 500, home 600, debt 700, emergency 800
    expect(repays).toEqual([['car', 500], ['home', 600], ['debt', 700], ['emergency', 800]])
    expect(day.autocoverOwed).toEqual({ emergency: 0, debt: 0, home: 0, car: 0 })
    expect(day.cash).toBe(2500)   // 5100 − 2600 repaid
  })

  it('full snapshot resets outstanding auto-cover debt', () => {
    const reset = { id: 's2', date: '2026-07-15', cash: 2000, car: 500, emergency: 800, debt: 700, home: 600, cash_pinned: 0, partial_funds: '', reconciled: 0 }
    const ledger = run({ rules: [], transactions: [bigExpense], snapshots: [snap, reset] })
    expect(ledger['2026-07-14'].autocoverOwed.emergency).toBe(800)
    expect(ledger['2026-07-15'].autocoverOwed).toEqual({ emergency: 0, debt: 0, home: 0, car: 0 })
  })
})

describe('characterization: snapshots', () => {
  it('partial snapshot moves only the listed fund', () => {
    const partial = { id: 's2', date: '2026-07-10', cash: 0, car: 9999, emergency: 0, debt: 0, home: 0, cash_pinned: 0, partial_funds: 'car', reconciled: 0 }
    const ledger = run({ rules: [], snapshots: [SEED_SNAPSHOT, partial] })
    expect(ledger['2026-07-10'].car).toBe(9999)
    expect(ledger['2026-07-10'].cash).toBe(1200)       // untouched
    expect(ledger['2026-07-10'].emergency).toBe(1500)  // untouched
  })

  it('pinned cash overrides event math for the day', () => {
    const pinned = { id: 's2', date: '2026-07-10', cash: 777, car: 0, emergency: 0, debt: 0, home: 0, cash_pinned: 1, partial_funds: 'cash', reconciled: 0 }
    const spend = { id: 't1', type: 'expense', name: 'Ignored', amt: 300, date: '2026-07-10', rule_id: '', skip: 0, fund_target: '', source_fund: '' }
    const ledger = run({ rules: [], transactions: [spend], snapshots: [SEED_SNAPSHOT, pinned] })
    expect(ledger['2026-07-10'].cash).toBe(777)
  })

  it('expense with source_fund draws from the fund first, spills to cash', () => {
    const spend = { id: 't1', type: 'expense', name: 'Car repair', amt: 3000, date: '2026-07-10', rule_id: '', skip: 0, fund_target: '', source_fund: 'car' }
    const ledger = run({ rules: [], transactions: [spend] })
    expect(ledger['2026-07-10'].car).toBe(0)          // 2800 drained
    expect(ledger['2026-07-10'].cash).toBe(1000)      // 1200 − 200 spill
  })
})

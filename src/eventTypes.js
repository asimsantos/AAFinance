// One source of truth for how each ledger event type renders:
// sign, hex color (inline styles), text/dot utility classes.
export const EVENT_TYPES = {
  income:         { label: 'Income',   sign: '+', color: '#065F46', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  expense:        { label: 'Expense',  sign: '-', color: '#B91C1C', text: 'text-red-600',     dot: 'bg-red-400' },
  fund:           { label: 'Fund',     sign: '-', color: '#1D4ED8', text: 'text-blue-700',    dot: 'bg-blue-400' },
  lend:           { label: 'Lend',     sign: '-', color: '#6D28D9', text: 'text-violet-700',  dot: 'bg-violet-400' },
  borrow:         { label: 'Borrow',   sign: '+', color: '#9A3412', text: 'text-orange-700',  dot: 'bg-orange-500' },
  autocover:      { label: 'Cover',    sign: '-', color: '#92400E', text: 'text-amber-700',   dot: 'bg-amber-500' },
  autocoverrepay: { label: 'Repay',    sign: '+', color: '#0F766E', text: 'text-teal-700',    dot: 'bg-teal-500' },
  debtpay:        { label: 'Debt pay', sign: '-', color: '#1E40AF', text: 'text-blue-700',    dot: 'bg-blue-600' },
}

// Calendar legend derives its swatches from the same map so a recolor
// can't leave the legend advertising stale colors.
export const LEGEND = [
  { color: EVENT_TYPES.income.dot,    label: 'In' },
  { color: EVENT_TYPES.expense.dot,   label: 'Out' },
  { color: EVENT_TYPES.fund.dot,      label: 'Transfer' },
  { color: EVENT_TYPES.lend.dot,      label: 'Lend' },
  { color: EVENT_TYPES.autocover.dot, label: 'Auto-cover' },
  { color: 'bg-teal-600',             label: 'Reconciled' },
]

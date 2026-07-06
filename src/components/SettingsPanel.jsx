import React, { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import { api } from '../api'

const FUND_LABEL = { car: 'Car', emergency: 'Emergency', debt: 'Debt Fund', home: 'Tuition reserve' }

function fmt(n) {
  const abs = Math.abs(Math.round(n))
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-AU')
}

const TYPE_COLOR = {
  income:  { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', dot: '#059669' },
  expense: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', dot: '#EF4444' },
  fund:    { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', dot: '#3B82F6' },
}

const RECUR_LABEL = {
  once: 'One time', daily: 'Daily', weekly: 'Weekly',
  fortnightly: 'Fortnightly', monthly: 'Monthly', yearly: 'Yearly',
}

const inp = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 bg-white'

// ── Rule row ──────────────────────────────────────────────────────
function RuleRow({ rule, onEdit, onDelete }) {
  const cfg     = TYPE_COLOR[rule.type] || TYPE_COLOR.expense
  const today   = dayjs().format('YYYY-MM-DD')
  const isEnded = rule.end_date && rule.end_date < today

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer group transition-all hover:shadow-sm ${isEnded ? 'opacity-40' : ''}`}
      style={{ background: cfg.bg, borderColor: cfg.border }}
      onClick={() => onEdit(rule)}>
      <span className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: isEnded ? '#9CA3AF' : cfg.dot }} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-800 truncate">
          {rule.name}
          {rule.type === 'fund' && rule.fund_target && <span className="text-[11px] text-slate-500 ml-1">→ {FUND_LABEL[rule.fund_target] || rule.fund_target}</span>}
          {rule.type === 'expense' && rule.source_fund && <span className="text-[10px] text-blue-500 ml-1">from {FUND_LABEL[rule.source_fund] || rule.source_fund}</span>}
          {rule.person && <span className="text-[10px] text-slate-400 ml-1">({rule.person})</span>}
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          {RECUR_LABEL[rule.recur] || rule.recur} · from {rule.start_date}
          {rule.end_date  ? ` · ends ${rule.end_date}` : ''}
          {isEnded        ? ' · ended' : ''}
        </p>
      </div>
      <span className="text-[13px] font-bold flex-shrink-0" style={{ color: cfg.text }}>
        ${Math.round(rule.amt).toLocaleString()}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onDelete(rule.id) }}
        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-sm px-1 transition-opacity flex-shrink-0">
        ✕
      </button>
    </div>
  )
}

// ── Rule form ─────────────────────────────────────────────────────
function RuleForm({ rule, onSave, onCancel }) {
  const [f, setF] = useState({
    id:          rule.id          || '',
    type:        rule.type        || 'expense',
    name:        rule.name        || '',
    amt:         rule.amt         ? String(rule.amt) : '',
    start_date:  rule.start_date  || dayjs().format('YYYY-MM-DD'),
    end_date:    rule.end_date    || '',
    recur:       rule.recur       || 'monthly',
    fund_target: rule.fund_target || 'car',
    source_fund: rule.source_fund || '',
    person:      rule.person      || '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700">{f.id ? 'Edit rule' : 'New rule'}</span>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
      </div>

      <div className="flex gap-1.5">
        {['income', 'expense', 'fund'].map(t => {
          const active = f.type === t
          const bg = { income: '#065F46', expense: '#DC2626', fund: '#1D4ED8' }[t]
          return (
            <button key={t} onClick={() => set('type', t)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold capitalize transition-colors
                ${active ? 'text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              style={active ? { background: bg } : {}}>
              {t}
            </button>
          )
        })}
      </div>

      {f.type === 'fund' && (
        <select className={inp} value={f.fund_target} onChange={e => set('fund_target', e.target.value)}>
          {Object.entries(FUND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      )}
      {f.type === 'expense' && (
        <select className={inp} value={f.source_fund} onChange={e => set('source_fund', e.target.value)}>
          <option value="">Deduct from cash (default)</option>
          {Object.entries(FUND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>Deduct from {l} first</option>
          ))}
        </select>
      )}
      {f.type === 'income' && (
        <input className={inp} value={f.person} onChange={e => set('person', e.target.value)}
          placeholder="Person / source" />
      )}

      <input className={inp} value={f.name} onChange={e => set('name', e.target.value)}
        placeholder="Name / description" />

      <div className="flex gap-2">
        <input className={inp} type="number" value={f.amt} onChange={e => set('amt', e.target.value)}
          placeholder="Amount $" />
        <select className={inp} value={f.recur} onChange={e => set('recur', e.target.value)}>
          {Object.entries(RECUR_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-1">Start date</p>
          <input className={inp} type="date" value={f.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        <div className="flex-1">
          <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-1">End date (optional)</p>
          <input className={inp} type="date" value={f.end_date} onChange={e => set('end_date', e.target.value)} />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 py-2 rounded-lg text-sm border border-slate-200 text-slate-500 hover:bg-slate-50">
          Cancel
        </button>
        <button onClick={() => onSave({ ...f, amt: parseFloat(f.amt) || 0, fund_target: f.type === 'fund' ? (f.fund_target || 'car') : '', source_fund: f.type === 'expense' ? (f.source_fund || '') : '' })}
          className="flex-1 py-2 rounded-lg text-sm font-bold text-white"
          style={{ background: '#065F46' }}>
          Save rule
        </button>
      </div>
    </div>
  )
}

// ── Lend row ──────────────────────────────────────────────────────
function LendRow({ lend, onEdit, onDelete }) {
  const today  = dayjs().format('YYYY-MM-DD')
  const overdue = lend.return_date && lend.return_date < today && !lend.returned
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border border-violet-100 bg-violet-50 cursor-pointer group hover:shadow-sm transition-all ${lend.returned ? 'opacity-40' : ''}`}
      onClick={() => onEdit(lend)}>
      <span className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-800 truncate">
          {lend.name}
          {lend.returned && <span className="ml-1 text-[10px] text-emerald-600">✓ returned</span>}
          {overdue       && <span className="ml-1 text-[10px] text-red-600">⚠ overdue</span>}
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Given {lend.given_date}{lend.return_date ? ` · due ${lend.return_date}` : ''}
        </p>
      </div>
      <span className="text-[13px] font-bold text-violet-700 flex-shrink-0">
        ${Math.round(lend.amt).toLocaleString()}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onDelete(lend.id) }}
        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-sm px-1 transition-opacity flex-shrink-0">
        ✕
      </button>
    </div>
  )
}

// ── Lend form ─────────────────────────────────────────────────────
function LendForm({ lend, onSave, onCancel }) {
  const [f, setF] = useState({
    id:          lend.id          || '',          // ← fix
    name:        lend.name        || '',
    amt:         lend.amt         ? String(lend.amt) : '',
    given_date:  lend.given_date  || dayjs().format('YYYY-MM-DD'),
    return_date: lend.return_date || '',
    note:        lend.note        || '',
    returned:    !!lend.returned,
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700">{f.id ? 'Edit lend' : 'New lend'}</span>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
      </div>
      <input className={inp} value={f.name} onChange={e => set('name', e.target.value)} placeholder="Name / purpose" />
      <div className="flex gap-2">
        <input className={inp} type="number" value={f.amt} onChange={e => set('amt', e.target.value)} placeholder="Amount $" />
        <input className={inp} type="date" value={f.given_date} onChange={e => set('given_date', e.target.value)} />
      </div>
      <input className={inp} type="date" value={f.return_date} onChange={e => set('return_date', e.target.value)}
        placeholder="Expected return date (optional)" />
      {f.id && (
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={f.returned} onChange={e => set('returned', e.target.checked)}
            className="accent-emerald-700" />
          Mark as returned
        </label>
      )}
      <div className="flex gap-2">
        <button onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50">
          Cancel
        </button>
        <button onClick={() => onSave({ ...f, amt: parseFloat(f.amt) || 0 })}
          className="flex-1 py-2 rounded-lg text-sm font-bold text-white"
          style={{ background: '#065F46' }}>
          Save
        </button>
      </div>
    </div>
  )
}

// ── Debt row ──────────────────────────────────────────────────────
function DebtRow({ debt, onPay, onEdit, onDelete }) {
  const today     = dayjs().format('YYYY-MM-DD')
  const remaining = Math.max(0, debt.amt - (debt.paid_amt || 0))
  const overdue   = debt.due_date && debt.due_date < today && !debt.repaid
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer group hover:shadow-sm transition-all
        ${debt.repaid ? 'opacity-40' : overdue ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-100'}`}
      onClick={() => onPay(debt)}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${overdue ? 'bg-red-400' : 'bg-orange-400'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-800 truncate">
          {debt.name}
          {debt.repaid && <span className="ml-1 text-[10px] text-emerald-600">✓ repaid</span>}
          {overdue     && <span className="ml-1 text-[10px] text-red-600">⚠ overdue</span>}
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Borrowed {debt.borrowed_date}{debt.due_date ? ` · due ${debt.due_date}` : ''}
          {debt.paid_amt > 0 ? ` · ${fmt(debt.paid_amt)} paid` : ''}
        </p>
      </div>
      <span className={`text-[13px] font-bold flex-shrink-0 ${overdue ? 'text-red-700' : 'text-orange-700'}`}>
        {fmt(remaining)}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onEdit(debt) }}
        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 text-sm px-1 transition-opacity flex-shrink-0"
        title="Edit">
        ✏
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDelete(debt.id) }}
        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-sm px-1 transition-opacity flex-shrink-0"
        title="Delete">
        ✕
      </button>
    </div>
  )
}

// ── Debt edit form ────────────────────────────────────────────────
function DebtForm({ debt, onSave, onCancel }) {
  const [f, setF] = useState({
    id:            debt.id            || '',       // ← fix
    name:          debt.name          || '',
    amt:           debt.amt           ? String(debt.amt) : '',
    borrowed_date: debt.borrowed_date || dayjs().format('YYYY-MM-DD'),
    due_date:      debt.due_date      || '',
    note:          debt.note          || '',
    repaid:        !!debt.repaid,
    paid_amt:      debt.paid_amt      || 0,
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700">{f.id ? 'Edit borrow' : 'New borrow'}</span>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
      </div>
      <input className={inp} value={f.name} onChange={e => set('name', e.target.value)}
        placeholder="Lender / source" autoFocus />
      <div className="flex gap-2">
        <input className={inp} type="number" value={f.amt} onChange={e => set('amt', e.target.value)}
          placeholder="Amount $" />
        <input className={inp} type="date" value={f.borrowed_date} onChange={e => set('borrowed_date', e.target.value)} />
      </div>
      <div>
        <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-1">Due date (optional)</p>
        <input className={inp} type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} />
      </div>
      {f.id && (
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={f.repaid} onChange={e => set('repaid', e.target.checked)}
            className="accent-emerald-700" />
          Mark as fully repaid
        </label>
      )}
      <div className="flex gap-2">
        <button onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50">
          Cancel
        </button>
        <button onClick={() => onSave({ ...f, amt: parseFloat(f.amt) || 0 })}
          className="flex-1 py-2 rounded-lg text-sm font-bold text-white"
          style={{ background: '#065F46' }}>
          Save
        </button>
      </div>
    </div>
  )
}

// ── Debt pay form ─────────────────────────────────────────────────
function DebtPayForm({ debt, debtFundBalance, onPay, onEditInstead, onCancel }) {
  const remaining = Math.max(0, debt.amt - (debt.paid_amt || 0))
  const [amount,  setAmount]  = useState(String(remaining))
  const [date,    setDate]    = useState(dayjs().format('YYYY-MM-DD'))
  const [saving,  setSaving]  = useState(false)

  const payAmt     = parseFloat(amount) || 0
  const afterFund  = debtFundBalance - payAmt
  const willGoNeg  = afterFund < 0

  const pay = async () => {
    if (payAmt <= 0) return
    setSaving(true)
    try { await onPay(debt.id, payAmt, date) } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700">Pay – {debt.name}</span>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
      </div>

      {/* Balances summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-orange-50 rounded-lg px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-orange-600">Owed</p>
          <p className="text-[16px] font-extrabold text-orange-800">{fmt(remaining)}</p>
          {debt.paid_amt > 0 && (
            <p className="text-[9px] text-orange-500">{fmt(debt.paid_amt)} paid so far</p>
          )}
        </div>
        <div className={`rounded-lg px-3 py-2 ${debtFundBalance < 0 ? 'bg-red-50' : 'bg-blue-50'}`}>
          <p className={`text-[9px] font-bold uppercase tracking-widest ${debtFundBalance < 0 ? 'text-red-600' : 'text-blue-600'}`}>Debt fund</p>
          <p className={`text-[16px] font-extrabold ${debtFundBalance < 0 ? 'text-red-800' : 'text-blue-800'}`}>{fmt(debtFundBalance)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <input className={inp} type="number" value={amount}
          onChange={e => setAmount(e.target.value)} placeholder="Amount to pay $" />
        <input className={inp} type="date" value={date}
          onChange={e => setDate(e.target.value)} />
      </div>

      {/* After-payment preview */}
      {payAmt > 0 && (
        <div className={`rounded-lg px-3 py-2 text-[11px] ${willGoNeg ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
          <span className={willGoNeg ? 'text-amber-700' : 'text-emerald-700'}>
            {willGoNeg
              ? `⚠ Debt fund will go ${fmt(afterFund)} — that's fine, it can be negative`
              : `Debt fund after payment: ${fmt(afterFund)}`}
          </span>
          {payAmt >= remaining && (
            <span className="block text-emerald-700 mt-0.5">✓ This will fully repay {debt.name}</span>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-500 hover:bg-slate-50">
          Cancel
        </button>
        <button onClick={onEditInstead}
          className="px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50">
          Edit details
        </button>
        <button onClick={pay} disabled={saving || payAmt <= 0}
          className="flex-1 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
          style={{ background: '#1E40AF' }}>
          {saving ? 'Paying…' : 'Pay from debt fund'}
        </button>
      </div>
    </div>
  )
}

// ── Main settings panel ───────────────────────────────────────────
export default function SettingsPanel({ onUpdate, debtFundBalance = 0 }) {
  const [tab,         setTab]         = useState('income')
  const [rules,       setRules]       = useState([])
  const [lends,       setLends]       = useState([])
  const [debts,       setDebts]       = useState([])
  const [editRule,    setEditRule]    = useState(null)
  const [editLend,    setEditLend]    = useState(null)
  const [editDebt,    setEditDebt]    = useState(null)
  const [payDebtItem, setPayDebtItem] = useState(null)

  const load = async () => {
    const [r, l, d] = await Promise.all([api.getRules(), api.getLends(), api.getDebts()])
    setRules(r); setLends(l); setDebts(d)
  }
  useEffect(() => { load() }, [])

  const saveRule = async f => {
    if (f.id) await api.updateRule(f.id, f)
    else      await api.addRule(f)
    setEditRule(null); load(); onUpdate()
  }
  const deleteRule = async id => {
    if (window.confirm('Delete this rule?')) { await api.deleteRule(id); load(); onUpdate() }
  }

  const saveLend = async f => {
    if (f.id) await api.updateLend(f.id, f)
    else      await api.addLend(f)
    setEditLend(null); load(); onUpdate()
  }
  const deleteLend = async id => {
    if (window.confirm('Delete this lend?')) { await api.deleteLend(id); load(); onUpdate() }
  }

  const saveDebt = async f => {
    if (f.id) {
      await api.updateDebt(f.id, { ...f, repaid: f.repaid ? 1 : 0 })
    } else {
      await api.addDebt({ name: f.name, amt: f.amt, borrowed_date: f.borrowed_date, due_date: f.due_date || '', note: f.note || '' })
      await api.addTransaction({ type: 'borrow', name: f.name, amt: f.amt, date: f.borrowed_date, fund_target: '' })
    }
    setEditDebt(null); load(); onUpdate()
  }
  const deleteDebt = async id => {
    if (window.confirm('Delete this borrow record?')) { await api.deleteDebt(id); load(); onUpdate() }
  }
  const handlePayDebt = async (id, amount, date) => {
    await api.payDebt(id, amount, date)
    setPayDebtItem(null); load(); onUpdate()
  }

  const TABS = [
    { key: 'income',  label: 'Income' },
    { key: 'expense', label: 'Expenses' },
    { key: 'fund',    label: 'Transfers' },
    { key: 'lend',    label: 'Lends' },
    { key: 'borrow',  label: 'Borrows' },
  ]

  const resetEdits = () => { setEditRule(null); setEditLend(null); setEditDebt(null); setPayDebtItem(null) }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
        <p className="font-bold text-slate-800 text-sm">Plan</p>
        <p className="text-[10px] text-slate-400 mt-0.5">Click any row to edit · Rules drive all projections</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 flex-shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => { setTab(t.key); resetEdits() }}
            className={`flex-1 min-w-[58px] py-2 text-[10px] font-bold transition-colors whitespace-nowrap
              ${tab === t.key
                ? 'border-b-2 border-emerald-700 text-emerald-800 bg-emerald-50'
                : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">

        {/* ── Income / Expense / Fund rule tabs ── */}
        {(tab === 'income' || tab === 'expense' || tab === 'fund') && (
          <>
            {editRule ? (
              <RuleForm rule={editRule} onSave={saveRule} onCancel={() => setEditRule(null)} />
            ) : (
              <>
                {rules.filter(r => r.type === tab).map(r => (
                  <RuleRow key={r.id} rule={r} onEdit={setEditRule} onDelete={deleteRule} />
                ))}
                {rules.filter(r => r.type === tab).length === 0 && (
                  <p className="text-center text-slate-400 text-xs py-6">No {tab} rules yet</p>
                )}
                <button
                  onClick={() => setEditRule({
                    type: tab, name: '', amt: '',
                    start_date: dayjs().format('YYYY-MM-DD'),
                    end_date: '', recur: 'monthly', fund_target: tab === 'fund' ? 'car' : '', person: '',
                  })}
                  className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-xs text-slate-400 hover:bg-slate-50 hover:border-slate-400 transition-colors">
                  + Add {tab === 'fund' ? 'transfer' : tab} rule
                </button>
              </>
            )}
          </>
        )}

        {/* ── Lends tab ── */}
        {tab === 'lend' && (
          <>
            {editLend ? (
              <LendForm lend={editLend} onSave={saveLend} onCancel={() => setEditLend(null)} />
            ) : (
              <>
                {lends.filter(l => !l.returned).length > 0 && (
                  <div className="flex justify-between items-center px-1 pb-1">
                    <span className="text-xs text-slate-500">Outstanding</span>
                    <span className="text-xs font-bold text-violet-700">
                      {fmt(lends.filter(l => !l.returned).reduce((s, l) => s + l.amt, 0))}
                    </span>
                  </div>
                )}
                {lends.map(l => (
                  <LendRow key={l.id} lend={l} onEdit={setEditLend} onDelete={deleteLend} />
                ))}
                {lends.length === 0 && (
                  <p className="text-center text-slate-400 text-xs py-6">No lend entries yet</p>
                )}
                <button
                  onClick={() => setEditLend({ name: '', amt: '', given_date: dayjs().format('YYYY-MM-DD'), return_date: '', note: '', returned: false })}
                  className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-xs text-slate-400 hover:bg-slate-50 transition-colors">
                  + Add lend entry
                </button>
              </>
            )}
          </>
        )}

        {/* ── Borrows tab ── */}
        {tab === 'borrow' && (
          <>
            {editDebt ? (
              <DebtForm debt={editDebt} onSave={saveDebt} onCancel={() => setEditDebt(null)} />
            ) : payDebtItem ? (
              <DebtPayForm
                debt={payDebtItem}
                debtFundBalance={debtFundBalance}
                onPay={handlePayDebt}
                onEditInstead={() => { setEditDebt(payDebtItem); setPayDebtItem(null) }}
                onCancel={() => setPayDebtItem(null)} />
            ) : (
              <>
                {/* Balances summary header */}
                <div className="grid grid-cols-2 gap-2 pb-1">
                  <div className="bg-orange-50 rounded-lg px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-orange-600">Total owed</p>
                    <p className="text-[15px] font-extrabold text-orange-800">
                      {fmt(debts.filter(d => !d.repaid).reduce((s, d) => s + Math.max(0, d.amt - (d.paid_amt || 0)), 0))}
                    </p>
                  </div>
                  <div className={`rounded-lg px-3 py-2 ${debtFundBalance < 0 ? 'bg-red-50' : 'bg-blue-50'}`}>
                    <p className={`text-[9px] font-bold uppercase tracking-widest ${debtFundBalance < 0 ? 'text-red-600' : 'text-blue-600'}`}>Debt fund</p>
                    <p className={`text-[15px] font-extrabold ${debtFundBalance < 0 ? 'text-red-800' : 'text-blue-800'}`}>{fmt(debtFundBalance)}</p>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 px-0.5">Tap a record to pay from debt fund · ✏ to edit</p>

                {debts.map(d => (
                  <DebtRow key={d.id} debt={d}
                    onPay={d.repaid ? () => {} : setPayDebtItem}
                    onEdit={setEditDebt}
                    onDelete={deleteDebt} />
                ))}
                {debts.length === 0 && (
                  <p className="text-center text-slate-400 text-xs py-6">No borrow entries yet</p>
                )}
                <button
                  onClick={() => setEditDebt({ name: '', amt: '', borrowed_date: dayjs().format('YYYY-MM-DD'), due_date: '', note: '', repaid: false })}
                  className="w-full py-2.5 rounded-xl border border-dashed border-orange-200 text-xs text-orange-400 hover:bg-orange-50 transition-colors">
                  + Add borrow entry
                </button>
              </>
            )}
          </>
        )}

      </div>
    </div>
  )
}

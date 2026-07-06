import React, { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import { api } from '../api'

const TYPE_CFG = {
  income:        { label: 'Income',   sign: '+', color: '#065F46', dot: 'bg-emerald-500' },
  expense:       { label: 'Expense',  sign: '-', color: '#B91C1C', dot: 'bg-red-400' },
  fund:          { label: 'Fund',     sign: '-', color: '#1D4ED8', dot: 'bg-blue-400' },
  lend:          { label: 'Lend',     sign: '-', color: '#6D28D9', dot: 'bg-violet-400' },
  borrow:        { label: 'Borrow',   sign: '+', color: '#9A3412', dot: 'bg-orange-500' },
  autocover:     { label: 'Cover',    sign: '-', color: '#92400E', dot: 'bg-amber-500' },
  autocoverrepay:{ label: 'Repay',    sign: '+', color: '#0F766E', dot: 'bg-teal-500' },
  debtpay:       { label: 'Debt pay', sign: '-', color: '#1E40AF', dot: 'bg-blue-600' },
}

const FUND_OPTIONS = [
  { value: 'car',       label: 'Car' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'debt',      label: 'Debt' },
  { value: 'home',      label: 'Tuition reserve' },
]

const FUND_LABEL = { car: 'Car', emergency: 'Emergency', debt: 'Debt', home: 'Tuition reserve' }
const RECUR_OPTIONS = [
  { value: 'once',        label: 'One time' },
  { value: 'weekly',      label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly',     label: 'Monthly' },
  { value: 'yearly',      label: 'Yearly' },
]
const SCOPE_OPTIONS = [
  { value: 'once', label: 'This occurrence only' },
  { value: 'from', label: 'From this date forward' },
  { value: 'all',  label: 'All occurrences' },
]

function fmt(n) {
  return '$' + Math.abs(Math.round(n)).toLocaleString('en-AU')
}

const inp = 'w-full px-2.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 bg-white'

// ── Transaction create / edit form ────────────────────────────────
function TxForm({ dateStr, editEvent, editRuleId, onSaved, onCancel }) {
  const isEdit     = !!editEvent
  const isRuleEdit = isEdit && editEvent.source === 'rule'

  const [type,       setType]       = useState(editEvent?.type        || 'expense')
  const [name,       setName]       = useState(editEvent?.name        || '')
  const [amt,        setAmt]        = useState(editEvent?.amt         ? String(editEvent.amt) : '')
  const [date,       setDate]       = useState(dateStr                || dayjs().format('YYYY-MM-DD'))
  const [recur,      setRecur]      = useState(editEvent?.recur       || 'once')
  const [endDate,    setEndDate]    = useState(editEvent?.end_date    || '')
  const [fundTarget, setFundTarget] = useState(editEvent?.fund_target || 'car')
  const [sourceFund, setSourceFund] = useState(editEvent?.source_fund || '')
  const [returnDate] = useState(editEvent?.return_date || '')
  const [scope,      setScope]      = useState('once')
  const [saving,     setSaving]     = useState(false)

  const save = async () => {
    if (!name.trim() || !amt || !date) return
    setSaving(true)
    const a = parseFloat(amt)
    try {
      const sf = type === 'expense' ? (sourceFund || '') : ''
      if (isRuleEdit) {
        if (scope === 'all') {
          await api.updateRule(editRuleId, {
            name, amt: a,
            start_date:  editEvent.date || dateStr,
            end_date:    endDate || '',
            recur:       editEvent.recur || 'monthly',
            fund_target: type === 'fund' ? (fundTarget || '') : '',
            source_fund: sf,
            person:      '',
          })
        } else if (scope === 'from') {
          const prev = dayjs(dateStr).subtract(1, 'day').format('YYYY-MM-DD')
          await api.updateRule(editRuleId, {
            name:        editEvent.name,
            amt:         editEvent.amt,
            start_date:  editEvent.date || editEvent.start_date || dateStr,
            end_date:    prev,
            recur:       editEvent.recur,
            fund_target: editEvent.type === 'fund' ? (editEvent.fund_target || '') : '',
            source_fund: editEvent.source_fund || '',
            person:      '',
          })
          await api.addRule({
            type, name, amt: a,
            start_date:  dateStr,
            end_date:    endDate || '',
            recur:       editEvent.recur || 'monthly',
            fund_target: type === 'fund' ? (fundTarget || '') : '',
            source_fund: sf,
            person:      '',
          })
        } else {
          await api.addTransaction({
            type, name, amt: a, date: dateStr,
            rule_id:     editRuleId,
            fund_target: type === 'fund' ? (fundTarget || '') : '',
            source_fund: sf,
            return_date: returnDate || '',
          })
        }
      } else if (isEdit && editEvent.source === 'tx') {
        await api.updateTransaction(editEvent.id, {
          type, name, amt: a, date,
          fund_target: type === 'fund' ? (fundTarget || '') : '',
          source_fund: sf,
          return_date: returnDate || '',
        })
      } else {
        if (recur === 'once') {
          await api.addTransaction({
            type, name, amt: a, date,
            fund_target: type === 'fund' ? (fundTarget || '') : '',
            source_fund: sf,
          })
        } else {
          await api.addRule({
            type, name, amt: a,
            start_date:  date,
            end_date:    endDate || '',
            recur,
            fund_target: type === 'fund' ? (fundTarget || '') : '',
            source_fund: sf,
            person:      '',
          })
        }
      }
      onSaved()
    } finally { setSaving(false) }
  }

  const del = async () => {
    if (!window.confirm('Delete this transaction?')) return
    if (isRuleEdit) {
      if (scope === 'all') await api.deleteRule(editRuleId)
      else await api.addTransaction({ type: editEvent.type, name: editEvent.name, amt: 0, date: dateStr, rule_id: editRuleId, skip: true })
    } else {
      await api.deleteTransaction(editEvent.id)
    }
    onSaved()
  }

  const typeColor = {
    income: '#065F46', expense: '#DC2626', fund: '#1D4ED8',
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">

      {/* Type pills */}
      <div className="flex gap-1.5">
        {[
          { key: 'income',  label: 'In' },
          { key: 'expense', label: 'Out' },
          { key: 'fund',    label: 'Transfer' },
        ].map(({ key, label }) => {
          const active = type === key
          return (
            <button key={key} onClick={() => setType(key)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors
                ${active ? 'text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}
              style={active ? { background: typeColor[key] } : {}}>
              {label}
            </button>
          )
        })}
      </div>

      {type === 'fund' && (
        <select className={inp} value={fundTarget} onChange={e => setFundTarget(e.target.value)}>
          {FUND_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      )}

      {type === 'expense' && (
        <select className={inp} value={sourceFund} onChange={e => setSourceFund(e.target.value)}>
          <option value="">Deduct from cash (default)</option>
          {FUND_OPTIONS.map(f => <option key={f.value} value={f.value}>Deduct from {f.label} first</option>)}
        </select>
      )}

      <input className={inp} placeholder={type === 'borrow' ? 'Lender / source' : 'Description'} value={name}
        onChange={e => setName(e.target.value)} autoFocus />

      <div className="flex gap-2">
        <input className={inp} type="number" placeholder="Amount $" value={amt}
          onChange={e => setAmt(e.target.value)} />
        <input className={inp} type="date" value={date}
          onChange={e => setDate(e.target.value)} />
      </div>

      {!isEdit && (
        <select className={inp} value={recur} onChange={e => setRecur(e.target.value)}>
          {RECUR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {!isEdit && recur !== 'once' && (
        <input className={inp} type="date" placeholder="End date (optional)" value={endDate}
          onChange={e => setEndDate(e.target.value)} />
      )}


      {isRuleEdit && (
        <div className="space-y-2 pt-1">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Edit scope</p>
          {SCOPE_OPTIONS.map(o => (
            <label key={o.value} className="flex items-center gap-2.5 cursor-pointer text-[13px] text-slate-700">
              <input type="radio" name="scope" value={o.value} checked={scope === o.value}
                onChange={e => setScope(e.target.value)} className="accent-emerald-700" />
              {o.label}
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2 sticky bottom-0 bg-slate-50 pb-1">
        <button onClick={onCancel}
          className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50">
          Cancel
        </button>
        {isEdit && (
          <button onClick={del}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-red-600 bg-red-50 border border-red-100 hover:bg-red-100">
            Delete
          </button>
        )}
        <button onClick={save} disabled={saving}
          className="flex-1 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50 transition-opacity"
          style={{ background: '#065F46' }}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add'}
        </button>
      </div>
    </div>
  )
}

// ── One-line quick add: amount + name, defaults Out / selected day ─
function QuickAdd({ dateStr, onSaved }) {
  const [amt,    setAmt]    = useState('')
  const [name,   setName]   = useState('')
  const [saving, setSaving] = useState(false)

  const add = async () => {
    const a = parseFloat(amt)
    if (!a || !name.trim()) return
    setSaving(true)
    try {
      await api.addTransaction({ type: 'expense', name: name.trim(), amt: a, date: dateStr, fund_target: '' })
      setAmt(''); setName(''); onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div className="flex gap-1.5">
      <input className="w-24 flex-shrink-0 px-2.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 bg-white"
        type="number" inputMode="decimal" placeholder="$"
        value={amt} onChange={e => setAmt(e.target.value)} />
      <input className={inp} placeholder="Quick add (Out)" value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add() }} />
      <button onClick={add} disabled={saving || !parseFloat(amt) || !name.trim()}
        className="px-3 rounded-lg text-xs font-bold text-white disabled:opacity-40 flex-shrink-0"
        style={{ background: '#DC2626' }}>
        Add
      </button>
    </div>
  )
}

// ── Main side panel ───────────────────────────────────────────────
export default function SidePanel({ dateStr, ledger, onUpdate, isSheet = false, onFormOpenChange }) {
  const [adding,    setAdding]    = useState(false)
  const [editEvent, setEditEvent] = useState(null)

  const formOpen = adding || !!editEvent
  useEffect(() => { onFormOpenChange?.(formOpen) }, [formOpen])

  if (!dateStr) return (
    <div className="flex items-center justify-center h-full text-sm text-slate-400 p-6 text-center">
      Select a day on the calendar
    </div>
  )

  const today    = dayjs().format('YYYY-MM-DD')
  const isFuture = dateStr > today
  const ld       = ledger[dateStr] || {}
  const events   = ld.events || []
  const d        = dayjs(dateStr)

  const handleSaved  = () => { setAdding(false); setEditEvent(null); onUpdate() }
  const handleEdit   = ev  => { setAdding(false); setEditEvent(ev) }
  const handleCancel = ()  => { setAdding(false); setEditEvent(null) }

  const openCash    = ld.openCash ?? null
  const dayIn       = ld.dayIn       || 0
  const daySpend    = ld.daySpend    || 0
  const dayTransfer = ld.dayTransfer || 0
  const hasData     = openCash !== null

  // Compute close from events so it's always mathematically consistent,
  // regardless of cash_pinned overriding ld.cash for the carry-forward.
  const netFromEvents = events.reduce((s, ev) => {
    if (ev.type === 'income' || ev.type === 'borrow' || ev.type === 'autocover')    return s + ev.amt
    if (ev.type === 'expense' || ev.type === 'lend' || ev.type === 'fund' || ev.type === 'autocoverrepay') return s - ev.amt
    return s
  }, 0)
  const displayClose   = openCash !== null ? openCash + netFromEvents : null
  const pinnedClose    = ld.cash_pinned ? (ld.cash ?? null) : null   // actual carry-forward when different
  const showPinnedNote = pinnedClose !== null && Math.round(pinnedClose) !== Math.round(displayClose ?? 0)

  return (
    <div className="flex flex-col h-full">

      {/* Date header */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
        {!isSheet && <p className="font-bold text-slate-800 text-sm leading-tight">{d.format('dddd, D MMMM YYYY')}</p>}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {isFuture && <p className="text-[10px] text-slate-400">Projected</p>}
          {ld.reconciled && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full">
              ✓ Reconciled
            </span>
          )}
          {ld.hasSnapshot && !ld.reconciled && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">
              ⊙ Snapshot
            </span>
          )}
          {ld.cash_pinned && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
              🔒 Pinned
            </span>
          )}
        </div>

        {hasData && !(isSheet && formOpen) && (
          <div className="mt-2.5 rounded-lg border border-slate-200 bg-white overflow-hidden">
            {[
              { label: 'Open',     value: openCash,     color: (openCash??0) < 0 ? 'text-red-600' : 'text-slate-700', prefix: (openCash??0) < 0 ? '-$' : '$',       bold: false },
              { label: 'In',       value: dayIn,        color: 'text-emerald-700', prefix: '+$', bold: false, hide: dayIn === 0 },
              { label: 'Out',      value: daySpend,     color: 'text-red-600',     prefix: '-$', bold: false, hide: daySpend === 0 },
              { label: 'Transfer', value: dayTransfer,  color: 'text-blue-600',    prefix: '-$', bold: false, hide: dayTransfer === 0 },
              { label: 'Close',    value: displayClose, color: (displayClose??0) < 0 ? 'text-red-600' : 'text-slate-800', prefix: (displayClose??0) < 0 ? '-$' : '$', bold: true },
            ].filter(r => !r.hide).map((row, i) => (
              <div key={row.label}
                className={`flex justify-between items-center px-3 py-1.5
                  ${row.label === 'Close' ? 'border-t border-slate-200 bg-slate-50' : ''}
                  ${i > 0 && row.label !== 'Close' ? 'border-t border-slate-100' : ''}`}>
                <span className={`text-[10px] ${row.bold ? 'font-bold text-slate-600' : 'text-slate-400'}`}>{row.label}</span>
                <span className={`text-[12px] ${row.bold ? 'font-extrabold' : 'font-semibold'} ${row.color}`}>
                  {row.prefix}{Math.abs(Math.round(row.value ?? 0)).toLocaleString('en-AU')}
                </span>
              </div>
            ))}
            {showPinnedNote && (
              <div className="flex justify-between items-center px-3 py-1 bg-amber-50 border-t border-amber-100">
                <span className="text-[9px] text-amber-600">Carry-forward pinned to</span>
                <span className="text-[10px] font-bold text-amber-700">
                  {(pinnedClose??0) < 0 ? '-$' : '$'}{Math.abs(Math.round(pinnedClose??0)).toLocaleString('en-AU')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">

        {/* Quick add — sheet only */}
        {isSheet && !adding && !editEvent && (
          <QuickAdd dateStr={dateStr} onSaved={handleSaved} />
        )}

        {/* Add transaction button */}
        {!adding && !editEvent && (
          <button onClick={() => setAdding(true)}
            className="w-full py-2 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:border-slate-400 transition-colors">
            + Add transaction
          </button>
        )}

        {/* Add form */}
        {adding && (
          <TxForm
            dateStr={dateStr}
            editEvent={null}
            onSaved={handleSaved}
            onCancel={handleCancel} />
        )}

        {/* Event list */}
        {events.length === 0 && !adding ? (
          <p className="text-center text-slate-400 text-sm py-8">No transactions on this day</p>
        ) : events.map((ev, i) => {
          const cfg       = TYPE_CFG[ev.type] || TYPE_CFG.expense
          const isIncome  = ev.type === 'income' || ev.type === 'borrow'
          const isCover   = ev.type === 'autocover'
          const isRepay   = ev.type === 'autocoverrepay'
          const isDebtPay = ev.type === 'debtpay'
          const isEditing = editEvent?.id === ev.id

          if (isDebtPay) {
            return (
              <div key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50">
                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-blue-900 truncate">
                    Debt fund → {ev.name}
                  </p>
                  <p className="text-[10px] text-blue-600 mt-0.5">Paid from debt fund</p>
                </div>
                <span className="text-[13px] font-bold flex-shrink-0 text-blue-700">-{fmt(ev.amt)}</span>
              </div>
            )
          }

          if (isCover) {
            return (
              <div key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50">
                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-amber-900 truncate">
                    Auto-cover from {ev.name}
                  </p>
                  <p className="text-[10px] text-amber-600 mt-0.5">Cash shortfall covered automatically</p>
                </div>
                <span className="text-[13px] font-bold flex-shrink-0 text-amber-700">-{fmt(ev.amt)}</span>
              </div>
            )
          }

          if (isRepay) {
            return (
              <div key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-xl border border-teal-200 bg-teal-50">
                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-teal-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-teal-900 truncate">
                    Repaid → {ev.name}
                  </p>
                  <p className="text-[10px] text-teal-600 mt-0.5">Auto-cover balance restored</p>
                </div>
                <span className="text-[13px] font-bold flex-shrink-0 text-teal-700">+{fmt(ev.amt)}</span>
              </div>
            )
          }

          return (
            <div key={i}>
              {isEditing ? (
                <TxForm
                  dateStr={dateStr}
                  editEvent={ev}
                  editRuleId={ev.rule_id || null}
                  onSaved={handleSaved}
                  onCancel={handleCancel} />
              ) : (
                <div
                  onClick={() => handleEdit(ev)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-white hover:border-slate-300 hover:shadow-sm cursor-pointer transition-all group">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800 truncate">
                      {ev.name}{ev.type === 'fund' && ev.fund_target ? ` → ${FUND_LABEL[ev.fund_target] || ev.fund_target}` : ''}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {ev.source === 'rule' ? `Recurring · ${ev.recur}` : ev.type === 'borrow' ? 'Borrowed' : 'One-off'}
                      {ev.source_fund ? ` · from ${FUND_LABEL[ev.source_fund] || ev.source_fund}` : ''}
                      {isFuture ? ' · projected' : ''}
                    </p>
                  </div>
                  <span className="text-[13px] font-bold flex-shrink-0" style={{ color: cfg.color }}>
                    {isIncome ? '+' : '-'}{fmt(ev.amt)}
                  </span>
                  <span className="text-[10px] text-slate-300 group-hover:text-slate-400 flex-shrink-0">✏</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

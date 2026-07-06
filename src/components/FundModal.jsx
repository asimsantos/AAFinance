import React, { useState } from 'react'
import dayjs from 'dayjs'
import { api } from '../api'

export default function FundModal({ fund, ledger, activeFunds = [], onClose, onSaved }) {
  const today   = dayjs().format('YYYY-MM-DD')
  const todayLd = ledger[today] || {}
  const [val,        setVal]        = useState(
    todayLd[fund.key] != null ? String(Math.round(todayLd[fund.key])) : ''
  )
  const [pinned,     setPinned]     = useState(!!(todayLd.cash_pinned))
  const [reconcile,  setReconcile]  = useState(false)
  const [saving,     setSaving]     = useState(false)

  const isCash = fund.key === 'cash'

  const save = async () => {
    setSaving(true)
    const numVal = parseFloat(val) || 0
    try {
      if (reconcile) {
        // Full snapshot: anchor cash + every active fund to today's values, mark reconciled
        await api.upsertSnapshot({
          date: today,
          cash: isCash ? numVal : (todayLd.cash ?? 0),
          balances: Object.fromEntries(activeFunds.map(f =>
            [f.key, f.key === fund.key ? numVal : (todayLd[f.key] ?? 0)])),
          cash_pinned: pinned,
          reconciled: true,
        })
      } else if (isCash) {
        // Partial snapshot: cash only
        await api.upsertSnapshot({ date: today, cash: numVal, cash_pinned: pinned })
      } else {
        // Partial snapshot: only this one fund
        await api.upsertSnapshot({ date: today, balances: { [fund.key]: numVal } })
      }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-xl"
        onClick={e => e.stopPropagation()}>

        <h3 className="text-base font-bold text-slate-800 mb-1">Update {fund.label}</h3>
        <p className="text-xs text-slate-400 mb-4">
          Saves a snapshot for today ({dayjs().format('D MMM YYYY')}).
          Projections recalculate forward from this value.
        </p>

        <input
          autoFocus
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose() }}
          className="w-full px-3 py-3 border border-slate-200 rounded-xl text-2xl font-bold text-center focus:outline-none focus:border-emerald-400 mb-3"
          placeholder="0"
        />

        {isCash && (
          <button
            onClick={() => setPinned(p => !p)}
            className={`w-full mb-3 px-3 py-2.5 rounded-xl border text-left flex items-center gap-3 transition-colors
              ${pinned ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
            <span className="text-base flex-shrink-0">{pinned ? '🔒' : '🔓'}</span>
            <div>
              <p className={`text-[13px] font-bold ${pinned ? 'text-amber-800' : 'text-slate-600'}`}>
                {pinned ? 'Pinned — amount locked' : 'Pin this amount'}
              </p>
              <p className={`text-[11px] ${pinned ? 'text-amber-600' : 'text-slate-400'}`}>
                {pinned ? 'Transactions on this day will not change this value.' : 'Lock cash to exactly this amount, ignoring transactions.'}
              </p>
            </div>
          </button>
        )}

        {/* Reconcile toggle */}
        <button
          onClick={() => setReconcile(r => !r)}
          className={`w-full mb-4 px-3 py-2.5 rounded-xl border text-left flex items-center gap-3 transition-colors
            ${reconcile ? 'bg-teal-50 border-teal-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
          <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 text-[12px] font-bold transition-colors
            ${reconcile ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-transparent'}`}>
            ✓
          </span>
          <div>
            <p className={`text-[13px] font-bold ${reconcile ? 'text-teal-800' : 'text-slate-600'}`}>
              {reconcile ? 'Reconciled — all funds anchored' : 'Mark day as reconciled'}
            </p>
            <p className={`text-[11px] ${reconcile ? 'text-teal-600' : 'text-slate-400'}`}>
              {reconcile
                ? 'All fund balances locked to today\'s computed values.'
                : 'Anchors all funds to today\'s values — confirms balances are correct.'}
            </p>
          </div>
        </button>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: reconcile ? '#0F766E' : '#065F46' }}>
            {saving ? 'Saving…' : reconcile ? 'Save & Reconcile' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

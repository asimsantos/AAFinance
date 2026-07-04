import React, { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import { api } from './api'
import { useLedger } from './hooks/useLedger'
import Calendar from './components/Calendar'
import SidePanel from './components/SidePanel'
import FundModal from './components/FundModal'
import SettingsPanel from './components/SettingsPanel'

const FUNDS = [
  { key: 'cash',      label: 'Cash',      color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0' },
  { key: 'car',       label: 'Car fund',  color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  { key: 'emergency', label: 'Emergency', color: '#047857', bg: '#F0FDF4', border: '#BBF7D0' },
  { key: 'debt',      label: 'Debt',      color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  { key: 'home',      label: 'Tuition reserve', color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE' },
]

function fmt(n) {
  const abs = Math.abs(Math.round(n))
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-AU')
}

export default function App() {
  const today    = dayjs()
  const todayStr = today.format('YYYY-MM-DD')

  const [year,           setYear]          = useState(today.year())
  const [month,          setMonth]         = useState(today.month())
  const [selectedDay,    setDay]           = useState(todayStr)
  const [lends,          setLends]         = useState([])
  const [debts,          setDebts]         = useState([])
  const [rightView,      setRightView]     = useState('day')
  const [fundModal,      setFundModal]     = useState(null)

  const { ledger, loading, reload } = useLedger(year, month)
  const loadLends = async () => setLends(await api.getLends())
  const loadDebts = async () => setDebts(await api.getDebts())
  useEffect(() => { loadLends(); loadDebts() }, [])
  const refresh = () => { reload(); loadLends(); loadDebts() }

  const changeMonth = dir => {
    let m = month + dir, y = year
    if (m > 11) { m = 0; y++ } else if (m < 0) { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  const selData      = ledger[selectedDay] || {}
  const isSelFuture  = selectedDay > todayStr
  const monthPrefix  = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthKeys    = Object.keys(ledger).filter(d => d.startsWith(monthPrefix))
  const monthIn       = monthKeys.reduce((s, d) => s + (ledger[d]?.dayIn       || 0), 0)
  const monthSpend    = monthKeys.reduce((s, d) => s + (ledger[d]?.daySpend    || 0), 0)
  const monthTransfer = monthKeys.reduce((s, d) => s + (ledger[d]?.dayTransfer || 0), 0)
  const endCash       = monthKeys.length ? (ledger[monthKeys.at(-1)]?.cash ?? 0) : 0
  const negDays       = monthKeys.filter(d => (ledger[d]?.cash ?? 0) < 0)
  const totalLent     = lends.filter(l => !l.returned).reduce((s, l) => s + l.amt, 0)
  const activeLends   = lends.filter(l => !l.returned)
  const activeDebts   = debts.filter(d => !d.repaid)
  const totalBorrowed = activeDebts.reduce((s, d) => s + Math.max(0, d.amt - (d.paid_amt || 0)), 0)

  return (
    <div className="flex flex-col h-screen" style={{ background: '#F1F5F9' }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header className="flex-shrink-0 h-11 px-5 flex items-center justify-between shadow-sm z-10"
        style={{ background: '#064E3B' }}>
        <span className="text-white font-bold text-sm tracking-tight select-none">A&A Finance</span>

        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)}
            className="w-7 h-7 rounded-lg bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold text-lg leading-none transition-colors">
            ‹
          </button>
          <span className="text-white font-semibold text-sm w-36 text-center select-none">
            {dayjs(new Date(year, month, 1)).format('MMMM YYYY')}
          </span>
          <button onClick={() => changeMonth(1)}
            className="w-7 h-7 rounded-lg bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold text-lg leading-none transition-colors">
            ›
          </button>
          <button
            onClick={() => { setYear(today.year()); setMonth(today.month()); setDay(todayStr) }}
            className="ml-1 px-3 h-7 rounded-lg bg-white/15 text-emerald-100 text-xs font-semibold hover:bg-white/25 transition-colors">
            Today
          </button>
        </div>

        {loading
          ? <span className="text-emerald-300 text-xs animate-pulse">Loading…</span>
          : <span style={{ color: '#064E3B' }} className="text-xs select-none">●</span>}
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ───────────────────────────────────────── */}
        <aside className="w-52 flex-shrink-0 bg-white border-r border-slate-200 overflow-y-auto flex flex-col">

          {/* Fund balances for selected day */}
          <div className="p-3 space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-1 select-none">
              {isSelFuture
                ? `Projected · ${dayjs(selectedDay).format('D MMM')}`
                : selectedDay === todayStr
                  ? 'Today'
                  : dayjs(selectedDay).format('D MMM YYYY')}
            </p>

            {FUNDS.map(f => {
              const v   = selData[f.key] ?? 0
              const neg = v < 0
              return (
                <button key={f.key}
                  onClick={() => setFundModal({ key: f.key, label: f.label, value: v })}
                  className="w-full text-left rounded-xl px-3 py-2.5 transition-all hover:brightness-95 active:scale-[.98]"
                  style={{ background: f.bg, border: `1.5px solid ${f.border}` }}>
                  <div className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1"
                    style={{ color: f.color }}>
                    {f.label}
                    {f.key === 'cash' && selData.cash_pinned && (
                      <span title="Cash locked — transactions don't change this value">🔒</span>
                    )}
                  </div>
                  <div className="text-[18px] font-extrabold leading-snug mt-0.5"
                    style={{ color: neg ? '#DC2626' : f.color }}>
                    {fmt(v)}
                  </div>
                </button>
              )
            })}

            {/* Lent out — read-only */}
            <div className="rounded-xl px-3 py-2.5"
              style={{ background: '#FAF5FF', border: '1.5px solid #DDD6FE' }}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-violet-700">Lent out</div>
              <div className="text-[18px] font-extrabold leading-snug mt-0.5 text-violet-700">
                {fmt(totalLent)}
              </div>
            </div>

            {/* Borrowed — read-only */}
            {totalBorrowed > 0 && (
              <div className="rounded-xl px-3 py-2.5"
                style={{ background: '#FFF7ED', border: '1.5px solid #FED7AA' }}>
                <div className="text-[9px] font-bold uppercase tracking-widest text-orange-700">Borrowed</div>
                <div className="text-[18px] font-extrabold leading-snug mt-0.5 text-orange-700">
                  {fmt(totalBorrowed)}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 mx-3" />

          {/* Month summary — spend and transfers shown separately */}
          <div className="p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-1 select-none">
              {dayjs(new Date(year, month, 1)).format('MMM YYYY')}
            </p>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between py-1 px-0.5">
                <span className="text-[11px] text-slate-500">In</span>
                <span className="text-[12px] font-bold text-emerald-700">+{fmt(monthIn)}</span>
              </div>
              <div className="flex items-center justify-between py-1 px-0.5">
                <span className="text-[11px] text-slate-500">Spend</span>
                <span className="text-[12px] font-bold text-red-600">-{fmt(monthSpend)}</span>
              </div>
              <div className="flex items-center justify-between py-1 px-0.5">
                <span className="text-[11px] text-slate-500">Transfers</span>
                <span className="text-[12px] font-bold text-blue-600">-{fmt(monthTransfer)}</span>
              </div>
              <div className="flex items-center justify-between py-1 px-0.5 border-t border-slate-100 mt-0.5 pt-1.5">
                <span className="text-[11px] text-slate-500">End cash</span>
                <span className={`text-[12px] font-bold ${endCash < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {fmt(endCash)}
                </span>
              </div>
            </div>

            {negDays.length > 0 && (
              <div className="mt-2 rounded-lg px-2.5 py-2 bg-red-50 border border-red-200">
                <p className="text-[10px] font-semibold text-red-700">
                  ⚠ Negative from {dayjs(negDays[0]).format('D MMM')}
                </p>
                {negDays.length > 1 && (
                  <p className="text-[9px] text-red-500 mt-0.5">{negDays.length} days total</p>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 mx-3" />

          {/* Outstanding lends */}
          <div className="p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-1 select-none">
              Lent out
            </p>
            {activeLends.length === 0
              ? <p className="text-[11px] text-slate-400 italic px-0.5">None outstanding</p>
              : (
                <div className="space-y-1.5">
                  {activeLends.map(l => {
                    const overdue = l.return_date && l.return_date < todayStr
                    return (
                      <div key={l.id}
                        className={`rounded-lg px-2.5 py-2 border ${overdue ? 'bg-red-50 border-red-200' : 'bg-violet-50 border-violet-100'}`}>
                        <p className="text-[11px] font-semibold text-slate-700 truncate">{l.name}</p>
                        <div className="flex justify-between items-center mt-0.5">
                          <span className={`text-[9px] ${overdue ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                            {overdue ? 'Overdue' : l.return_date ? dayjs(l.return_date).format('D MMM') : 'No due date'}
                          </span>
                          <span className="text-[11px] font-bold text-violet-700">{fmt(l.amt)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }
          </div>

          {/* Outstanding debts (borrowed) */}
          {activeDebts.length > 0 && (
            <>
              <div className="border-t border-slate-100 mx-3" />
              <div className="p-3 flex-1">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-1 select-none">
                  Borrowed from
                </p>
                <div className="space-y-1.5">
                  {activeDebts.map(d => {
                    const remaining = Math.max(0, d.amt - (d.paid_amt || 0))
                    const overdue   = d.due_date && d.due_date < todayStr
                    return (
                      <div key={d.id}
                        className={`rounded-lg px-2.5 py-2 border ${overdue ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-100'}`}>
                        <p className="text-[11px] font-semibold text-slate-700 truncate">{d.name}</p>
                        <div className="flex justify-between items-center mt-0.5">
                          <span className={`text-[9px] ${overdue ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                            {overdue ? 'Overdue' : d.due_date ? `Due ${dayjs(d.due_date).format('D MMM YYYY')}` : 'No due date'}
                          </span>
                          <span className="text-[11px] font-bold text-orange-700">{fmt(remaining)}</span>
                        </div>
                        {d.paid_amt > 0 && (
                          <div className="text-[9px] text-slate-400 mt-0.5">{fmt(d.paid_amt)} paid of {fmt(d.amt)}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
          {activeDebts.length === 0 && <div className="flex-1" />}
        </aside>

        {/* ── CALENDAR ───────────────────────────────────────────── */}
        <main className="flex-1 overflow-hidden flex flex-col p-3 min-w-0">
          {loading
            ? <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
            : <Calendar
                year={year}
                month={month}
                ledger={ledger}
                selectedDay={selectedDay}
                onDayClick={ds => { setDay(ds); setRightView('day') }} />
          }
        </main>

        {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-slate-200 flex-shrink-0 bg-white">
            {[
              { key: 'day',   label: 'Day detail' },
              { key: 'rules', label: 'Fund Management' },
            ].map(t => (
              <button key={t.key} onClick={() => setRightView(t.key)}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors
                  ${rightView === t.key
                    ? 'text-emerald-800 border-b-2 border-emerald-700 bg-emerald-50'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightView === 'rules'
              ? <SettingsPanel onUpdate={refresh} />
              : <SidePanel
                  dateStr={selectedDay}
                  ledger={ledger}
                  lends={lends}
                  onUpdate={refresh} />
            }
          </div>
        </aside>

      </div>

      {/* Fund balance edit modal */}
      {fundModal && (
        <FundModal
          fund={fundModal}
          ledger={ledger}
          onClose={() => setFundModal(null)}
          onSaved={() => { setFundModal(null); refresh() }} />
      )}
    </div>
  )
}

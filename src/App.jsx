import React, { useState, useEffect, useCallback, useRef } from 'react'
import dayjs from 'dayjs'
import { api } from './api'
import { useLedger } from './hooks/useLedger'
import Calendar from './components/Calendar'
import SidePanel from './components/SidePanel'
import FundModal from './components/FundModal'
import SettingsPanel from './components/SettingsPanel'

const FUNDS = [
  { key: 'cash',      label: 'Cash',            color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0' },
  { key: 'car',       label: 'Car fund',         color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  { key: 'emergency', label: 'Emergency',        color: '#047857', bg: '#F0FDF4', border: '#BBF7D0' },
  { key: 'debt',      label: 'Debt Fund',        color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
  { key: 'home',      label: 'Tuition reserve',  color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE' },
]

function fmt(n) {
  const abs = Math.abs(Math.round(n))
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-AU')
}

// ── Mobile bottom nav tab definitions ────────────────────────────
const MOBILE_TABS = [
  { key: 'today', label: 'Today', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )},
  { key: 'calendar', label: 'Calendar', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )},
  { key: 'manage', label: 'Manage', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )},
]

export default function App() {
  const today    = dayjs()
  const todayStr = today.format('YYYY-MM-DD')

  const [year,        setYear]      = useState(today.year())
  const [month,       setMonth]     = useState(today.month())
  const [selectedDay, setDay]       = useState(todayStr)
  const [lends,       setLends]     = useState([])
  const [debts,       setDebts]     = useState([])
  const [rightView,   setRightView] = useState('day')
  const [fundModal,   setFundModal] = useState(null)
  const [mobileTab,   setMobileTab] = useState('today')
  const [drawerOpen,  setDrawerOpen] = useState(false)

  const TAB_ORDER = ['today', 'calendar', 'manage']
  const swipeRef  = useRef(null)

  const handleTouchStart = e => {
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const handleTouchEnd = e => {
    if (!swipeRef.current || drawerOpen) return
    const dx = e.changedTouches[0].clientX - swipeRef.current.x
    const dy = e.changedTouches[0].clientY - swipeRef.current.y
    swipeRef.current = null
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    const idx = TAB_ORDER.indexOf(mobileTab)
    if (dx < 0 && idx < TAB_ORDER.length - 1) { setMobileTab(TAB_ORDER[idx + 1]); setDrawerOpen(false) }
    else if (dx > 0 && idx > 0)               { setMobileTab(TAB_ORDER[idx - 1]); setDrawerOpen(false) }
  }

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

  // Desktop day click
  const handleDayClick = ds => {
    setDay(ds)
    setRightView('day')
  }

  // Mobile calendar day click — opens drawer
  const handleCalendarDayClick = ds => {
    setDay(ds)
    setDrawerOpen(true)
  }

  // Computed values
  const todayData    = ledger[todayStr] || {}
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

  // ── Reusable: fund balance cards for a given day's data ──────────
  const FundCards = ({ dayData, dateStr }) => {
    const isFuture = dateStr > todayStr
    return (
      <div className="p-3 space-y-1.5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-0.5 select-none">
          {isFuture
            ? `Projected · ${dayjs(dateStr).format('D MMM')}`
            : dateStr === todayStr ? 'Today'
            : dayjs(dateStr).format('D MMM YYYY')}
        </p>
        {FUNDS.map(f => {
          const v = dayData[f.key] ?? 0
          const neg = v < 0
          return (
            <button key={f.key}
              onClick={() => setFundModal({ key: f.key, label: f.label, value: v })}
              className="w-full text-left rounded-xl px-3 py-2.5 transition-all hover:brightness-95 active:scale-[.98]"
              style={{ background: f.bg, border: `1.5px solid ${f.border}` }}>
              <div className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: f.color }}>
                {f.label}
                {f.key === 'cash' && dayData.cash_pinned && <span title="Cash locked">🔒</span>}
              </div>
              <div className="text-[18px] font-extrabold leading-snug mt-0.5"
                style={{ color: neg ? '#DC2626' : f.color }}>
                {fmt(v)}
              </div>
            </button>
          )
        })}
        <div className="rounded-xl px-3 py-2.5" style={{ background: '#FAF5FF', border: '1.5px solid #DDD6FE' }}>
          <div className="text-[9px] font-bold uppercase tracking-widest text-violet-700">Lent out</div>
          <div className="text-[18px] font-extrabold leading-snug mt-0.5 text-violet-700">{fmt(totalLent)}</div>
        </div>
        {totalBorrowed > 0 && (
          <div className="rounded-xl px-3 py-2.5" style={{ background: '#FFF7ED', border: '1.5px solid #FED7AA' }}>
            <div className="text-[9px] font-bold uppercase tracking-widest text-orange-700">Borrowed</div>
            <div className="text-[18px] font-extrabold leading-snug mt-0.5 text-orange-700">{fmt(totalBorrowed)}</div>
          </div>
        )}
      </div>
    )
  }

  // ── Reusable: full left-panel content ───────────────────────────
  const LeftPanelContent = ({ dayData, dateStr }) => (
    <div className="flex flex-col">
      <FundCards dayData={dayData} dateStr={dateStr} />

      <div className="border-t border-slate-100 mx-3" />

      {/* Month summary */}
      <div className="p-3">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-1 select-none">
          {dayjs(new Date(year, month, 1)).format('MMM YYYY')}
        </p>
        <div className="space-y-0.5">
          {[
            { label: 'In',        val: monthIn,       cls: 'text-emerald-700', prefix: '+' },
            { label: 'Spend',     val: monthSpend,    cls: 'text-red-600',     prefix: '-' },
            { label: 'Transfers', val: monthTransfer, cls: 'text-blue-600',    prefix: '-' },
          ].map(r => (
            <div key={r.label} className="flex items-center justify-between py-1 px-0.5">
              <span className="text-[11px] text-slate-500">{r.label}</span>
              <span className={`text-[12px] font-bold ${r.cls}`}>{r.prefix}{fmt(r.val)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between py-1 px-0.5 border-t border-slate-100 mt-0.5 pt-1.5">
            <span className="text-[11px] text-slate-500">End cash</span>
            <span className={`text-[12px] font-bold ${endCash < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmt(endCash)}</span>
          </div>
        </div>
        {negDays.length > 0 && (
          <div className="mt-2 rounded-lg px-2.5 py-2 bg-red-50 border border-red-200">
            <p className="text-[10px] font-semibold text-red-700">⚠ Negative from {dayjs(negDays[0]).format('D MMM')}</p>
            {negDays.length > 1 && <p className="text-[9px] text-red-500 mt-0.5">{negDays.length} days total</p>}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 mx-3" />

      {/* Outstanding lends */}
      <div className="p-3">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-1 select-none">Lent out</p>
        {activeLends.length === 0
          ? <p className="text-[11px] text-slate-400 italic px-0.5">None outstanding</p>
          : <div className="space-y-1.5">
              {activeLends.map(l => {
                const overdue = l.return_date && l.return_date < todayStr
                return (
                  <div key={l.id} className={`rounded-lg px-2.5 py-2 border ${overdue ? 'bg-red-50 border-red-200' : 'bg-violet-50 border-violet-100'}`}>
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
        }
      </div>

      {activeDebts.length > 0 && (
        <>
          <div className="border-t border-slate-100 mx-3" />
          <div className="p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-1 select-none">Borrowed from</p>
            <div className="space-y-1.5">
              {activeDebts.map(d => {
                const remaining = Math.max(0, d.amt - (d.paid_amt || 0))
                const overdue   = d.due_date && d.due_date < todayStr
                return (
                  <div key={d.id} className={`rounded-lg px-2.5 py-2 border ${overdue ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-100'}`}>
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
    </div>
  )

  return (
    <div className="flex flex-col h-screen" style={{ background: '#F1F5F9' }}>

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 h-11 px-3 sm:px-5 flex items-center justify-between shadow-sm z-10"
        style={{ background: '#064E3B' }}>
        <span className="text-white font-bold text-sm tracking-tight select-none hidden sm:block">A&A Finance</span>
        <span className="text-white font-bold text-sm tracking-tight select-none sm:hidden">A&A</span>

        <div className={`items-center gap-1.5 sm:gap-2 ${mobileTab === 'calendar' ? 'flex' : 'hidden md:flex'}`}>
          <button onClick={() => changeMonth(-1)}
            className="w-7 h-7 rounded-lg bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold text-lg leading-none transition-colors">‹</button>
          <span className="text-white font-semibold text-xs sm:text-sm w-28 sm:w-36 text-center select-none">
            {dayjs(new Date(year, month, 1)).format('MMMM YYYY')}
          </span>
          <button onClick={() => changeMonth(1)}
            className="w-7 h-7 rounded-lg bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold text-lg leading-none transition-colors">›</button>
          <button
            onClick={() => { setYear(today.year()); setMonth(today.month()); setDay(todayStr); setMobileTab('today'); setDrawerOpen(false) }}
            className="ml-0.5 sm:ml-1 px-2 sm:px-3 h-7 rounded-lg bg-white/15 text-emerald-100 text-xs font-semibold hover:bg-white/25 transition-colors">
            Today
          </button>
        </div>

        {loading
          ? <span className="text-emerald-300 text-xs animate-pulse">Loading…</span>
          : <span style={{ color: '#064E3B' }} className="text-xs select-none">●</span>}
      </header>

      {/* ══════════════════════════════════════════════════════════════
          MOBILE LAYOUT  (< md)
      ══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-hidden md:hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}>

        {/* Content area — leaves room at bottom for the fixed nav */}
        <div className="h-full overflow-hidden relative" style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom))' }}>

          {/* ── Tab 1: TODAY ──────────────────────────────────────── */}
          {mobileTab === 'today' && (
            <div className="absolute inset-0 overflow-y-auto bg-white">
              <LeftPanelContent dayData={todayData} dateStr={todayStr} />
            </div>
          )}

          {/* ── Tab 2: CALENDAR ───────────────────────────────────── */}
          {mobileTab === 'calendar' && (
            <div className="absolute inset-0 overflow-hidden flex flex-col p-2" style={{ background: '#F1F5F9' }}>
              {loading
                ? <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
                : <Calendar
                    year={year}
                    month={month}
                    ledger={ledger}
                    selectedDay={selectedDay}
                    onDayClick={handleCalendarDayClick} />
              }
            </div>
          )}

          {/* ── Tab 3: MANAGE ─────────────────────────────────────── */}
          {mobileTab === 'manage' && (
            <div className="absolute inset-0 overflow-hidden flex flex-col bg-white">
              <SettingsPanel onUpdate={refresh} debtFundBalance={todayData.debt ?? 0} />
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom navigation — fixed, always on top ──────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex">
          {MOBILE_TABS.map(t => (
            <button key={t.key}
              onClick={() => { setMobileTab(t.key); if (t.key !== 'calendar') setDrawerOpen(false) }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors
                ${mobileTab === t.key ? 'text-emerald-700' : 'text-slate-400 hover:text-slate-600'}`}>
              {t.icon}
              <span className="text-[10px] font-semibold">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── Day-detail bottom drawer (mobile, calendar tab) ─────────
          Slides up over the calendar when a day is tapped.
      ────────────────────────────────────────────────────────────── */}

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300
          ${drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.35)' }}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Drawer panel */}
      <div
        className={`fixed left-0 right-0 bottom-0 z-50 md:hidden bg-white rounded-t-2xl shadow-2xl
          flex flex-col transition-transform duration-300 ease-out`}
        style={{
          height: '85vh',
          transform: drawerOpen ? 'translateY(0)' : 'translateY(100%)',
        }}>

        {/* Drag handle + date label + close */}
        <div className="flex-shrink-0 relative flex items-center justify-between px-4 pt-4 pb-2 border-b border-slate-100">
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-slate-300" />
          <span className="text-sm font-bold text-slate-700 mt-1">
            {selectedDay ? dayjs(selectedDay).format('dddd, D MMMM') : ''}
          </span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 text-sm font-bold mt-1">
            ✕
          </button>
        </div>

        {/* ── Fund balances: 3-column grid ── */}
        <div className="flex-shrink-0 border-b border-slate-100 px-3 py-2.5">
          <div className="grid grid-cols-3 gap-2">
            {FUNDS.map(f => {
              const v   = selData[f.key] ?? 0
              const neg = v < 0
              return (
                <button key={f.key}
                  onClick={() => setFundModal({ key: f.key, label: f.label, value: v })}
                  className="rounded-xl px-2.5 py-2 text-left transition-all hover:brightness-95 active:scale-[.98]"
                  style={{ background: f.bg, border: `1.5px solid ${f.border}` }}>
                  <div className="text-[8px] font-bold uppercase tracking-widest flex items-center gap-0.5 truncate"
                    style={{ color: f.color }}>
                    {f.label}
                    {f.key === 'cash' && selData.cash_pinned && <span>🔒</span>}
                  </div>
                  <div className="text-[14px] font-extrabold leading-snug mt-0.5 truncate"
                    style={{ color: neg ? '#DC2626' : f.color }}>
                    {fmt(v)}
                  </div>
                </button>
              )
            })}
            {/* Lent out */}
            <div className="rounded-xl px-2.5 py-2"
              style={{ background: '#FAF5FF', border: '1.5px solid #DDD6FE' }}>
              <div className="text-[8px] font-bold uppercase tracking-widest text-violet-700 truncate">Lent out</div>
              <div className="text-[14px] font-extrabold leading-snug mt-0.5 text-violet-700 truncate">{fmt(totalLent)}</div>
            </div>
            {totalBorrowed > 0 && (
              <div className="rounded-xl px-2.5 py-2"
                style={{ background: '#FFF7ED', border: '1.5px solid #FED7AA' }}>
                <div className="text-[8px] font-bold uppercase tracking-widest text-orange-700 truncate">Borrowed</div>
                <div className="text-[14px] font-extrabold leading-snug mt-0.5 text-orange-700 truncate">{fmt(totalBorrowed)}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Day detail ── */}
        <div className="flex-1 overflow-y-auto">
          <SidePanel
            dateStr={selectedDay}
            ledger={ledger}
            lends={lends}
            onUpdate={() => { setDrawerOpen(false); refresh() }} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (≥ md)
      ══════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-1 overflow-hidden">

        {/* Left sidebar */}
        <aside className="w-48 lg:w-52 flex-shrink-0 bg-white border-r border-slate-200 overflow-y-auto flex flex-col">
          <LeftPanelContent dayData={selData} dateStr={selectedDay} />
        </aside>

        {/* Calendar */}
        <main className="flex-1 overflow-hidden flex flex-col p-3 min-w-0">
          {loading
            ? <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
            : <Calendar
                year={year}
                month={month}
                ledger={ledger}
                selectedDay={selectedDay}
                onDayClick={handleDayClick} />
          }
        </main>

        {/* Right panel */}
        <aside className="w-72 lg:w-80 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
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
              ? <SettingsPanel onUpdate={refresh} debtFundBalance={todayData.debt ?? 0} />
              : <SidePanel dateStr={selectedDay} ledger={ledger} lends={lends} onUpdate={refresh} />
            }
          </div>
        </aside>
      </div>

      {/* ── Fund balance edit modal ──────────────────────────────── */}
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

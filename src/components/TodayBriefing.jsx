import React from 'react'
import dayjs from 'dayjs'

const EVENT_META = {
  income:         { sign: '+', color: 'text-emerald-700', dot: 'bg-emerald-500' },
  borrow:         { sign: '+', color: 'text-orange-700',  dot: 'bg-orange-500' },
  expense:        { sign: '−', color: 'text-red-600',     dot: 'bg-red-400' },
  fund:           { sign: '−', color: 'text-blue-700',    dot: 'bg-blue-400' },
  lend:           { sign: '−', color: 'text-violet-700',  dot: 'bg-violet-400' },
  autocover:      { sign: '−', color: 'text-amber-700',   dot: 'bg-amber-500' },
  autocoverrepay: { sign: '+', color: 'text-teal-700',    dot: 'bg-teal-500' },
  debtpay:        { sign: '−', color: 'text-blue-700',    dot: 'bg-blue-600' },
}

function fmt(n) {
  const abs = Math.abs(Math.round(n))
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-AU')
}

export default function TodayBriefing({ ledger, todayStr, onDayTap }) {
  const todayEvents = (ledger[todayStr]?.events) || []
  const upcoming = Array.from({ length: 7 }, (_, i) => {
    const d  = dayjs(todayStr).add(i + 1, 'day')
    const ds = d.format('YYYY-MM-DD')
    const ld = ledger[ds] || {}
    return { ds, d, events: ld.events || [], cash: ld.cash ?? null }
  })

  return (
    <div className="p-3 pb-0 space-y-3">
      {/* Today's events */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-1 select-none">
          Today · {dayjs(todayStr).format('dddd D MMMM')}
        </p>
        {todayEvents.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic px-0.5">Nothing due today</p>
        ) : (
          <div className="space-y-1">
            {todayEvents.map((ev, i) => {
              const m = EVENT_META[ev.type] || EVENT_META.expense
              return (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-100 bg-white">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.dot}`} />
                  <span className="flex-1 text-[12px] font-semibold text-slate-700 truncate">{ev.name}</span>
                  <span className={`text-[12px] font-bold flex-shrink-0 ${m.color}`}>{m.sign}{fmt(ev.amt)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 7-day upcoming strip */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 pb-1 select-none">Next 7 days</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3">
          {upcoming.map(u => {
            const neg     = u.cash !== null && u.cash < 0
            const visible = u.events.filter(e => e.type !== 'autocover' && e.type !== 'autocoverrepay')
            return (
              <button key={u.ds} onClick={() => onDayTap(u.ds)}
                className={`flex-shrink-0 w-[104px] rounded-xl border px-2 py-1.5 text-left
                  ${neg ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                <p className="text-[9px] font-bold text-slate-500">{u.d.format('ddd D MMM')}</p>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                  {visible.length === 0 ? '—' : visible.length === 1 ? visible[0].name : `${visible.length} events`}
                </p>
                {u.cash !== null && (
                  <p className={`text-[11px] font-extrabold mt-0.5 ${neg ? 'text-red-600' : 'text-slate-700'}`}>{fmt(u.cash)}</p>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-t border-slate-100" />
    </div>
  )
}

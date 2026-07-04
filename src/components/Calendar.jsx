import React from 'react'
import dayjs from 'dayjs'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmt(n) {
  const abs = Math.abs(Math.round(n))
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-AU')
}

export default function Calendar({ year, month, ledger, selectedDay, onDayClick }) {
  const today    = dayjs().format('YYYY-MM-DD')
  const firstDay = new Date(year, month, 1).getDay()
  const dim      = new Date(year, month + 1, 0).getDate()
  const prevDim  = new Date(year, month, 0).getDate()

  const cells = []
  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({ day: prevDim - i, current: false })
  for (let d = 1; d <= dim; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, ds, current: true })
  }
  while (cells.length < 42)
    cells.push({ day: cells.length - firstDay - dim + 1, current: false })

  return (
    <div className="flex-1 overflow-hidden flex flex-col select-none">

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5 flex-shrink-0">
        {DAYS.map(d => (
          <div key={d} className="text-[10px] font-semibold text-slate-400 text-center py-1">{d}</div>
        ))}
      </div>

      {/* Cell grid */}
      <div className="grid grid-cols-7 gap-1.5 flex-1">
        {cells.map((cell, i) => {
          if (!cell.current) return (
            <div key={i} className="rounded-xl bg-slate-50/60 border border-slate-100/80" />
          )

          const ld           = ledger[cell.ds] || {}
          const events       = ld.events || []
          const cash         = ld.cash ?? null
          const isToday      = cell.ds === today
          const isFuture     = cell.ds > today
          const isSel        = cell.ds === selectedDay
          const isNeg        = cash !== null && cash < 0
          const hasCash      = cash !== null
          const isReconciled = !!ld.reconciled

          // Background + border
          let cellClass = 'bg-white border-slate-200'
          if      (isSel)   cellClass = 'bg-amber-50 border-amber-400 border-[2px]'
          else if (isToday) cellClass = 'bg-sky-50 border-sky-400 border-[2px]'
          else if (isNeg)   cellClass = 'bg-red-50 border-red-200'

          // Cash colour
          const cashColor = isNeg ? '#DC2626' : isFuture ? '#94A3B8' : '#065F46'

          return (
            <div key={cell.ds}
              onClick={() => onDayClick(cell.ds)}
              className={`rounded-xl border cursor-pointer flex flex-col p-1.5
                transition-all duration-100 hover:shadow-md hover:z-10 relative
                ${cellClass}
                ${isFuture && !isSel && !isToday ? 'opacity-70' : ''}`}>

              {/* Row 1: day number + event-type dots */}
              <div className="flex items-center justify-between flex-shrink-0 mb-0.5">
                {isToday ? (
                  <span className="w-[18px] h-[18px] rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 leading-none">
                    {cell.day}
                  </span>
                ) : (
                  <span className={`text-[11px] font-bold leading-none
                    ${isSel ? 'text-amber-600' : 'text-slate-500'}`}>
                    {cell.day}
                  </span>
                )}
                <div className="flex gap-[3px] items-center flex-shrink-0">
                  {events.some(e => e.type === 'income' || e.type === 'borrow') && <span className="w-[5px] h-[5px] rounded-full bg-emerald-500" />}
                  {events.some(e => e.type === 'expense')        && <span className="w-[5px] h-[5px] rounded-full bg-red-400" />}
                  {events.some(e => e.type === 'fund')           && <span className="w-[5px] h-[5px] rounded-full bg-blue-400" />}
                  {events.some(e => e.type === 'lend')           && <span className="w-[5px] h-[5px] rounded-full bg-violet-400" />}
                  {events.some(e => e.type === 'autocover')      && <span className="w-[5px] h-[5px] rounded-full bg-amber-500" />}
                  {events.some(e => e.type === 'autocoverrepay') && <span className="w-[5px] h-[5px] rounded-full bg-teal-500" />}
                  {isReconciled && <span className="w-[5px] h-[5px] rounded-full bg-teal-600" title="Reconciled" />}
                </div>
              </div>

              {/* Row 2: event name labels (autocover hidden from cell, visible in day detail) */}
              <div className="flex-1 flex flex-col gap-[2px] overflow-hidden">
                {events.filter(e => e.type !== 'autocover' && e.type !== 'autocoverrepay').slice(0, 3).map((ev, j) => (
                  <div key={j}
                    className={`text-[8px] rounded-[3px] px-1 py-[1px] font-semibold truncate leading-tight flex-shrink-0
                      ${ev.type === 'income'  ? 'bg-emerald-100 text-emerald-800' :
                        ev.type === 'borrow'  ? 'bg-orange-100 text-orange-800' :
                        ev.type === 'expense' && ev.amt > 1000 ? 'bg-red-600 text-white' :
                        ev.type === 'expense' ? 'bg-red-100 text-red-700' :
                        ev.type === 'fund'    ? 'bg-blue-100 text-blue-700' :
                                                'bg-violet-100 text-violet-700'}`}>
                    {ev.name}
                  </div>
                ))}
                {events.filter(e => e.type !== 'autocover' && e.type !== 'autocoverrepay').length > 3 && (
                  <span className="text-[7px] text-slate-400 pl-0.5">
                    +{events.filter(e => e.type !== 'autocover' && e.type !== 'autocoverrepay').length - 3} more
                  </span>
                )}
              </div>

              {/* Row 3: cash balance — always visible */}
              {hasCash && (
                <div className="text-[10px] font-extrabold text-right leading-none flex-shrink-0 mt-1"
                  style={{ color: cashColor }}>
                  {fmt(cash)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import dayjs from 'dayjs'

export function useLedger(year, month) {
  const [ledger, setLedger] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    // Window always covers the viewed month AND today..today+7 (Today briefing)
    const monthEnd   = dayjs(new Date(year, month + 1, 0))
    const horizon    = dayjs().add(7, 'day')
    const to         = (horizon.isAfter(monthEnd, 'day') ? horizon : monthEnd).format('YYYY-MM-DD')
    // Load from 3 months back so running balance is accurate; never later than today's month
    const base       = dayjs(new Date(year, month - 3, 1))
    const todayMonth = dayjs().startOf('month')
    const realFrom   = (todayMonth.isBefore(base) ? todayMonth : base).format('YYYY-MM-DD')
    const data = await api.getLedger(realFrom, to)
    setLedger(data)
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  return { ledger, loading, reload: load }
}

import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import dayjs from 'dayjs'

export function useLedger(year, month) {
  const [ledger, setLedger] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const from = dayjs(new Date(year,month,1)).format('YYYY-MM-DD')
    const to   = dayjs(new Date(year,month+1,0)).format('YYYY-MM-DD')
    // Load from 3 months back so running balance is accurate
    const realFrom = dayjs(new Date(year,month-3,1)).format('YYYY-MM-DD')
    const data = await api.getLedger(realFrom, to)
    setLedger(data)
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  return { ledger, loading, reload: load }
}

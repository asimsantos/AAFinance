import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { fundStyle } from '../fundStyle'

export function useFunds() {
  const [funds, setFunds] = useState([])
  const reloadFunds = useCallback(async () => {
    setFunds((await api.getFunds()).map(fundStyle))
  }, [])
  useEffect(() => { reloadFunds() }, [reloadFunds])
  return { funds, activeFunds: funds.filter(f => !f.archived), reloadFunds }
}

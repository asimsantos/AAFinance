const BASE = '/api'

const get  = (path) => fetch(BASE+path).then(r=>r.json())
const post = (path,body) => fetch(BASE+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json())
const put  = (path,body) => fetch(BASE+path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json())
const del  = (path) => fetch(BASE+path,{method:'DELETE'}).then(r=>r.json())

export const api = {
  // Ledger
  getLedger: (from,to) => get(`/ledger?from=${from}&to=${to}`),
  // Rules
  getRules: () => get('/rules'),
  addRule: (data) => post('/rules',data),
  updateRule: (id,data) => put(`/rules/${id}`,data),
  deleteRule: (id) => del(`/rules/${id}`),
  // Transactions
  getTransactions: (from,to) => get(`/transactions?from=${from}&to=${to}`),
  addTransaction: (data) => post('/transactions',data),
  updateTransaction: (id,data) => put(`/transactions/${id}`,data),
  deleteTransaction: (id) => del(`/transactions/${id}`),
  // Snapshots
  getSnapshots: () => get('/snapshots'),
  upsertSnapshot: (data) => post('/snapshots',data),
  // Lends
  getLends: () => get('/lends'),
  addLend: (data) => post('/lends',data),
  updateLend: (id,data) => put(`/lends/${id}`,data),
  deleteLend: (id) => del(`/lends/${id}`),
  // Debts (money borrowed)
  getDebts: () => get('/debts'),
  addDebt: (data) => post('/debts',data),
  updateDebt: (id,data) => put(`/debts/${id}`,data),
  deleteDebt: (id) => del(`/debts/${id}`),
  payDebt: (id, amount, date) => post(`/debts/${id}/pay`, { amount, date }),
}

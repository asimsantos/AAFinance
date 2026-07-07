// Shared sql.js row collector — the prepare/bind/step/free loop is
// easy to get subtly wrong (leaked statements), so it lives once here.
export function rows(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const out = []
  while (stmt.step()) out.push(stmt.getAsObject())
  stmt.free()
  return out
}

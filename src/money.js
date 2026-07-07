// Single money formatter — every rendered amount goes through here.
export function fmt(n) {
  const abs = Math.abs(Math.round(n))
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-AU')
}

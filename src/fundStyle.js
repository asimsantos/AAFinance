// Cash is not a fund — it keeps its special palette and semantics.
export const CASH = { key: 'cash', label: 'Cash', color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0' }

// Mix a hex color toward white: ratio 0 = the color, 1 = white.
export function tint(hex, ratio) {
  const n = (hex || '#1D4ED8').replace('#', '')
  const full = n.length === 3 ? n.split('').map(c => c + c).join('') : n
  const ch = i => {
    const c = parseInt(full.slice(i, i + 2), 16)
    return Math.round(c + (255 - c) * ratio).toString(16).padStart(2, '0')
  }
  return `#${ch(0)}${ch(2)}${ch(4)}`
}

// Decorate a funds-table row with the tile/border tints the UI uses.
export const fundStyle = f => ({ ...f, bg: tint(f.color, 0.93), border: tint(f.color, 0.72) })

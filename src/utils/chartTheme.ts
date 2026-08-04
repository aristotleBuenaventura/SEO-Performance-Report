export function chartTooltipStyle(theme: 'dark' | 'light' = 'dark') {
  const dark = theme === 'dark'
  return {
    background: dark ? '#141a27' : '#ffffff',
    border: `1px solid ${dark ? '#2a3348' : '#e2e8f0'}`,
    borderRadius: 10,
    color: dark ? '#e8ecf4' : '#0f172a',
    boxShadow: dark
      ? '0 12px 40px rgba(0,0,0,0.45)'
      : '0 12px 30px rgba(15,23,42,0.12)',
  }
}

export function chartAxisColor(theme: 'dark' | 'light' = 'dark') {
  return theme === 'dark' ? '#8b93a7' : '#64748b'
}

export function chartGridColor(theme: 'dark' | 'light' = 'dark') {
  return theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)'
}

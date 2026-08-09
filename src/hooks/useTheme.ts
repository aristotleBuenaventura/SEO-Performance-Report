import { useCallback, useState } from 'react'

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'seo-report-theme'

function readStoredTheme(): ThemeMode {
  try {
    // Only honor an explicit prior choice of light.
    // Missing / invalid / first visit → dark.
    if (localStorage.getItem(STORAGE_KEY) === 'light') return 'light'
  } catch {
    /* ignore */
  }
  return 'dark'
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const initial = readStoredTheme()
    applyTheme(initial)
    return initial
  })

  const setTheme = useCallback((next: ThemeMode) => {
    applyTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' }
}

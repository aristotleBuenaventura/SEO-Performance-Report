import { useTheme, type ThemeMode } from '../hooks/useTheme'

type Props = {
  compact?: boolean
  className?: string
}

function SunIcon() {
  return (
    <svg
      className="theme-toggle-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      className="theme-toggle-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      className="theme-toggle-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function ThemeToggle({ compact = true, className = '' }: Props) {
  const { theme, setTheme } = useTheme()

  return (
    <div
      className={`theme-toggle ${compact ? 'is-compact' : ''} ${className}`.trim()}
      role="group"
      aria-label="Color theme"
    >
      {!compact ? <span className="theme-toggle-label">Theme</span> : null}
      <div className="theme-toggle-track">
        <button
          type="button"
          className={theme === 'light' ? 'is-active' : undefined}
          aria-pressed={theme === 'light'}
          aria-label="Light theme"
          onClick={() => setTheme('light' as ThemeMode)}
        >
          {theme === 'light' ? <CheckIcon /> : <SunIcon />}
          <span>Light</span>
        </button>
        <button
          type="button"
          className={theme === 'dark' ? 'is-active' : undefined}
          aria-pressed={theme === 'dark'}
          aria-label="Dark theme"
          onClick={() => setTheme('dark' as ThemeMode)}
        >
          {theme === 'dark' ? <CheckIcon /> : <MoonIcon />}
          <span>Dark</span>
        </button>
      </div>
    </div>
  )
}

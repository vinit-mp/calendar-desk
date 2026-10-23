import { useEffect, useRef, useState } from 'react'
import type { ViewMode } from '../../../shared/types'

interface Props {
  view: ViewMode
  rangeLabel: string
  loading: boolean
  email?: string
  onView: (view: ViewMode) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onNew: () => void
  onSignOut: () => void
}

function Chevron({ dir }: { dir: 'left' | 'right' }): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={dir === 'left' ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function TopBar({ view, rangeLabel, loading, email, onView, onPrev, onNext, onToday, onNew, onSignOut }: Props): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  return (
    <header className="topbar">
      <div className="topbar__brand">Calendar Desk</div>

      <div className="topbar__nav">
        <button type="button" className="btn btn--ghost" onClick={onToday} title="Today (T)">
          Today
        </button>
        <div className="topbar__arrows">
          <button type="button" className="iconbtn" onClick={onPrev} aria-label={`Previous ${view}`} title={`Previous ${view} (←)`}>
            <Chevron dir="left" />
          </button>
          <button type="button" className="iconbtn" onClick={onNext} aria-label={`Next ${view}`} title={`Next ${view} (→)`}>
            <Chevron dir="right" />
          </button>
        </div>
        <h1 className="topbar__range">{rangeLabel}</h1>
        <span className={`topbar__sync${loading ? ' is-on' : ''}`} aria-live="polite">
          {loading ? 'Updating…' : ''}
        </span>
      </div>

      <div className="topbar__actions">
        <div className="seg" role="group" aria-label="View">
          <button type="button" className={`seg__btn${view === 'week' ? ' is-on' : ''}`} aria-pressed={view === 'week'} onClick={() => onView('week')} title="Week view (W)">
            Week
          </button>
          <button type="button" className={`seg__btn${view === 'quarter' ? ' is-on' : ''}`} aria-pressed={view === 'quarter'} onClick={() => onView('quarter')} title="Quarter view (Q)">
            Quarter
          </button>
        </div>
        <button type="button" className="btn btn--primary" onClick={onNew}>
          New event
        </button>
        <div className="account" ref={menuRef}>
          <button
            type="button"
            className="account__btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={email ?? 'Account'}
          >
            {(email?.[0] ?? '?').toUpperCase()}
          </button>
          {menuOpen && (
            <div className="account__menu" role="menu">
              <div className="account__email">{email ?? 'Signed in'}</div>
              <button
                type="button"
                role="menuitem"
                className="account__item"
                onClick={() => {
                  setMenuOpen(false)
                  onSignOut()
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

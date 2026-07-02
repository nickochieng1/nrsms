import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/contexts/LanguageContext'
import { useDarkMode } from '@/contexts/DarkModeContext'
import { ROLE_LABELS } from '@/utils/format'
import clsx from 'clsx'
import nrbLogo from '@/images/nrb-kenya.svg'

import type { UserRole } from '@/types'

const NAV_ITEMS: { to: string; label: string; roles: UserRole[]; end: boolean }[] = [
  { to: '/dashboard',             label: 'Dashboard',          roles: ['clerk','registrar','director','admin','dcrop','crop','rrop','hq_clerk'], end: false },
  { to: '/reports',               label: 'Reports',            roles: ['registrar','director','rrop','hq_clerk'],                              end: false },
  { to: '/submissions/new',       label: 'New Submission',     roles: ['dcrop','clerk'],                                                       end: false },
  { to: '/submissions',           label: 'Submissions',        roles: ['dcrop','clerk','crop','rrop','hq_clerk','registrar','director'],        end: true  },
  { to: '/mobile-registrations',  label: 'Usajili Mashinani',  roles: ['clerk','dcrop','registrar','director'],                                end: true  },
  { to: '/mashinani-reports',     label: 'Mashinani Report',   roles: ['registrar','director','rrop','hq_clerk'],                              end: false },
  { to: '/users',                 label: 'Users',              roles: ['admin','director'],                                                    end: false },
  { to: '/stations',              label: 'Stations',           roles: ['admin'],                                                              end: false },
  { to: '/audit',                 label: 'Audit Log',          roles: ['admin'],                                                              end: false },
]

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const { lang, setLang } = useLang()
  const { isDark, toggle: toggleDark } = useDarkMode()

  const visibleItems = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role),
  )

  return (
    <aside className="w-64 h-full min-h-screen bg-primary-900 text-white flex flex-col">
      <div className="bg-[#E3EDEB] px-5 py-4 flex items-center justify-between border-b border-black/20">
        <img
          src={nrbLogo}
          alt="National Registration Bureau"
          className="h-9 w-auto object-contain"
        />
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded text-gray-600 hover:bg-black/10"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="px-5 py-2.5 border-b border-white/10">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-200">
          Statistics Management System
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) =>
              clsx(
                'flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#E3EDEB] text-black'
                  : 'text-white/75 hover:bg-white/10 hover:text-white',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10">
        {user && (
          <div className="mb-3">
            <p className="text-sm font-medium text-white truncate">{user.full_name}</p>
            <p className="text-xs text-primary-200">{ROLE_LABELS[user.role]}</p>
          </div>
        )}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setLang('en')}
            className={`text-xs px-2 py-1 rounded ${lang === 'en' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'}`}
          >
            EN
          </button>
          <button
            onClick={() => setLang('sw')}
            className={`text-xs px-2 py-1 rounded ${lang === 'sw' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'}`}
          >
            SW
          </button>
          <button
            onClick={toggleDark}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="ml-auto p-1.5 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Toggle dark mode"
          >
            {isDark ? (
              /* Sun icon */
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              /* Moon icon */
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
        <button
          onClick={logout}
          className="w-full text-left text-xs text-white/50 hover:text-white transition-colors py-1"
        >
          {lang === 'sw' ? 'Toka →' : 'Sign out →'}
        </button>
      </div>
    </aside>
  )
}

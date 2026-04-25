import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_LABELS } from '@/utils/format'
import clsx from 'clsx'
import nrbLogo from '@/images/nrb-kenya.svg'

const NAV_ITEMS = [
  { to: '/dashboard',       label: 'Dashboard',      roles: ['station_officer', 'registrar', 'director', 'admin'] },
  { to: '/submissions/new', label: 'New Submission',  roles: ['station_officer', 'admin'] },
  { to: '/submissions',     label: 'Submissions',     roles: ['station_officer', 'registrar', 'director', 'admin'] },
  { to: '/reports',         label: 'Reports',         roles: ['registrar', 'director', 'admin'] },
  { to: '/audit',           label: 'Audit Log',       roles: ['registrar', 'director', 'admin'] },
  { to: '/stations',        label: 'Stations',        roles: ['director', 'admin'] },
  { to: '/users',           label: 'Users',           roles: ['director', 'admin'] },
]

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const { user, logout } = useAuth()

  const visibleItems = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role),
  )

  return (
    <aside className="w-64 h-full min-h-screen bg-primary-900 text-white flex flex-col">
      {/* Logo area */}
      <div className="bg-[#E3EDEB] px-5 py-4 flex items-center justify-between border-b border-black/20">
        <img
          src={nrbLogo}
          alt="National Registration Bureau"
          className="h-9 w-auto object-contain"
        />
        {/* Close button — mobile only */}
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

      {/* System label strip */}
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
        <button
          onClick={logout}
          className="w-full text-left text-xs text-white/50 hover:text-white transition-colors py-1"
        >
          Sign out →
        </button>
      </div>
    </aside>
  )
}

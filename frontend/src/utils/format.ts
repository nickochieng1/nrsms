export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const STATUS_LABELS: Record<string, string> = {
  draft:               'Draft',
  submitted:           'Awaiting Registrar Review',
  approved:            'Approved',
  rejected:            'Rejected',
}

export const STATUS_COLORS: Record<string, string> = {
  draft:               'bg-gray-100 text-gray-700',
  submitted:           'bg-blue-100 text-blue-700',
  approved:            'bg-green-100 text-green-700',
  rejected:            'bg-red-100 text-red-700',
}

export const ROLE_LABELS: Record<string, string> = {
  clerk:     'Clerk',
  registrar: 'Registrar',
  director:  'Director of Statistics',
  admin:     'System Administrator',
}

export const ROLE_GROUP: Record<string, string> = {
  clerk:     'Field',
  registrar: 'Field',
  director:  'Headquarters',
  admin:     'System',
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

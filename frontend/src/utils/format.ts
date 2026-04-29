export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const STATUS_LABELS: Record<string, string> = {
  draft:               'Draft',
  submitted:           'Awaiting Sub-County Review',
  sub_county_approved: 'Awaiting County Review',
  county_approved:     'Awaiting Regional Review',
  regional_approved:   'Awaiting HQ Review',
  approved:            'Approved',
  rejected:            'Rejected',
}

export const STATUS_COLORS: Record<string, string> = {
  draft:               'bg-gray-100 text-gray-700',
  submitted:           'bg-blue-100 text-blue-700',
  sub_county_approved: 'bg-indigo-100 text-indigo-700',
  county_approved:     'bg-violet-100 text-violet-700',
  regional_approved:   'bg-orange-100 text-orange-700',
  approved:            'bg-green-100 text-green-700',
  rejected:            'bg-red-100 text-red-700',
}

export const ROLE_LABELS: Record<string, string> = {
  // Field
  clerk:                'Clerk',
  sub_county_registrar: 'Sub-County Registrar',
  county_registrar:     'County Registrar',
  regional_registrar:   'Regional Registrar',
  // Headquarters
  hq_clerk:             'HQ Clerk',
  hq_officer:           'HQ Officer',
  director:             'Director of Statistics',
  admin:                'System Administrator',
}

export const ROLE_GROUP: Record<string, string> = {
  clerk:                'Field',
  sub_county_registrar: 'Field',
  county_registrar:     'Field',
  regional_registrar:   'Field',
  hq_clerk:             'Headquarters',
  hq_officer:           'Headquarters',
  director:             'Headquarters',
  admin:                'Headquarters',
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

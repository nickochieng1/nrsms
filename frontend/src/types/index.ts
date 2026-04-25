export type UserRole = 'station_officer' | 'registrar' | 'director' | 'admin'

export interface User {
  id: number
  full_name: string
  username: string | null
  email: string
  role: UserRole
  station_id: number | null
  is_active: boolean
  must_change_password: boolean
  created_at: string
}

export interface Station {
  id: number
  name: string
  region: string
  county: string
  code: string
}

export type SubmissionStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected'

export type NrbCat = 'npr' | 'replacements' | 'changes' | 'duplicates' | 'type4' | 'type5'
export type ModulePrefix = 'app' | 'ids' | 'rej'

export const NRB_CATS: NrbCat[] = ['npr', 'replacements', 'changes', 'duplicates', 'type4', 'type5']

export const CAT_LABELS: Record<NrbCat, string> = {
  npr: 'NPR',
  replacements: 'Replacements',
  changes: 'Changes',
  duplicates: 'Duplicates',
  type4: 'Type 4',
  type5: 'Type 5',
}

export const CAT_COLORS: Record<NrbCat, string> = {
  npr: '#3b82f6',
  replacements: '#f59e0b',
  changes: '#8b5cf6',
  duplicates: '#10b981',
  type4: '#ef4444',
  type5: '#06b6d4',
}

export const MODULE_LABELS: Record<ModulePrefix, string> = {
  app: 'Applications to HQ',
  ids: 'IDs Received',
  rej: 'Rejections from HQ',
}

export const MODULE_COLORS: Record<ModulePrefix, string> = {
  app: '#2563eb',
  ids: '#16a34a',
  rej: '#dc2626',
}

// Helper to generate all M/F field names for a module
export function moduleFields(prefix: ModulePrefix | 'reg136c' | 'photo3a') {
  return NRB_CATS.flatMap((cat) => [`${prefix}_${cat}_male`, `${prefix}_${cat}_female`])
}

export interface Submission {
  id: number
  station_id: number
  submitted_by: number
  reviewed_by: number | null
  period_month: number
  period_year: number
  status: SubmissionStatus
  notes: string | null
  rejection_reason: string | null

  // Module 1 — Applications to HQ
  app_npr_male: number; app_npr_female: number; app_npr_total: number
  app_replacements_male: number; app_replacements_female: number; app_replacements_total: number
  app_changes_male: number; app_changes_female: number; app_changes_total: number
  app_duplicates_male: number; app_duplicates_female: number; app_duplicates_total: number
  app_type4_male: number; app_type4_female: number; app_type4_total: number
  app_type5_male: number; app_type5_female: number; app_type5_total: number
  app_grand_male: number; app_grand_female: number; app_grand_total: number

  // Module 2 — IDs received
  ids_npr_male: number; ids_npr_female: number; ids_npr_total: number
  ids_replacements_male: number; ids_replacements_female: number; ids_replacements_total: number
  ids_changes_male: number; ids_changes_female: number; ids_changes_total: number
  ids_duplicates_male: number; ids_duplicates_female: number; ids_duplicates_total: number
  ids_type4_male: number; ids_type4_female: number; ids_type4_total: number
  ids_type5_male: number; ids_type5_female: number; ids_type5_total: number
  ids_grand_male: number; ids_grand_female: number; ids_grand_total: number

  // Module 3 — Rejections
  rej_npr_male: number; rej_npr_female: number; rej_npr_total: number
  rej_replacements_male: number; rej_replacements_female: number; rej_replacements_total: number
  rej_changes_male: number; rej_changes_female: number; rej_changes_total: number
  rej_duplicates_male: number; rej_duplicates_female: number; rej_duplicates_total: number
  rej_type4_male: number; rej_type4_female: number; rej_type4_total: number
  rej_type5_male: number; rej_type5_female: number; rej_type5_total: number
  rej_grand_male: number; rej_grand_female: number; rej_grand_total: number

  // Module 4 — Collected / Uncollected
  collected_npr_male: number; collected_npr_female: number; collected_npr_total: number
  collected_others_male: number; collected_others_female: number; collected_others_total: number
  collected_rejected_male: number; collected_rejected_female: number; collected_rejected_total: number
  collected_male: number; collected_female: number; collected_total: number
  uncollected_npr_male: number; uncollected_npr_female: number; uncollected_npr_total: number
  uncollected_others_male: number; uncollected_others_female: number; uncollected_others_total: number
  uncollected_lost_male: number; uncollected_lost_female: number; uncollected_lost_total: number
  uncollected_male: number; uncollected_female: number; uncollected_total: number

  // Module 5 — Reg. 136C
  reg136c_balance_bd: number
  reg136c_used: number
  reg136c_spoilt: number
  reg136c_returned: number
  reg136c_balance_cf: number

  // Module 6 — Photo Papers 3A
  photo3a_balance_bd: number
  photo3a_used: number
  photo3a_spoilt: number
  photo3a_returned: number
  photo3a_balance_cf: number

  created_at: string
  updated_at: string
  submitted_at: string | null
  approved_at: string | null
}

export interface AuditLog {
  id: number
  user_id: number | null
  action: string
  resource: string
  resource_id: number | null
  old_value: string | null
  new_value: string | null
  ip_address: string | null
  timestamp: string
}

export interface MonthlyData {
  month: number
  month_name: string
  [key: string]: number | string
}

export interface SummaryReport {
  year: number
  monthly: MonthlyData[]
  totals: Record<string, number>
}

export const WORK_CATEGORIES = [
  'Software Engineering',
  'Design',
  'Marketing',
  'Sales',
  'Finance',
  'Data & Analytics',
  'Product Management',
  'Operations',
  'Customer Support',
  'Education',
  'Content Creation',
  'Entrepreneurship',
  'General / Other',
] as const

export type WorkCategory = (typeof WORK_CATEGORIES)[number]

export function normalizeWorkCategory(value: string): WorkCategory {
  return (WORK_CATEGORIES.find((category) => category === value) ?? 'General / Other') as WorkCategory
}

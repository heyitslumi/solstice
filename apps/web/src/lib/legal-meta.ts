export const LEGAL_UPDATED = '15 September 2026'

/*
 * Placeholders the operator must replace before publishing. They are rendered
 * verbatim in the documents so an unfilled value is impossible to miss.
 */
export const LEGAL_ENTITY = '[LEGAL ENTITY NAME]'
export const LEGAL_ADDRESS = '[REGISTERED ADDRESS]'
export const LEGAL_JURISDICTION = '[GOVERNING JURISDICTION]'

export const CONTACT_LEGAL = 'legal@[OPERATOR DOMAIN]'
export const CONTACT_PRIVACY = 'privacy@[OPERATOR DOMAIN]'
export const CONTACT_ABUSE = 'abuse@[OPERATOR DOMAIN]'

export const LEGAL_DOCUMENTS = [
  { to: '/legal/terms', label: 'Terms of Service' },
  { to: '/legal/aup', label: 'Acceptable Use Policy' },
  { to: '/legal/privacy', label: 'Privacy Policy' },
] as const

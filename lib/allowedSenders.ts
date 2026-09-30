/**
 * Allowlist of accounts permitted to send mail through this app.
 *
 * Configured with ALLOWED_SENDERS — a comma-separated list of either full
 * addresses (`rpcbilling@lufa.com`) or whole domains (`@lufa.com`).
 * When the variable is unset or empty no restriction is applied, so existing
 * deployments keep working until the value is set.
 */

const entries = (process.env.ALLOWED_SENDERS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export const allowlistConfigured = entries.length > 0

export function isAllowedSender(email: string | null | undefined): boolean {
  if (!allowlistConfigured) return true
  if (!email) return false

  const normalized = email.trim().toLowerCase()
  const domain = normalized.slice(normalized.lastIndexOf('@'))

  return entries.some((entry) => (entry.startsWith('@') ? entry === domain : entry === normalized))
}

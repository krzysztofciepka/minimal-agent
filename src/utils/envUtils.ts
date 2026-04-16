export function isEnvTruthy(name: string): boolean {
  const value = process.env[name]
  if (!value) return false
  const lower = value.toLowerCase()
  return lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on'
}

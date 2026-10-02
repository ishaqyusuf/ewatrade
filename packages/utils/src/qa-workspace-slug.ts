export function withQaWorkspaceSuffix(
  slug: string,
  isQa: boolean,
  maxLength = 32,
) {
  const normalized = slug.trim().toLowerCase()
  if (!isQa || !normalized || normalized.endsWith("-qa")) return normalized
  const base = normalized.slice(0, maxLength - 3).replace(/-+$/, "")
  return `${base}-qa`
}

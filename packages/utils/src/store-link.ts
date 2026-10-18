/** Platform hostnames are never available as merchant links. */
export const RESERVED_STORE_LINKS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "shop",
  "store",
  "ewatrade",
  "dash",
  "dashboard",
  "mail",
  "support",
  "help",
  "status",
  "static",
  "assets",
  "auth",
  "login",
  "signup",
  "preview",
  "staging",
  "dev",
  "localhost",
  "billing",
  "legal",
  "privacy",
  "terms",
  "cdn",
  "ftp",
  "smtp",
])

export function normalizeStoreLink(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "")
}

export function isValidStoreLink(value: string): boolean {
  return (
    value.length >= 2 &&
    value.length <= 40 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
    !RESERVED_STORE_LINKS.has(value)
  )
}

export function storeLinkSuggestions(value: string): string[] {
  const base =
    normalizeStoreLink(value).slice(0, 32).replace(/-+$/g, "") || "my-business"
  return ["shop", "ng", "online", "hq", "store"].map(
    (suffix) => `${base}-${suffix}`,
  )
}

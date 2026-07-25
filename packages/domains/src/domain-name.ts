export type SupportedDomain = {
  label: string
  normalizedDomain: string
  tld: "com" | "com.ng"
}

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function normalizeDomainName(value: string): SupportedDomain {
  const normalizedDomain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    ?.replace(/\.$/, "")

  if (!normalizedDomain) {
    throw new Error("Enter a domain name.")
  }

  const tld = normalizedDomain.endsWith(".com.ng")
    ? "com.ng"
    : normalizedDomain.endsWith(".com")
      ? "com"
      : null

  if (!tld) {
    throw new Error("Only .com.ng and .com domains are currently supported.")
  }

  const label = normalizedDomain.slice(0, -(tld.length + 1))

  if (!LABEL_PATTERN.test(label)) {
    throw new Error(
      "Use letters, numbers, or hyphens. A domain cannot begin or end with a hyphen.",
    )
  }

  return { label, normalizedDomain, tld }
}

export function splitDomainName(domain: string) {
  const parsed = normalizeDomainName(domain)
  return { extension: parsed.tld, name: parsed.label }
}

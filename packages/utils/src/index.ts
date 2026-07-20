export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

export function formatMoney(value?: number | string | null, currency = "USD") {
  const amount = Number(value ?? 0)
  const safeAmount = Number.isFinite(amount) ? amount : 0

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount)
}

export function sum(values: Array<number | string | null | undefined>) {
  return values.reduce<number>((total, value) => {
    const amount = Number(value ?? 0)
    return total + (Number.isFinite(amount) ? amount : 0)
  }, 0)
}

export function percentageValue(
  value?: number | string | null,
  percentage?: number | string | null,
) {
  const amount = Number(value ?? 0)
  const percent = Number(percentage ?? 0)

  if (!Number.isFinite(amount) || !Number.isFinite(percent)) {
    return 0
  }

  return (amount * percent) / 100
}

export function consoleLog(...args: unknown[]) {
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } })
    .process?.env?.NODE_ENV

  if (nodeEnv !== "production") {
    console.log(...args)
  }
}

export function getNameInitials(value?: string | null) {
  const parts = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) return "?"

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function listFilter<T>(items: T[], search: string, deep = false): T[] {
  const query = search.trim().toLowerCase()
  if (!query) return items

  return items.filter((item) => {
    const haystack = deep ? JSON.stringify(item) : String(item)
    return haystack.toLowerCase().includes(query)
  })
}

export function padStart(
  value: string | number | null | undefined,
  length: number,
  fill = "0",
) {
  return String(value ?? "").padStart(length, fill)
}

export function dotObject<T extends Record<string, unknown>>(value: T): T {
  return value
}

export function camel(value?: string | null) {
  return String(value ?? "")
    .trim()
    .replace(/[-_\s]+(.)?/g, (_, char: string | undefined) =>
      char ? char.toUpperCase() : "",
    )
    .replace(/^(.)/, (char) => char.toLowerCase())
}

export * from "./currency"
export * from "./domain"
export * from "./exact-decimal"
export * from "./catalog-options"
export * from "./catalog-setup-helpers"
export * from "./vercel"

export function storefrontInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
}

export function formatStorefrontPrice(
  minor: number,
  currency: string,
  currencyDisplay: "symbol" | "code" = "symbol",
) {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      currencyDisplay,
      minimumFractionDigits: minor % 100 ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(minor / 100)
  } catch {
    return `${new Intl.NumberFormat("en-NG").format(minor / 100)} ${currency}`
  }
}

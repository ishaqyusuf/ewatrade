// EwaTrade's supported operating currencies all use two minor-unit digits.
export function parseFinanceMoney(value: string): string {
  const match = /^(0|[1-9]\d{0,12})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match?.[1])
    throw new Error("Enter an amount with up to two decimal places.")
  const amount =
    BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"))
  if (amount <= BigInt(0) || amount > BigInt(100_000_000_000_000))
    throw new Error("Enter a positive amount within the transaction limit.")
  return amount.toString()
}

export function formatFinanceMoney(value: string, currency: string): string {
  const amount = BigInt(value)
  const absolute = amount < BigInt(0) ? -amount : amount
  const whole = absolute / BigInt(100)
  const fraction = (absolute % BigInt(100)).toString().padStart(2, "0")
  const signed =
    amount < BigInt(0) ? (whole === BigInt(0) ? -0 : -whole) : whole
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(signed)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("")
}

export function parseFinanceCashCount(value: string): string {
  const match = /^(0|[1-9]\d{0,16})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match?.[1])
    throw new Error(
      "Enter a non-negative amount with up to two decimal places.",
    )
  const minor =
    BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"))
  if (minor > BigInt("9223372036854775807"))
    throw new Error("The count exceeds the supported balance limit.")
  return minor.toString()
}

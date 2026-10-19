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
  const whole = (absolute / BigInt(100)).toString()
  const fraction = (absolute % BigInt(100)).toString().padStart(2, "0")
  const formatter = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  // Native Intl may lack both BigInt formatting and formatToParts. Only a
  // small sample reaches Intl; splice the exact digits into its en-NG layout.
  const sample = formatter.format(amount < BigInt(0) ? -1234.56 : 1234.56)
  const layout = /1([^0-9]*)234([^0-9]*)56/.exec(sample)
  if (!layout)
    throw new Error("Currency formatting is unavailable on this device.")
  const digits = whole.replace(/\B(?=(\d{3})+(?!\d))/g, layout[1] ?? ",")
  return sample.replace(layout[0], () => `${digits}${layout[2]}${fraction}`)
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

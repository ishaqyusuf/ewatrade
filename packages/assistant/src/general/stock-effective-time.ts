export class StockEffectiveTimeError extends Error {
  constructor(readonly reason: "invalid_utc" | "unrepresentable_precision") {
    super(
      reason === "unrepresentable_precision"
        ? "Use a time with no more than millisecond precision. Keep any further fractional digits at zero."
        : "Enter a valid UTC time, including seconds and Z.",
    )
    this.name = "StockEffectiveTimeError"
  }
}

/** Native stock commands accept Date: never round a reviewed instant into it. */
export function parseStockEffectiveTime(value: unknown): Date {
  if (typeof value !== "string")
    throw new StockEffectiveTimeError("invalid_utc")
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(
    value,
  )
  if (!match) throw new StockEffectiveTimeError("invalid_utc")
  const fraction = match[2] ?? ""
  if (/[1-9]/.test(fraction.slice(3)))
    throw new StockEffectiveTimeError("unrepresentable_precision")
  const date = new Date(value)
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 19) !== match[1] ||
    date.getUTCMilliseconds() !== Number(fraction.padEnd(3, "0").slice(0, 3))
  )
    throw new StockEffectiveTimeError("invalid_utc")
  return date
}

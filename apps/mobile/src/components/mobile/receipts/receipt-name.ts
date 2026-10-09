// Path separators and characters Windows forbids in file names.
const UNSAFE_FILENAME = /[\\/:*?"<>|]+/g

function clean(value: string) {
  return Array.from(value, (character) =>
    character.charCodeAt(0) < 32 ? " " : character,
  )
    .join("")
    .replace(UNSAFE_FILENAME, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * A readable, order-based download name, for example
 * "ORD-012 Receipt - Jawdah Poultry.pdf". Android adds " (1)" itself when the
 * same name is saved again, so no timestamp is needed.
 */
export function receiptDownloadName({
  businessName,
  extension,
  orderNumbers,
  images = false,
}: {
  businessName?: string | null
  extension: "pdf" | "png" | "zip"
  orderNumbers: string[]
  images?: boolean
}) {
  const orders = orderNumbers.map(clean).filter(Boolean)
  const first = orders[0] ?? "Order"
  const subject =
    orders.length <= 1
      ? `${first} Receipt`
      : orders.length === 2
        ? `${first} & ${orders[1]} Receipts`
        : `${first} + ${orders.length - 1} more Receipts`
  const kind = images && extension === "zip" ? " images" : ""
  const business = clean(businessName ?? "")
  const stem = business
    ? `${subject}${kind} - ${business}`
    : `${subject}${kind}`
  return `${stem.slice(0, 120).trim()}.${extension}`
}

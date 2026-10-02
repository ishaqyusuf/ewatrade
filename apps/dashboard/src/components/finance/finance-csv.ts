export function financeCsvCell(value: string) {
  // Signed integer amounts are safe literals; preserve every digit for import.
  const safe =
    !/^-?\d+$/.test(value) && /^[\s]*[=+@-]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

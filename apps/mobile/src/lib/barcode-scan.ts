/** Keep codes as strings: leading zeros and alphanumeric labels are meaningful. */
export function barcodeScanValue(value: string): string | null {
  const code = value.trim()
  const hasControlCharacter = [...code].some((character) => {
    const point = character.charCodeAt(0)
    return point < 32 || point === 127
  })
  return code && code.length <= 120 && !hasControlCharacter ? code : null
}

export function distinctScannedBarcodes(results: Array<{ data: string }>) {
  return [
    ...new Set(
      results
        .map(({ data }) => barcodeScanValue(data))
        .filter((code): code is string => code !== null),
    ),
  ]
}

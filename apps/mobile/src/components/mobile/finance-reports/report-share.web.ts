function download(csv: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  )
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return "CSV download started."
}
export async function shareFinanceCsv(csv: string, filename: string) {
  return download(csv, filename)
}
export async function saveFinanceCsv(csv: string, filename: string) {
  return download(csv, filename)
}

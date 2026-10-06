import type { ReceiptFile } from "./receipt-file"

export async function deliverReceiptFile(
  file: ReceiptFile,
  action: "save" | "share",
) {
  const blob = new Blob([Uint8Array.from(file.bytes)], { type: file.mimeType })
  const output = new File([blob], file.filename, { type: file.mimeType })
  if (action === "share") {
    if (!navigator.canShare?.({ files: [output] }))
      throw new Error(
        "File sharing is unavailable in this browser. Use Save instead.",
      )
    try {
      await navigator.share({ files: [output], title: "Order receipt" })
      return "Share sheet closed."
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        return "Share cancelled."
      throw error
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = file.filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return `Download ready: ${file.filename}`
}

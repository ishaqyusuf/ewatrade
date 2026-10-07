"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import { receiptFileStem } from "@ewatrade/order-receipts"
import { useEffect, useState } from "react"

export function useReceiptDownload(
  pdfBase64: string | undefined,
  orderNumbers: string[],
) {
  const workflow = useDashboardWorkflow()
  const [url, setUrl] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!pdfBase64) {
      setUrl(null)
      return
    }
    const bytes = Uint8Array.from(atob(pdfBase64), (char) => char.charCodeAt(0))
    const next = URL.createObjectURL(
      new Blob([bytes], { type: "application/pdf" }),
    )
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [pdfBase64])

  async function download(format: "pdf" | "image") {
    if (!pdfBase64 || pending) return
    setPending(true)
    setError(null)
    setMessage("Preparing download…")
    workflow.track("receipt_download", "started", { channel: "browser" })
    try {
      const bytes = Uint8Array.from(atob(pdfBase64), (char) =>
        char.charCodeAt(0),
      )
      const output =
        format === "pdf"
          ? {
              blob: new Blob([bytes], { type: "application/pdf" }),
              filename:
                orderNumbers.length === 1
                  ? `${receiptFileStem(orderNumbers[0] ?? "order")}.pdf`
                  : "order-receipts.pdf",
            }
          : await (
              await import("@/components/receipts/image-export")
            ).receiptImages(bytes, orderNumbers, setMessage)
      const objectUrl = URL.createObjectURL(output.blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = output.filename
      document.body.append(link)
      link.click()
      workflow.track("receipt_download", "completed", { channel: "browser" })
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
      setMessage(`Download ready: ${output.filename}`)
    } catch (cause) {
      workflow.track("receipt_download", "failed", { channel: "browser" })
      setError(
        cause instanceof Error
          ? cause.message
          : "Download failed. Please try again.",
      )
      setMessage("")
    } finally {
      setPending(false)
    }
  }
  return { url, pending, message, error, download }
}

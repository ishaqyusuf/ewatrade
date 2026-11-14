"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import { receiptFileStem } from "@ewatrade/order-receipts"
import { useEffect, useMemo, useState } from "react"

function receiptPdfName(orderNumbers: string[]) {
  return orderNumbers.length === 1
    ? `${receiptFileStem(orderNumbers[0] ?? "order")}.pdf`
    : "order-receipts.pdf"
}

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
              filename: receiptPdfName(orderNumbers),
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
  // The phone share sheet (WhatsApp, email…) takes the PDF itself.
  const shareFile = useMemo(() => {
    if (!pdfBase64 || typeof File === "undefined") return null
    const bytes = Uint8Array.from(atob(pdfBase64), (char) => char.charCodeAt(0))
    return new File([bytes], receiptPdfName(orderNumbers), {
      type: "application/pdf",
    })
  }, [pdfBase64, orderNumbers])
  const canShare = Boolean(
    shareFile &&
      typeof navigator !== "undefined" &&
      navigator.canShare?.({ files: [shareFile] }),
  )

  async function share() {
    if (!shareFile || pending) return
    setError(null)
    workflow.track("receipt_download", "started", { channel: "share" })
    try {
      await navigator.share({
        files: [shareFile],
        title: orderNumbers.join(", "),
      })
      workflow.track("receipt_download", "completed", { channel: "share" })
    } catch (cause) {
      // Closing the share sheet is not an error.
      if (cause instanceof DOMException && cause.name === "AbortError") return
      workflow.track("receipt_download", "failed", { channel: "share" })
      setError("Sharing failed. Download the PDF instead.")
    }
  }

  /** Prints the same PDF from a hidden frame; opens it when a frame can't. */
  function print() {
    if (!url) return
    const frame = document.createElement("iframe")
    frame.style.position = "fixed"
    frame.style.width = "0"
    frame.style.height = "0"
    frame.style.border = "0"
    frame.src = url
    frame.onload = () => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } catch {
        window.open(url, "_blank", "noopener")
      }
      window.setTimeout(() => frame.remove(), 60_000)
    }
    document.body.append(frame)
  }

  return { url, pending, message, error, download, canShare, share, print }
}

"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { Button } from "@ewatrade/ui"
import QRCode from "qrcode"
import { useEffect, useState } from "react"

export function QrCodeCard({ url }: { url: string }) {
  const workflow = useDashboardWorkflow()
  const [image, setImage] = useState("")

  useEffect(() => {
    let active = true
    void QRCode.toDataURL(url, { margin: 1, width: 224 }).then((value) => {
      if (active) setImage(value)
    })
    return () => {
      active = false
    }
  }, [url])

  const download = () => {
    if (!image) return
    workflow.track("channel_qr_download", "started")
    const anchor = document.createElement("a")
    anchor.download = "customer-entry-qr.png"
    anchor.href = image
    anchor.click()
    workflow.track("channel_qr_download", "completed")
  }

  return (
    <div className="grid place-items-center gap-3 rounded-lg border border-border bg-background p-4">
      {image ? (
        <img alt="Customer entry QR code" className="size-48" src={image} />
      ) : (
        <div className="size-48 animate-pulse rounded-md bg-muted" />
      )}
      <Button
        disabled={!image}
        onClick={download}
        type="button"
        variant="outline"
        appearance="form"
      >
        Download QR
      </Button>
    </div>
  )
}

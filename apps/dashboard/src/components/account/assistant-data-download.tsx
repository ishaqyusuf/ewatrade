"use client"

import { Button } from "@ewatrade/ui"
import { useEffect, useRef, useState } from "react"

const maximumBytes = 24 * 1024 * 1024

/** Personal download; private contents never enter a shared query or persistent app cache. */
export function AssistantDataDownload() {
  const request = useRef<AbortController | null>(null)
  const objectUrl = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(
    () => () => {
      request.current?.abort()
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    },
    [],
  )

  async function download() {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/assistant/private-export", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      })
      if (!response.ok) {
        if (response.status === 401)
          throw Error(
            "Sign out and sign in again to verify your account, then retry the download.",
          )
        if (response.status === 413)
          throw Error(
            "Your account needs a larger export. Contact support@ewatrade.com; no partial download was created.",
          )
        if (response.status === 403)
          throw Error(
            "This download needs an account privacy review. Contact support@ewatrade.com.",
          )
        throw Error("The download could not be prepared. Try again.")
      }
      if (
        !response.headers.get("content-type")?.startsWith("application/json") ||
        !response.body
      )
        throw Error("The download could not be verified. Try again.")
      const reader = response.body.getReader()
      const chunks: Uint8Array<ArrayBuffer>[] = []
      let bytes = 0
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          bytes += next.value.byteLength
          if (bytes > maximumBytes)
            throw Error(
              "The download exceeds the supported size. Contact support@ewatrade.com.",
            )
          chunks.push(Uint8Array.from(next.value))
        }
      } finally {
        await reader.cancel().catch(() => undefined)
      }
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(
        new Blob(chunks, { type: "application/json" }),
      )
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = url
      const link = document.createElement("a")
      link.href = url
      link.download = "ewatrade-assistant-data.json"
      link.click()
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "The download could not be prepared.",
        )
    } finally {
      if (request.current === controller) request.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <section className="grid gap-4 border p-5">
      <div className="grid gap-2">
        <h2 className="font-medium">Download your assistant data</h2>
        <p className="text-sm text-muted-foreground">
          Download your private General, Setup and Product chats, drafts and
          retained original files from EwaTrade and WhatsApp. Shared business
          records are excluded. The download lists expired or unavailable files
          explicitly.
        </p>
      </div>
      <Button className="w-fit" disabled={busy} onClick={() => void download()}>
        {busy ? "Preparing download…" : "Download assistant data"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}

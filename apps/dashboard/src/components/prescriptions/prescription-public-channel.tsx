"use client"

import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import QRCode from "qrcode"
import { useEffect, useMemo, useState } from "react"

export function PrescriptionPublicChannel({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [qrCode, setQrCode] = useState("")
  const [copied, setCopied] = useState(false)
  const channel = useQuery(
    trpc.prescriptions.channelInfo.queryOptions({ storeId }),
  )
  const ensure = useMutation(
    trpc.prescriptions.channel.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.channelInfo.queryKey({ storeId }),
        }),
    }),
  )
  const url = useMemo(() => {
    if (!channel.data?.publicToken) return ""
    const base =
      process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/$/, "") ?? ""
    return base ? `${base}/prescription/${channel.data.publicToken}` : ""
  }, [channel.data?.publicToken])
  const whatsappUrl = useMemo(() => {
    const token = channel.data?.publicToken
    const number =
      channel.data?.store.whatsappStoreBindings[0]?.connection.displayNumber.replace(
        /\D/g,
        "",
      )
    if (!token || !number) return ""
    return `https://wa.me/${number}?text=${encodeURIComponent(`Start rxstore:${token}`)}`
  }, [channel.data])

  useEffect(() => {
    if (!url) {
      setQrCode("")
      return
    }
    QRCode.toDataURL(url, { margin: 0, width: 220 })
      .then(setQrCode)
      .catch(() => setQrCode(""))
  }, [url])

  return (
    <section className="grid gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-semibold">Public intake link and QR</h2>
        <p className="text-sm text-muted-foreground">
          This stable Store-specific destination preserves pharmacy attribution.
        </p>
      </div>
      {!channel.data ? (
        <Button
          disabled={ensure.isPending || channel.isLoading}
          onClick={() => ensure.mutate({ storeId })}
          type="button"
        >
          {ensure.isPending ? "Creating…" : "Create secure intake link"}
        </Button>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr] md:items-center">
          <div className="flex size-[220px] items-center justify-center border border-border bg-white p-3">
            {qrCode ? (
              <img
                alt="Prescription intake QR code"
                className="size-full"
                src={qrCode}
              />
            ) : (
              <span className="text-sm text-muted-foreground">
                Generating QR…
              </span>
            )}
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Public URL</span>
              <input
                className="h-10 border border-border bg-background px-3"
                readOnly
                value={url}
              />
            </label>
            {whatsappUrl ? (
              <a
                className="text-sm font-medium text-primary underline underline-offset-4"
                href={whatsappUrl}
                rel="noreferrer"
                target="_blank"
              >
                Test Store-routed WhatsApp intake
              </a>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(url)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 2_000)
                }}
                type="button"
                variant="outline"
              >
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button
                onClick={() => window.print()}
                type="button"
                variant="outline"
              >
                Print QR
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

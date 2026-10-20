"use client"
import { Button, Input, toast } from "@ewatrade/ui"

import { SettingsSection } from "@/components/settings/settings-page"
import { useTRPC } from "@/trpc/client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import QRCode from "qrcode"
import { useEffect, useId, useMemo, useState } from "react"

export function PrescriptionPublicChannel({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const linkId = useId()
  const [qrCode, setQrCode] = useState("")
  const [qrError, setQrError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const channel = useQuery(
    trpc.prescriptions.channelInfo.queryOptions({ storeId }),
  )
  const ensure = useMutation(
    trpc.prescriptions.channel.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.channelInfo.queryKey({ storeId }),
        })
        toast("Prescription link and QR code created.")
      },
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
      setQrError(null)
      return
    }
    setQrError(null)
    QRCode.toDataURL(url, { margin: 0, width: 220 })
      .then(setQrCode)
      .catch(() => {
        setQrCode("")
        setQrError("Couldn't make the QR code.")
      })
  }, [url])

  return (
    <SettingsSection
      title="Prescription link and QR code"
      description="Customers use it to send a prescription to this store. It doesn't change."
    >
      {channel.isLoading ? (
        <div
          className="m-4 h-24 animate-pulse rounded-md bg-muted"
          aria-busy="true"
        />
      ) : channel.error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <p className="text-sm">Couldn't load your prescription link.</p>
          <Button
            onClick={() => void channel.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : !channel.data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-[1_1_220px] text-sm">
            <p className="text-muted-foreground">
              You don't have a prescription link yet.
            </p>
            {ensure.error ? (
              <p role="alert" className="text-destructive">
                {ensure.error.message}
              </p>
            ) : null}
          </div>
          <Button
            disabled={ensure.isPending}
            onClick={() => ensure.mutate({ storeId })}
            type="button"
          >
            {ensure.isPending ? "Creating…" : "Create link and QR code"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-[180px_1fr] sm:items-center">
          <div className="flex size-[180px] items-center justify-center rounded-md border border-border bg-white p-3">
            {qrCode ? (
              <img
                alt="QR code for your prescription link"
                className="size-full"
                src={qrCode}
              />
            ) : (
              <span className="text-center text-sm text-muted-foreground">
                {url ? (qrError ?? "Making QR code…") : "No QR code yet"}
              </span>
            )}
          </div>
          <div className="grid min-w-0 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor={linkId} className="text-sm font-medium">
                Prescription link
              </label>
              <Input id={linkId} readOnly value={url} />
            </div>
            {!url ? (
              <p className="text-sm text-muted-foreground">
                Your online store address isn't set up yet, so this link can't
                be shared.
              </p>
            ) : null}
            {whatsappUrl ? (
              <a
                className="w-fit text-sm font-medium text-primary underline underline-offset-4"
                href={whatsappUrl}
                rel="noreferrer"
                target="_blank"
              >
                Test the WhatsApp link
              </a>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url)
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 2_000)
                  } catch {
                    setCopied(false)
                    toast.error(
                      "Couldn't copy the link. Select it and copy it yourself.",
                    )
                  }
                }}
                disabled={!url}
                size="sm"
                type="button"
                variant="outline"
              >
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button
                disabled={!url}
                onClick={() => window.print()}
                size="sm"
                type="button"
                variant="outline"
              >
                Print page
              </Button>
            </div>
          </div>
        </div>
      )}
    </SettingsSection>
  )
}

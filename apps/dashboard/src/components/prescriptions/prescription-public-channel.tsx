"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { Button, ControlField, Input } from "@ewatrade/ui"

import { useTRPC } from "@/trpc/client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import QRCode from "qrcode"
import { useEffect, useMemo, useState } from "react"

export function PrescriptionPublicChannel({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [qrCode, setQrCode] = useState("")
  const [qrError, setQrError] = useState<string | null>(null)
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
      setQrError(null)
      return
    }
    setQrError(null)
    QRCode.toDataURL(url, { margin: 0, width: 220 })
      .then(setQrCode)
      .catch(() => {
        setQrCode("")
        setQrError("The intake QR code could not be generated.")
      })
  }, [url])

  return (
    <section className="grid gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-semibold">Public intake link and QR</h2>
        <p className="text-sm text-muted-foreground">
          This stable Store-specific destination preserves pharmacy attribution.
        </p>
      </div>
      {channel.isLoading ? (
        <div className="h-24 animate-pulse bg-muted" aria-busy="true" />
      ) : channel.error ? (
        <div className="grid gap-3">
          <FormFeedback appearance="dashboard">
            {channel.error.message}
          </FormFeedback>
          <Button
            appearance="form"
            className="w-fit"
            onClick={() => void channel.refetch()}
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : !channel.data ? (
        <div className="grid justify-items-start gap-3">
          {ensure.error ? (
            <FormFeedback appearance="dashboard">
              {ensure.error.message}
            </FormFeedback>
          ) : null}
          <Button
            appearance="form"
            disabled={ensure.isPending || channel.isLoading}
            onClick={() => ensure.mutate({ storeId })}
            type="button"
          >
            {ensure.isPending ? "Creating…" : "Create secure intake link"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr] md:items-center">
          <div className="flex size-[220px] items-center justify-center rounded-lg border border-border bg-white p-3">
            {qrCode ? (
              <img
                alt="Prescription intake QR code"
                className="size-full"
                src={qrCode}
              />
            ) : (
              <span className="text-sm text-muted-foreground">
                {qrError ?? "Generating QR…"}
              </span>
            )}
          </div>
          <div className="grid gap-3">
            <ControlField label={<>Public URL</>}>
              <Input readOnly value={url} />
            </ControlField>
            {!url ? (
              <FormFeedback appearance="dashboard">
                The storefront URL is not configured, so this link cannot be
                shared yet.
              </FormFeedback>
            ) : null}
            {ensure.error ? (
              <FormFeedback appearance="dashboard">
                {ensure.error.message}
              </FormFeedback>
            ) : null}
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
                appearance="form"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url)
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 2_000)
                  } catch {
                    setCopied(false)
                  }
                }}
                disabled={!url}
                type="button"
                variant="outline"
              >
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button
                appearance="form"
                disabled={!url}
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

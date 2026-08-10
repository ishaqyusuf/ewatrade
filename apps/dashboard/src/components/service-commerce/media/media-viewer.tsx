"use client"

import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { MediaStatus } from "./media-status"

export function MediaViewer({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const params = useServiceCommerceParams()
  const attachmentId = params.attachmentId ?? ""
  const attachment = useQuery(
    trpc.serviceCommerce.mediaAttachment.queryOptions(
      { attachmentId, storeId },
      { enabled: Boolean(attachmentId), retry: false },
    ),
  )
  const [grant, setGrant] = useState<{ expiresAt: Date; url: string } | null>(
    null,
  )
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const authorize = useMutation(
    trpc.serviceCommerce.requestMediaViewerGrant.mutationOptions({
      onError: () => setGrant(null),
      onSuccess: (result) => {
        setFailed(false)
        setGrant(result)
        setNow(Date.now())
      },
    }),
  )

  useEffect(() => {
    if (!grant) return
    const delay = grant.expiresAt.getTime() - Date.now()
    if (delay <= 0) {
      setNow(Date.now())
      return
    }
    const timeout = window.setTimeout(() => setNow(Date.now()), delay + 50)
    return () => window.clearTimeout(timeout)
  }, [grant])

  if (attachment.isLoading) {
    return <div className="h-72 animate-pulse rounded-lg bg-muted" />
  }
  if (attachment.isError || !attachment.data) {
    return (
      <div className="grid gap-3" role="alert">
        <p className="text-sm text-destructive">
          {attachment.error?.message ?? "Attachment is unavailable."}
        </p>
        <Button
          className="w-fit"
          onClick={() => void attachment.refetch()}
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  }

  const media = attachment.data.media
  const usable = Boolean(grant && !failed && grant.expiresAt.getTime() > now)
  return (
    <section className="grid gap-4" aria-labelledby="customer-media-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium" id="customer-media-title">
            {media.fileName}
          </h3>
          <p className="text-sm text-muted-foreground">
            Private customer {media.kind}. Viewing is audited.
          </p>
        </div>
        <MediaStatus lifecycle={media.lifecycle} />
      </div>

      <div className="flex min-h-72 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 p-3">
        {usable && grant ? (
          <object
            aria-label={`Authorized private attachment ${media.fileName}`}
            className="h-96 w-full"
            data={grant.url}
            onError={() => setFailed(true)}
            type={media.mimeType}
          >
            <a href={grant.url} rel="noreferrer" target="_blank">
              Open authorized attachment
            </a>
          </object>
        ) : (
          <div className="grid max-w-sm justify-items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              {failed
                ? "The private view failed to load. Authorize a new link and try again."
                : grant
                  ? "The private view expired. Authorize a new short-lived link."
                  : media.lifecycle === "safe"
                    ? "Authorize a short-lived private view."
                    : "This attachment cannot be viewed until safety checks permit it."}
            </p>
            <Button
              disabled={media.lifecycle !== "safe" || authorize.isPending}
              onClick={() =>
                authorize.mutate({
                  attachmentId,
                  reason: "customer_request_attachment_review",
                  storeId,
                })
              }
              type="button"
              variant="outline"
            >
              {authorize.isPending ? "Authorizing…" : "Authorize view"}
            </Button>
          </div>
        )}
      </div>
      {authorize.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {authorize.error.message}
        </p>
      ) : null}
    </section>
  )
}

"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import {
  Button,
  MediaPreview,
  MediaPreviewFrame,
  SubmitButton,
} from "@ewatrade/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { MediaStatus } from "./media-status"

export function MediaViewer({ storeId }: { storeId: string }) {
  const params = useServiceCommerceParams()
  const attachmentId = params.attachmentId ?? ""
  return (
    <MediaViewerContent
      key={`${storeId}:${attachmentId}`}
      storeId={storeId}
      attachmentId={attachmentId}
    />
  )
}

function MediaViewerContent({
  storeId,
  attachmentId,
}: { storeId: string; attachmentId: string }) {
  const trpc = useTRPC()
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
    return <div className="h-72 animate-pulse bg-muted" />
  }
  if (attachment.isError || !attachment.data) {
    return (
      <div className="grid gap-3">
        <FormFeedback appearance="dashboard">
          {attachment.error?.message ?? "Attachment is unavailable."}
        </FormFeedback>
        <Button
          appearance="form"
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

      <MediaPreviewFrame>
        {usable && grant ? (
          <MediaPreview
            key={grant.url}
            label={`Authorized private attachment ${media.fileName}`}
            url={grant.url}
            onError={() => setFailed(true)}
            mimeType={media.mimeType}
          />
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
            <SubmitButton
              isSubmitting={authorize.isPending}
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
            </SubmitButton>
          </div>
        )}
      </MediaPreviewFrame>
      {authorize.isError ? (
        <FormFeedback appearance="dashboard">
          {authorize.error.message}
        </FormFeedback>
      ) : null}
    </section>
  )
}

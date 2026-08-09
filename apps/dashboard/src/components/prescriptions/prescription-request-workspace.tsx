"use client"

import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { buildPrescriptionQuoteCommand } from "@ewatrade/prescriptions/quotes"
import { Badge, Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import type { PrescriptionSheetMode } from "@/hooks/use-prescription-params"
import { PrescriptionSheetHeader } from "./prescription-sheet-header"

type RequestDetail = RouterOutputs["prescriptions"]["detail"]

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

function currentTranscript(request: RequestDetail) {
  return request.transcriptions.find(
    (item) => item.revision === request.currentTranscriptRevision,
  )
}

function formatStatus(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

export function PrescriptionRequestWorkspace({
  mode,
  requestId,
  storeId,
}: {
  mode: PrescriptionSheetMode
  requestId: string
  storeId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const detail = useQuery(
    trpc.prescriptions.detail.queryOptions(
      { requestId, storeId },
      { retry: false },
    ),
  )
  const [error, setError] = useState<string | null>(null)
  const [clearerReason, setClearerReason] = useState("")
  const [verifiedText, setVerifiedText] = useState<Record<string, string>>({})
  const [lineMapping, setLineMapping] = useState<
    Record<
      string,
      {
        availability:
          | "available"
          | "declined"
          | "partial"
          | "restricted"
          | "unavailable"
        offeringId: string
        quantity: string
      }
    >
  >({})
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({})
  const [pendingDecision, setPendingDecision] = useState<
    "declined" | "needs_clarification" | "released" | null
  >(null)

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.prescriptions.detail.queryKey({ requestId, storeId }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.prescriptions.queue.queryKey(),
      }),
    ])
  }
  const mutationOptions = {
    onError: (failure: { message: string }) => setError(failure.message),
    onSuccess: refresh,
  }
  const mediaAccess = useMutation(
    trpc.prescriptions.mediaAccess.mutationOptions({
      onError: mutationOptions.onError,
      onSuccess: (delivery) =>
        setMediaUrls((current) => ({
          ...current,
          [delivery.mediaId]: delivery.url,
        })),
    }),
  )
  const startTranscription = useMutation(
    trpc.prescriptions.startTranscription.mutationOptions(mutationOptions),
  )
  const clearerMedia = useMutation(
    trpc.prescriptions.requestClearerMedia.mutationOptions(mutationOptions),
  )
  const verifyLine = useMutation(
    trpc.prescriptions.verifyLine.mutationOptions(mutationOptions),
  )
  const submitForPharmacist = useMutation(
    trpc.prescriptions.submitForPharmacistReview.mutationOptions(
      mutationOptions,
    ),
  )
  const pharmacistReview = useMutation(
    trpc.prescriptions.pharmacistReview.mutationOptions(mutationOptions),
  )
  const issueQuote = useMutation(
    trpc.prescriptions.issueQuote.mutationOptions(mutationOptions),
  )
  const offerings = useQuery(
    trpc.prescriptions.selectableOfferings.queryOptions(
      { storeId },
      {
        enabled:
          detail.data?.status === "PHARMACIST_REVIEW" ||
          detail.data?.status === "READY_TO_QUOTE",
        retry: false,
      },
    ),
  )

  if (detail.isLoading) {
    return <div className="h-48 animate-pulse rounded-lg bg-muted" />
  }
  if (detail.error || !detail.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {detail.error?.message ?? "Prescription Request not found."}
      </p>
    )
  }
  const request = detail.data
  const transcript = currentTranscript(request)
  const currentMedia = request.media.filter(
    (media) => media.revision === request.currentMediaRevision,
  )
  const allowedStatuses: Partial<Record<PrescriptionSheetMode, string[]>> = {
    "attendant-review": ["ATTENDANT_VERIFICATION"],
    "media-review": ["RECEIVED", "MEDIA_REVIEW", "NEEDS_CLEARER_MEDIA"],
    "pharmacist-review": ["PHARMACIST_REVIEW"],
    quote: ["READY_TO_QUOTE"],
  }
  const allowed = allowedStatuses[mode]
  if (allowed && !allowed.includes(request.status)) {
    return (
      <p role="alert" className="text-sm text-destructive">
        This request has moved to {formatStatus(request.status)}. Close and
        reopen it from the queue to continue in the current workflow.
      </p>
    )
  }
  const isPending =
    startTranscription.isPending ||
    clearerMedia.isPending ||
    verifyLine.isPending ||
    submitForPharmacist.isPending ||
    pharmacistReview.isPending ||
    issueQuote.isPending

  const confirmPharmacistDecision = () => {
    if (!transcript || !pendingDecision) return
    setError(null)
    pharmacistReview.mutate(
      {
        decision: pendingDecision,
        expectedMediaRevision: request.currentMediaRevision,
        expectedTranscriptRevision: transcript.revision,
        lines:
          pendingDecision === "released"
            ? transcript.lines.map((line) => {
                const mapping = lineMapping[line.id] ?? {
                  availability: "available" as const,
                  offeringId: "",
                  quantity: "1",
                }
                return {
                  availability: mapping.availability,
                  offeringId: mapping.offeringId || undefined,
                  quantity: mapping.quantity || undefined,
                  transcriptionLineId: line.id,
                }
              })
            : [],
        reason:
          pendingDecision === "declined"
            ? "Pharmacist declined after review"
            : pendingDecision === "needs_clarification"
              ? "Customer clarification required"
              : undefined,
        requestId,
        storeId,
      },
      {
        onSuccess: () => setPendingDecision(null),
      },
    )
  }

  const quote = () => {
    if (!transcript) return
    issueQuote.mutate(
      buildPrescriptionQuoteCommand({
        lines: transcript.lines.map((line) => ({
          availability: line.mapping?.availability,
          id: line.id,
        })),
        prices,
        requestId,
        storeId,
      }),
    )
  }

  return (
    <div className="grid gap-6">
      <PrescriptionSheetHeader
        reference={request.reference}
        status={formatStatus(request.status)}
      />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd className="mt-1 capitalize">{formatStatus(request.source)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fulfilment</dt>
          <dd className="mt-1 capitalize">
            {formatStatus(request.fulfilmentPreference)}
          </dd>
        </div>
      </dl>

      {(mode === "details" || mode === "media-review") &&
      currentMedia.length ? (
        <section className="grid gap-3">
          <h4 className="font-medium">Private media</h4>
          {currentMedia.map((media) => (
            <div
              key={media.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
            >
              <div>
                <p>Page {media.pageNumber}</p>
                <Badge className="mt-1 rounded-full">
                  {formatStatus(media.status)}
                </Badge>
              </div>
              {mediaUrls[media.id] ? (
                <a
                  className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium"
                  href={mediaUrls[media.id]}
                  rel="noreferrer"
                  target="_blank"
                >
                  View once
                </a>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={media.status !== "SAFE" || mediaAccess.isPending}
                  onClick={() =>
                    mediaAccess.mutate({
                      mediaId: media.id,
                      reason: "Operational prescription review",
                      storeId,
                    })
                  }
                >
                  Authorize view
                </Button>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {mode === "media-review" &&
      (request.status === "RECEIVED" || request.status === "MEDIA_REVIEW") &&
      currentMedia.length ? (
        <section className="grid gap-3 rounded-lg border border-border p-4">
          <h4 className="font-medium">Media review</h4>
          <p className="text-sm text-muted-foreground">
            Every page must pass the private safety scan before transcription.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isPending}
              onClick={() => startTranscription.mutate({ requestId, storeId })}
            >
              Start transcription
            </Button>
          </div>
          <div className="grid gap-2">
            <input
              className={fieldClass}
              value={clearerReason}
              onChange={(event) => setClearerReason(event.target.value)}
              placeholder="Neutral reason for clearer images"
            />
            <Button
              variant="outline"
              disabled={isPending || !clearerReason.trim()}
              onClick={() =>
                clearerMedia.mutate({
                  reason: clearerReason,
                  requestId,
                  storeId,
                })
              }
            >
              Request clearer media
            </Button>
          </div>
        </section>
      ) : null}

      {mode === "attendant-review" &&
      request.status === "ATTENDANT_VERIFICATION" &&
      transcript ? (
        <section className="grid gap-3">
          <h4 className="font-medium">Verify every transcription line</h4>
          <p className="text-sm text-muted-foreground">
            OCR is a draft only. Confirmation here is not clinical approval.
          </p>
          {transcript.lines.map((line) => (
            <div key={line.id} className="grid gap-2 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Draft line {line.lineNumber}
              </p>
              <input
                className={fieldClass}
                value={
                  verifiedText[line.id] ?? line.verifiedText ?? line.draftText
                }
                onChange={(event) =>
                  setVerifiedText((current) => ({
                    ...current,
                    [line.id]: event.target.value,
                  }))
                }
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={verifyLine.isPending}
                  onClick={() =>
                    verifyLine.mutate({
                      lineId: line.id,
                      status: "verified",
                      storeId,
                      verifiedText:
                        verifiedText[line.id] ??
                        line.verifiedText ??
                        line.draftText,
                    })
                  }
                >
                  Verify line
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={verifyLine.isPending}
                  onClick={() =>
                    verifyLine.mutate({
                      lineId: line.id,
                      status: "unreadable",
                      storeId,
                    })
                  }
                >
                  Mark unreadable
                </Button>
              </div>
            </div>
          ))}
          <Button
            disabled={isPending}
            onClick={() => submitForPharmacist.mutate({ requestId, storeId })}
          >
            Send to pharmacist
          </Button>
        </section>
      ) : null}

      {mode === "pharmacist-review" &&
      request.status === "PHARMACIST_REVIEW" &&
      transcript ? (
        <section className="grid gap-3">
          <h4 className="font-medium">
            Pharmacist review and catalogue mapping
          </h4>
          <p className="text-sm text-muted-foreground">
            Map the verified lines without changing prescribed content. Only an
            active credentialed pharmacist can release.
          </p>
          {transcript.lines.map((line) => {
            const mapping = lineMapping[line.id] ?? {
              availability: "available" as const,
              offeringId: "",
              quantity: "1",
            }
            return (
              <div key={line.id} className="grid gap-2 rounded-lg border p-3">
                <p className="font-medium">
                  {line.verifiedText ?? "Unreadable line"}
                </p>
                <select
                  className={fieldClass}
                  value={mapping.availability}
                  onChange={(event) =>
                    setLineMapping((current) => ({
                      ...current,
                      [line.id]: {
                        ...mapping,
                        availability: event.target
                          .value as typeof mapping.availability,
                      },
                    }))
                  }
                >
                  <option value="available">Available</option>
                  <option value="partial">Partially available</option>
                  <option value="unavailable">Unavailable</option>
                  <option value="restricted">Restricted</option>
                  <option value="declined">Declined</option>
                </select>
                <select
                  className={fieldClass}
                  value={mapping.offeringId}
                  onChange={(event) =>
                    setLineMapping((current) => ({
                      ...current,
                      [line.id]: { ...mapping, offeringId: event.target.value },
                    }))
                  }
                >
                  <option value="">No Product Offering</option>
                  {(offerings.data ?? []).map((offering) => (
                    <option key={offering.id} value={offering.id}>
                      {offering.label}
                    </option>
                  ))}
                </select>
                <input
                  className={fieldClass}
                  value={mapping.quantity}
                  onChange={(event) =>
                    setLineMapping((current) => ({
                      ...current,
                      [line.id]: { ...mapping, quantity: event.target.value },
                    }))
                  }
                  inputMode="decimal"
                  placeholder="Quantity"
                />
              </div>
            )
          })}
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              disabled={isPending}
              onClick={() => setPendingDecision("released")}
            >
              Release for quote
            </Button>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => setPendingDecision("needs_clarification")}
            >
              Request clarification
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => setPendingDecision("declined")}
            >
              Decline
            </Button>
          </div>
          {pendingDecision ? (
            <div
              className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"
              role="alertdialog"
              aria-labelledby="pharmacist-decision-title"
            >
              <div>
                <h5 id="pharmacist-decision-title" className="font-medium">
                  Confirm professional decision
                </h5>
                <p className="mt-1 text-sm">
                  {formatStatus(pendingDecision)} for media revision{" "}
                  {request.currentMediaRevision} and transcript revision{" "}
                  {transcript.revision}. This command is audited and revalidated
                  server-side.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={pharmacistReview.isPending}
                  onClick={confirmPharmacistDecision}
                >
                  {pharmacistReview.isPending
                    ? "Confirming…"
                    : "Confirm decision"}
                </Button>
                <Button
                  disabled={pharmacistReview.isPending}
                  onClick={() => setPendingDecision(null)}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {mode === "quote" && request.status === "READY_TO_QUOTE" && transcript ? (
        <section className="grid gap-3">
          <h4 className="font-medium">Prepare pickup quote</h4>
          {transcript.lines.map((line) => (
            <div key={line.id} className="grid gap-1.5 text-sm">
              {line.mapping?.customerWording ??
                line.verifiedText ??
                "Unavailable line"}
              {line.mapping?.availability === "AVAILABLE" ||
              line.mapping?.availability === "PARTIAL" ? (
                <input
                  aria-label={`Unit price for ${line.mapping?.customerWording ?? line.verifiedText ?? "prescription line"}`}
                  className={fieldClass}
                  inputMode="decimal"
                  placeholder="Unit price"
                  value={prices[line.id] ?? ""}
                  onChange={(event) =>
                    setPrices((current) => ({
                      ...current,
                      [line.id]: event.target.value,
                    }))
                  }
                />
              ) : (
                <Badge className="w-fit rounded-full">
                  {formatStatus(line.mapping?.availability ?? "unavailable")}
                </Badge>
              )}
            </div>
          ))}
          <Button disabled={isPending} onClick={quote}>
            Issue pickup quote
          </Button>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

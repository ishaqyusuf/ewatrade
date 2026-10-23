"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { ServiceQuoteForm } from "@/components/service-work/service-quote-form"
import {
  formatDue,
  formatPrice,
  isOpenRequest,
  requestStatus,
  toneClass,
} from "@/components/service-work/service-utils"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useTRPC } from "@/trpc/client"
import {
  Badge,
  Button,
  ControlField,
  FormActions,
  Sheet,
  SubmitButton,
  Textarea,
  cn,
} from "@ewatrade/ui"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useState } from "react"

type StoreSummary = { currencyCode: string; id: string; name: string }
type Step = "quote" | "info" | "decline" | null

const STEP_TITLE: Record<Exclude<Step, null>, string> = {
  quote: "Prepare quote",
  info: "Ask for more details",
  decline: "Decline this request?",
}

/**
 * A customer request and everything you do with it. Send quote, Ask for more
 * details and Decline are steps inside this sheet, with Back to the request.
 */
export function CustomerRequestSheet({
  store,
  timeZone,
}: {
  store: StoreSummary
  timeZone: string
}) {
  const { requestId, jobStep, setParams, sheet } = useServiceWorkParams()
  const open =
    (sheet === "customer_request" || sheet === "quote") && Boolean(requestId)
  const { closeError, requestClose } = useSheetDismissal(() => setParams(null))

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose()
      }}
    >
      {open && requestId ? (
        <CustomerRequestContent
          key={`${store.id}:${requestId}:${jobStep ?? "record"}`}
          closeError={closeError}
          initialStep={
            sheet === "quote" || jobStep === "quote"
              ? "quote"
              : jobStep === "ask" || jobStep === "info"
                ? "info"
                : jobStep === "decline"
                  ? "decline"
                  : null
          }
          requestId={requestId}
          store={store}
          timeZone={timeZone}
          onDone={() => void requestClose()}
        />
      ) : null}
    </Sheet>
  )
}

function CustomerRequestContent({
  closeError,
  initialStep,
  requestId,
  store,
  timeZone,
  onDone,
}: {
  closeError: string | null
  initialStep: Step
  requestId: string
  store: StoreSummary
  timeZone: string
  onDone: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams } = useServiceWorkParams()
  const { data: requests } = useSuspenseQuery(
    trpc.serviceAccess.requests.queryOptions(
      { limit: 100, storeId: store.id },
      { retry: false },
    ),
  )
  const request = requests.find((entry) => entry.id === requestId)
  const [step, setStep] = useState<Step>(initialStep)
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const firstName = request?.customerName.split(/\s+/)[0] ?? ""
  const update = useMutation(
    trpc.serviceAccess.updateRequest.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async (_result, variables) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.serviceAccess.requests.queryKey(),
        })
        if (variables.status === "declined") {
          onDone()
          return
        }
        setNotice(`Reply saved for ${request?.customerName ?? "the customer"}.`)
        goTo(null)
      },
    }),
  )

  function goTo(next: Step) {
    setError(null)
    setStep(next)
    if (next === "info")
      setMessage(
        `Hello ${firstName}, thanks for your request. To give you a price, please tell us: `,
      )
    if (next === "decline") setMessage("")
    // Keep the URL on the record so a refresh reopens the request, not the step.
    void setParams({
      requestId,
      jobStep: next,
      serviceSheet: "customer_request",
    })
  }

  if (!request) {
    return (
      <SheetFrame closeError={closeError} title="Customer request">
        <p className="text-sm text-muted-foreground">
          This request is no longer available.
        </p>
      </SheetFrame>
    )
  }

  const status = requestStatus(request.status)
  const wants = request.lines
    .map((line) => `${line.offeringName} · ${line.quantity}`)
    .join(", ")
  const contact = [request.customerPhone, request.customerEmail]
    .filter(Boolean)
    .join(" · ")
  const back = step
    ? { label: `Back to ${request.customerName}`, onClick: () => goTo(null) }
    : undefined
  const header = (
    <Badge className={cn("w-fit rounded-full", toneClass(status.tone))}>
      {status.label}
    </Badge>
  )

  if (step === "quote") {
    return (
      <SheetFrame
        closeError={closeError}
        back={back}
        title={STEP_TITLE.quote}
        description={`${request.customerName} · ${wants}`}
      >
        <ServiceQuoteForm key={`${store.id}:${requestId}`} store={store} />
      </SheetFrame>
    )
  }

  if (step === "info" || step === "decline") {
    const decline = step === "decline"
    const response = message.trim()
    return (
      <SheetFrame
        closeError={closeError}
        back={back}
        title={STEP_TITLE[step]}
        description={`${request.customerName} · ${wants}`}
      >
        <div className="grid gap-4">
          {error ? (
            <FormFeedback appearance="dashboard">{error}</FormFeedback>
          ) : null}
          <ControlField
            label={<>Message to {request.customerName}</>}
            description="Saved on this request. Nothing is sent automatically."
          >
            <Textarea
              rows={5}
              maxLength={2_000}
              value={message}
              placeholder={
                decline ? "e.g. Sorry, we are fully booked this month." : ""
              }
              onChange={(event) => setMessage(event.target.value)}
            />
          </ControlField>
          <FormActions>
            <Button type="button" variant="outline" onClick={() => goTo(null)}>
              {decline ? "Keep request" : "Back"}
            </Button>
            <SubmitButton
              type="button"
              variant={decline ? "destructive" : "default"}
              isSubmitting={update.isPending}
              disabled={update.isPending}
              onClick={() => {
                if (!response) {
                  setError("Write what you need to know.")
                  return
                }
                update.mutate({
                  expectedRevision: request.revision,
                  storeId: store.id,
                  requestId,
                  response,
                  status: decline ? "declined" : "needs_information",
                })
              }}
            >
              {decline ? "Decline request" : "Save reply"}
            </SubmitButton>
          </FormActions>
        </div>
      </SheetFrame>
    )
  }

  const open = isOpenRequest(request.status)
  const quote = request.currentQuote
  return (
    <SheetFrame
      closeError={closeError}
      title={request.customerName}
      description={`From ${request.formLabel}`}
      header={header}
    >
      <div className="grid gap-5">
        {notice ? (
          <FormFeedback appearance="dashboard" variant="default">
            {notice}
          </FormFeedback>
        ) : null}
        <div className="grid gap-3 border border-border bg-card p-4">
          <p className="text-sm font-medium">
            {request.status === "SUBMITTED"
              ? "New request. Send a price, or ask for what you need to price it."
              : request.status === "NEEDS_INFORMATION"
                ? "You asked for more details. Waiting for the customer."
                : request.status === "QUOTED" && quote
                  ? `Quote of ${formatPrice(quote.totalMinor, quote.currencyCode)} prepared${quote.expiresAt ? `. Good until ${formatDue(quote.expiresAt, timeZone)}` : ""}.`
                  : request.status === "CONVERTED"
                    ? "Accepted. The job was created for you."
                    : request.status === "DECLINED"
                      ? "You declined this request."
                      : "The customer withdrew this request."}
          </p>
          {open || request.status === "QUOTED" ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => goTo("quote")}>
                {request.status === "QUOTED"
                  ? "Change the quote"
                  : "Prepare quote"}
              </Button>
              {request.status === "SUBMITTED" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => goTo("info")}
                >
                  Ask for more details
                </Button>
              ) : null}
              {open ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => goTo("decline")}
                >
                  Decline
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Wants</dt>
          <dd>
            {request.lines.map((line) => (
              <span key={line.id} className="block">
                {line.offeringName} · {line.quantity}
                {line.fixedPriceMinor !== null
                  ? ` · ${formatPrice(line.fixedPriceMinor, store.currencyCode)} each`
                  : " · price after quote"}
              </span>
            ))}
          </dd>
          {request.details ? (
            <>
              <dt className="text-muted-foreground">They wrote</dt>
              <dd className="whitespace-pre-line">“{request.details}”</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Contact</dt>
          <dd>{contact || "No phone or email"}</dd>
          <dt className="text-muted-foreground">Sent</dt>
          <dd>{formatDue(request.createdAt, timeZone)}</dd>
          {request.staffResponse ? (
            <>
              <dt className="text-muted-foreground">Your last message</dt>
              <dd className="whitespace-pre-line">{request.staffResponse}</dd>
            </>
          ) : null}
        </dl>
        <p className="text-xs text-muted-foreground">
          Nothing is booked or charged until the customer accepts a quote. Then
          the job is created for you.
        </p>
      </div>
    </SheetFrame>
  )
}

"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useCustomerMessageParams } from "@/hooks/use-customer-message-params"
import { useTRPC } from "@/trpc/client"
import {
  type CustomerMessageEventKey,
  getCustomerMessageEvent,
} from "@ewatrade/customer-messages/client"
import {
  Button,
  SelectControl,
  Textarea,
  buttonVariants,
  cn,
} from "@ewatrade/ui"
import { WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { MessageBubble } from "./message-bubble"
import { MessageComposer } from "./message-composer"
import {
  LANGUAGE_OPTIONS,
  type MessageLanguage,
  type MessageTone,
  TONE_OPTIONS,
  hidesCachedData,
  saveFailureText,
  savedMessageLabel,
} from "./message-status"
import { messageLength, tryRenderMessage } from "./message-variables"
import { useDraftWriter } from "./use-draft-writer"
import {
  type OrderMessagePreview,
  PREVIEW_STALE_MS,
} from "./use-order-message-action"
import {
  type TemplateScope,
  expectedFor,
  scopeTemplate,
  useTemplateMutations,
} from "./use-template-mutations"

const OPEN_MAX_CHARACTERS = 1_500

/**
 * One Order's message: pick the event (and exact record), review the text,
 * then Copy or Open WhatsApp. Nothing here sends; the person sends it in
 * WhatsApp.
 */
export function OrderMessagePanel({
  orderId,
  eventKey,
  sourceId,
  onDirtyChange,
}: {
  orderId: string
  eventKey: CustomerMessageEventKey | null
  sourceId: string | null
  onDirtyChange: (dirty: boolean) => void
}) {
  const trpc = useTRPC()
  const { setParams } = useCustomerMessageParams()
  const dirty = useRef(false)
  const trackDirty = useCallback(
    (value: boolean) => {
      dirty.current = value
      onDirtyChange(value)
    },
    [onDirtyChange],
  )
  // Switching event or record starts a new draft: confirm before losing one.
  const keepDraft = () =>
    dirty.current &&
    !window.confirm("Switch messages? Your changes aren’t saved.")
  const query = useQuery(
    trpc.customerMessages.preview.queryOptions(
      {
        orderId,
        eventKey: eventKey ?? undefined,
        sourceId: sourceId ?? undefined,
      },
      {
        retry: false,
        staleTime: PREVIEW_STALE_MS,
        // Switching event keeps this Order's recipient and picker on screen;
        // the message itself is never shown from another event.
        placeholderData: (previous) =>
          previous?.orderId === orderId ? previous : undefined,
      },
    ),
  )
  if (query.isPending)
    return <output aria-live="polite">Preparing the message…</output>
  if (!query.data || (query.isError && hidesCachedData(query.error)))
    return (
      <div role="alert" className="grid gap-3">
        <p className="text-sm">
          This message couldn’t be prepared. Check the selected Store and your
          access.
        </p>
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  const preview = query.data
  return (
    <div className="grid gap-5">
      <MessageHeader
        preview={preview}
        selectedEvent={eventKey ?? preview.eventKey}
        selectedSource={sourceId ?? preview.sourceId}
        onEvent={(next) => {
          if (next === preview.eventKey || keepDraft()) return
          void setParams({ messageEvent: next, messageSource: null })
        }}
        onSource={(next) => {
          if (next === preview.sourceId || keepDraft()) return
          void setParams({ messageSource: next })
        }}
      />
      {query.isPlaceholderData ? (
        <output aria-live="polite" className="text-sm text-muted-foreground">
          Preparing the message…
        </output>
      ) : (
        <MessageBody
          // A different event, record or fresh facts start a clean draft.
          key={`${preview.eventKey}:${preview.sourceId ?? ""}`}
          preview={preview}
          refreshing={query.isFetching}
          refreshFailed={query.isError}
          onRetry={() => void query.refetch()}
          onDirtyChange={trackDirty}
        />
      )}
    </div>
  )
}

function MessageHeader({
  preview,
  selectedEvent,
  selectedSource,
  onEvent,
  onSource,
}: {
  preview: OrderMessagePreview
  selectedEvent: CustomerMessageEventKey
  selectedSource: string | null
  onEvent: (eventKey: CustomerMessageEventKey) => void
  onSource: (sourceId: string) => void
}) {
  // Payment and refund messages always show which record they describe.
  const showSources =
    preview.sourceChoices.length > 0 &&
    (selectedEvent === "payment.recorded" ||
      selectedEvent === "payment.refund_recorded")
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">To</dt>
        <dd className="min-w-0">
          <span className="font-medium">
            {preview.recipient?.name || "Customer"}
          </span>
          {preview.recipient?.phoneDisplay ? (
            <span className="text-muted-foreground">
              {" "}
              · {preview.recipient.phoneDisplay}
            </span>
          ) : null}
        </dd>
        <dt className="text-muted-foreground">Order</dt>
        <dd>{preview.orderNumber}</dd>
        {orderFacts(preview).map((fact) => (
          <Fragment key={fact.label}>
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className="tabular-nums">{fact.value}</dd>
          </Fragment>
        ))}
      </dl>
      <div className="grid gap-1.5">
        <label htmlFor="customer-message-event" className="text-sm font-medium">
          Message about
        </label>
        <SelectControl<CustomerMessageEventKey>
          id="customer-message-event"
          value={selectedEvent}
          onValueChange={onEvent}
          options={preview.events.map((event) => ({
            value: event.key,
            label: event.label,
            description: savedMessageLabel(event.state, event.scope),
          }))}
        />
      </div>
      {showSources ? (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">
            {preview.eventKey === "payment.refund_recorded"
              ? "Which refund?"
              : "Which payment?"}
          </legend>
          <div className="grid gap-1.5">
            {preview.sourceChoices.map((choice) => (
              <label
                key={choice.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted",
                  selectedSource === choice.id &&
                    "border-foreground/40 bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="customer-message-source"
                  className="accent-foreground"
                  checked={selectedSource === choice.id}
                  onChange={() => onSource(choice.id)}
                />
                <span>{choice.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  )
}

/**
 * Current facts shown with every preview and re-review: the server's own
 * formatted values, never recomputed here.
 */
function orderFacts(preview: OrderMessagePreview) {
  const v = preview.variables
  const facts: Array<{ label: string; value: string }> = []
  if (preview.eventKey === "payment.recorded" && v.amount_paid)
    facts.push({ label: "This payment", value: v.amount_paid })
  if (preview.eventKey === "payment.refund_recorded" && v.refund_amount)
    facts.push({ label: "This refund", value: v.refund_amount })
  if (v.order_total) facts.push({ label: "Total", value: v.order_total })
  if (v.balance_due) facts.push({ label: "Balance due", value: v.balance_due })
  return facts
}

type Mode =
  | { kind: "view" }
  | { kind: "edit"; text: string }
  | { kind: "compose" }

function MessageBody({
  preview,
  refreshing,
  refreshFailed,
  onRetry,
  onDirtyChange,
}: {
  preview: OrderMessagePreview
  refreshing: boolean
  /** The last re-read failed: text stays, opening waits for a good read. */
  refreshFailed: boolean
  onRetry: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const { setParams } = useCustomerMessageParams()
  const event = getCustomerMessageEvent(preview.eventKey)
  const [mode, setMode] = useState<Mode>(
    preview.state === "not_composed" ? { kind: "compose" } : { kind: "view" },
  )
  const [composeBody, setComposeBody] = useState("")
  // Edited text was written against these facts; a refetch with new facts
  // (recipient, amounts) must be reviewed before it can open.
  const [reviewed, setReviewed] = useState(preview.previewVersion)
  const factsChanged =
    mode.kind !== "view" && preview.previewVersion !== reviewed
  const version = mode.kind === "view" ? preview.previewVersion : reviewed
  // While order facts re-read, nothing opens or copies from the old ones.
  const holdReason = refreshing
    ? "Updating the order details…"
    : refreshFailed
      ? "Couldn’t refresh the order details. Try again."
      : factsChanged
        ? "Check the updated order details first."
        : null
  const retryNotice =
    refreshFailed && !refreshing ? (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
        <span className="flex-1">
          Couldn’t refresh the order details. Your text is kept.
        </span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    ) : null
  const changedNotice = factsChanged ? (
    <div className="grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p>
        This order changed while you were writing. Check the recipient and
        details above, then continue.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setReviewed(preview.previewVersion)}
      >
        I’ve checked it
      </Button>
    </div>
  ) : null
  const dirty =
    (mode.kind === "edit" && mode.text !== preview.message) ||
    (mode.kind === "compose" && composeBody.trim().length > 0)
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  function openSaved() {
    if (
      dirty &&
      !window.confirm("Leave this message? Your changes aren’t saved.")
    )
      return
    void setParams({
      messageSheet: "template",
      messageEvent: preview.eventKey,
      messageScope: preview.templateScope ?? "business",
    })
  }

  const blocked = blockedCopy(preview)
  if (blocked)
    return (
      <div className="grid gap-3">
        <FormFeedback variant="default" appearance="dashboard">
          {blocked}
        </FormFeedback>
        {preview.state === "disabled" && preview.canManageTemplates ? (
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => openSaved()}
          >
            Open message settings
          </Button>
        ) : null}
        {preview.state === "disabled" &&
        preview.canManageTemplates &&
        preview.canComposeOneOff ? (
          <Button
            variant="ghost"
            className="w-fit"
            onClick={() => setMode({ kind: "compose" })}
          >
            Write a one-time message
          </Button>
        ) : null}
        {mode.kind === "compose" ? (
          <>
            {retryNotice}
            {changedNotice}
            <Composer
              preview={preview}
              body={composeBody}
              onBody={setComposeBody}
              version={version}
              holdReason={holdReason}
            />
          </>
        ) : null}
      </div>
    )

  if (mode.kind === "compose")
    return (
      <div className="grid gap-4">
        {retryNotice}
        {changedNotice}
        <Composer
          preview={preview}
          body={composeBody}
          onBody={setComposeBody}
          version={version}
          holdReason={holdReason}
        />
      </div>
    )

  const text = mode.kind === "edit" ? mode.text : (preview.message ?? "")
  return (
    <div className="grid gap-4">
      {mode.kind === "edit" ? (
        <div className="grid gap-1.5">
          <label
            htmlFor="customer-message-once"
            className="text-sm font-medium"
          >
            This message only
          </label>
          <Textarea
            id="customer-message-once"
            value={mode.text}
            rows={7}
            className="min-h-40 resize-y"
            onChange={(change) =>
              setMode({ kind: "edit", text: change.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            Changes here aren’t saved for other orders.
          </p>
        </div>
      ) : (
        <MessageBubble text={text} />
      )}
      <p className="text-xs text-muted-foreground">
        {event.label} · prepared{" "}
        {new Date(preview.preparedAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}
        {refreshing ? " · refreshing…" : ""}. Send it from WhatsApp after it
        opens.
      </p>
      {retryNotice}
      {changedNotice}
      <OpenActions
        // Copy/open results belong to the text they were about.
        key={mode.kind}
        preview={preview}
        text={text}
        edited={mode.kind === "edit"}
        previewVersion={version}
        disabledReason={holdReason}
      />
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {mode.kind === "view" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setMode({ kind: "edit", text: preview.message ?? "" })
            }
          >
            Edit this message
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode({ kind: "view" })}
          >
            Use saved wording
          </Button>
        )}
        {preview.canManageTemplates ? (
          <Button variant="ghost" size="sm" onClick={() => openSaved()}>
            Edit saved message
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Grey states explain; they never offer Open or Copy. */
function blockedCopy(preview: OrderMessagePreview): string | null {
  switch (preview.state) {
    case "no_phone":
      return "This order has no customer phone number. Add one under Change → Customer."
    case "invalid_phone":
      return `Check the phone number${preview.recipient?.phoneDisplay ? ` (${preview.recipient.phoneDisplay})` : ""}. ${preview.reason ?? "Add the country code if the customer is abroad."}`
    case "source_required":
      return preview.sourceChoices.length
        ? "Choose which record this message is about."
        : preview.eventKey === "payment.refund_recorded"
          ? "This order has no recorded refund to describe."
          : "This order has no recorded payment to describe."
    case "disabled":
      return "This message is turned off for this Store."
    case "ineligible":
      return preview.reason ?? "This message doesn’t apply to this order now."
    case "invalid_message":
      return (
        preview.reason ??
        "The saved message needs details this order doesn’t have."
      )
    default:
      return null
  }
}

/** Unsaved wording: one-time text plus, for managers, Save message. */
function Composer({
  preview,
  body,
  onBody,
  version,
  holdReason,
}: {
  preview: OrderMessagePreview
  body: string
  onBody: (body: string) => void
  version: OrderMessagePreview["previewVersion"]
  holdReason: string | null
}) {
  const trpc = useTRPC()
  const event = getCustomerMessageEvent(preview.eventKey)
  const [scope, setScope] = useState<TemplateScope>("business")
  const [tone, setTone] = useState<MessageTone>("friendly")
  const [language, setLanguage] = useState<MessageLanguage>("en")
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [source, setSource] = useState<"MANUAL" | "AI_ASSISTED" | "STARTER">(
    "MANUAL",
  )
  const list = useQuery(
    trpc.customerMessages.templates.list.queryOptions(undefined, {
      enabled: preview.canManageTemplates,
      retry: false,
    }),
  )
  const { save } = useTemplateMutations()
  // The saved rows this one-time draft was started against, captured once;
  // Save never adopts a revision someone else wrote meanwhile.
  const guards = useRef(
    new Map<TemplateScope, ReturnType<typeof expectedFor>>(),
  )
  if (list.data)
    for (const each of ["business", "store"] as const)
      if (!guards.current.has(each))
        guards.current.set(
          each,
          expectedFor(scopeTemplate(list.data, preview.eventKey, each)),
        )
  const writer = useDraftWriter()
  const rendered = body.trim()
    ? tryRenderMessage(preview.eventKey, body, preview.variables)
    : null
  const finalText = rendered?.text ?? ""
  return (
    <div className="grid gap-4">
      <MessageComposer
        id="customer-message-compose"
        eventKey={preview.eventKey}
        value={body}
        onChange={(next) => {
          onBody(next)
          setNotice(null)
          if (source !== "MANUAL" && next !== body) setSource("MANUAL")
        }}
        variables={preview.variables}
        exampleLabel={`What ${preview.recipient?.name || "the customer"} will see`}
        label={`${event.label} message`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onBody(event.starterBody)
            setSource("STARTER")
            setNotice("Starter wording added. Change anything you like.")
          }}
        >
          Use starter wording
        </Button>
        {preview.canManageTemplates ? (
          <>
            <SelectControl<MessageTone>
              aria-label="Tone"
              className="h-8 w-36"
              value={tone}
              onValueChange={setTone}
              options={[...TONE_OPTIONS]}
            />
            <SelectControl<MessageLanguage>
              aria-label="Language"
              className="h-8 w-32"
              value={language}
              onValueChange={setLanguage}
              options={[...LANGUAGE_OPTIONS]}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={writer.writing}
              onClick={() => {
                setProblem(null)
                void writer
                  .write({ eventKeys: [preview.eventKey], tone, language })
                  .then((result) => {
                    if (!result) return
                    const next = result.drafts.find(
                      (item) => item.eventKey === preview.eventKey,
                    )
                    if (!next) {
                      setProblem("No draft came back. Write your own here.")
                      return
                    }
                    onBody(next.body)
                    setSource(next.source)
                    setNotice(
                      result.source === "ai"
                        ? "Draft ready. Read it before you use it."
                        : `Starter wording; AI unavailable${result.reason ? ` (${result.reason})` : ""}.`,
                    )
                  })
                  .catch((failure: unknown) =>
                    setProblem(
                      failure instanceof Error
                        ? failure.message
                        : "No draft came back. Write your own here.",
                    ),
                  )
              }}
            >
              {writer.writing ? "Writing…" : "Help me write"}
            </Button>
          </>
        ) : null}
      </div>
      {notice ? (
        <output className="block text-xs text-muted-foreground">
          {notice}
        </output>
      ) : null}
      {problem ? (
        <FormFeedback appearance="dashboard">{problem}</FormFeedback>
      ) : null}
      {preview.canComposeOneOff ? (
        <OpenActions
          preview={preview}
          text={finalText}
          edited
          previewVersion={version}
          disabledReason={
            holdReason
              ? holdReason
              : !body.trim()
                ? "Write a message first."
                : rendered?.problem
                  ? "Fix the message first."
                  : null
          }
        />
      ) : null}
      {preview.canManageTemplates ? (
        <div className="grid gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Save it so future {event.label.toLowerCase()} messages are ready.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <SelectControl<TemplateScope>
              aria-label="Save for"
              className="h-9 w-56"
              value={scope}
              onValueChange={setScope}
              options={[
                { value: "business", label: "All Stores" },
                {
                  value: "store",
                  label: list.data
                    ? `${list.data.storeName} only`
                    : "This Store only",
                },
              ]}
            />
            <Button
              variant="outline"
              disabled={
                save.isPending ||
                !list.data ||
                !body.trim() ||
                Boolean(rendered?.problem)
              }
              onClick={() => {
                if (!list.data) return
                setProblem(null)
                save.mutate(
                  {
                    eventKey: preview.eventKey,
                    scope,
                    body,
                    enabled: true,
                    source,
                    ...(guards.current.get(scope) ?? { expectedRevision: 0 }),
                  },
                  {
                    onSuccess: (result) => {
                      // Our own confirmed write becomes the next guard.
                      guards.current.set(
                        scope,
                        result.removed
                          ? { expectedRevision: 0 }
                          : expectedFor(result.template),
                      )
                      setNotice("Message saved.")
                    },
                    onError: (failure) => setProblem(saveFailureText(failure)),
                  },
                )
              }}
            >
              {save.isPending ? "Saving…" : "Save message"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Copy and Open WhatsApp. A fresh unedited preview opens through a real
 * link. Edited text is checked by prepareOpen first: the tab is reserved on
 * the click, so the popup isn't blocked, and closed if facts changed.
 */
function OpenActions({
  preview,
  text,
  edited,
  previewVersion,
  disabledReason = null,
}: {
  preview: OrderMessagePreview
  text: string
  edited: boolean
  /** The facts this text was reviewed against; changed facts need review. */
  previewVersion: OrderMessagePreview["previewVersion"]
  disabledReason?: string | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // A link prepared after a blocked popup belongs to that exact text and
  // those facts; any change, or age, sends the next click back through
  // prepareOpen.
  const [fallback, setFallback] = useState<{
    url: string
    text: string
    version: OrderMessagePreview["previewVersion"]
    at: number
  } | null>(null)
  const prepare = useMutation(
    trpc.customerMessages.prepareOpen.mutationOptions(),
  )
  const mounted = useRef(true)
  const operation = useRef(0)
  const latest = useRef({ text, version: previewVersion })
  latest.current = { text, version: previewVersion }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const tooLong = messageLength(text) > OPEN_MAX_CHARACTERS
  const reason =
    disabledReason ??
    (!text.trim()
      ? "Write a message first."
      : tooLong
        ? `Keep this message under ${OPEN_MAX_CHARACTERS.toLocaleString()} characters for the link, or copy it instead.`
        : null)
  const fallbackUrl =
    fallback && fallback.text === text && fallback.version === previewVersion
      ? fallback.url
      : null
  const directUrl = !edited ? preview.waUrl : null
  // Checked on the click itself: an open sheet doesn't re-render as it ages.
  const linkStillFresh = () =>
    fallbackUrl
      ? Date.now() - (fallback?.at ?? 0) < PREVIEW_STALE_MS
      : Date.now() - new Date(preview.preparedAt).getTime() < PREVIEW_STALE_MS

  async function openChecked() {
    setProblem(null)
    setFallback(null)
    const tab = window.open("", "_blank")
    if (tab) tab.opener = null
    // Bound to this exact text and facts: a result that arrives after the
    // sheet closed, or after either changed, is dropped and its tab closed.
    operation.current += 1
    const started = {
      id: operation.current,
      text,
      version: previewVersion,
    }
    const stillCurrent = () =>
      mounted.current &&
      operation.current === started.id &&
      latest.current.text === started.text &&
      latest.current.version === started.version
    try {
      const result = await prepare.mutateAsync({
        orderId: preview.orderId,
        eventKey: preview.eventKey,
        sourceId: preview.sourceId ?? undefined,
        previewVersion,
        body: text,
      })
      if (!stillCurrent()) {
        tab?.close()
        return
      }
      if (result.state === "ready" && result.waUrl) {
        if (tab) {
          tab.location.replace(result.waUrl)
          setStatus("WhatsApp opened in a new tab. Send it there.")
        } else
          setFallback({
            url: result.waUrl,
            text,
            version: previewVersion,
            at: Date.now(),
          })
        return
      }
      tab?.close()
      setProblem(
        "Order details changed since this message was prepared. Check it again; your text is kept.",
      )
      void queryClient.invalidateQueries({
        queryKey: trpc.customerMessages.preview.queryKey(),
      })
    } catch (failure) {
      tab?.close()
      if (!stillCurrent()) return
      setProblem(
        failure instanceof Error
          ? failure.message
          : "WhatsApp couldn’t be opened. Copy the message instead.",
      )
    }
  }

  const openClass = cn(
    buttonVariants(),
    "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400",
  )
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {reason ? (
          // Not green when it can't open: green only ever means ready.
          <Button disabled variant="outline">
            <HugeiconsIcon icon={WhatsappIcon} className="size-4" />
            Open WhatsApp
          </Button>
        ) : directUrl || fallbackUrl ? (
          <a
            href={(fallbackUrl ?? directUrl) as string}
            target="_blank"
            rel="noopener noreferrer"
            className={openClass}
            onClick={(event) => {
              if (!linkStillFresh()) {
                // Re-check now, inside this click, so the reserved tab is
                // still allowed; changed facts come back for review.
                event.preventDefault()
                void openChecked()
                return
              }
              setStatus("WhatsApp opened in a new tab. Send it there.")
            }}
          >
            <HugeiconsIcon icon={WhatsappIcon} className="size-4" />
            Open WhatsApp
          </a>
        ) : (
          <Button
            className={openClass}
            disabled={prepare.isPending}
            onClick={() => void openChecked()}
          >
            <HugeiconsIcon icon={WhatsappIcon} className="size-4" />
            {prepare.isPending ? "Checking…" : "Open WhatsApp"}
          </Button>
        )}
        <Button
          variant="outline"
          disabled={!text.trim() || Boolean(disabledReason)}
          onClick={() =>
            void navigator.clipboard.writeText(text).then(
              () => setStatus("Message copied."),
              () => setProblem("Copy didn’t work. Select the text instead."),
            )
          }
        >
          Copy
        </Button>
      </div>
      {reason && text.trim() ? (
        <p className="text-xs text-muted-foreground">{reason}</p>
      ) : null}
      {status ? (
        <output className="block text-xs text-muted-foreground">
          {status}
        </output>
      ) : null}
      {problem ? (
        <FormFeedback appearance="dashboard">{problem}</FormFeedback>
      ) : null}
    </div>
  )
}

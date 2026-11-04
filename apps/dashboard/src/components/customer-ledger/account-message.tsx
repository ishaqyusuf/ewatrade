"use client"
import { useTRPC } from "@/trpc/client"
import { getCustomerMessageEvent } from "@ewatrade/customer-messages/client"
import {
  Alert,
  AlertDescription,
  Button,
  ControlField,
  Textarea,
  buttonVariants,
  cn,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useEffect, useId, useState } from "react"
import {
  messageLength,
  tryRenderMessage,
} from "../customer-messages/message-variables"

export type AccountMessageKind = "remind" | "summary"
const eventKeys = {
  remind: "customer.balance_reminder",
  summary: "customer.account_summary",
} as const
const OPEN_MAX_CHARACTERS = 1_500
const day = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" })

/**
 * Workshop customers-pages 04: a balance reminder or account summary for one
 * saved customer, from saved wording (or the starter wording). Open WhatsApp
 * only opens a chat with the text ready; EwaTrade sends nothing.
 */
export function AccountMessage({
  accountId,
  kind,
  onKindChange,
  onDone,
}: {
  accountId: string
  kind: AccountMessageKind
  onKindChange: (kind: AccountMessageKind) => void
  onDone: () => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const textId = useId()
  const eventKey = eventKeys[kind]
  const query = useQuery(
    trpc.customerLedger.accountMessagePreview.queryOptions(
      { accountId, eventKey },
      { retry: false, staleTime: 60_000 },
    ),
  )
  const prepare = useMutation(
    trpc.customerLedger.accountMessageOpen.mutationOptions(),
  )
  const [text, setText] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const preview = query.data
  // Saved wording when there is some; otherwise the starter wording, filled in.
  const suggested = preview
    ? (preview.message ??
      tryRenderMessage(
        eventKey,
        getCustomerMessageEvent(eventKey).starterBody,
        preview.variables,
      ).text ??
      "")
    : ""
  useEffect(() => {
    setText(suggested)
    setStatus(null)
    setProblem(null)
    setFallbackUrl(null)
  }, [suggested])

  if (query.isPending)
    return (
      <output aria-busy="true" className="text-sm text-muted-foreground">
        Preparing the message…
      </output>
    )
  if (query.isError || !preview)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>
          {query.error?.message ??
            "Couldn’t prepare this message. Check your connection and try again."}
        </AlertDescription>
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </Alert>
    )
  const money = (value: string) =>
    formatFinanceMoney(value, preview.amounts.currencyCode)
  const paidAhead = BigInt(preview.amounts.availableCreditMinor)
  const blocked =
    preview.state === "no_phone" ||
    preview.state === "invalid_phone" ||
    preview.state === "ineligible"
  const tooLong = messageLength(text) > OPEN_MAX_CHARACTERS

  async function open() {
    if (!preview || prepare.isPending) return
    setProblem(null)
    setStatus(null)
    setFallbackUrl(null)
    // Reserve the tab inside the click so the browser doesn't block it.
    const tab = window.open("", "_blank")
    if (tab) tab.opener = null
    try {
      const result = await prepare.mutateAsync({
        accountId,
        eventKey,
        previewVersion: preview.previewVersion,
        body: text,
      })
      if (result.state === "ready" && result.waUrl) {
        if (tab) {
          tab.location.replace(result.waUrl)
          setStatus(
            "WhatsApp opened in a new tab. It’s sent only when you press Send there.",
          )
        } else setFallbackUrl(result.waUrl)
        return
      }
      tab?.close()
      setProblem(
        "What they owe changed since this message was prepared. Check it again; your text is kept.",
      )
      await client.invalidateQueries({
        queryKey: trpc.customerLedger.accountMessagePreview.pathKey(),
      })
    } catch (failure) {
      tab?.close()
      setProblem(
        failure instanceof Error
          ? failure.message
          : "WhatsApp couldn’t be opened. Copy the message instead.",
      )
    }
  }

  return (
    <div className="grid gap-4 text-sm">
      <div className="flex flex-wrap items-center gap-1 border border-border p-1">
        {(
          [
            ["remind", "Balance reminder"],
            ["summary", "Account summary"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={kind === value ? "secondary" : "ghost"}
            aria-pressed={kind === value}
            onClick={() => onKindChange(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div>
        <p className="font-medium">{preview.recipient.name}</p>
        <p className="text-muted-foreground">
          {preview.recipient.phoneDisplay
            ? `WhatsApp ${preview.recipient.phoneDisplay}`
            : "No phone number"}
        </p>
      </div>
      <dl className="grid grid-cols-3 border border-border">
        <div className="grid gap-0.5 p-3">
          <dt className="text-muted-foreground">Owes you</dt>
          <dd
            className={`font-semibold tabular-nums ${BigInt(preview.amounts.totalOwedMinor) > BigInt(0) ? "text-amber-700 dark:text-amber-300" : ""}`}
          >
            {money(preview.amounts.totalOwedMinor)}
          </dd>
        </div>
        <div className="grid gap-0.5 border-l border-border p-3">
          <dt className="text-muted-foreground">Owed since</dt>
          <dd className="font-semibold">
            {preview.amounts.oldestOwedAt
              ? day.format(new Date(preview.amounts.oldestOwedAt))
              : "—"}
          </dd>
        </div>
        <div className="grid gap-0.5 border-l border-border p-3">
          <dt className="text-muted-foreground">Paid ahead</dt>
          <dd className="font-semibold tabular-nums">
            {money(paidAhead > BigInt(0) ? paidAhead.toString() : "0")}
          </dd>
        </div>
      </dl>
      {blocked ? (
        <Alert appearance="dashboard">
          <AlertDescription>{preview.reason}</AlertDescription>
        </Alert>
      ) : (
        <ControlField
          label="Message"
          description={
            preview.message
              ? "From your saved wording. Changes here are for this message only."
              : "Starter wording. Save your own in Settings › WhatsApp messages."
          }
          error={
            tooLong
              ? `Keep this message under ${OPEN_MAX_CHARACTERS.toLocaleString()} characters.`
              : undefined
          }
        >
          <Textarea
            id={textId}
            rows={6}
            value={text}
            disabled={prepare.isPending}
            onChange={(event) => setText(event.target.value)}
          />
        </ControlField>
      )}
      {preview.canManageTemplates && !preview.message && !blocked ? (
        <Link
          href="/settings/whatsapp-messages"
          className="w-fit text-primary hover:underline"
        >
          Save wording for {kind === "remind" ? "reminders" : "summaries"}
        </Link>
      ) : null}
      {problem ? (
        <Alert appearance="dashboard" variant="destructive" role="alert">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      ) : null}
      <output className="block text-muted-foreground">
        {status ??
          "Opens WhatsApp with the message ready. Nothing is sent until you press Send there."}
      </output>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        {fallbackUrl ? (
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants(),
              "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400",
            )}
            onClick={() => setFallbackUrl(null)}
          >
            <HugeiconsIcon icon={WhatsappIcon} className="size-4" />
            Open WhatsApp
          </a>
        ) : (
          <Button
            disabled={
              blocked ||
              !preview.canComposeOneOff ||
              !text.trim() ||
              tooLong ||
              prepare.isPending
            }
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
            onClick={() => void open()}
          >
            <HugeiconsIcon icon={WhatsappIcon} className="size-4" />
            {prepare.isPending ? "Opening…" : "Open WhatsApp"}
          </Button>
        )}
      </div>
    </div>
  )
}

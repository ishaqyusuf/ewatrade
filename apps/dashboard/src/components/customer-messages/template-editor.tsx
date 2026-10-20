"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import {
  type CustomerMessageEventKey,
  getCustomerMessageEvent,
} from "@ewatrade/customer-messages/client"
import { Button, SelectControl, toast } from "@ewatrade/ui"
import { SparklesIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { MessageBubble } from "./message-bubble"
import { MessageComposer } from "./message-composer"
import {
  LANGUAGE_OPTIONS,
  type MessageLanguage,
  type MessageTone,
  TONE_OPTIONS,
  hidesCachedData,
  saveFailureText,
} from "./message-status"
import { tryRenderMessage } from "./message-variables"
import { SAMPLE_LABEL, sampleMessageVariables } from "./sample-variables"
import { editorStateFor, reconcileEditor } from "./template-model"
import { useDraftWriter } from "./use-draft-writer"
import {
  type TemplateList,
  type TemplateScope,
  expectedFor,
  scopeTemplate,
  templateListInput,
  useTemplateMutations,
} from "./use-template-mutations"

/**
 * Saved wording for one event (Owner/Admin): the business message, or one
 * Store's own message. The Settings Store picker chooses which.
 */
export function TemplateEditor({
  eventKey,
  scope,
  storeId,
  onDirtyChange,
  onDone,
  onCancel,
}: {
  eventKey: CustomerMessageEventKey
  scope: TemplateScope
  /** The Store Settings is editing; none means the active Store. */
  storeId: string | null
  onDirtyChange: (dirty: boolean) => void
  /** Closes the sheet after a save; nothing is left unsaved. */
  onDone: () => void
  /** Closes the sheet, asking first when text is unsaved. */
  onCancel: () => void
}) {
  const trpc = useTRPC()
  const list = useQuery(
    trpc.customerMessages.templates.list.queryOptions(
      templateListInput(storeId),
      { retry: false },
    ),
  )
  if (list.isPending)
    return <output aria-live="polite">Loading message…</output>
  if (!list.data || (list.isError && hidesCachedData(list.error)))
    return (
      <div role="alert" className="grid justify-items-start gap-3">
        <p className="text-sm">Couldn’t load this message.</p>
        <Button variant="outline" onClick={() => void list.refetch()}>
          Try again
        </Button>
      </div>
    )
  return (
    <ScopeEditor
      // One editor per event and scope: saved-row changes are reconciled
      // inside it, so typed text is never dropped by a remount.
      key={`${eventKey}:${scope}:${storeId ?? ""}`}
      eventKey={eventKey}
      scope={scope}
      storeId={storeId}
      list={list.data}
      onDirtyChange={onDirtyChange}
      onDone={onDone}
      onCancel={onCancel}
    />
  )
}

function ScopeEditor({
  eventKey,
  scope,
  storeId,
  list,
  onDirtyChange,
  onDone,
  onCancel,
}: {
  eventKey: CustomerMessageEventKey
  scope: TemplateScope
  storeId: string | null
  list: TemplateList
  onDirtyChange: (dirty: boolean) => void
  onDone: () => void
  onCancel: () => void
}) {
  const event = getCustomerMessageEvent(eventKey)
  const row = scopeTemplate(list, eventKey, scope)
  const business = scopeTemplate(list, eventKey, "business")
  const inherits = scope === "store" && !row
  const [writing, setWriting] = useState(!inherits)
  // Text plus the saved row it writes against. A refetched row is adopted
  // only while nothing is typed; otherwise the guard stays and we ask.
  const [editor, setEditor] = useState(() => editorStateFor(row))
  const reconciled = reconcileEditor(editor, row)
  if (reconciled !== editor) setEditor(reconciled)
  const body = editor.body
  const setBody = (next: string) =>
    setEditor((current) => ({ ...current, body: next }))
  const [source, setSource] = useState<"MANUAL" | "AI_ASSISTED" | "STARTER">(
    "MANUAL",
  )
  const [tone, setTone] = useState<MessageTone>("friendly")
  const [language, setLanguage] = useState<MessageLanguage>("en")
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const { save, reset, setEnabled } = useTemplateMutations(storeId)
  const writer = useDraftWriter()
  const busy =
    save.isPending || reset.isPending || setEnabled.isPending || writer.writing
  const variables = sampleMessageVariables({
    businessName: list.businessName,
    storeName: list.storeName,
  })
  const target = { ...templateListInput(storeId), eventKey, scope }
  const dirty = writing && body !== editor.baseline
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  const rendered = body.trim()
    ? tryRenderMessage(eventKey, body, variables)
    : null
  const fail = (failure: unknown) => setProblem(saveFailureText(failure))
  const closeSaved = (message: string, undo?: () => void) => {
    onDirtyChange(false)
    toast(message, undo ? { action: { label: "Undo", onClick: undo } } : {})
    onDone()
  }

  const where =
    scope === "business"
      ? "Every store sends this unless it has its own message."
      : inherits && !writing
        ? business
          ? `${list.storeName} sends the business message.`
          : `${list.storeName} has no message yet.`
        : !row || row.enabled
          ? `Only ${list.storeName} sends this message.`
          : `${list.storeName} has its own message. It’s turned off.`

  if (inherits && !writing)
    return (
      <div className="grid gap-5">
        <p className="text-sm text-muted-foreground">{where}</p>
        {business?.body ? (
          <InheritedPreview
            body={business.body}
            eventKey={eventKey}
            variables={variables}
            enabled={business.enabled}
          />
        ) : (
          <p className="rounded-[10px] border border-border bg-muted px-3.5 py-3 text-sm">
            The business message isn’t written yet. Write it under All stores,
            or write one just for {list.storeName}.
          </p>
        )}
        {problem ? (
          <FormFeedback appearance="dashboard">{problem}</FormFeedback>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {business?.enabled ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                setEnabled.mutate(
                  { ...target, enabled: false, ...editor.guard },
                  {
                    onSuccess: (result) =>
                      closeSaved(
                        `Turned off at ${list.storeName}.`,
                        result.removed
                          ? undefined
                          : () =>
                              reset.mutate(
                                { ...target, ...expectedFor(result.template) },
                                {
                                  onError: (failure) =>
                                    toast(saveFailureText(failure)),
                                },
                              ),
                      ),
                    onError: fail,
                  },
                )
              }
            >
              Turn off at {list.storeName}
            </Button>
          ) : null}
          <span className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={onCancel}>
              Close
            </Button>
            <Button
              onClick={() => {
                setBody(business?.body ?? "")
                setWriting(true)
              }}
            >
              Write one for {list.storeName}
            </Button>
          </span>
        </div>
      </div>
    )

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">{where}</p>
      <MessageComposer
        id="customer-message-template"
        eventKey={eventKey}
        value={body}
        onChange={(next) => {
          setBody(next)
          setNotice(null)
          if (source !== "MANUAL") setSource("MANUAL")
        }}
        variables={variables}
        exampleLabel={SAMPLE_LABEL}
        placeholder="Write the message staff will send"
        disabled={busy}
      />
      <div className="flex flex-wrap items-center gap-2">
        {body.trim() ? null : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBody(event.starterBody)
              setSource("STARTER")
            }}
          >
            Use suggested wording
          </Button>
        )}
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
          disabled={busy}
          onClick={() => {
            setProblem(null)
            void writer
              .write({ eventKeys: [eventKey], tone, language })
              .then((result) => {
                if (!result) return
                const next = result.drafts.find(
                  (item) => item.eventKey === eventKey,
                )
                if (!next) {
                  setProblem("No draft came back. Write your own here.")
                  return
                }
                setBody(next.body)
                setSource(next.source)
                setNotice(
                  result.source === "ai"
                    ? "Draft ready. Read it before you save."
                    : (result.reason ??
                        "AI isn’t available right now, so we added suggested wording."),
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
          <HugeiconsIcon icon={SparklesIcon} className="size-4" />
          {writer.writing ? "Writing…" : "Help me write"}
        </Button>
      </div>
      {notice ? (
        <output className="block text-sm text-muted-foreground">
          {notice}
        </output>
      ) : null}
      {editor.conflict ? (
        <div className="grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p>
            Someone else saved a new version while you were editing. Your
            changes are still here.
          </p>
          {row?.body ? (
            <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
              Saved now: {row.body}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              The saved message was removed.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditor(editorStateFor(row))}
            >
              Use the saved version
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setEditor((current) => ({
                  ...editorStateFor(row),
                  body: current.body,
                }))
              }
            >
              Keep my version
            </Button>
          </div>
        </div>
      ) : null}
      {problem ? (
        <FormFeedback appearance="dashboard">{problem}</FormFeedback>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {scope === "store" && row ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              reset.mutate(
                { ...target, ...editor.guard },
                {
                  onSuccess: () =>
                    closeSaved(
                      `${list.storeName} uses the business message again.`,
                    ),
                  onError: fail,
                },
              )
            }
          >
            Use the business message
          </Button>
        ) : null}
        <span className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={save.isPending}
            onClick={() => {
              if (!inherits) return onCancel()
              // Back to the business message this Store already sends.
              setWriting(false)
              setBody("")
              setNotice(null)
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={
              busy ||
              !body.trim() ||
              body === editor.baseline ||
              Boolean(rendered?.problem)
            }
            onClick={() => {
              setProblem(null)
              save.mutate(
                { ...target, body, enabled: true, source, ...editor.guard },
                {
                  onSuccess: () =>
                    closeSaved("Saved. Staff see it on their next order."),
                  onError: fail,
                },
              )
            }}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </span>
      </div>
    </div>
  )
}

function InheritedPreview({
  body,
  enabled,
  eventKey,
  variables,
}: {
  body: string
  enabled: boolean
  eventKey: CustomerMessageEventKey
  variables: Record<string, string>
}) {
  const rendered = tryRenderMessage(eventKey, body, variables)
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        Business message · {SAMPLE_LABEL.toLowerCase()}
        {enabled ? "" : " (turned off)"}
      </p>
      {rendered.text ? (
        <MessageBubble text={rendered.text} />
      ) : (
        <p className="text-sm text-destructive">{rendered.problem}</p>
      )}
    </div>
  )
}

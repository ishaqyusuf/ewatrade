"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useCustomerMessageParams } from "@/hooks/use-customer-message-params"
import { useTRPC } from "@/trpc/client"
import {
  type CustomerMessageEventKey,
  getCustomerMessageEvent,
} from "@ewatrade/customer-messages/client"
import { Button, SelectControl } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
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
import {
  type TemplateWriteResult,
  adoptOwnWrite,
  editorStateFor,
  reconcileEditor,
} from "./template-model"
import { useDraftWriter } from "./use-draft-writer"
import {
  type TemplateList,
  type TemplateScope,
  expectedFor,
  scopeTemplate,
  useTemplateMutations,
} from "./use-template-mutations"

/** Saved wording for one event in one scope (Owner/Admin). */
export function TemplateEditor({
  eventKey,
  scope,
  onDirtyChange,
}: {
  eventKey: CustomerMessageEventKey
  scope: TemplateScope
  onDirtyChange: (dirty: boolean) => void
}) {
  const trpc = useTRPC()
  const { setParams } = useCustomerMessageParams()
  const [notice, setNotice] = useState<string | null>(null)
  // Switching scope starts another editor: ask before typed text is lost.
  const dirty = useRef(false)
  const trackDirty = useCallback(
    (value: boolean) => {
      dirty.current = value
      onDirtyChange(value)
    },
    [onDirtyChange],
  )
  const list = useQuery(
    trpc.customerMessages.templates.list.queryOptions(undefined, {
      retry: false,
    }),
  )
  if (list.isPending)
    return <output aria-live="polite">Loading saved messages…</output>
  if (!list.data || (list.isError && hidesCachedData(list.error)))
    return (
      <div role="alert" className="grid gap-3">
        <p className="text-sm">
          Only owners and admins can change saved messages.
        </p>
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => void list.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  const row = scopeTemplate(list.data, eventKey, scope)
  return (
    <div className="grid gap-5">
      <fieldset
        className="flex flex-wrap gap-2"
        aria-label="Which wording to edit"
      >
        {(["business", "store"] as const).map((value) => (
          <Button
            key={value}
            variant={scope === value ? "default" : "outline"}
            size="sm"
            aria-pressed={scope === value}
            onClick={() => {
              if (value === scope) return
              if (
                dirty.current &&
                !window.confirm("Switch? Your changes aren’t saved.")
              )
                return
              setNotice(null)
              void setParams({ messageScope: value })
            }}
          >
            {value === "business" ? "All Stores" : list.data.storeName}
          </Button>
        ))}
      </fieldset>
      <ScopeEditor
        // One editor per event and scope: saved-row changes are reconciled
        // inside it, so typed text is never dropped by a remount.
        key={`${eventKey}:${scope}`}
        eventKey={eventKey}
        scope={scope}
        list={list.data}
        onDirtyChange={trackDirty}
        onNotice={setNotice}
      />
      {notice ? (
        <output className="block text-sm text-muted-foreground">
          {notice}
        </output>
      ) : null}
    </div>
  )
}

function ScopeEditor({
  eventKey,
  scope,
  list,
  onDirtyChange,
  onNotice: setNotice,
}: {
  eventKey: CustomerMessageEventKey
  scope: TemplateScope
  list: TemplateList
  onDirtyChange: (dirty: boolean) => void
  onNotice: (notice: string | null) => void
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
  const adopt = (result: TemplateWriteResult) =>
    setEditor((current) => adoptOwnWrite(current, result))
  const [source, setSource] = useState<"MANUAL" | "AI_ASSISTED" | "STARTER">(
    "MANUAL",
  )
  const [tone, setTone] = useState<MessageTone>("friendly")
  const [language, setLanguage] = useState<MessageLanguage>("en")
  const [problem, setProblem] = useState<string | null>(null)
  const { save, reset, setEnabled } = useTemplateMutations()
  const writer = useDraftWriter()
  const busy =
    save.isPending || reset.isPending || setEnabled.isPending || writer.writing
  const variables = sampleMessageVariables({
    businessName: list.businessName,
    storeName: list.storeName,
  })
  const dirty = writing && body !== editor.baseline
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  const rendered = body.trim()
    ? tryRenderMessage(eventKey, body, variables)
    : null
  const fail = (failure: unknown) => setProblem(saveFailureText(failure))

  const scopeNote =
    scope === "business"
      ? "Every Store uses this unless it has its own wording."
      : row?.enabled
        ? `${list.storeName} uses its own wording.`
        : row
          ? `Turned off for ${list.storeName}. The business wording isn’t used here either.`
          : `${list.storeName} uses the business wording.`

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h3 className="font-medium">{event.label}</h3>
        <p className="text-sm text-muted-foreground">{event.description}</p>
        <p className="text-sm">{scopeNote}</p>
      </div>
      {inherits && !writing ? (
        <div className="grid gap-3">
          {business?.enabled && business.body ? (
            <InheritedPreview
              body={business.body}
              eventKey={eventKey}
              variables={variables}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              There’s no business wording yet.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setBody(business?.body ?? "")
                setWriting(true)
              }}
            >
              Write wording for {list.storeName}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                setEnabled.mutate(
                  { eventKey, scope, enabled: false, ...editor.guard },
                  {
                    onSuccess: (result) => {
                      adopt(result)
                      setNotice(`Turned off for ${list.storeName}.`)
                    },
                    onError: fail,
                  },
                )
              }
            >
              Turn off for {list.storeName}
            </Button>
          </div>
        </div>
      ) : (
        <>
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
            disabled={busy}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setBody(event.starterBody)
                setSource("STARTER")
                setNotice("Starter wording added. Change anything you like.")
              }}
            >
              Use starter wording
            </Button>
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
                        ? "Draft ready. Read it, then save."
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
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              disabled={busy || !body.trim() || Boolean(rendered?.problem)}
              onClick={() => {
                setProblem(null)
                save.mutate(
                  {
                    eventKey,
                    scope,
                    body,
                    enabled: true,
                    source,
                    ...editor.guard,
                  },
                  {
                    onSuccess: (result) => {
                      adopt(result)
                      setNotice("Message saved.")
                    },
                    onError: fail,
                  },
                )
              }}
            >
              {save.isPending
                ? "Saving…"
                : row?.enabled === false
                  ? "Save and turn on"
                  : "Save message"}
            </Button>
            {row?.enabled ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setEnabled.mutate(
                    { eventKey, scope, enabled: false, ...editor.guard },
                    {
                      onSuccess: (result) => {
                        adopt(result)
                        setNotice("Turned off.")
                      },
                      onError: fail,
                    },
                  )
                }
              >
                Turn off
              </Button>
            ) : null}
            {scope === "store" && row ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  reset.mutate(
                    { eventKey, scope, ...editor.guard },
                    {
                      onSuccess: (result) => {
                        adopt(result)
                        setNotice(
                          `${list.storeName} uses the business wording again.`,
                        )
                        // Inheriting again: the composer closes.
                        setWriting(false)
                      },
                      onError: fail,
                    },
                  )
                }
              >
                Use business wording
              </Button>
            ) : null}
            {inherits ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setWriting(false)
                  setBody("")
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </>
      )}
      {editor.conflict ? (
        <div className="grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p>
            Someone else changed this message while you were editing. Your text
            is kept; saving now won’t overwrite theirs.
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
              Use their version
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
              Keep mine and save over it
            </Button>
          </div>
        </div>
      ) : null}
      {problem ? (
        <FormFeedback appearance="dashboard">{problem}</FormFeedback>
      ) : null}
    </div>
  )
}

function InheritedPreview({
  body,
  eventKey,
  variables,
}: {
  body: string
  eventKey: CustomerMessageEventKey
  variables: Record<string, string>
}) {
  const rendered = tryRenderMessage(eventKey, body, variables)
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        Business wording · {SAMPLE_LABEL.toLowerCase()}
      </p>
      {rendered.text ? (
        <MessageBubble text={rendered.text} />
      ) : (
        <p className="text-sm text-destructive">{rendered.problem}</p>
      )}
    </div>
  )
}

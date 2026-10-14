"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import {
  type CustomerMessageEventKey,
  customerMessageEvents,
} from "@ewatrade/customer-messages/client"
import { Button, Checkbox, SelectControl, Textarea, cn } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { MessageBubble } from "./message-bubble"
import { MessageComposer } from "./message-composer"
import {
  LANGUAGE_OPTIONS,
  type MessageLanguage,
  type MessageTone,
  SAVED_MESSAGE_TONE,
  TONE_OPTIONS,
  hidesCachedData,
  saveFailureText,
  savedMessageLabel,
} from "./message-status"
import { tryRenderMessage } from "./message-variables"
import { SAMPLE_LABEL, sampleMessageVariables } from "./sample-variables"
import { captureBaselines } from "./template-model"
import { useDraftWriter } from "./use-draft-writer"
import {
  type TemplateList,
  type TemplateScope,
  expectedFor,
  scopeTemplate,
  useTemplateMutations,
} from "./use-template-mutations"

type Draft = {
  eventKey: CustomerMessageEventKey
  body: string
  source: "AI_ASSISTED" | "STARTER"
  selected: boolean
  result: { ok: true } | { ok: false; message: string } | null
  /**
   * The saved row this draft was written against, captured when generation
   * started. Save never adopts a newer revision silently.
   */
  expected: ReturnType<typeof expectedFor>
}

/**
 * Compose all: choose events, draft them together, review each one, then
 * Save selected. Nothing is saved or turned on without that click.
 */
export function AiDraftReview({
  scope,
  onDirtyChange,
  onDone,
}: {
  scope: TemplateScope
  onDirtyChange: (dirty: boolean) => void
  onDone: () => void
}) {
  const trpc = useTRPC()
  const list = useQuery(
    trpc.customerMessages.templates.list.queryOptions(undefined, {
      retry: false,
    }),
  )
  if (list.isPending)
    return <output aria-live="polite">Loading saved messages…</output>
  if (!list.data || (list.isError && hidesCachedData(list.error)))
    return (
      <FormFeedback appearance="dashboard">
        Only owners and admins can write saved messages.
      </FormFeedback>
    )
  return (
    <Review
      scope={scope}
      list={list.data}
      onDirtyChange={onDirtyChange}
      onDone={onDone}
    />
  )
}

function Review({
  scope,
  list,
  onDirtyChange,
  onDone,
}: {
  scope: TemplateScope
  list: TemplateList
  onDirtyChange: (dirty: boolean) => void
  onDone: () => void
}) {
  const statusOf = (eventKey: CustomerMessageEventKey) =>
    list.statuses.find((row) => row.eventKey === eventKey)
  const [chosen, setChosen] = useState<CustomerMessageEventKey[]>(() =>
    customerMessageEvents
      .filter((event) => statusOf(event.key)?.state !== "composed")
      .map((event) => event.key),
  )
  const [tone, setTone] = useState<MessageTone>("friendly")
  const [language, setLanguage] = useState<MessageLanguage>("en")
  const [instructions, setInstructions] = useState("")
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [origin, setOrigin] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const writer = useDraftWriter()
  const { save } = useTemplateMutations()
  const variables = sampleMessageVariables({
    businessName: list.businessName,
    storeName: list.storeName,
  })
  const pending = drafts?.filter((draft) => draft.result?.ok !== true) ?? []
  const dirty = pending.some((draft) => draft.selected)
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  const scopeName = scope === "business" ? "all Stores" : list.storeName

  function update(eventKey: CustomerMessageEventKey, patch: Partial<Draft>) {
    setDrafts(
      (current) =>
        current?.map((draft) =>
          draft.eventKey === eventKey ? { ...draft, ...patch } : draft,
        ) ?? null,
    )
  }

  async function saveSelected() {
    if (!drafts) return
    setSaving(true)
    setProblem(null)
    // One at a time: each event keeps its own result or conflict.
    for (const draft of drafts) {
      if (!draft.selected || draft.result?.ok) continue
      try {
        await save.mutateAsync({
          eventKey: draft.eventKey,
          scope,
          body: draft.body,
          enabled: true,
          source: draft.source,
          ...draft.expected,
        })
        update(draft.eventKey, { result: { ok: true } })
      } catch (failure) {
        update(draft.eventKey, {
          result: { ok: false, message: saveFailureText(failure) },
        })
      }
    }
    setSaving(false)
  }

  if (!drafts)
    return (
      <form
        className="grid gap-5"
        onSubmit={async (submit) => {
          submit.preventDefault()
          setProblem(null)
          const baseline = captureBaselines(list, chosen, scope)
          try {
            const result = await writer.write({
              eventKeys: chosen,
              tone,
              language,
              instructions: instructions.trim() || undefined,
            })
            if (!result) return
            setOrigin(
              result.source === "ai"
                ? "Drafts ready. Read each one before you save."
                : `Starter wording; AI unavailable${result.reason ? ` (${result.reason})` : ""}. Edit before you save.`,
            )
            setDrafts(
              result.drafts.map((draft) => ({
                ...draft,
                selected: true,
                result: null,
                expected: baseline.get(draft.eventKey) ?? {
                  expectedRevision: 0,
                },
              })),
            )
          } catch (failure) {
            setProblem(
              failure instanceof Error
                ? failure.message
                : "Drafts couldn’t be written. Try again.",
            )
          }
        }}
      >
        <p className="text-sm text-muted-foreground">
          Drafts are saved for {scopeName} only when you choose Save selected.
        </p>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">
            Messages to write
          </legend>
          {customerMessageEvents.map((event) => {
            const status = statusOf(event.key)
            const state = status?.state ?? "missing"
            return (
              <label
                key={event.key}
                htmlFor={`compose-all-${event.key}`}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <Checkbox
                  id={`compose-all-${event.key}`}
                  checked={chosen.includes(event.key)}
                  onCheckedChange={(value) =>
                    setChosen((current) =>
                      value
                        ? [...current, event.key]
                        : current.filter((key) => key !== event.key),
                    )
                  }
                />
                <span className="grid min-w-0 flex-1">
                  <span className="text-sm">{event.label}</span>
                  {state === "composed" ? (
                    <span className="text-xs text-muted-foreground">
                      Replaces the saved wording if you save it
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs",
                    SAVED_MESSAGE_TONE[state],
                  )}
                >
                  {savedMessageLabel(state, status?.scope ?? null)}
                </span>
              </label>
            )
          })}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="compose-all-tone" className="text-sm font-medium">
              Tone
            </label>
            <SelectControl<MessageTone>
              id="compose-all-tone"
              value={tone}
              onValueChange={setTone}
              options={[...TONE_OPTIONS]}
            />
          </div>
          <div className="grid gap-1.5">
            <label
              htmlFor="compose-all-language"
              className="text-sm font-medium"
            >
              Language
            </label>
            <SelectControl<MessageLanguage>
              id="compose-all-language"
              value={language}
              onValueChange={setLanguage}
              options={[...LANGUAGE_OPTIONS]}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <label
            htmlFor="compose-all-instructions"
            className="text-sm font-medium"
          >
            Anything to include? (optional)
          </label>
          <Textarea
            id="compose-all-instructions"
            value={instructions}
            maxLength={500}
            rows={3}
            placeholder="For example: sign off with “– the Mama Put team”."
            onChange={(change) => setInstructions(change.target.value)}
          />
        </div>
        {problem ? (
          <FormFeedback appearance="dashboard">{problem}</FormFeedback>
        ) : null}
        {writer.slow ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <output>Still writing… your choices are kept.</output>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={writer.abandon}
            >
              Stop waiting
            </Button>
          </div>
        ) : null}
        <Button
          type="submit"
          className="w-fit"
          disabled={!chosen.length || writer.writing}
        >
          {writer.writing
            ? "Writing drafts…"
            : `Write ${chosen.length} draft${chosen.length === 1 ? "" : "s"}`}
        </Button>
      </form>
    )

  const selectedCount = pending.filter((draft) => draft.selected).length
  const allSaved = drafts.every((draft) => !draft.selected || draft.result?.ok)
  return (
    <div className="grid gap-5">
      {origin ? (
        <output className="block text-sm text-muted-foreground">
          {origin}
        </output>
      ) : null}
      <ol className="grid gap-4">
        {drafts.map((draft) => {
          const event = customerMessageEvents.find(
            (item) => item.key === draft.eventKey,
          )
          const rendered = tryRenderMessage(
            draft.eventKey,
            draft.body,
            variables,
          )
          return (
            <li
              key={draft.eventKey}
              className="grid gap-3 rounded-xl border border-border p-4"
            >
              <label
                htmlFor={`draft-pick-${draft.eventKey}`}
                className="flex items-center gap-3"
              >
                <Checkbox
                  id={`draft-pick-${draft.eventKey}`}
                  checked={draft.selected}
                  disabled={saving || draft.result?.ok === true}
                  onCheckedChange={(value) =>
                    update(draft.eventKey, { selected: value })
                  }
                />
                <span className="flex-1 font-medium">{event?.label}</span>
                <span className="text-xs text-muted-foreground">
                  {draft.result?.ok
                    ? "Saved"
                    : draft.source === "STARTER"
                      ? "Starter wording"
                      : "AI draft"}
                </span>
              </label>
              {draft.result?.ok ? null : (
                <MessageComposer
                  id={`draft-${draft.eventKey}`}
                  eventKey={draft.eventKey}
                  value={draft.body}
                  disabled={saving}
                  onChange={(body) =>
                    update(draft.eventKey, { body, result: null })
                  }
                  variables={variables}
                  exampleLabel={SAMPLE_LABEL}
                  label="Wording"
                />
              )}
              {draft.result && !draft.result.ok ? (
                <div className="grid gap-2">
                  <FormFeedback appearance="dashboard">
                    {draft.result.message}
                  </FormFeedback>
                  <LatestSaved
                    list={list}
                    draft={draft}
                    scope={scope}
                    variables={variables}
                    onReplace={() =>
                      update(draft.eventKey, {
                        result: null,
                        expected: expectedFor(
                          scopeTemplate(list, draft.eventKey, scope),
                        ),
                      })
                    }
                  />
                </div>
              ) : null}
              {rendered.problem && draft.selected && !draft.result?.ok ? (
                <p className="text-xs text-destructive">
                  Fix this draft or untick it before saving.
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {allSaved ? (
          <Button onClick={onDone}>Done</Button>
        ) : (
          <Button
            disabled={
              saving ||
              !selectedCount ||
              pending.some(
                (draft) =>
                  draft.selected &&
                  tryRenderMessage(draft.eventKey, draft.body, variables)
                    .problem,
              )
            }
            onClick={() => void saveSelected()}
          >
            {saving
              ? "Saving…"
              : `Save ${selectedCount} selected for ${scopeName}`}
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => setDrafts(null)}
        >
          Start over
        </Button>
      </div>
    </div>
  )
}

/**
 * After a conflict: show what is saved now, and let the person deliberately
 * keep their draft over it. Nothing is adopted without this choice.
 */
function LatestSaved({
  list,
  draft,
  scope,
  variables,
  onReplace,
}: {
  list: TemplateList
  draft: Draft
  scope: TemplateScope
  variables: Record<string, string>
  onReplace: () => void
}) {
  const row = scopeTemplate(list, draft.eventKey, scope)
  const current = row
    ? { revision: row.revision, id: row.id }
    : { revision: 0, id: undefined }
  const changed =
    current.revision !== draft.expected.expectedRevision ||
    current.id !==
      ("expectedTemplateId" in draft.expected
        ? draft.expected.expectedTemplateId
        : undefined)
  if (!changed)
    return (
      <p className="text-xs text-muted-foreground">
        Loading the latest saved wording…
      </p>
    )
  const shown = row?.body
    ? tryRenderMessage(draft.eventKey, row.body, variables)
    : null
  return (
    <div className="grid gap-2 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">
        {row
          ? row.enabled
            ? "Saved now (example with sample details):"
            : "Saved now, turned off:"
          : "This message was removed for this scope."}
      </p>
      {shown?.text ? <MessageBubble text={shown.text} /> : null}
      <Button variant="outline" size="sm" className="w-fit" onClick={onReplace}>
        Keep my draft instead
      </Button>
    </div>
  )
}

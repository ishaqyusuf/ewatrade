import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { CustomerMessageEventKey } from "@ewatrade/customer-messages/client"

export type TemplateList =
  RouterOutputs["customerMessages"]["templates"]["list"]
export type SavedTemplate = TemplateList["templates"][number]
export type TemplateScope = "business" | "store"

/** The selected scope's own row, never the inherited one. */
export function scopeTemplate(
  list: Pick<TemplateList, "templates" | "storeId">,
  eventKey: CustomerMessageEventKey,
  scope: TemplateScope,
): SavedTemplate | null {
  const scopeKey = scope === "business" ? "business" : `store:${list.storeId}`
  return (
    list.templates.find(
      (row) => row.eventKey === eventKey && row.scopeKey === scopeKey,
    ) ?? null
  )
}

/** Optimistic-concurrency fields for a write to this scope's row. */
export function expectedFor(row: SavedTemplate | null) {
  return row
    ? { expectedRevision: row.revision, expectedTemplateId: row.id }
    : { expectedRevision: 0 }
}

export type TemplateWrite = {
  eventKey: CustomerMessageEventKey
  scope: TemplateScope
}
export type TemplateWriteResult =
  | { removed: true }
  | { removed: false; template: SavedTemplate }

/**
 * Put a confirmed write into the cached list at once, so an editor never
 * re-reads the row it just replaced. Statuses follow with the refetch.
 */
export function applyTemplateWrite(
  list: TemplateList,
  write: TemplateWrite,
  result: TemplateWriteResult,
): TemplateList {
  const scopeKey =
    write.scope === "business" ? "business" : `store:${list.storeId}`
  const others = list.templates.filter(
    (row) => !(row.eventKey === write.eventKey && row.scopeKey === scopeKey),
  )
  return {
    ...list,
    templates: result.removed ? others : [...others, result.template],
  }
}

/**
 * Freeze each event's concurrency guard when an AI batch starts. A list that
 * refreshes during generation or review never changes what Save expects.
 */
export function captureBaselines(
  list: Pick<TemplateList, "templates" | "storeId">,
  eventKeys: readonly CustomerMessageEventKey[],
  scope: TemplateScope,
) {
  return new Map(
    eventKeys.map((key) => [key, expectedFor(scopeTemplate(list, key, scope))]),
  )
}

/** What a saved-wording editor shows and which saved row it writes against. */
export type EditorState = {
  body: string
  /** The saved body this editor last adopted. */
  baseline: string
  guard: ReturnType<typeof expectedFor>
  /** A newer saved row arrived while the person had unsaved text. */
  conflict: boolean
}

export function editorStateFor(row: SavedTemplate | null): EditorState {
  const body = row?.body ?? ""
  return { body, baseline: body, guard: expectedFor(row), conflict: false }
}

function sameGuard(
  guard: ReturnType<typeof expectedFor>,
  row: SavedTemplate | null,
) {
  const next = expectedFor(row)
  return (
    guard.expectedRevision === next.expectedRevision &&
    ("expectedTemplateId" in guard ? guard.expectedTemplateId : undefined) ===
      ("expectedTemplateId" in next ? next.expectedTemplateId : undefined)
  )
}

/**
 * A refetched row: a clean editor adopts it; an editor with typed text keeps
 * its text and its original guard and is marked in conflict, so Save can't
 * overwrite a change the person hasn't seen.
 */
export function reconcileEditor(
  state: EditorState,
  row: SavedTemplate | null,
): EditorState {
  if (sameGuard(state.guard, row)) return state
  if (state.body === state.baseline) return editorStateFor(row)
  return state.conflict ? state : { ...state, conflict: true }
}

/** This editor's own confirmed write is adopted explicitly. */
export function adoptOwnWrite(
  state: EditorState,
  result: TemplateWriteResult,
): EditorState {
  if (result.removed) return editorStateFor(null)
  return {
    body: state.body,
    baseline: result.template.body,
    guard: expectedFor(result.template),
    conflict: false,
  }
}

/**
 * A write applies to the cached list only if that list still belongs to the
 * Store the write started in. A save that lands after a business, Store or
 * account switch never touches the new list.
 */
export function applyTemplateWriteIfCurrent(
  current: TemplateList | undefined,
  startedForStoreId: string | undefined,
  write: TemplateWrite,
  result: TemplateWriteResult,
): TemplateList | undefined {
  if (!current || !startedForStoreId || current.storeId !== startedForStoreId)
    return current
  return applyTemplateWrite(current, write, result)
}

/** Where and when a template write started. */
export type WriteContext = {
  storeId: string | undefined
  /** The data-cache generation; any clear since makes the write stale. */
  generation: number
}

/**
 * A finished write may touch the cache only in the context it started in:
 * same Store list and no cache clear in between. Sign-out or an A→B→A switch
 * keeps the old write discarded even when the same Store comes back.
 */
export function writeContextIsCurrent(
  started: WriteContext | undefined,
  now: WriteContext,
) {
  return Boolean(
    started?.storeId &&
      started.storeId === now.storeId &&
      started.generation === now.generation,
  )
}

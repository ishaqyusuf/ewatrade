"use client"

import { useZodForm } from "@/hooks/use-zod-form"
import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type StorefrontContentContext,
  type StorefrontContentDraft,
  type StorefrontContentField,
  storefrontContentContextSchema,
  storefrontContentFieldLimit,
  storefrontContentFieldState,
} from "@ewatrade/storefront-contracts/content"
import type { StorefrontComposition } from "@ewatrade/storefront-contracts/manifest"
import { storefrontContentFields } from "@ewatrade/storefront-templates"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  type ContentReviewRow,
  contentFieldHasEdits,
  contentRunActive,
  mergeContentReview,
  selectedContentRefinements,
} from "./storefront-content-model"

export type ContentApply = {
  base: StorefrontComposition
  revision: number
  fields: StorefrontContentField[]
  drafts: StorefrontContentDraft[]
}
type GenerateInput = RouterInputs["storefront"]["generateContent"]
type RequestSnapshot = {
  input: GenerateInput
  base: StorefrontComposition
  fields: StorefrontContentField[]
  generation: number
  refine: boolean
}
const errorText = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "Content generation couldn't be completed. Try again."
const emptyContext: StorefrontContentContext = {
  name: "",
  description: "",
  location: "",
  offerings: "",
}

export function useStorefrontContent(props: {
  open: boolean
  siteId: string
  revision: number
  composition: StorefrontComposition
  pageKey: string
  sectionId: string
  blocked: boolean
  onWrite: () => void
  onContext: () => void
  onClose: () => void
  onApply: (input: ContentApply) => boolean
}) {
  const trpc = useTRPC()
  const api = useTRPCClient()
  const alive = useRef(true)
  const inFlight = useRef(false)
  const pollStarted = useRef(Date.now())
  const handledRun = useRef<string | null>(null)
  const intent = useRef<{ signature: string; key: string } | null>(null)
  const contextInitialized = useRef(false)
  const snapshotRef = useRef<RequestSnapshot | null>(null)
  const [request, setRequest] = useState<{
    snapshot: RequestSnapshot
    runId: string
    status: string
  } | null>(null)
  const [reviewBase, setReviewBase] = useState<{
    composition: StorefrontComposition
    revision: number
    pageKey: string
  } | null>(null)
  const [rows, setRows] = useState<ContentReviewRow[]>([])
  const [reviewing, setReviewing] = useState(false)
  const [problem, setProblem] = useState("")
  const [requesting, setRequesting] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [refinement, setRefinement] = useState("")
  const [lastInstructions, setLastInstructions] = useState("")
  const [keepEdits, setKeepEdits] = useState(true)
  const [scopeChoice, setScope] = useState(props.sectionId)
  const compositionKey = useMemo(
    () => JSON.stringify(props.composition),
    [props.composition],
  )
  const selectionKey = `${props.pageKey}:${compositionKey}`
  const [selection, setSelection] = useState<{
    key: string
    fields: Record<string, boolean>
  }>({ key: selectionKey, fields: {} })
  const fields = useMemo(
    () => storefrontContentFields(props.composition, props.pageKey),
    [props.composition, props.pageKey],
  )
  const scope = fields.some((field) => field.sectionId === scopeChoice)
    ? scopeChoice
    : "page"
  const scopedFields = fields.filter(
    (field) => scope === "page" || field.sectionId === scope,
  )
  const isChosen = (field: StorefrontContentField) =>
    (selection.key === selectionKey ? selection.fields[field.id] : undefined) ??
    !contentFieldHasEdits(field)
  const contextForm = useZodForm<StorefrontContentContext>(
    storefrontContentContextSchema,
    { defaultValues: emptyContext },
  )
  const context = useQuery(
    trpc.storefront.contentContext.queryOptions(
      { expectedSiteId: props.siteId },
      {
        enabled: props.open,
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    ),
  )
  const generation = useQuery(
    trpc.storefront.contentGeneration.queryOptions(
      { expectedSiteId: props.siteId, runId: request?.runId ?? "" },
      {
        enabled:
          props.open &&
          !!request &&
          request.snapshot.generation === getDataCacheGeneration(),
        retry: false,
        refetchOnWindowFocus: false,
        refetchIntervalInBackground: false,
        refetchInterval: (query) =>
          !query.state.error &&
          contentRunActive(query.state.data?.status) &&
          Date.now() - pollStarted.current < 120_000
            ? Date.now() - pollStarted.current < 10_000
              ? 1500
              : 10_000
            : false,
      },
    ),
  )
  const cancelMutation = useMutation(
    trpc.storefront.cancelContentGeneration.mutationOptions(),
  )
  const currentRun = generation.isError
    ? null
    : generation.data?.id === request?.runId
      ? generation.data
      : null
  const active = contentRunActive(currentRun?.status ?? request?.status)
  const pending = requesting || active
  const unavailable = !context.data?.available || context.isError
  const stale =
    !!reviewBase &&
    (JSON.stringify(reviewBase.composition) !== compositionKey ||
      reviewBase.revision !== props.revision ||
      (context.data && context.data.revision > reviewBase.revision) ||
      reviewBase.pageKey !== props.pageKey)
  const selectedRows = rows.filter((row) => row.selected)
  const validSelected =
    selectedRows.length > 0 &&
    selectedRows.every(
      (row) => storefrontContentFieldState(row.field, row.text).valid,
    )

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (props.open) pollStarted.current = Date.now()
  }, [props.open])
  useEffect(() => {
    if (context.data && !context.isError && !contextInitialized.current) {
      contextInitialized.current = true
      contextForm.reset(context.data.context)
    }
  }, [context.data, context.isError, contextForm])
  useEffect(() => {
    if (
      !props.open ||
      !request ||
      !currentRun ||
      request.snapshot.generation !== getDataCacheGeneration()
    )
      return
    if (
      currentRun.status === "READY" &&
      currentRun.output &&
      handledRun.current !== currentRun.id
    ) {
      handledRun.current = currentRun.id
      intent.current = null
      setRows((previous) =>
        mergeContentReview(
          previous,
          request.snapshot.fields,
          currentRun.output,
          request.snapshot.refine,
        ),
      )
      setReviewing(true)
      setProblem("")
      setRefinement("")
    } else if (
      (currentRun.status === "FAILED" || currentRun.status === "CANCELLED") &&
      !currentRun.needsReconciliation
    )
      intent.current = null
  }, [props.open, request, currentRun])

  const choose = (field: StorefrontContentField, checked: boolean) =>
    setSelection((current) => ({
      key: selectionKey,
      fields: {
        ...(current.key === selectionKey ? current.fields : {}),
        [field.id]: checked,
      },
    }))
  const updateRow = (
    id: string,
    patch: Partial<Pick<ContentReviewRow, "text" | "selected">>,
  ) =>
    setRows((current) =>
      current.map((row) =>
        row.field.id === id
          ? {
              ...row,
              ...patch,
              ...(patch.text !== undefined ? { edited: true } : {}),
            }
          : row,
      ),
    )
  async function generate(refine = false) {
    if (
      inFlight.current ||
      pending ||
      props.blocked ||
      unavailable ||
      currentRun?.needsReconciliation ||
      (refine && stale)
    )
      return
    setProblem("")
    const parsed = storefrontContentContextSchema.safeParse(
      contextForm.getValues(),
    )
    if (
      !parsed.success ||
      (!parsed.data.description.trim() && !parsed.data.offerings.trim())
    ) {
      await contextForm.trigger()
      contextForm.setError("description", {
        message:
          "Add a business description or products and services before generating content.",
      })
      props.onContext()
      return
    }
    const previous = refine ? selectedContentRefinements(rows, keepEdits) : []
    const picked = refine
      ? rows
          .filter((row) => previous.some((draft) => draft.id === row.field.id))
          .map((row) => row.field)
      : scopedFields.filter(isChosen)
    if (!picked.length || picked.length > storefrontContentFieldLimit) {
      setProblem(
        refine
          ? "Choose an area without protected edits, or turn off Keep my edits."
          : `Choose between 1 and ${storefrontContentFieldLimit} content areas.`,
      )
      return
    }
    const writing = refine ? refinement.trim() : instructions.trim()
    if (refine && !writing) return
    const core = {
      expectedSiteId: props.siteId,
      expectedDraftRevision: props.revision,
      composition: structuredClone(props.composition),
      pageKey: props.pageKey,
      fieldIds: picked.map((field) => field.id),
      context: parsed.data,
      instructions: writing,
      previous,
    }
    const signature = JSON.stringify(core)
    if (intent.current?.signature !== signature)
      intent.current = { signature, key: crypto.randomUUID() }
    const input: GenerateInput = {
      ...core,
      clientRequestId: intent.current.key,
    }
    const snapshot: RequestSnapshot = {
      input,
      base: structuredClone(props.composition),
      fields: picked,
      generation: getDataCacheGeneration(),
      refine,
    }
    snapshotRef.current = snapshot
    if (!refine) {
      setRows([])
      setReviewBase({
        composition: snapshot.base,
        revision: props.revision,
        pageKey: props.pageKey,
      })
      setReviewing(false)
    }
    inFlight.current = true
    setRequesting(true)
    props.onWrite()
    setLastInstructions(writing)
    try {
      const result = await api.storefront.generateContent.mutate(input)
      if (
        !alive.current ||
        snapshot.generation !== getDataCacheGeneration() ||
        snapshotRef.current !== snapshot
      )
        return
      pollStarted.current = Date.now()
      setRequest({ snapshot, runId: result.run.id, status: result.run.status })
    } catch (cause) {
      if (alive.current && snapshot.generation === getDataCacheGeneration())
        setProblem(errorText(cause))
    } finally {
      inFlight.current = false
      if (alive.current && snapshot.generation === getDataCacheGeneration())
        setRequesting(false)
    }
  }
  async function cancel() {
    if (!request || cancelMutation.isPending) return
    const cacheGeneration = getDataCacheGeneration()
    try {
      await cancelMutation.mutateAsync({
        expectedSiteId: props.siteId,
        runId: request.runId,
      })
      if (alive.current && cacheGeneration === getDataCacheGeneration())
        await generation.refetch()
    } catch (cause) {
      if (alive.current && cacheGeneration === getDataCacheGeneration())
        setProblem(errorText(cause))
    }
  }
  function apply() {
    if (
      !reviewBase ||
      stale ||
      pending ||
      props.blocked ||
      !validSelected ||
      context.isError
    )
      return
    if (
      props.onApply({
        base: reviewBase.composition,
        revision: reviewBase.revision,
        fields: rows.map((row) => row.field),
        drafts: selectedRows.map((row) => ({
          id: row.field.id,
          text: row.text,
        })),
      })
    ) {
      setRows([])
      setReviewBase(null)
      setReviewing(false)
      setRequest(null)
      props.onClose()
    }
  }
  const terminalMessage =
    currentRun?.status === "FAILED"
      ? currentRun.needsReconciliation
        ? "The provider outcome is uncertain. Its allowance remains held for review; this request will not be sent again."
        : "We couldn't generate that draft. Your storefront is unchanged. You can make a new request or continue editing by hand."
      : currentRun?.status === "CANCELLED"
        ? "Generation cancelled. Your storefront is unchanged."
        : ""
  return {
    contextForm,
    context,
    fields,
    scopedFields,
    scope,
    setScope,
    isChosen,
    choose,
    rows,
    updateRow,
    reviewing,
    setReviewing,
    instructions,
    setInstructions,
    refinement,
    setRefinement,
    lastInstructions,
    keepEdits,
    setKeepEdits,
    problem,
    terminalMessage,
    pending,
    active,
    requesting,
    unavailable,
    stale,
    selectedRows,
    validSelected,
    generate,
    cancel,
    cancelPending: cancelMutation.isPending,
    apply,
    currentRun,
    generation,
    checkStatus: () => {
      pollStarted.current = Date.now()
      return generation.refetch()
    },
    timedOut: active && Date.now() - pollStarted.current >= 120_000,
  }
}
export type StorefrontContentController = ReturnType<
  typeof useStorefrontContent
>

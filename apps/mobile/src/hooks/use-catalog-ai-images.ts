import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type CatalogAiChoice,
  type CatalogAiFacts,
  catalogAiChoiceInputs,
} from "@ewatrade/utils/catalog-ai-images"
import {
  type CatalogImageReplacement,
  applyCatalogAiJobs,
} from "@ewatrade/utils/catalog-image-editor"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useEffect, useRef, useState } from "react"

type Commands = RouterInputs["catalog"]["aiImages"]
type Command = Commands["start"] | Commands["startBatch"]
export type GeneratedCatalogImageChoice = { assetId: string; variantId: string }

export function useCatalogAiImages(input: {
  storeId: string
  contextKey: string
  catalogItemId?: string
  facts: CatalogAiFacts
  assetIds: string[]
  onChange(
    ids: string[],
    replacements: CatalogImageReplacement[],
    choices: GeneratedCatalogImageChoice[],
  ): void
  enabled?: boolean
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const enabled = input.enabled !== false && !!input.storeId
  const query = useQuery(
    trpc.catalog.aiImages.state.queryOptions(
      { storeId: input.storeId, contextKey: input.contextKey },
      {
        enabled,
        refetchInterval: (query) =>
          query.state.data?.jobs.some((job) =>
            ["QUEUED", "DISPATCHING", "PENDING_REVIEW"].includes(job.state),
          )
            ? 2000
            : false,
      },
    ),
  )
  const mutation = useMutation(trpc.catalog.aiImages.start.mutationOptions())
  const batch = useMutation(trpc.catalog.aiImages.startBatch.mutationOptions())
  const cancellation = useMutation(
    trpc.catalog.aiImages.cancel.mutationOptions(),
  )
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState<{
    scope: string
    operationId: string
    choices: CatalogAiChoice[]
  } | null>(null)
  const seen = useRef(new Set<string>())
  const running = useRef(false)
  const current = useRef(input)
  current.current = input
  const scope = `${input.storeId}:${input.contextKey}`
  const activeScope = useRef(scope)
  activeScope.current = scope
  const commandKey = ["catalog-ai-request", input.storeId, input.contextKey]
  const [retryRequest, setRetryRequest] = useState(
    () => !!client.getQueryData<Command>(commandKey),
  )
  useEffect(() => {
    seen.current = new Set()
    setError(null)
    setRetryRequest(
      !!client.getQueryData<Command>([
        "catalog-ai-request",
        input.storeId,
        input.contextKey,
      ]),
    )
  }, [client, input.storeId, input.contextKey])
  useEffect(() => {
    if (!enabled || !query.data) return
    const replacements: CatalogImageReplacement[] = []
    const next = applyCatalogAiJobs(
      current.current.assetIds,
      query.data.jobs,
      seen.current,
      replacements,
    )
    if (JSON.stringify(next) !== JSON.stringify(current.current.assetIds)) {
      const choices = query.data.jobs.flatMap((job) =>
        job.mode === "generate" &&
        job.choice &&
        job.outputAssetId &&
        next.includes(job.outputAssetId) &&
        !current.current.assetIds.includes(job.outputAssetId)
          ? [{ assetId: job.outputAssetId, variantId: job.choice.id }]
          : [],
      )
      current.current.onChange(next, replacements, choices)
    }
  }, [enabled, query.data])
  const pending =
    query.data?.jobs.filter((job) =>
      ["QUEUED", "DISPATCHING", "UNCERTAIN", "PENDING_REVIEW"].includes(
        job.state,
      ),
    ) ?? []
  const cancellable = pending.filter(
    (job) =>
      job.state !== "UNCERTAIN" && job.failureCode !== "CANCEL_REQUESTED",
  )
  const progress = pending.length
    ? pending.map((job) => ({
        id: job.id,
        choice: job.choice?.name,
        label:
          job.failureCode === "CANCEL_REQUESTED"
            ? "Stopping…"
            : job.state === "QUEUED"
              ? "Queued"
              : job.state === "PENDING_REVIEW" || job.state === "UNCERTAIN"
                ? "Checking…"
                : job.mode === "refine"
                  ? "Refining…"
                  : "Creating…",
      }))
    : starting?.scope === scope
      ? (starting.choices.length ? starting.choices : [null]).map((choice) => ({
          id: choice?.id ?? starting.operationId,
          choice: choice?.name,
          label: "Starting…",
        }))
      : []

  async function cancel() {
    if (cancellation.isPending || !cancellable.length) return
    setError(null)
    try {
      await cancellation.mutateAsync({
        storeId: input.storeId,
        contextKey: input.contextKey,
        jobIds: cancellable.map((job) => job.id),
      })
    } catch (error) {
      if (activeScope.current === scope)
        setError(
          error instanceof Error
            ? error.message
            : "Could not stop generation. Try again.",
        )
    } finally {
      await client.invalidateQueries({
        queryKey: trpc.catalog.aiImages.state.queryKey({
          storeId: input.storeId,
          contextKey: input.contextKey,
        }),
      })
    }
  }

  async function start(sourceAssetId?: string, choices?: CatalogAiChoice[]) {
    if (running.current) return
    running.current = true
    setError(null)
    const originalScope = scope
    const previous = client.getQueryData<Command>(commandKey)
    const common = {
      storeId: input.storeId,
      contextKey: input.contextKey,
      catalogItemId: input.catalogItemId,
      facts: input.facts,
      note: note,
      clientOperationId: Crypto.randomUUID(),
    }
    const request: Command =
      previous ??
      (choices?.length
        ? { ...common, choices: catalogAiChoiceInputs(choices) }
        : { ...common, sourceAssetId })
    setStarting({
      scope,
      operationId: request.clientOperationId,
      choices: "choices" in request ? request.choices : [],
    })
    client.setQueryData(commandKey, request)
    setRetryRequest(true)
    try {
      if ("choices" in request) await batch.mutateAsync(request)
      else await mutation.mutateAsync(request)
      client.removeQueries({ queryKey: commandKey, exact: true })
      if (activeScope.current === originalScope) setRetryRequest(false)
    } catch (error) {
      const known =
        error &&
        typeof error === "object" &&
        "data" in error &&
        error.data &&
        typeof error.data === "object" &&
        "code" in error.data &&
        [
          "BAD_REQUEST",
          "FORBIDDEN",
          "PRECONDITION_FAILED",
          "TOO_MANY_REQUESTS",
          "NOT_FOUND",
          "CONFLICT",
        ].includes(String(error.data.code))
      if (known) {
        client.removeQueries({ queryKey: commandKey, exact: true })
        if (activeScope.current === originalScope) setRetryRequest(false)
      }
      if (activeScope.current === originalScope)
        setError(
          error instanceof Error
            ? error.message
            : "The request could not be confirmed. Retry the same request.",
        )
    } finally {
      await client.invalidateQueries({
        queryKey: trpc.catalog.aiImages.state.queryKey({
          storeId: input.storeId,
          contextKey: input.contextKey,
        }),
      })
      running.current = false
      if (activeScope.current === originalScope) setStarting(null)
    }
  }
  const [note, setNote] = useState("")
  return {
    query,
    note,
    setNote,
    error,
    retryRequest,
    start,
    cancel,
    canCancel: cancellable.length > 0 && !cancellation.isPending,
    cancelling: cancellation.isPending,
    busy: progress.length > 0,
    pending,
    progress,
    available:
      !!query.data?.configured &&
      !!query.data.canGenerate &&
      !!query.data.usage.enabled &&
      (query.data.usage.remaining ?? 0) > 0,
    refresh: () => query.refetch(),
  }
}

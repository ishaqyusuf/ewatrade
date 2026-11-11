import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import type { CatalogAiFacts } from "@ewatrade/utils/catalog-ai-images"
import {
  type CatalogImageReplacement,
  applyCatalogAiJobs,
} from "@ewatrade/utils/catalog-image-editor"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useEffect, useRef, useState } from "react"

type Command = RouterInputs["catalog"]["aiImages"]["start"]
export function useCatalogAiImages(input: {
  storeId: string
  contextKey: string
  catalogItemId?: string
  facts: CatalogAiFacts
  assetIds: string[]
  onChange(ids: string[], replacements: CatalogImageReplacement[]): void
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
  const [error, setError] = useState<string | null>(null)
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
    if (JSON.stringify(next) !== JSON.stringify(current.current.assetIds))
      current.current.onChange(next, replacements)
  }, [enabled, query.data])
  const pending = query.data?.jobs.find((job) =>
    ["QUEUED", "DISPATCHING", "UNCERTAIN", "PENDING_REVIEW"].includes(
      job.state,
    ),
  )
  async function start(sourceAssetId?: string) {
    if (running.current) return
    running.current = true
    setError(null)
    const originalScope = scope
    const previous = client.getQueryData<Command>(commandKey)
    const request: Command = previous ?? {
      storeId: input.storeId,
      contextKey: input.contextKey,
      catalogItemId: input.catalogItemId,
      sourceAssetId,
      facts: input.facts,
      note: note,
      clientOperationId: Crypto.randomUUID(),
    }
    client.setQueryData(commandKey, request)
    setRetryRequest(true)
    try {
      await mutation.mutateAsync(request)
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
      running.current = false
      await client.invalidateQueries({
        queryKey: trpc.catalog.aiImages.state.queryKey({
          storeId: input.storeId,
          contextKey: input.contextKey,
        }),
      })
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
    busy: mutation.isPending || !!pending,
    pending,
    available:
      !!query.data?.configured &&
      !!query.data.canGenerate &&
      !!query.data.usage.enabled &&
      (query.data.usage.remaining ?? 0) > 0,
    refresh: () => query.refetch(),
  }
}

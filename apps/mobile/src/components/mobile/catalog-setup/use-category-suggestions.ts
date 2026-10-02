import { useTRPC } from "@/trpc/client"
import type { CatalogCategorySuggestion } from "@ewatrade/utils/catalog-category-suggestions"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

type Context = {
  title: string
  kind: string | null
  actorId?: string
  tenantId?: string
  storeId?: string
  businessProfileKey: string | null
  enabled: boolean
}

/** Blur requests stay behind the form. Results are bound to the exact draft scope. */
export function useCategorySuggestions(context: Context) {
  const trpc = useTRPC()
  const mutation = useMutation({
    ...trpc.catalog.categories.suggest.mutationOptions(),
    retry: false,
  })
  const signature = JSON.stringify([
    context.title.trim(),
    context.kind,
    context.actorId,
    context.tenantId,
    context.storeId,
    context.businessProfileKey,
    context.enabled,
  ])
  const current = useRef({ signature, context })
  current.current = { signature, context }
  const generation = useRef(0)
  const mounted = useRef(true)
  const inFlight = useRef<string | null>(null)
  const [result, setResult] = useState<{
    signature: string
    generation: number
    suggestions: CatalogCategorySuggestion[]
  } | null>(null)
  const latestResult = useRef(result)
  latestResult.current = result
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
    }
  }, [])
  // A -> B -> A must invalidate the old A request as well as checking its text.
  const previousSignature = useRef(signature)
  if (previousSignature.current !== signature) {
    previousSignature.current = signature
    generation.current += 1
    inFlight.current = null
  }
  async function request() {
    const snapshot = current.current
    const title = snapshot.context.title.trim()
    if (
      !snapshot.context.enabled ||
      snapshot.context.kind !== "product" ||
      !snapshot.context.storeId ||
      !snapshot.context.actorId ||
      !snapshot.context.tenantId ||
      title.length < 2 ||
      title.length > 160 ||
      inFlight.current === snapshot.signature ||
      (result?.signature === snapshot.signature &&
        result.generation === generation.current)
    )
      return
    const requestGeneration = ++generation.current
    inFlight.current = snapshot.signature
    setResult(null)
    try {
      const response = await mutation.mutateAsync({
        title,
        storeId: snapshot.context.storeId,
      })
      if (
        mounted.current &&
        generation.current === requestGeneration &&
        current.current.signature === snapshot.signature &&
        current.current.context.enabled
      ) {
        setResult({
          signature: snapshot.signature,
          generation: requestGeneration,
          suggestions: response.suggestions,
        })
      }
    } catch {
      // Advisory failure never blocks the title or manual category selection.
    } finally {
      if (generation.current === requestGeneration) inFlight.current = null
    }
  }
  return {
    isCurrentSuggestion: (suggestion: CatalogCategorySuggestion) => {
      const latest = latestResult.current
      return (
        current.current.context.enabled &&
        current.current.context.kind === "product" &&
        latest?.signature === current.current.signature &&
        latest.generation === generation.current &&
        latest.suggestions.includes(suggestion)
      )
    },
    suggestions:
      context.enabled &&
      context.kind === "product" &&
      result?.signature === signature &&
      result.generation === generation.current
        ? result.suggestions
        : [],
    request,
  }
}

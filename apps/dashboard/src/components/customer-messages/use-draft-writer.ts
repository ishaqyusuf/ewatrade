"use client"

import { useTRPC } from "@/trpc/client"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import { useMutation } from "@tanstack/react-query"
import { useRef, useState } from "react"

type DraftInput = RouterInputs["customerMessages"]["draftWithAi"]
type DraftResult = RouterOutputs["customerMessages"]["draftWithAi"]

const SLOW_MS = 30_000

/**
 * AI drafts resolve through the awaited call, not observer callbacks, so a
 * remounted observer can't strand the screen on "Writing…". A slow run can be
 * abandoned; its late result is ignored and the person's choices stay.
 */
export function useDraftWriter() {
  const trpc = useTRPC()
  const mutation = useMutation(
    trpc.customerMessages.draftWithAi.mutationOptions(),
  )
  const run = useRef(0)
  const [writing, setWriting] = useState(false)
  const [slow, setSlow] = useState(false)

  async function write(input: DraftInput): Promise<DraftResult | null> {
    run.current += 1
    const id = run.current
    setWriting(true)
    setSlow(false)
    const timer = setTimeout(() => {
      if (run.current === id) setSlow(true)
    }, SLOW_MS)
    try {
      const result = await mutation.mutateAsync(input)
      return run.current === id ? result : null
    } finally {
      clearTimeout(timer)
      if (run.current === id) {
        setWriting(false)
        setSlow(false)
      }
    }
  }

  function abandon() {
    run.current += 1
    setWriting(false)
    setSlow(false)
  }

  return { write, writing, slow, abandon }
}

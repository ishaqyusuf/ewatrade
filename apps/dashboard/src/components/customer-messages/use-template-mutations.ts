"use client"

import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  type TemplateWrite,
  type TemplateWriteResult,
  type WriteContext,
  applyTemplateWriteIfCurrent,
  writeContextIsCurrent,
} from "./template-model"

export {
  type SavedTemplate,
  type TemplateList,
  type TemplateScope,
  expectedFor,
  scopeTemplate,
} from "./template-model"

/** Every write refreshes status, list and previews for this Store. */
export function useTemplateMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const listKey = trpc.customerMessages.templates.list.queryKey()
  const now = (): WriteContext => ({
    storeId: queryClient.getQueryData(listKey)?.storeId ?? undefined,
    generation: getDataCacheGeneration(),
  })
  const options = {
    // Bound to the Store list and cache generation the write started in.
    onMutate: (): WriteContext => now(),
    onSuccess: async (
      result: TemplateWriteResult,
      write: TemplateWrite,
      started: WriteContext | undefined,
    ) => {
      if (!writeContextIsCurrent(started, now())) return
      // A list read already in flight predates this write: drop it first.
      await queryClient.cancelQueries({ queryKey: listKey })
      if (!writeContextIsCurrent(started, now())) return
      queryClient.setQueryData(listKey, (current) =>
        applyTemplateWriteIfCurrent(current, started?.storeId, write, result),
      )
    },
    // Not awaited: per-call callbacks run before the background refetch.
    onSettled: (
      _result: unknown,
      _failure: unknown,
      _write: TemplateWrite,
      started: WriteContext | undefined,
    ) => {
      if (!writeContextIsCurrent(started, now())) return
      void queryClient.invalidateQueries({
        queryKey: trpc.customerMessages.pathKey(),
      })
    },
  }
  return {
    save: useMutation(
      trpc.customerMessages.templates.save.mutationOptions(options),
    ),
    reset: useMutation(
      trpc.customerMessages.templates.reset.mutationOptions(options),
    ),
    setEnabled: useMutation(
      trpc.customerMessages.templates.setEnabled.mutationOptions(options),
    ),
  }
}

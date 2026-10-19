import { ActionButton } from "@/components/mobile/action-button"
import { SectionHeader } from "@/components/mobile/green-till/kit"
import { ProductUsagePicker } from "@/components/mobile/product-usage-picker"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import type { ProductUsage } from "@ewatrade/utils/product-usage"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { View } from "react-native"

/** Owner/Admin control for For sale · Internal use · Both on a saved Product. */
export function ProductUsageEditor({
  itemId,
  updatedAt,
  usage,
}: {
  itemId: string
  updatedAt: Date | string
  usage: ProductUsage
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(usage)
  const mutation = useMutation(
    trpc.catalog.setProductUsage.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.catalog.pathKey() }),
    }),
  )
  const changed = draft !== usage
  return (
    <View>
      <SectionHeader title="Usage" />
      <View className="gap-3 rounded-[20px] bg-card p-3.5 shadow-sm">
        <ProductUsagePicker
          disabled={mutation.isPending}
          onChange={(next) => {
            mutation.reset()
            setDraft(next)
          }}
          value={draft}
        />
        {mutation.error ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-xs text-destructive"
          >
            {mutation.error.message}
          </Text>
        ) : null}
        {changed ? (
          <View className="flex-row gap-2">
            <ActionButton
              className="flex-1"
              disabled={mutation.isPending}
              onPress={() => {
                mutation.reset()
                setDraft(usage)
              }}
              variant="outline"
            >
              Cancel
            </ActionButton>
            <ActionButton
              className="flex-1"
              isLoading={mutation.isPending}
              loadingLabel="Saving…"
              onPress={() =>
                mutation.mutate({
                  expectedUpdatedAt: new Date(updatedAt),
                  itemId,
                  usage: draft,
                })
              }
            >
              Save usage
            </ActionButton>
          </View>
        ) : null}
      </View>
    </View>
  )
}

import { useColors } from "@/hooks/use-color"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import {
  RefreshControl,
  type RefreshControlProps,
} from "react-native"

type QueryRefreshControlProps = Omit<
  Partial<RefreshControlProps>,
  "onRefresh" | "refreshing"
>

export function QueryRefreshControl(props: QueryRefreshControlProps) {
  const colors = useColors()
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    if (refreshing) return

    setRefreshing(true)
    try {
      await queryClient.refetchQueries({ type: "active" })
    } finally {
      setRefreshing(false)
    }
  }, [queryClient, refreshing])

  return (
    <RefreshControl
      {...props}
      colors={[colors.primary]}
      onRefresh={() => void refresh()}
      progressBackgroundColor={colors.card}
      refreshing={refreshing}
      tintColor={colors.primary}
    />
  )
}

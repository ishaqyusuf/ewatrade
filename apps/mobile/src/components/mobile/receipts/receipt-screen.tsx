import { ActionButton } from "@/components/mobile/action-button"
import { MobileScreen } from "@/components/mobile/screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { receiptFileStem } from "@ewatrade/order-receipts"
import {
  decodeReceiptBase64,
  receiptImageFile,
} from "@ewatrade/order-receipts/files"
import { useQuery } from "@tanstack/react-query"
import { Image } from "expo-image"
import { useRouter } from "expo-router"
import { useRef, useState } from "react"
import { Platform } from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { deliverReceiptFile } from "./receipt-file"

export function ReceiptScreen({ orderIds }: { orderIds: string[] }) {
  const router = useRouter()
  const { profile } = useAuthContext()
  const trpc = useTRPC()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [format, setFormat] = useState<"pdf" | "images">("pdf")
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const query = useQuery(
    trpc.orders.prepareReceipts.queryOptions(
      {
        storeId: profile?.storeId,
        orderIds,
        includeImages: true,
      },
      {
        enabled: !offline && orderIds.length > 0,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    ),
  )
  async function deliver(action: "save" | "share") {
    if (!query.data || busy.current || offline) return
    busy.current = true
    setPending(true)
    setError("")
    setMessage("")
    try {
      const file =
        format === "pdf"
          ? {
              bytes: decodeReceiptBase64(query.data.pdfBase64),
              filename:
                query.data.orderNumbers.length === 1
                  ? `${receiptFileStem(query.data.orderNumbers[0] ?? "order")}.pdf`
                  : "order-receipts.pdf",
              mimeType: "application/pdf",
            }
          : receiptImageFile(query.data.pages ?? [], query.data.orderNumbers)
      setMessage(await deliverReceiptFile(file, action))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not export this receipt. Try again.",
      )
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <MobileScreen scroll={false} contentClassName="flex-1">
      <View className="gap-3">
        <ActionButton
          variant="ghost"
          disabled={pending}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/admin-home")
          }
        >
          Close receipts
        </ActionButton>
        <Text className="text-2xl font-bold">
          {orderIds.length > 1 ? "Order receipts" : "Order receipt"}
        </Text>
        <Text className="text-sm text-muted-foreground">
          {query.data?.orderNumbers.join(", ") ?? `${orderIds.length} selected`}{" "}
          · Saved receipt settings
        </Text>
      </View>
      {!orderIds.length ? (
        <StatusBanner
          tone="destructive"
          message="Select between 1 and 20 distinct Orders to generate receipts."
        />
      ) : offline ? (
        <StatusBanner
          tone="warning"
          message="Reconnect to prepare and export receipts."
        />
      ) : query.isError ? (
        <StatusBanner
          tone="destructive"
          message={query.error.message}
          actionLabel="Try again"
          onActionPress={() => void query.refetch()}
        />
      ) : query.isPending ? (
        <Text accessibilityRole="progressbar">Preparing your receipts…</Text>
      ) : null}
      {query.data && !offline ? (
        <>
          <FlatList
            data={query.data.pages ?? []}
            keyExtractor={(_, index) => String(index)}
            contentContainerClassName="gap-4 pb-4"
            renderItem={({ item, index }) => (
              <View className="gap-2">
                <Text className="text-sm text-muted-foreground">
                  Page {index + 1} of {query.data.pages?.length}
                </Text>
                <Image
                  source={{ uri: `data:image/png;base64,${item.base64}` }}
                  style={{
                    width: "100%",
                    aspectRatio: item.width / item.height,
                  }}
                  contentFit="contain"
                  cachePolicy="none"
                  accessibilityLabel={`Receipt page ${index + 1}`}
                  accessible
                />
              </View>
            )}
          />
          <View className="gap-3 border-t border-border pt-3">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <ActionButton
                  variant={format === "pdf" ? "default" : "outline"}
                  accessibilityState={{ selected: format === "pdf" }}
                  disabled={pending}
                  onPress={() => setFormat("pdf")}
                >
                  PDF
                </ActionButton>
              </View>
              <View className="flex-1">
                <ActionButton
                  variant={format === "images" ? "default" : "outline"}
                  accessibilityState={{ selected: format === "images" }}
                  disabled={pending}
                  onPress={() => setFormat("images")}
                >
                  Images
                </ActionButton>
              </View>
            </View>
            <Text className="text-xs text-muted-foreground">
              {format === "images"
                ? "One PNG per page. Multiple pages save as a ZIP."
                : "One PDF containing every selected Order."}
            </Text>
            {error ? (
              <StatusBanner tone="destructive" message={error} />
            ) : message ? (
              <Text accessibilityLiveRegion="polite">{message}</Text>
            ) : null}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <ActionButton
                  disabled={pending}
                  isLoading={pending}
                  onPress={() => void deliver("save")}
                >
                  {Platform.OS === "ios" ? "Save to Files" : "Save"}
                </ActionButton>
              </View>
              <View className="flex-1">
                <ActionButton
                  variant="outline"
                  disabled={pending}
                  onPress={() => void deliver("share")}
                >
                  Share
                </ActionButton>
              </View>
            </View>
          </View>
        </>
      ) : null}
    </MobileScreen>
  )
}

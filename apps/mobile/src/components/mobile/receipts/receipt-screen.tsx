import { MobileScreen } from "@/components/mobile/screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import {
  decodeReceiptBase64,
  receiptImageFile,
} from "@ewatrade/order-receipts/files"
import { useQuery } from "@tanstack/react-query"
import { Image } from "expo-image"
import { useRouter } from "expo-router"
import { useRef, useState } from "react"
import { FlatList } from "react-native"
import { deliverReceiptFile } from "./receipt-file"
import { receiptDownloadName } from "./receipt-name"

type ReceiptFormat = "pdf" | "images"

// Native failures surface as developer text ("Cannot find native module…");
// people get the fix instead.
function friendlyExportError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : ""
  if (/native module|is not a function|unavailable/i.test(message))
    return "This phone needs the latest ẸwáTrade update to share files. Update the app, then try again."
  return message || "Could not export this receipt. Try again."
}

function ToolbarAction({
  disabled,
  icon,
  label,
  onPress,
  primary = false,
}: {
  disabled: boolean
  icon: IconKeys
  label: string
  onPress: () => void
  primary?: boolean
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn("items-center gap-1", disabled && "opacity-45")}
      disabled={disabled}
      haptic
      onPress={onPress}
    >
      <View
        className={cn(
          "size-12 items-center justify-center rounded-full",
          primary ? "bg-primary" : "border border-border bg-secondary",
        )}
      >
        <Icon
          className={cn(
            "size-base",
            primary ? "text-primary-foreground" : "text-foreground",
          )}
          name={icon}
        />
      </View>
      <Text className="text-xs font-semibold text-muted-foreground">
        {label}
      </Text>
    </Pressable>
  )
}

function FormatSwitch({
  disabled,
  format,
  onChange,
}: {
  disabled: boolean
  format: ReceiptFormat
  onChange: (format: ReceiptFormat) => void
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      className="flex-row rounded-full bg-secondary p-1"
    >
      {(
        [
          ["pdf", "PDF"],
          ["images", "Image"],
        ] as const
      ).map(([value, label]) => {
        const selected = format === value
        return (
          <Pressable
            accessibilityLabel={`Export as ${label}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            className={cn(
              "min-h-10 justify-center rounded-full px-4",
              selected && "bg-card",
            )}
            disabled={disabled}
            key={value}
            onPress={() => onChange(value)}
          >
            <Text
              className={cn(
                "text-sm font-bold",
                selected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function PaperSkeleton() {
  return (
    <SkeletonGroup accessibilityLabel="Preparing your receipt">
      <View className="gap-3 rounded-lg bg-card p-5">
        <View className="flex-row justify-between gap-3">
          <Skeleton height={18} width="48%" />
          <Skeleton height={14} width={64} />
        </View>
        <Skeleton height={10} width="60%" />
        <Skeleton height={44} radius={8} />
        <Skeleton height={10} width="90%" />
        <Skeleton height={10} width="76%" />
        <Skeleton height={10} width="84%" />
        <View className="items-end gap-2 pt-2">
          <Skeleton height={12} width="40%" />
          <Skeleton height={16} width="46%" />
        </View>
      </View>
    </SkeletonGroup>
  )
}

export function ReceiptScreen({ orderIds }: { orderIds: string[] }) {
  const router = useRouter()
  const { profile } = useAuthContext()
  const trpc = useTRPC()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [format, setFormat] = useState<ReceiptFormat>("pdf")
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [page, setPage] = useState(0)
  const [canvasWidth, setCanvasWidth] = useState(0)
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
  const pages = query.data?.pages ?? []
  const orderNumbers = query.data?.orderNumbers ?? []
  const ready = Boolean(query.data) && !offline

  async function deliver(action: "save" | "share") {
    if (!query.data || busy.current || offline) return
    busy.current = true
    setPending(true)
    setError("")
    setMessage("")
    try {
      const base =
        format === "pdf"
          ? {
              bytes: decodeReceiptBase64(query.data.pdfBase64),
              mimeType: "application/pdf",
            }
          : receiptImageFile(query.data.pages ?? [], query.data.orderNumbers)
      const extension =
        base.mimeType === "application/pdf"
          ? "pdf"
          : base.mimeType === "image/png"
            ? "png"
            : "zip"
      const filename = receiptDownloadName({
        businessName: profile?.businessName,
        extension,
        images: format === "images",
        orderNumbers: query.data.orderNumbers,
      })
      setMessage(await deliverReceiptFile({ ...base, filename }, action))
    } catch (cause) {
      setError(friendlyExportError(cause))
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <MobileScreen scroll={false} contentClassName="flex-1 gap-4">
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityLabel="Close receipt"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full border border-border bg-card"
          disabled={pending}
          haptic
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/admin-home")
          }
        >
          <Icon className="size-base text-foreground" name="X" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-lg font-extrabold text-foreground">
            {orderIds.length > 1 ? "Receipts" : "Receipt"}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {orderNumbers.length
              ? orderNumbers.join(", ")
              : `${orderIds.length} ${orderIds.length === 1 ? "order" : "orders"}`}
          </Text>
        </View>
      </View>

      {!orderIds.length ? (
        <StatusBanner
          tone="destructive"
          message="Select between 1 and 20 orders to make receipts."
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
      ) : null}

      <View
        className="flex-1 overflow-hidden rounded-3xl bg-secondary"
        onLayout={(event) => setCanvasWidth(event.nativeEvent.layout.width)}
      >
        {query.isPending && !offline && orderIds.length ? (
          <View className="p-4">
            <PaperSkeleton />
          </View>
        ) : ready && canvasWidth > 0 ? (
          <FlatList
            data={pages}
            horizontal
            keyExtractor={(_, index) => String(index)}
            onMomentumScrollEnd={(event) =>
              setPage(
                Math.round(event.nativeEvent.contentOffset.x / canvasWidth),
              )
            }
            pagingEnabled
            renderItem={({ item, index }) => (
              <View style={{ padding: 16, width: canvasWidth }}>
                <View className="overflow-hidden rounded-lg bg-card">
                  <Image
                    accessibilityLabel={`Receipt page ${index + 1} of ${pages.length}`}
                    accessible
                    cachePolicy="none"
                    contentFit="contain"
                    source={{ uri: `data:image/png;base64,${item.base64}` }}
                    style={{
                      aspectRatio: item.width / item.height,
                      width: "100%",
                    }}
                  />
                </View>
              </View>
            )}
            showsHorizontalScrollIndicator={false}
          />
        ) : null}
      </View>

      {pages.length > 1 ? (
        <View
          accessibilityLabel={`Page ${page + 1} of ${pages.length}`}
          className="flex-row justify-center gap-1.5"
        >
          {pages.map((_, index) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: page dots mirror page order.
              key={index}
              className={cn(
                "h-1.5 rounded-full",
                index === page ? "w-4 bg-primary" : "w-1.5 bg-border",
              )}
            />
          ))}
        </View>
      ) : null}

      {error ? (
        <StatusBanner tone="destructive" message={error} />
      ) : message ? (
        <View className="flex-row items-center gap-2 rounded-2xl bg-accent px-4 py-3">
          <Icon
            className="size-sm text-accent-foreground"
            name="CheckCircle2"
          />
          <Text
            accessibilityLiveRegion="polite"
            className="min-w-0 flex-1 text-sm font-semibold text-accent-foreground"
          >
            {message}
          </Text>
        </View>
      ) : null}

      <View className="flex-row items-center justify-between gap-3 rounded-3xl border border-border bg-card px-3 py-2">
        <FormatSwitch
          disabled={pending || !ready}
          format={format}
          onChange={(next) => {
            setFormat(next)
            setMessage("")
            setError("")
          }}
        />
        <View className="flex-row gap-4">
          <ToolbarAction
            disabled={pending || !ready}
            icon="Download"
            label="Save"
            onPress={() => void deliver("save")}
            primary
          />
          <ToolbarAction
            disabled={pending || !ready}
            icon="Share"
            label="Share"
            onPress={() => void deliver("share")}
          />
        </View>
      </View>
    </MobileScreen>
  )
}

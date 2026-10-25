import { ActionButton } from "@/components/mobile/action-button"
import { StockRow as Row } from "@/components/mobile/appearances/classic/stock-intake"
import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { Icon } from "@/components/ui/icon"
import { Modal, type useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import {
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { Platform, StyleSheet, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { BottomSearchFooter } from "../bottom-search-footer"
import {
  stockCustodyLabel,
  stockFactsLabel,
  stockKindLabel,
} from "./stock-intake-model"
import type { StockIntakeModel } from "./use-stock-intake"

/** Up to five balances fit a small sheet; more get the full presentation. */
export function stockChooserLayout(total: number) {
  return total <= 5 ? "compact" : "full"
}
/** Bottom search: always past seven; for six or seven only when it overflows. */
export function stockChooserSearch(total: number, overflows: boolean) {
  return total > 7 || (total > 5 && overflows)
}
/**
 * Skeletons only until this screen's first authoritative balance read
 * (model.loading follows the hook's fresh-read gate, so old cache never shows
 * as zero choices). Background refreshes after that read never show skeletons.
 */
export function stockChooserLoading(
  model: Pick<StockIntakeModel, "loading" | "loadError">,
) {
  return model.loading && !model.loadError
}

type Chooser = Pick<ReturnType<typeof useModal>, "ref" | "dismiss">

/**
 * Choose stock balance: one sheet that starts compact (with three skeleton
 * rows while balances first load) and settles into the count-appropriate
 * view. Thresholds use the unfiltered eligible count, so a search narrowing
 * the list never collapses the sheet or hides the search.
 */
export function StockBalanceChooser({
  modal,
  model,
}: {
  modal: Chooser
  model: StockIntakeModel
}) {
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const loading = stockChooserLoading(model)
  const failed = !loading && Boolean(model.loadError) && !model.totalRows
  const total = model.totalRows
  const layout = loading || failed ? "compact" : stockChooserLayout(total)
  const [viewport, setViewport] = useState(0)
  const [content, setContent] = useState(0)
  // Once the search appears for an open it stays until the sheet closes.
  const [searchShown, setSearchShown] = useState(false)
  const [footerHeight, setFooterHeight] = useState(96)
  const overflows = viewport > 0 && content > viewport
  const search =
    layout === "full" && (searchShown || stockChooserSearch(total, overflows))
  useEffect(() => {
    if (search && !searchShown) setSearchShown(true)
  }, [search, searchShown])
  // The compact sheet has no search: never leave it filtered by a stale query.
  const { query, setQuery } = model
  useEffect(() => {
    if (layout === "compact" && query) setQuery("")
  }, [layout, query, setQuery])

  const footer = useRef({ query, setQuery, onHeight: setFooterHeight })
  footer.current = { query, setQuery, onHeight: setFooterHeight }
  // Gorhom renders the sheet at a separate PortalHost; the footer reads its
  // values through a provider inside that node (stable container type).
  const Container = useCallback(
    ({ children }: { children?: ReactNode }) => (
      <FooterContext.Provider value={footer.current}>
        {children}
      </FooterContext.Provider>
    ),
    [],
  )
  // Android full screen: its own header (close + title) clears the status bar;
  // no grabber or floating sheet chrome. Gorhom renders handles in their own
  // layer where NativeWind classes don't apply, so layout and colours are
  // explicit styles (Icon reads its own size class itself).
  const screenHeader = useCallback(
    () => (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 16,
          paddingBottom: 12,
          paddingTop: insets.top + 8,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        }}
      >
        <Pressable
          accessibilityLabel="Close stock balances"
          accessibilityRole="button"
          haptic
          onPress={modal.dismiss}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.card,
          }}
        >
          <Icon className="size-[18px]" color={colors.foreground} name="X" />
        </Pressable>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: "center",
            color: colors.foreground,
            fontSize: 16,
            fontWeight: "800",
          }}
        >
          Choose stock balance
        </Text>
        <View style={{ width: 44, height: 44 }} />
      </View>
    ),
    [
      insets.top,
      modal.dismiss,
      colors.background,
      colors.border,
      colors.card,
      colors.foreground,
    ],
  )

  const body = loading ? (
    <SkeletonGroup accessibilityLabel="Loading stock balances">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} height={64} />
      ))}
    </SkeletonGroup>
  ) : failed ? (
    <View className="gap-3">
      <Text className="text-sm text-muted-foreground">
        {model.loadError ?? "Stock balances could not load."}
      </Text>
      <ActionButton icon="RefreshCw" onPress={model.retryLoad} tone="soft">
        Try again
      </ActionButton>
    </View>
  ) : (
    <>
      {model.rows.map((item) => (
        <Row
          key={item.balanceSourceId}
          icon="Warehouse"
          title={item.productName}
          subtitle={`${item.variantName} · ${stockKindLabel(item)} · ${stockCustodyLabel(item, model.people)}`}
          quantityLabel={stockFactsLabel(item)}
          selected={model.selected?.balanceSourceId === item.balanceSourceId}
          disabled={model.locked}
          onPress={() => {
            model.edit({ balanceId: item.balanceSourceId })
            modal.dismiss()
          }}
        />
      ))}
      {!model.rows.length ? <Text>No matching stock balances.</Text> : null}
    </>
  )

  const android = Platform.OS === "android"
  const full = layout === "full"
  // One sheet throughout, so a first load settles in place without reopening.
  return (
    <Modal
      ref={modal.ref}
      title="Choose stock balance"
      containerComponent={Container}
      footerComponent={search ? StockChooserSearch : undefined}
      onDismiss={() => {
        setSearchShown(false)
        setContent(0)
      }}
      {...(!full
        ? { enableDynamicSizing: true, maxDynamicContentSize: height * 0.8 }
        : android
          ? {
              // Android: an edge-to-edge full screen.
              snapPoints: ["100%"],
              detached: false,
              // The shared sheet adds a floating bottom inset otherwise.
              bottomInset: 0,
              handleComponent: screenHeader,
              enablePanDownToClose: false,
              backgroundStyle: { borderRadius: 0 },
              keyboardBehavior: "fillParent" as const,
              // Edge-to-edge Android doesn't resize the window for the IME,
              // so gorhom must subtract the keyboard itself ("adjustPan"
              // maths); with "adjustResize" it assumes a native resize and
              // leaves the docked search under the keyboard.
              android_keyboardInputMode: "adjustPan" as const,
            }
          : // iOS: a full sheet.
            { snapPoints: ["92%"], keyboardBehavior: "fillParent" as const })}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          padding: 18,
          paddingTop: 0,
          gap: 12,
          paddingBottom: (search ? footerHeight : 0) + 24,
        }}
        keyboardShouldPersistTaps="handled"
        onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
        onContentSizeChange={(_width, next) => setContent(next)}
      >
        {body}
      </BottomSheetScrollView>
    </Modal>
  )
}

const FooterContext = createContext<{
  query: string
  setQuery: (value: string) => void
  onHeight: (height: number) => void
} | null>(null)

// Stable component identity keeps the focused search mounted while filtering.
// The standard floating bottom search (as BottomSearchFooter): the pill floats
// over the list with standard side and safe-area spacing. Spacing is explicit
// because the gorhom footer layer doesn't apply layout classes.
function StockChooserSearch(props: BottomSheetFooterProps) {
  const context = useContext(FooterContext)
  if (!context) return null
  return (
    <BottomSheetFooter {...props}>
      <BottomSheetInputProvider>
        <BottomSearchFooter
          accessibilityLabel="Find balance"
          alwaysShowSearch
          keyboardOwner="sheet"
          localSearch
          maxLength={160}
          onChangeText={context.setQuery}
          onHeightChange={context.onHeight}
          placeholder="Item, variant, unit, custody"
          position="relative"
          totalCount={0}
          value={context.query}
        />
      </BottomSheetInputProvider>
    </BottomSheetFooter>
  )
}

import { ActionButton } from "@/components/mobile/action-button"
import * as Classic from "@/components/mobile/appearances/classic/stock-intake"
import * as Market from "@/components/mobile/appearances/market-day/stock-intake"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useColorScheme } from "@/hooks/use-color"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useRouter } from "expo-router"
import { VariableContextProvider } from "nativewind"
import { useEffect, useRef, useState } from "react"
import {
  type FlatList as NativeFlatList,
  Text as NativeText,
  View as NativeView,
  type ScrollViewProps,
} from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { FormField } from "../form-field"
import { HeroCard } from "../green-till/hero-card"
import { StockIntakeFields } from "./stock-intake-fields"
import {
  STOCK_MODES,
  type StockBalance,
  type StockIntakeProps,
  stockCustodyLabel,
} from "./stock-intake-model"
import { StockIntakeReview } from "./stock-intake-review"
import { stockAfter } from "./stock-preview"
import { useStockIntake } from "./use-stock-intake"

export function StockIntakeChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="stock-intake" />
}

export function StockIntakeContent(props: StockIntakeProps) {
  const model = useStockIntake(props)
  const router = useRouter()
  const market = useMobileDesign("stock-intake") === "market-day"
  const {
    StockHeader: Header,
    StockChoice: Choice,
    StockRow: Row,
    StockSection: Section,
  } = market ? Market : Classic
  const palette = useMarketDayPalette()
  const [footerHeight, setFooterHeight] = useState(150)
  const scrollHide = useBottomSearchScroll()
  const list = useRef<NativeFlatList<StockBalance>>(null)
  const completed = model.phase === "complete"
  const chooser = useModal()
  const after = model.selected
    ? stockAfter(
        model.selected.onHandQuantity,
        model.draft.quantity,
        model.draft.mode,
        model.draft.direction,
      )
    : null
  const firstBalanceId = model.rows[0]?.balanceSourceId
  useEffect(() => {
    if (
      market ||
      completed ||
      model.locked ||
      model.selected ||
      model.query ||
      !firstBalanceId
    )
      return
    model.edit({ balanceId: firstBalanceId })
  }, [
    market,
    completed,
    model.locked,
    model.selected,
    model.query,
    firstBalanceId,
    model.edit,
  ])
  useEffect(() => {
    if (model.error && !model.review)
      list.current?.scrollToOffset({ offset: 0, animated: true })
  }, [model.error, model.review])
  return (
    <VariableContextProvider
      value={{ "--stock-intake-footer": footerHeight + 24 }}
    >
      <View
        className={cn("flex-1", market ? "bg-market-canvas" : "bg-background")}
      >
        <FlatList
          ref={list}
          className="flex-1"
          contentContainerClassName="grow gap-1 px-[18px] pb-[var(--stock-intake-footer)]"
          data={completed || !market ? [] : model.rows}
          keyExtractor={(row) => row.balanceSourceId}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScroll={scrollHide.onScroll}
          scrollEventThrottle={16}
          renderScrollComponent={(scrollProps: ScrollViewProps) => (
            <KeyboardAwareScrollView
              {...scrollProps}
              bottomOffset={footerHeight + 12}
              extraKeyboardSpace={0}
              disableScrollOnKeyboardHide
            />
          )}
          ListHeaderComponent={
            <View className="gap-5 pb-4 pt-2">
              {market ? (
                <Header
                  storeName={model.storeName}
                  description="Choose an operation, select the exact balance, then review the quantity and reason."
                />
              ) : (
                <ClassicStockHero
                  after={after}
                  loading={model.loading}
                  locked={model.locked}
                  modeKey={model.draft.mode}
                  noBalances={
                    !model.loading &&
                    model.hasBalanceData &&
                    model.totalRows === 0
                  }
                  offline={model.offline}
                  onAddProduct={() =>
                    router.push(
                      "/first-product-setup-modal?kind=product" as never,
                    )
                  }
                  onChange={() => chooser.present()}
                  people={model.people}
                  selected={model.selected}
                />
              )}
              {model.offline ? (
                <StatusBanner
                  tone="warning"
                  icon="Lock"
                  title="Online connection required"
                  message={`Stock operations require a connection. ${model.balancesUpdatedAt ? `Saved balances as of ${new Date(model.balancesUpdatedAt).toLocaleString()}.` : "Reconnect to load balances."}`}
                />
              ) : null}
              {!model.canManage ? (
                <StatusBanner
                  tone="warning"
                  message="Inventory management requires an Owner, Admin or Manager."
                />
              ) : null}
              {model.scopeChanged ? (
                <StatusBanner
                  tone="warning"
                  message="Account, business or Store changed. Reopen Stock Intake in the intended workspace; no further stage is sent from this draft."
                />
              ) : null}
              {model.loadError ? (
                <StatusBanner
                  tone="destructive"
                  message={model.loadError}
                  actionLabel={model.offline ? undefined : "Try again"}
                  onActionPress={model.retryLoad}
                />
              ) : null}
              {model.error ? (
                <StatusBanner tone="destructive" message={model.error} />
              ) : null}
              {completed ? (
                <StatusBanner
                  tone="success"
                  title="Stock operation recorded"
                  message={
                    model.notice ??
                    "The server accepted this operation. No repeat submission is available."
                  }
                />
              ) : (
                <>
                  {model.hasAttempt ? (
                    <StatusBanner
                      tone="warning"
                      title="Reviewed operation retained"
                      message="Reopen review to retry the same request. Fields remain locked; closing this screen does not undo a server-side operation or Count draft."
                    />
                  ) : null}
                  <QaQuickFillButton
                    formId="mobile.inventory.stock-intake"
                    isDirty={Boolean(
                      model.draft.quantity || model.draft.reason,
                    )}
                    canUndo={model.canUndo}
                    onFill={model.fill}
                    onUndo={model.undo}
                  />
                  {!market ? (
                    <View className="gap-2">
                      <View
                        accessibilityLabel="Operation"
                        accessibilityRole="radiogroup"
                        className="flex-row gap-0.5 rounded-[13px] bg-muted p-[3px]"
                      >
                        {STOCK_MODES.map((mode) => {
                          const on = model.draft.mode === mode.key
                          return (
                            <Pressable
                              accessibilityRole="radio"
                              accessibilityState={{
                                checked: on,
                                disabled: model.locked,
                              }}
                              className={cn(
                                "min-h-[38px] flex-1 items-center justify-center rounded-[10px] px-1",
                                on && "bg-card shadow-sm",
                              )}
                              disabled={model.locked}
                              haptic="selection"
                              key={mode.key}
                              onPress={() => model.edit({ mode: mode.key })}
                            >
                              <Text
                                className={cn(
                                  "text-[13px] font-extrabold",
                                  on
                                    ? "text-foreground"
                                    : "text-muted-foreground",
                                )}
                                numberOfLines={1}
                              >
                                {mode.label}
                              </Text>
                            </Pressable>
                          )
                        })}
                      </View>
                      <Text className="text-center text-xs text-muted-foreground">
                        {
                          STOCK_MODES.find(
                            (mode) => mode.key === model.draft.mode,
                          )?.description
                        }
                      </Text>
                    </View>
                  ) : (
                    <Section title="Operation">
                      <View
                        accessibilityRole="radiogroup"
                        className="flex-row flex-wrap gap-2"
                      >
                        {STOCK_MODES.map((mode) => (
                          <Choice
                            key={mode.key}
                            label={mode.label}
                            disabled={model.locked}
                            selected={model.draft.mode === mode.key}
                            onPress={() => model.edit({ mode: mode.key })}
                          />
                        ))}
                      </View>
                      <Text
                        className={
                          market
                            ? "text-sm text-market-muted-ink"
                            : "text-sm text-muted-foreground"
                        }
                      >
                        {
                          STOCK_MODES.find(
                            (mode) => mode.key === model.draft.mode,
                          )?.description
                        }
                      </Text>
                    </Section>
                  )}
                  {market ? (
                    <Section
                      title="Select stock balance"
                      description="Choose Product, variant, unit and custody together. Units are never combined."
                    >
                      <Text
                        className={
                          market
                            ? "text-xs text-market-muted-ink"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {model.loading
                          ? "Finding balances…"
                          : model.loadError ||
                              !model.hasBalanceData ||
                              !model.canManage ||
                              model.scopeChanged ||
                              model.missingStore
                            ? "Balance report unavailable"
                            : `${model.rows.length} matching balances`}
                      </Text>
                    </Section>
                  ) : null}
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Row
              icon="Warehouse"
              title={item.productName}
              subtitle={`${item.variantName} · ${item.kind.toLowerCase().replaceAll("_", " ")} · ${stockCustodyLabel(item, model.people)}`}
              quantityLabel={`${item.onHandQuantity} ${item.inventoryUnitName} on hand · ${item.availableQuantity} available`}
              selected={model.draft.balanceId === item.balanceSourceId}
              disabled={model.locked}
              onPress={() => model.edit({ balanceId: item.balanceSourceId })}
            />
          )}
          ListEmptyComponent={
            !completed &&
            market &&
            model.canManage &&
            !model.scopeChanged &&
            !model.loadError ? (
              model.loading ? (
                <View className="px-4">
                  <ListSkeleton
                    count={5}
                    label="Loading stock balances"
                    variant="item"
                  />
                </View>
              ) : (
                <EmptyState
                  icon="Warehouse"
                  title={
                    model.missingStore
                      ? "Store unavailable"
                      : model.offline && !model.hasBalanceData
                        ? "No cached stock balances"
                        : model.query
                          ? "No matching balances"
                          : "No stock balances"
                  }
                  message={
                    model.offline && !model.hasBalanceData
                      ? "Reconnect to load balances for this Store."
                      : model.query
                        ? "Try another Product, unit or custody search."
                        : "Add a stock-tracked Product in the current Store before recording inventory."
                  }
                />
              )
            ) : null
          }
          ListFooterComponent={
            !completed && model.canManage && !model.scopeChanged ? (
              <StockIntakeFields model={model} market={market} />
            ) : null
          }
        />
        {!completed ? (
          <BottomSearchFooter
            localSearch
            searchVisible={market}
            alwaysShowSearch={market}
            hidden={market && scrollHide.hidden}
            includeSafeArea={props.presentation !== "sheet"}
            variant={market ? "market-day" : "default"}
            accessibilityLabel="Search stock balances"
            label="Find balance"
            maxLength={160}
            value={model.query}
            onChangeText={model.setQuery}
            totalCount={model.totalRows}
            onHeightChange={setFooterHeight}
            placeholder="Product, variant, unit, custody"
          >
            <ActionButton
              disabled={!model.canReview}
              isLoading={model.pending}
              loadingLabel="Recording stock"
              foregroundColor={market ? palette.onPalm : undefined}
              disabledForegroundColor={market ? palette.mutedInk : undefined}
              className={
                market
                  ? model.canReview
                    ? "bg-market-palm active:bg-market-hero-pressed"
                    : "bg-market-line active:bg-market-line"
                  : undefined
              }
              onPress={model.openReview}
              trailingIcon="ArrowRight"
            >
              {model.offline
                ? "Reconnect to manage stock"
                : model.hasAttempt
                  ? "Reopen stock review"
                  : "Review and confirm"}
            </ActionButton>
          </BottomSearchFooter>
        ) : null}
        <Modal
          ref={chooser.ref}
          title="Choose stock balance"
          snapPoints={["80%"]}
          keyboardBehavior="fillParent"
        >
          <BottomSheetScrollView
            contentContainerStyle={{ padding: 18, gap: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            <FormField
              label="Find balance"
              value={model.query}
              onChangeText={model.setQuery}
              placeholder="Product, variant, unit, custody"
            />
            {model.rows.map((item) => (
              <Row
                key={item.balanceSourceId}
                icon="Warehouse"
                title={item.productName}
                subtitle={`${item.variantName} · ${stockCustodyLabel(item, model.people)}`}
                quantityLabel={`${item.onHandQuantity} ${item.inventoryUnitName}`}
                selected={model.draft.balanceId === item.balanceSourceId}
                disabled={model.locked}
                onPress={() => {
                  model.edit({ balanceId: item.balanceSourceId })
                  chooser.dismiss()
                }}
              />
            ))}
            {!model.rows.length ? (
              <Text>No matching stock balances.</Text>
            ) : null}
          </BottomSheetScrollView>
        </Modal>
        <StockIntakeReview model={model} market={market} />
      </View>
    </VariableContextProvider>
  )
}

/**
 * Green Till Balance Hero: the chosen balance with a live "50 → 60 bag" line,
 * or the empty state when the Store has no stock-tracked balances yet.
 */
function ClassicStockHero({
  after,
  loading,
  locked,
  modeKey,
  noBalances,
  offline,
  onAddProduct,
  onChange,
  people,
  selected,
}: {
  after: string | null
  loading: boolean
  locked: boolean
  modeKey: string
  noBalances: boolean
  offline: boolean
  onAddProduct: () => void
  onChange: () => void
  people: Parameters<typeof stockCustodyLabel>[1]
  selected: StockBalance | null | undefined
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  if (noBalances)
    return (
      <HeroCard
        label="No balances yet"
        pill={{
          label: offline ? "Saved copy" : "Online",
          tone: offline ? "offline" : "synced",
        }}
        title="Nothing to record yet"
        sub="Add a product that tracks stock. Its balance will show here with what you hold and what is available."
        cta={{ icon: "Plus", label: "Add a product", onPress: onAddProduct }}
      />
    )
  if (!selected)
    return (
      <HeroCard
        label="Record stock"
        pill={{
          label: offline ? "Saved copy" : "Draft",
          tone: offline ? "offline" : "draft",
        }}
        title={loading ? "Finding balances…" : "Choose a stock balance"}
        sub="See what changes before you record it."
        cta={
          loading
            ? undefined
            : { icon: "Search", label: "Choose balance", onPress: onChange }
        }
      >
        {loading ? (
          <View className="mt-4">
            <SkeletonGroup accessibilityLabel="Loading stock balance">
              <Skeleton height={40} />
            </SkeletonGroup>
          </View>
        ) : null}
      </HeroCard>
    )
  const verb =
    STOCK_MODES.find((mode) => mode.key === modeKey)?.label ?? "Record"
  return (
    <HeroCard
      label={
        selected.variantName && selected.variantName !== selected.productName
          ? `${selected.productName} · ${selected.variantName}`
          : selected.productName
      }
      labelAction={
        <Pressable
          accessibilityLabel="Change stock balance"
          accessibilityRole="button"
          className="rounded-full active:opacity-80"
          disabled={locked}
          haptic
          onPress={onChange}
          transition
        >
          <NativeView
            style={{
              alignItems: "center",
              backgroundColor: palette.heroLine,
              borderRadius: 999,
              flexDirection: "row",
              gap: 6,
              minHeight: 36,
              paddingHorizontal: 12,
            }}
          >
            <Icon
              className="size-[14px]"
              color={palette.heroForeground}
              name="Search"
            />
            <NativeText
              style={{
                color: palette.heroForeground,
                fontSize: 12.5,
                fontWeight: "800",
              }}
            >
              Change
            </NativeText>
          </NativeView>
        </Pressable>
      }
      amountContent={
        <NativeView
          accessibilityLabel={`${selected.onHandQuantity} to ${after ?? "not set"} ${selected.inventoryUnitName}`}
          style={{
            alignItems: "baseline",
            flexDirection: "row",
            gap: 10,
            marginTop: 8,
          }}
        >
          <NativeText
            style={{
              color: palette.heroMuted,
              fontSize: 24,
              fontVariant: ["tabular-nums"],
              fontWeight: "800",
            }}
          >
            {selected.onHandQuantity}
          </NativeText>
          <NativeView style={{ alignSelf: "center" }}>
            <Icon
              className="size-[20px]"
              color={palette.gold}
              name="ArrowRight"
            />
          </NativeView>
          <NativeText
            style={{
              color: palette.heroForeground,
              fontSize: 36,
              fontVariant: ["tabular-nums"],
              fontWeight: "800",
              letterSpacing: -1.2,
            }}
          >
            {after ?? "—"}
          </NativeText>
          <NativeText
            style={{
              color: palette.heroMuted,
              fontSize: 14,
              fontWeight: "700",
            }}
          >
            {selected.inventoryUnitName}
          </NativeText>
        </NativeView>
      }
      sub={`${verb} · ${stockCustodyLabel(selected, people)}`}
      stats={[
        { label: "On hand", value: String(selected.onHandQuantity) },
        { label: "Available", value: String(selected.availableQuantity) },
        { label: "After", value: after ?? "—" },
      ]}
    />
  )
}

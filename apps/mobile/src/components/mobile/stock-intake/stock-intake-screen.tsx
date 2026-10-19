import { ActionButton } from "@/components/mobile/action-button"
import { StockRow as Row } from "@/components/mobile/appearances/classic/stock-intake"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { Icon } from "@/components/ui/icon"
import { useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { isSalesRepRole } from "@/lib/mobile-roles"
import {
  exitOutcome,
  rebaseOutcomeOnHome,
} from "@/lib/operation-success-navigation"
import { cn } from "@/lib/utils"
import { trackMobileActivity } from "@/runtime/analytics-runtime"
import { useRoute } from "@react-navigation/native"
import { useNavigation, useRouter } from "expo-router"
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
import { HeroCard } from "../green-till/hero-card"
import { StockBalanceChooser } from "./stock-balance-chooser"
import { StockIntakeFields } from "./stock-intake-fields"
import {
  STOCK_MODES,
  type StockBalance,
  type StockIntakeProps,
  stockCustodyLabel,
  stockFactsLabel,
  stockKindLabel,
  stockQuantityLine,
  stockReferenceRow,
} from "./stock-intake-model"
import { StockIntakeReview } from "./stock-intake-review"
import { StockOutcomeSheet } from "./stock-outcome-sheet"
import { stockAfter } from "./stock-preview"
import { useStockActivity } from "./use-stock-activity"
import { type StockIntakeModel, useStockIntake } from "./use-stock-intake"

export function StockIntakeChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} />
}

export function StockIntakeContent(props: StockIntakeProps) {
  const model = useStockIntake(props)
  useStockActivity(model, trackMobileActivity)
  const largeText = useLargeTextLayout()
  const router = useRouter()
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
  const catalogEntry = model.target.kind !== "generic"
  // Catalog entry never preselects one of several sources (the resolver only
  // selects a single eligible row). Generic entry keeps its first-row default,
  // but only for a fresh draft, so a vanished choice is never replaced.
  const firstBalanceId = catalogEntry
    ? undefined
    : model.rows[0]?.balanceSourceId
  useEffect(() => {
    if (
      completed ||
      model.draft.balanceId ||
      model.locked ||
      model.selected ||
      model.query ||
      !firstBalanceId
    )
      return
    model.edit({ balanceId: firstBalanceId })
  }, [
    completed,
    model.locked,
    model.selected,
    model.query,
    model.draft.balanceId,
    firstBalanceId,
    model.edit,
  ])
  const blocked =
    model.resolution === "invalid" ||
    model.resolution === "scope_changed" ||
    (catalogEntry && model.resolution === "empty")
  useEffect(() => {
    if (model.error && !model.review)
      list.current?.scrollToOffset({ offset: 0, animated: true })
  }, [model.error, model.review])
  return (
    <VariableContextProvider
      value={{ "--stock-intake-footer": footerHeight + 24 }}
    >
      <View className="flex-1 bg-background">
        <FlatList
          ref={list}
          className="flex-1"
          contentContainerClassName="grow gap-1 px-[18px] pb-[var(--stock-intake-footer)]"
          // Catalog entry lists its own sources inline so the exact balance
          // that will change stays visible; generic entry uses the chooser.
          data={
            catalogEntry && !completed && model.totalRows > 1 ? model.rows : []
          }
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
              <ClassicStockHero
                after={after}
                catalogEntry={catalogEntry}
                choiceCount={model.totalRows}
                onGoHome={() => router.replace("/dashboard")}
                onBackToItem={() =>
                  router.canGoBack()
                    ? router.back()
                    : router.replace("/dashboard")
                }
                resolution={model.resolution}
                storeName={model.allStoreName}
                loading={model.loading}
                locked={model.locked}
                modeKey={model.draft.mode}
                noBalances={!catalogEntry && model.resolution === "empty"}
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
              {model.offline ? (
                <StatusBanner
                  tone="warning"
                  icon="Lock"
                  title="Online connection required"
                  message={`Stock operations and balances require a connection. ${model.balancesUpdatedAt ? `Last loaded ${new Date(model.balancesUpdatedAt).toLocaleString()}; reconnect to see current balances.` : "Reconnect to load balances."}`}
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
              {model.resolution === "selection_missing" && !model.hasAttempt ? (
                <StatusBanner
                  tone="warning"
                  title="That balance is no longer available"
                  message="Choose another balance. Nothing was recorded."
                />
              ) : null}
              {blocked || completed ? null : (
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
                  <View className="gap-2">
                    <View
                      accessibilityLabel="Operation"
                      accessibilityRole="radiogroup"
                      className={cn(
                        "flex-row gap-0.5 rounded-[13px] bg-muted p-[3px]",
                        largeText && "flex-wrap",
                      )}
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
                              "min-h-[38px] items-center justify-center rounded-[10px] px-1",
                              // Two per row at large text so labels never truncate.
                              largeText ? "w-[49%]" : "flex-1",
                              on && "bg-card shadow-sm",
                            )}
                            disabled={model.locked}
                            haptic="selection"
                            key={mode.key}
                            onPress={() => model.edit({ mode: mode.key })}
                          >
                            <Text
                              className={cn(
                                "text-xs font-extrabold",
                                on
                                  ? "text-foreground"
                                  : "text-muted-foreground",
                              )}
                              numberOfLines={largeText ? undefined : 1}
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
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Row
              icon="Warehouse"
              title={item.productName}
              subtitle={`${item.variantName} · ${stockKindLabel(item)} · ${stockCustodyLabel(item, model.people)}`}
              quantityLabel={stockFactsLabel(item)}
              selected={
                model.selected?.balanceSourceId === item.balanceSourceId
              }
              disabled={model.locked}
              onPress={() => model.edit({ balanceId: item.balanceSourceId })}
            />
          )}
          ListFooterComponent={
            !completed && !blocked && model.canManage && !model.scopeChanged ? (
              <StockIntakeFields model={model} />
            ) : null
          }
        />
        {!completed && !blocked && !model.outcome ? (
          <BottomSearchFooter
            localSearch
            searchVisible={
              model.draft.mode === "custody" &&
              model.draft.targetCustodyType === "staff"
            }
            alwaysShowSearch
            editable={!model.locked}
            includeSafeArea={props.presentation !== "sheet"}
            accessibilityLabel="Find team member"
            label="Find team member"
            maxLength={160}
            value={model.personQuery}
            onChangeText={model.setPersonQuery}
            totalCount={model.totalRows}
            onHeightChange={setFooterHeight}
            placeholder="Find team member"
          >
            <ActionButton
              disabled={!model.canReview}
              isLoading={model.pending}
              loadingLabel="Recording stock"
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
        <StockBalanceChooser modal={chooser} model={model} />
        <StockIntakeReview model={model} />
        <StockOutcome model={model} />
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
  catalogEntry,
  choiceCount,
  onBackToItem,
  onGoHome,
  resolution,
  storeName,
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
  catalogEntry: boolean
  choiceCount: number
  onBackToItem: () => void
  onGoHome: () => void
  resolution: StockIntakeModel["resolution"]
  storeName: string | undefined
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
  if (resolution === "invalid")
    return (
      <HeroCard
        label="Record stock"
        pill={{ label: "Not opened", tone: "draft" }}
        title="This stock link is incomplete"
        sub="It doesn't identify an item this screen can open. Nothing was changed."
        cta={{ icon: "House", label: "Go home", onPress: onGoHome }}
      />
    )
  if (resolution === "scope_changed")
    return (
      <HeroCard
        label="Record stock"
        pill={{ label: "Other Store", tone: "draft" }}
        title="Opened for another Store"
        sub="Switch to that Store, then open Stock in from the item again. Nothing was changed."
        cta={{
          icon: "ArrowLeft",
          label: "Back to item",
          onPress: onBackToItem,
        }}
      />
    )
  if (catalogEntry && resolution === "empty")
    return (
      <HeroCard
        label="Record stock"
        pill={{ label: "Online", tone: "synced" }}
        title="No stock balance for this item"
        sub={`Nothing for this item is tracked in ${storeName ?? "this Store"}. Other products' stock isn't offered here.`}
        cta={{
          icon: "ArrowLeft",
          label: "Back to item",
          onPress: onBackToItem,
        }}
      />
    )
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
        sub={
          catalogEntry && !loading && choiceCount > 1
            ? `This item has ${choiceCount} balances here. Pick the one that changes.`
            : "See what changes before you record it."
        }
        cta={
          // Generic entry can open the chooser while balances first load (it
          // shows skeletons); catalog entry lists its own sources inline.
          catalogEntry && (loading || choiceCount > 1)
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
      top={
        <NativeView
          style={{ alignItems: "flex-start", flexDirection: "row", gap: 12 }}
        >
          <NativeText
            accessibilityRole="header"
            style={{
              color: palette.heroForeground,
              flex: 1,
              fontSize: 24,
              fontWeight: "800",
              lineHeight: 30,
            }}
          >
            {selected.variantName &&
            selected.variantName !== selected.productName
              ? `${selected.productName} · ${selected.variantName}`
              : selected.productName}
          </NativeText>
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
                  fontSize: 16,
                  fontWeight: "800",
                }}
              >
                Change
              </NativeText>
            </NativeView>
          </Pressable>
        </NativeView>
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
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            {selected.inventoryUnitName}
          </NativeText>
        </NativeView>
      }
      sub={`${verb} · ${stockKindLabel(selected)} · ${stockCustodyLabel(selected, people)}`}
      stats={[
        { label: "On hand", value: String(selected.onHandQuantity) },
        { label: "Reserved", value: String(selected.reservedQuantity) },
        { label: "Available", value: String(selected.availableQuantity) },
      ]}
    />
  )
}

/**
 * Terminal stock outcomes. Showing one rebases history to Home + this route
 * (same route key, so the draft and attempt survive): system back, swipe and
 * close then reach Home, never the submitted form. Only Edit reopens a draft.
 */
function StockOutcome({ model }: { model: StockIntakeModel }) {
  const navigation = useNavigation()
  const route = useRoute()
  const rebased = useRef(false)
  const outcome = model.outcome
  const { profile } = useAuthContext()
  const salesRep = isSalesRepRole(profile?.role)
  useEffect(() => {
    if (!outcome || rebased.current) return
    rebased.current = true
    rebaseOutcomeOnHome(
      navigation,
      { key: route.key, name: route.name, params: route.params },
      { salesRep },
    )
  }, [outcome, navigation, route.key, route.name, route.params, salesRep])
  if (!outcome) return null
  const { review } = outcome
  const unit = review.balance.inventoryUnitName
  const movement = stockQuantityLine(review.draft, review.quantity, unit)
  const item = `${review.balance.productName} · ${review.balance.storeName}`
  const goHome = () => exitOutcome(navigation, { to: "home" }, { salesRep })
  const catalogItemId =
    model.target.kind === "catalog" ? model.target.target.catalogItemId : null
  const backToProduct = () => {
    if (catalogItemId)
      exitOutcome(
        navigation,
        { to: "catalog-item", catalogItemId },
        { salesRep },
      )
  }
  const home = { icon: "House" as const, label: "Go home", onPress: goHome }
  // Every terminal outcome can return to its originating Product (exact
  // target, Home underneath). Leaving an unknown outcome never retries it.
  const productExit = catalogItemId
    ? {
        icon: "Package" as const,
        label: `Back to ${review.balance.productName}`,
        onPress: backToProduct,
      }
    : null
  if (outcome.kind === "recorded") {
    const balance = model.recordedBalance
    const time = outcome.effectiveAt?.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
    return (
      <StockOutcomeSheet
        tone="recorded"
        kicker={time ? `Recorded at ${time}` : "Recorded"}
        title="Stock recorded"
        amount={balance ? balance.onHandQuantity : movement}
        amountUnit={balance ? `${unit} on hand` : undefined}
        rows={[
          ["Change", movement],
          ["Item", item],
          [
            "Available now",
            balance
              ? `${balance.availableQuantity} ${unit}`
              : model.refreshFailed
                ? "—"
                : "Updating…",
          ],
          stockReferenceRow(outcome.operationId),
        ]}
        warning={
          model.refreshFailed
            ? "Recorded. The balance couldn't refresh, so it isn't shown here. Reload stock when you're back on a good connection."
            : null
        }
        primary={
          catalogItemId
            ? {
                icon: "Package",
                label: `Back to ${review.balance.productName}`,
                onPress: backToProduct,
              }
            : home
        }
        secondary={catalogItemId ? home : undefined}
      />
    )
  }
  if (outcome.kind === "not_recorded")
    return (
      <StockOutcomeSheet
        tone="not_recorded"
        kicker="Nothing changed"
        title="Not recorded"
        amount={movement}
        rows={[
          ["Reason", outcome.message],
          ["Item", item],
          ["Your draft", "Kept"],
        ]}
        primary={
          outcome.canEdit
            ? {
                icon: "Pencil",
                label: "Edit draft",
                onPress: model.editAfterFailure,
              }
            : {
                icon: "RefreshCw",
                label: "Try again",
                loading: model.pending,
                loadingLabel: "Finalizing count",
                onPress: () => void model.confirm(),
              }
        }
        secondary={productExit ?? home}
        onHome={productExit ? goHome : undefined}
      />
    )
  return (
    <StockOutcomeSheet
      tone="unknown"
      kicker="Connection lost before we heard back"
      title="Outcome not confirmed"
      amount={movement}
      rows={[
        ["What we know", "The request was sent; the reply didn't arrive"],
        [
          "Safe to retry",
          "Check status reuses this exact request, so it can't be recorded twice",
        ],
      ]}
      primary={{
        icon: "RefreshCw",
        label: "Check status",
        loading: model.pending,
        loadingLabel: "Checking",
        onPress: () => void model.confirm(),
      }}
      secondary={
        productExit
          ? { ...productExit, disabled: model.pending }
          : { ...home, disabled: model.pending }
      }
      onHome={productExit && !model.pending ? goHome : undefined}
    />
  )
}

import { ActionButton } from "@/components/mobile/action-button"
import * as Classic from "@/components/mobile/appearances/classic/stock-intake"
import * as Market from "@/components/mobile/appearances/market-day/stock-intake"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { Modal, useModal } from "@/components/ui/modal"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { useEffect, useRef, useState } from "react"
import type { FlatList as NativeFlatList, ScrollViewProps } from "react-native"
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
                <HeroCard
                  label={model.selected?.productName ?? "Record stock"}
                  title={
                    model.selected
                      ? `${model.selected.onHandQuantity} → ${after ?? "—"} ${model.selected.inventoryUnitName}`
                      : "Choose a stock balance"
                  }
                  sub={
                    model.selected
                      ? `${model.selected.variantName} · ${stockCustodyLabel(model.selected, model.people)}`
                      : "See what changes before you record it."
                  }
                  pill={{
                    label: model.offline ? "Saved copy" : "Draft",
                    tone: model.offline ? "offline" : "draft",
                  }}
                >
                  {model.loading ? (
                    <Skeleton className="mt-4 h-10 w-full" />
                  ) : null}
                  <View className="mt-4">
                    <ActionButton
                      tone="cream"
                      disabled={model.locked || model.loading}
                      onPress={() => chooser.present()}
                    >
                      {model.selected ? "Change balance" : "Choose balance"}
                    </ActionButton>
                  </View>
                </HeroCard>
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
                        {model.loading ||
                        model.loadError ||
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
            (market || !model.selected) &&
            model.canManage &&
            !model.scopeChanged &&
            !model.loadError ? (
              <EmptyState
                icon="Warehouse"
                title={
                  model.loading
                    ? "Loading stock"
                    : model.missingStore
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

import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import {
  ClassicCloseoutHeader,
  ClassicCloseoutRow,
} from "@/components/mobile/appearances/classic/closeout-screen"
import {
  MarketDayCloseoutHeader,
  MarketDayCloseoutRow,
} from "@/components/mobile/appearances/market-day/closeout-screen"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { VariableContextProvider } from "nativewind"
import { useState } from "react"
import type { ScrollViewProps } from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { CloseoutReviewSheet } from "./closeout-review-sheet"
import type { CloseoutContentProps } from "./closeout-model"
import { useCloseout } from "./use-closeout"

export function CloseoutWorkflowChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="closeout" />
}
export function CloseoutContent(props: CloseoutContentProps) {
  const model = useCloseout(props)
  const appearance = useMobileDesign("closeout")
  const market = appearance === "market-day"
  const palette = useMarketDayPalette()
  const [footerHeight, setFooterHeight] = useState(88)
  const Header = market ? MarketDayCloseoutHeader : ClassicCloseoutHeader
  const Row = market ? MarketDayCloseoutRow : ClassicCloseoutRow
  const completed = model.phase === "complete"
  return (
    <VariableContextProvider value={{ "--closeout-footer": footerHeight + 24 }}>
      <View
        className={cn("flex-1", market ? "bg-market-canvas" : "bg-background")}
      >
        <FlatList
          className="flex-1"
          contentContainerClassName="grow px-4 pb-[var(--closeout-footer)]"
          data={completed ? [] : model.lines}
          keyExtractor={(line) => line.balance.balanceSourceId}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          renderScrollComponent={(scrollProps: ScrollViewProps) => (
            <KeyboardAwareScrollView
              {...scrollProps}
              bottomOffset={footerHeight + 12}
              extraKeyboardSpace={0}
              disableScrollOnKeyboardHide
            />
          )}
          ListHeaderComponent={
            <View className="gap-4 pb-4">
              <Header
                attendantName={model.attendantName}
                storeName={model.storeName}
                count={
                  model.loading ||
                  model.loadError ||
                  !model.canManage ||
                  model.missingStore ||
                  !model.hasBalanceData
                    ? null
                    : model.lines.length
                }
                changedCount={
                  model.loading ||
                  model.loadError ||
                  !model.canManage ||
                  !model.hasBalanceData ||
                  model.lines.some((line) => line.error)
                    ? null
                    : model.changedCount
                }
              />
              {model.offline ? (
                <StatusBanner
                  icon="Lock"
                  title="Online connection required"
                  tone="warning"
                  message="Closeout is online-only. Reconnect before confirming inventory declarations."
                />
              ) : null}
              {!model.canManage ? (
                <StatusBanner
                  title="Inventory management permission required"
                  tone="warning"
                  message="Your current role cannot review or finalize a closeout. Ask an Owner, Admin or Manager."
                />
              ) : null}
              {model.loadError ? (
                <StatusBanner
                  title="Could not load current balances"
                  message={model.loadError}
                  tone="destructive"
                  actionLabel={model.offline ? undefined : "Try again"}
                  onActionPress={model.offline ? undefined : model.retryLoad}
                />
              ) : null}
              {model.error ? (
                <StatusBanner
                  title="Check closeout"
                  message={model.error}
                  tone="destructive"
                />
              ) : null}
              {model.hasAttempt && !completed ? (
                <StatusBanner
                  tone="warning"
                  title="Reviewed declaration retained"
                  message="Reopen the review to retry the same closeout. Declarations cannot be edited after confirmation starts."
                />
              ) : null}
              {model.canManage && !completed ? (
                <QaQuickFillButton
                  formId="mobile.closeout"
                  isDirty={model.hasDraft}
                  canUndo={model.canUndo}
                  onFill={model.fill}
                  onUndo={model.undo}
                />
              ) : null}
            </View>
          }
          ListEmptyComponent={
            completed ? (
              <StatusBanner
                tone="success"
                title="Closeout recorded"
                message={
                  model.notice ?? "The reviewed declarations were finalized."
                }
              />
            ) : model.canManage && !model.loadError ? (
              <EmptyState
                icon="Warehouse"
                title={
                  model.loading
                    ? "Loading custody balances"
                    : model.missingStore
                      ? "Store unavailable"
                      : model.offline
                        ? "No cached custody balances"
                        : "No assigned balances"
                }
                message={
                  model.loading
                    ? "Fetching the current Store report."
                    : "Only stock held by this staff member in the current Store belongs here. Store stock is not a staff closeout balance."
                }
              />
            ) : null
          }
          renderItem={({ item, index }) => (
            <Row
              line={item}
              index={index}
              disabled={model.locked}
              onChange={(value) =>
                model.editValue(item.balance.balanceSourceId, value)
              }
            />
          )}
          ListFooterComponent={
            !completed && model.lines.length > 0 ? (
              <View className="gap-3 pt-5">
                <FormField
                  label="Reason · Optional"
                  multiline
                  maxLength={500}
                  editable={!model.locked}
                  inputClassName={
                    market ? "bg-market-field text-market-ink" : undefined
                  }
                  onChangeText={model.editReason}
                  value={model.reason}
                />
                <Text
                  className={cn(
                    "text-xs [-rn-line-height:18]",
                    market ? "text-market-muted-ink" : "text-muted-foreground",
                  )}
                >
                  Expected quantities are prefilled. Check each declaration.
                  Different units are kept separate.
                </Text>
              </View>
            ) : null
          }
        />
        {!completed ? (
          <BottomSearchFooter
            variant={market ? "market-day" : "default"}
            accessibilityLabel="Closeout actions"
            onHeightChange={setFooterHeight}
            onChangeText={() => undefined}
            placeholder=""
            searchVisible={false}
            totalCount={0}
            value=""
          >
            <ActionButton
              disabled={!model.canReview}
              isLoading={model.pending}
              loadingLabel="Confirming closeout"
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
                ? "Reconnect to close out"
                : model.hasAttempt
                  ? "Reopen closeout review"
                  : "Review declarations"}
            </ActionButton>
          </BottomSearchFooter>
        ) : null}
        <CloseoutReviewSheet model={model} appearance={appearance} />
      </View>
    </VariableContextProvider>
  )
}

import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { FormField } from "@/components/mobile/form-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import * as Classic from "@/components/mobile/appearances/classic/unit-conversion"
import * as Market from "@/components/mobile/appearances/market-day/unit-conversion"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { VariableContextProvider } from "nativewind"
import { useEffect, useRef, useState } from "react"
import { Keyboard, type ScrollView } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { ConversionBalanceChoices } from "./conversion-balance-choices"
import type { ConversionProps } from "./unit-conversion-model"
import { UnitConversionReview } from "./unit-conversion-review"
import { useUnitConversion } from "./use-unit-conversion"

export function UnitConversionChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="unit-conversion" />
}

export function UnitConversionContent(props: ConversionProps) {
  const model = useUnitConversion(props)
  const market = useMobileDesign("unit-conversion") === "market-day"
  const {
    ConversionHeader: Header,
    ConversionSection: Section,
    ConversionSummary: Summary,
  } = market ? Market : Classic
  const palette = useMarketDayPalette()
  const [footerHeight, setFooterHeight] = useState(88)
  const scroll = useRef<ScrollView>(null)
  const sourceTop = useRef(0)
  const targetTop = useRef(0)
  const revealSection = (y: number) => {
    Keyboard.dismiss()
    scroll.current?.scrollTo({ y, animated: true })
  }
  const completed = model.phase === "complete"
  const muted = market ? "text-market-muted-ink" : "text-muted-foreground"
  useEffect(() => {
    if (model.error && !model.review)
      scroll.current?.scrollTo({ y: 0, animated: true })
  }, [model.error, model.review])
  return (
    <VariableContextProvider
      value={{ "--conversion-footer": footerHeight + 24 }}
    >
      <View
        className={cn("flex-1", market ? "bg-market-canvas" : "bg-background")}
      >
        <KeyboardAwareScrollView
          ref={scroll}
          className="flex-1"
          bottomOffset={footerHeight + 12}
          extraKeyboardSpace={0}
          disableScrollOnKeyboardHide
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-6 px-4 pt-3 pb-[var(--conversion-footer)]">
            <Header storeName={model.storeName} />
            {model.offline ? (
              <StatusBanner
                tone="warning"
                title="Online action"
                message="Connect before transforming packaged stock. Cached balances are for reference only."
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
                message="Account, business or Store changed. Reopen conversion in the intended workspace; no new request is sent from this draft."
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
                title="Transformation recorded"
                message={
                  model.notice ??
                  "Both reviewed movements were accepted. No repeat submission is available."
                }
              />
            ) : model.canManage && !model.scopeChanged ? (
              <>
                {model.hasAttempt ? (
                  <StatusBanner
                    tone="warning"
                    title="Reviewed transformation retained"
                    message="Reopen the review to retry the same request. Quantities cannot be edited after confirmation starts."
                  />
                ) : null}
                <QaQuickFillButton
                  formId="mobile.inventory.unit-conversion"
                  isDirty={Boolean(
                    model.draft.sourceId ||
                      model.draft.targetId ||
                      model.draft.sourceQuantity ||
                      model.draft.targetQuantity ||
                      model.draft.reason,
                  )}
                  canUndo={model.canUndo}
                  onFill={model.fill}
                  onUndo={model.undo}
                />
                <Section
                  title="Source balance"
                  onLayout={(event) => {
                    sourceTop.current = event.nativeEvent.layout.y
                  }}
                  description="Choose the packaged balance to reduce. Shared-pool balances are not transformation endpoints."
                >
                  {model.loading ? (
                    <Text className={muted}>
                      Loading current-Store balances…
                    </Text>
                  ) : model.missingStore ? (
                    <Text className={muted}>Current Store unavailable.</Text>
                  ) : !model.hasBalanceData ? (
                    <Text className={muted}>
                      No cached balance report. Reconnect to load stock.
                    </Text>
                  ) : (
                    <ConversionBalanceChoices
                      rows={model.rows}
                      selectedId={model.draft.sourceId}
                      disabled={model.locked}
                      market={market}
                      label="Source balances"
                      onSelect={model.selectSource}
                      onPageChange={() => revealSection(sourceTop.current)}
                      emptyMessage="No packaged balances in this Store. Configure packaged inventory before converting units."
                    />
                  )}
                  <FormField
                    label={
                      model.source
                        ? `Source quantity · ${model.source.inventoryUnitName}`
                        : "Source quantity"
                    }
                    keyboardType="decimal-pad"
                    maxLength={40}
                    editable={!model.locked && Boolean(model.source)}
                    value={model.draft.sourceQuantity}
                    onChangeText={(sourceQuantity) =>
                      model.edit({ sourceQuantity })
                    }
                  />
                </Section>
                <Section
                  title="Target packaged balance"
                  onLayout={(event) => {
                    targetTop.current = event.nativeEvent.layout.y
                  }}
                  description="Only matching Product, variant, Store and configuration are shown."
                >
                  <ConversionBalanceChoices
                    key={model.source?.balanceSourceId ?? "no-source"}
                    rows={model.targetRows}
                    selectedId={model.draft.targetId}
                    disabled={model.locked}
                    market={market}
                    label="Target balances"
                    onSelect={model.selectTarget}
                    onPageChange={() => revealSection(targetTop.current)}
                    emptyMessage={
                      model.source
                        ? "No compatible target balance. Configure another packaged balance for this Product and variant."
                        : "Choose a source balance first."
                    }
                  />
                  <FormField
                    label={
                      model.target
                        ? `Target quantity · ${model.target.inventoryUnitName}`
                        : "Target quantity"
                    }
                    keyboardType="decimal-pad"
                    maxLength={40}
                    editable={!model.locked && Boolean(model.target)}
                    value={model.draft.targetQuantity}
                    onChangeText={(targetQuantity) =>
                      model.edit({ targetQuantity })
                    }
                  />
                </Section>
                {model.source && model.target && model.projection.value ? (
                  <Summary
                    source={model.source}
                    target={model.target}
                    projection={model.projection.value}
                  />
                ) : model.source &&
                  model.target &&
                  model.draft.sourceQuantity &&
                  model.draft.targetQuantity &&
                  model.projection.error ? (
                  <StatusBanner
                    tone="warning"
                    title="Check exact quantities"
                    message={model.projection.error}
                  />
                ) : null}
                <FormField
                  label="Reason"
                  multiline
                  maxLength={500}
                  editable={!model.locked}
                  value={model.draft.reason}
                  onChangeText={(reason) => model.edit({ reason })}
                />
                <Text className={`text-xs ${muted}`}>
                  Each quantity must fit its unit's precision, up to six decimal
                  places. No rounding is applied. Record loss as a separate
                  Adjustment.
                </Text>
              </>
            ) : null}
          </View>
        </KeyboardAwareScrollView>
        {!completed ? (
          <BottomSearchFooter
            accessibilityLabel="Unit conversion actions"
            searchVisible={false}
            includeSafeArea={props.presentation !== "sheet"}
            totalCount={0}
            value=""
            onChangeText={() => undefined}
            placeholder=""
            variant={market ? "market-day" : "default"}
            onHeightChange={setFooterHeight}
          >
            <ActionButton
              disabled={!model.canReview}
              isLoading={model.pending}
              loadingLabel="Transforming stock"
              onPress={model.openReview}
              trailingIcon="ArrowRight"
              foregroundColor={market ? palette.onPalm : undefined}
              disabledForegroundColor={market ? palette.mutedInk : undefined}
              className={
                market
                  ? model.canReview
                    ? "bg-market-palm active:bg-market-hero-pressed"
                    : "bg-market-line active:bg-market-line"
                  : undefined
              }
            >
              {model.offline
                ? "Reconnect to convert units"
                : model.hasAttempt
                  ? "Reopen transformation review"
                  : "Review and transform"}
            </ActionButton>
          </BottomSearchFooter>
        ) : null}
        <UnitConversionReview model={model} market={market} />
      </View>
    </VariableContextProvider>
  )
}

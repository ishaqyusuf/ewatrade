import { ActionButton } from "@/components/mobile/action-button"
import * as Classic from "@/components/mobile/appearances/classic/unit-conversion"
import * as Market from "@/components/mobile/appearances/market-day/unit-conversion"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { FormField } from "@/components/mobile/form-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { useEffect, useRef, useState } from "react"
import {
  Keyboard,
  Text as NativeText,
  View as NativeView,
  type ScrollView,
} from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { HeroCard } from "../green-till/hero-card"
import { RowDivider, SectionHeader, StatusPill } from "../green-till/kit"
import { ExactQuantityStepper } from "../stock-intake/exact-quantity-stepper"
import { suggestedTargetQuantity } from "../stock-intake/stock-preview"
import { ConversionBalanceChoices } from "./conversion-balance-choices"
import {
  type ConversionBalance,
  type ConversionProps,
  conversionCustody,
} from "./unit-conversion-model"
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
            {!market ? (
              <ClassicConversionHero model={model} />
            ) : (
              <Header storeName={model.storeName} />
            )}
            {model.offline ? (
              <StatusBanner
                tone="warning"
                title="Online action"
                message={`Connect before converting stock. ${model.balancesUpdatedAt ? `Saved balances as of ${new Date(model.balancesUpdatedAt).toLocaleString()}.` : "Reconnect to load balances."}`}
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
                {market ? (
                  <>
                    <Section
                      title="Source balance"
                      onLayout={(event) => {
                        sourceTop.current = event.nativeEvent.layout.y
                      }}
                      description="Choose the packaged stock to convert."
                    >
                      {model.loading ? (
                        <Skeleton className="h-16 w-full" />
                      ) : model.missingStore ? (
                        <Text className={muted}>
                          Current Store unavailable.
                        </Text>
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
                      {!market ? (
                        <ExactQuantityStepper
                          label={`Source quantity · ${model.source?.inventoryUnitName ?? "units"}`}
                          value={model.draft.sourceQuantity}
                          disabled={model.locked || !model.source}
                          onChange={(sourceQuantity) =>
                            model.edit({ sourceQuantity })
                          }
                        />
                      ) : (
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
                      )}{" "}
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
                  </>
                ) : (
                  <ClassicConversionBody model={model} />
                )}
                {market || model.rows.length ? (
                  <>
                    {!market ? (
                      <Text className="-mb-3 text-xs text-muted-foreground">
                        No rounding. Record any loss separately as an
                        Adjustment.
                      </Text>
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
                      Each quantity must fit its unit's precision, up to six
                      decimal places. No rounding is applied. Record loss as a
                      separate Adjustment.
                    </Text>
                  </>
                ) : null}
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

type ConversionModel = ReturnType<typeof useUnitConversion>

const plural = (unit: string) => (unit.endsWith("s") ? unit : `${unit}s`)

/** Green Till hero: "2 bag → 50 kg" with what each balance holds after. */
function ClassicConversionHero({ model }: { model: ConversionModel }) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const { source, target, projection, draft } = model
  if (!source)
    return (
      <HeroCard
        label="Convert units"
        pill={{
          label: model.offline ? "Saved copy" : "Draft",
          tone: model.offline ? "offline" : "draft",
        }}
        title={
          model.loading
            ? "Finding packaged stock…"
            : model.hasBalanceData && !model.rows.length
              ? "No packaged stock yet"
              : "One balance, another unit"
        }
        sub={
          model.hasBalanceData && !model.rows.length
            ? "Configure packaged units (for example bags of 25 kg) to open them here."
            : model.storeName
        }
      />
    )
  const unitSize = target
    ? suggestedTargetQuantity(
        "1",
        source.inventoryUnitFactor,
        target.inventoryUnitFactor,
        target.inventoryUnitTransactionScale,
      )
    : ""
  const conserved = Boolean(projection.value)
  return (
    <HeroCard
      label={
        source.variantName && source.variantName !== source.productName
          ? `${source.productName} · ${source.variantName}`
          : source.productName
      }
      pill={{
        label: model.offline ? "Saved copy" : conversionCustody(source),
        tone: model.offline ? "offline" : "synced",
      }}
      amountContent={
        <NativeView
          style={{
            alignItems: "baseline",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 8,
          }}
        >
          <NativeText
            style={{
              color: palette.heroForeground,
              fontSize: 32,
              fontVariant: ["tabular-nums"],
              fontWeight: "800",
              letterSpacing: -1,
            }}
          >
            {draft.sourceQuantity || "—"}
            <NativeText
              style={{
                color: palette.heroMuted,
                fontSize: 14,
                fontWeight: "700",
                letterSpacing: 0,
              }}
            >
              {` ${source.inventoryUnitName}`}
            </NativeText>
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
              fontSize: 32,
              fontVariant: ["tabular-nums"],
              fontWeight: "800",
              letterSpacing: -1,
            }}
          >
            {draft.targetQuantity || "—"}
            <NativeText
              style={{
                color: palette.heroMuted,
                fontSize: 14,
                fontWeight: "700",
                letterSpacing: 0,
              }}
            >
              {` ${target?.inventoryUnitName ?? "unit"}`}
            </NativeText>
          </NativeText>
        </NativeView>
      }
      sub={
        target && unitSize
          ? `1 ${source.inventoryUnitName} = ${unitSize} ${target.inventoryUnitName} · ${conserved ? "amount conserved" : "check the quantities"}`
          : "Choose the unit to convert into."
      }
      stats={[
        {
          label: `${plural(source.inventoryUnitName)} after`,
          value: projection.value?.sourceAfter ?? String(source.onHandQuantity),
        },
        {
          label: `${target ? plural(target.inventoryUnitName) : "Units"} after`,
          value:
            projection.value?.targetAfter ??
            (target ? String(target.onHandQuantity) : "—"),
        },
        { label: "Available", value: String(source.availableQuantity) },
      ]}
    />
  )
}

/** Green Till body: quantity card, then From and to with sheet pickers. */
function ClassicConversionBody({ model }: { model: ConversionModel }) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const sourcePicker = useModal()
  const targetPicker = useModal()
  const { source, target, draft } = model
  // Start from the first packaged balance and its first matching unit.
  const firstSource = model.rows[0]?.balanceSourceId
  const firstTarget = model.targetRows[0]?.balanceSourceId
  useEffect(() => {
    if (model.locked || draft.sourceId || !firstSource) return
    model.selectSource(firstSource)
  }, [model.locked, draft.sourceId, firstSource, model.selectSource])
  useEffect(() => {
    if (model.locked || !draft.sourceId || draft.targetId || !firstTarget)
      return
    model.selectTarget(firstTarget)
  }, [
    model.locked,
    draft.sourceId,
    draft.targetId,
    firstTarget,
    model.selectTarget,
  ])
  if (model.loading)
    return (
      <SkeletonGroup accessibilityLabel="Loading packaged stock">
        <Skeleton height={120} radius={20} />
      </SkeletonGroup>
    )
  if (!model.rows.length) return null
  const balanceRow = (
    balance: ConversionBalance | undefined,
    direction: "from" | "to",
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityLabel={`Change ${direction === "from" ? "source" : "target"} balance`}
      accessibilityRole="button"
      className="-mx-3.5 min-h-[62px] flex-row items-center gap-3 px-3.5 py-3 active:opacity-80"
      disabled={model.locked}
      haptic
      onPress={onPress}
    >
      {direction === "to" ? <RowDivider position="top" /> : null}
      <NativeView
        style={{
          alignItems: "center",
          backgroundColor: direction === "from" ? palette.amber : palette.mint,
          borderRadius: 19,
          height: 38,
          justifyContent: "center",
          width: 38,
        }}
      >
        <Icon
          className="size-[18px]"
          color={
            direction === "from"
              ? palette.amberForeground
              : palette.mintForeground
          }
          name={direction === "from" ? "ArrowUp" : "ArrowDown"}
        />
      </NativeView>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
          {balance
            ? `${balance.productName} · ${balance.inventoryUnitName}`
            : direction === "from"
              ? "Choose packaged stock"
              : "Choose the unit"}
        </Text>
        {balance ? (
          <Text
            className="text-xs tabular-nums text-muted-foreground"
            numberOfLines={1}
          >
            {balance.onHandQuantity} on hand · {conversionCustody(balance)}
          </Text>
        ) : null}
      </View>
      {direction === "to" && model.targetRows.length > 1 ? (
        <StatusPill label={`${model.targetRows.length} match`} tone="muted" />
      ) : (
        <Text className="text-[13px] font-extrabold text-primary">Change</Text>
      )}
    </Pressable>
  )
  return (
    <View className="gap-4">
      <View className="gap-2 rounded-[20px] bg-card p-4 shadow-sm">
        <ExactQuantityStepper
          label={`${plural(source?.inventoryUnitName ?? "unit")} to open`}
          value={draft.sourceQuantity}
          disabled={model.locked || !source}
          onChange={(sourceQuantity) => model.edit({ sourceQuantity })}
        />
        <FormField
          label={`You get · ${target?.inventoryUnitName ?? "target unit"}`}
          keyboardType="decimal-pad"
          maxLength={40}
          editable={!model.locked && Boolean(target)}
          value={draft.targetQuantity}
          onChangeText={(targetQuantity) => model.edit({ targetQuantity })}
          variant="green-gate"
        />
        <Text className="text-center text-xs text-muted-foreground">
          Filled in from the unit size. Edit only for an exact count.
        </Text>
      </View>
      {model.projection.error &&
      draft.sourceQuantity &&
      draft.targetQuantity ? (
        <StatusBanner
          tone="warning"
          title="Check exact quantities"
          message={model.projection.error}
        />
      ) : null}
      <SectionHeader title="From and to" />
      <View className="-mt-2 rounded-[20px] bg-card shadow-sm">
        <View className="overflow-hidden rounded-[20px] px-3.5">
          {balanceRow(source, "from", () => sourcePicker.present())}
          {balanceRow(target, "to", () => targetPicker.present())}
        </View>
      </View>
      <Modal
        ref={sourcePicker.ref}
        title="Packaged stock to open"
        snapPoints={["75%"]}
      >
        <BottomSheetScrollView contentContainerStyle={{ gap: 12, padding: 18 }}>
          <ConversionBalanceChoices
            rows={model.rows}
            selectedId={draft.sourceId}
            disabled={model.locked}
            market={false}
            label="Source balances"
            onSelect={(id) => {
              model.selectSource(id)
              sourcePicker.dismiss()
            }}
            onPageChange={() => {}}
            emptyMessage="No packaged balances in this Store."
          />
        </BottomSheetScrollView>
      </Modal>
      <Modal ref={targetPicker.ref} title="Convert into" snapPoints={["75%"]}>
        <BottomSheetScrollView contentContainerStyle={{ gap: 12, padding: 18 }}>
          <ConversionBalanceChoices
            key={source?.balanceSourceId ?? "no-source"}
            rows={model.targetRows}
            selectedId={draft.targetId}
            disabled={model.locked}
            market={false}
            label="Target balances"
            onSelect={(id) => {
              model.selectTarget(id)
              targetPicker.dismiss()
            }}
            onPageChange={() => {}}
            emptyMessage="No compatible unit for this product. Configure another packaged unit first."
          />
        </BottomSheetScrollView>
      </Modal>
    </View>
  )
}

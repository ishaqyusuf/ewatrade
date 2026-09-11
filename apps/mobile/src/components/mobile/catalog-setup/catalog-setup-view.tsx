import { CatalogSetupEssentials } from "./catalog-setup-essentials"
import { CatalogSetupService } from "./catalog-setup-service"
import { CatalogSetupOptions } from "./catalog-setup-options"
import { CatalogSetupUnits } from "./catalog-setup-units"
import { CatalogSetupPricing } from "./catalog-setup-pricing"
import { ActionButton } from "@/components/mobile/action-button"
import { CatalogSetupHelperPicker } from "./catalog-helper-picker"
import { KeyboardInlineComposer } from "@/components/mobile/keyboard-inline-composer"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { Keyboard, ScrollView, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import type { CatalogSetupModel } from "./use-catalog-setup"
import { SellingUnitEditor } from "./selling-unit-editor"
import * as Classic from "@/components/mobile/appearances/classic/catalog-setup"
import * as Market from "@/components/mobile/appearances/market-day/catalog-setup"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { VariableContextProvider } from "nativewind"
import { useRef, useState } from "react"
import { CatalogSetupConfirmation } from "./catalog-setup-confirmation"
import { catalogSetupClassName } from "./catalog-setup-presentation"

export function CatalogSetupView({ model }: { model: CatalogSetupModel }) {
  const largeTextLayout = useLargeTextLayout()
  const market = useMobileDesign("first-product") === "market-day"
  const palette = useMarketDayPalette()
  const [footerHeight, setFooterHeight] = useState(88)
  const [composerHeight, setComposerHeight] = useState(88)
  const scrollRef = useRef<ScrollView>(null)
  const bodyTop = useRef(0)
  const pricingTop = useRef(0)
  const { KindChoice } = market ? Market : Classic
  const {
    isOffline,
    variantComposerInputRef,
    kind,
    setKind,
    helperPickerOpen,
    setHelperPickerOpen,
    selectedHelperKey,
    multiplePriceOptions,
    unitName,
    showAdvanced,
    editingGroupId,
    variantComposerMode,
    composerText,
    unitEditorDraft,
    setUnitEditorDraft,
    unitEditorError,
    setUnitEditorError,
    submitError,
    currencyCode,
    isEditingUnit,
    businessProfileKey,
    businessProfile,
    selectedHelper,
    activeGroup,
    composerPills,
    applyHelper,
    submit,
    updateUnitEditorDraft,
    saveUnitEditorDraft,
    changeUnitEditorDirection,
    hideVariantComposer,
    submitVariantComposer,
    changeVariantComposerText,
    pressVariantComposerPill,
    removeComposerValue,
    fill,
    undoFill,
    qaDirty,
    isSaving,
    saveReadiness,
    canUndoFill,
  } = model
  const activeFooterHeight = variantComposerMode ? composerHeight : footerHeight
  if (model.scopeChanged || !model.canManage)
    return (
      <View className={catalogSetupClassName("p-5", market)}>
        <StatusBanner
          tone="warning"
          title={
            model.scopeChanged
              ? "Setup context changed"
              : "Catalog management permission required"
          }
          message={
            model.scopeChanged
              ? "Reopen setup in the intended business and Store. No new request was sent after the context changed."
              : "An Owner, Admin or Manager can create Catalog items."
          }
        />
      </View>
    )
  if (model.completion)
    return (
      <View className={catalogSetupClassName("p-5", market)}>
        <StatusBanner
          tone="success"
          title="Item saved"
          message={
            model.saveNotice ??
            `${model.completion.name} is ready in your Catalog.`
          }
        />
      </View>
    )
  if (!kind) {
    return (
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View
          className={cn("flex-1", market ? "bg-market-canvas" : "px-4 pt-2")}
        >
          {market ? (
            <Market.MarketSetupHeader kind={null} />
          ) : (
            <View className={catalogSetupClassName("gap-2 pb-6", market)}>
              <Text
                className={catalogSetupClassName(
                  "text-xl font-extrabold text-foreground",
                  market,
                )}
              >
                What are you adding?
              </Text>
              <Text
                className={catalogSetupClassName(
                  "text-sm [-rn-line-height:20] text-muted-foreground",
                  market,
                )}
              >
                Products can track stock. Services do not affect inventory.
              </Text>
            </View>
          )}
          <View
            className={
              market || largeTextLayout ? "gap-3 p-4" : "flex-row gap-3"
            }
          >
            <KindChoice
              description="An item you keep and sell."
              icon="Warehouse"
              label="Product"
              onPress={() => setKind("product")}
              recommendation={
                businessProfile?.recommendedItemKinds.includes("product")
                  ? `Recommended for ${businessProfile.title}`
                  : undefined
              }
            />
            <KindChoice
              description="Work you price and deliver."
              icon="Wrench"
              label="Service"
              onPress={() => setKind("service")}
              recommendation={
                businessProfile?.recommendedItemKinds.includes("service")
                  ? `Recommended for ${businessProfile.title}`
                  : undefined
              }
            />
          </View>
        </View>
      </ScrollView>
    )
  }

  return (
    <VariableContextProvider
      value={{ "--setup-main-bottom": activeFooterHeight + 24 }}
    >
      <View className={market ? "flex-1 bg-market-canvas" : "flex-1"}>
        <CatalogSetupHelperPicker
          disabled={model.locked}
          businessProfileKey={businessProfileKey}
          kind={kind}
          onClose={() => setHelperPickerOpen(false)}
          onSelect={applyHelper}
          selectedKey={selectedHelperKey}
          visible={helperPickerOpen}
        />
        <KeyboardAwareScrollView
          ref={scrollRef}
          bottomOffset={activeFooterHeight + 12}
          extraKeyboardSpace={0}
          className={catalogSetupClassName("flex-1", market)}
          disableScrollOnKeyboardHide
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onTouchStart={hideVariantComposer}
        >
          {market ? <Market.MarketSetupHeader kind={kind} /> : null}
          <View
            pointerEvents={model.locked ? "none" : "auto"}
            onLayout={(event) => {
              bodyTop.current = event.nativeEvent.layout.y
            }}
            className={catalogSetupClassName(
              "gap-5 px-4 pt-4 pb-[var(--setup-main-bottom)]",
              market,
            )}
          >
            {!market ? (
              <Text
                className={catalogSetupClassName(
                  "text-sm [-rn-line-height:20] text-muted-foreground",
                  market,
                )}
              >
                {kind === "product"
                  ? "Start with the essentials. Add details anytime."
                  : "Name the work. Set a price now, or quote each order later."}
              </Text>
            ) : null}
            {market ? (
              <Market.MarketQuickSetup
                title={selectedHelper?.title}
                disabled={model.locked}
                onPress={() => setHelperPickerOpen(true)}
              />
            ) : (
              <Pressable
                accessibilityHint="Apply a common setup pattern to this item."
                accessibilityLabel="Choose a quick setup"
                accessibilityRole="button"
                className={catalogSetupClassName(
                  "min-h-11 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 active:bg-accent",
                  market,
                )}
                haptic
                onPress={() => setHelperPickerOpen(true)}
                transition
              >
                <Icon
                  className={catalogSetupClassName(
                    "size-sm text-primary",
                    market,
                  )}
                  name="LayoutGrid"
                />
                <Text
                  className={catalogSetupClassName(
                    "min-w-0 flex-1 text-sm font-bold text-foreground",
                    market,
                  )}
                >
                  {selectedHelper
                    ? `Quick setup: ${selectedHelper.title}`
                    : "Quick setup"}
                </Text>
                {!selectedHelper ? (
                  <Text
                    className={catalogSetupClassName(
                      "text-xs font-bold text-primary",
                      market,
                    )}
                  >
                    Optional
                  </Text>
                ) : null}
                <Icon
                  className={catalogSetupClassName(
                    "size-sm text-muted-foreground",
                    market,
                  )}
                  name="ChevronRight"
                />
              </Pressable>
            )}
            {model.storesLoading ? (
              <StatusBanner
                title="Loading current Store"
                message="You can prepare the draft while Store information loads."
              />
            ) : null}
            {model.storesError ? (
              <StatusBanner
                tone="warning"
                title="Store could not refresh"
                message={model.storesError}
                actionLabel={isOffline ? undefined : "Try again"}
                onActionPress={model.retryStores}
              />
            ) : null}
            {!model.storesLoading && !model.storesError && !model.storeReady ? (
              <StatusBanner
                tone="warning"
                title="Current Store unavailable"
                message="Select a Store before saving this item."
              />
            ) : null}
            {model.hasAttempt ? (
              <StatusBanner
                tone="warning"
                title="Save outcome not confirmed"
                message="The submitted draft is retained. Retry the same request to recover its result; do not create a replacement item until its outcome is known."
              />
            ) : null}
            {showAdvanced && model.optionIssue ? (
              <StatusBanner tone="warning" message={model.optionIssue} />
            ) : null}

            {submitError ? (
              <StatusBanner
                icon="AlertCircle"
                message={submitError}
                tone="destructive"
              />
            ) : null}
            {isOffline && !submitError ? (
              <StatusBanner
                icon="Lock"
                message="Product and Service setup is online-only."
                title="Online connection required"
                tone="warning"
              />
            ) : null}

            <QaQuickFillButton
              canUndo={canUndoFill}
              formId="mobile.catalog.item"
              isDirty={qaDirty}
              onFill={fill}
              onUndo={undoFill}
            />

            <CatalogSetupEssentials model={model} market={market} />
            <CatalogSetupService model={model} market={market} />
            <CatalogSetupOptions model={model} market={market} />
            <CatalogSetupUnits model={model} market={market} />
            <CatalogSetupPricing
              model={model}
              market={market}
              onLayout={(event) => {
                pricingTop.current = event.nativeEvent.layout.y
              }}
              onPageChange={() =>
                scrollRef.current?.scrollTo({
                  y: bodyTop.current + pricingTop.current,
                  animated: true,
                })
              }
            />
          </View>
        </KeyboardAwareScrollView>
        {!variantComposerMode ? (
          <BottomSearchFooter
            accessibilityLabel="Catalog setup actions"
            onHeightChange={setFooterHeight}
            searchVisible={false}
            onChangeText={() => undefined}
            placeholder=""
            totalCount={0}
            value=""
            variant={market ? "market-day" : "default"}
          >
            {model.storesError && !isOffline && !isSaving ? (
              <ActionButton onPress={model.retryStores} variant="outline">
                Refresh Store information
              </ActionButton>
            ) : null}
            {!isOffline && saveReadiness.hint && !model.hasAttempt ? (
              <Text
                className={cn(
                  "text-center text-xs",
                  market ? "text-market-muted-ink" : "text-muted-foreground",
                )}
              >
                {saveReadiness.hint}
              </Text>
            ) : null}
            <ActionButton
              disabled={!model.canSave}
              isLoading={isSaving}
              loadingLabel="Saving item"
              onPress={submit}
              foregroundColor={market ? palette.onPalm : undefined}
              disabledForegroundColor={market ? palette.mutedInk : undefined}
              className={
                market
                  ? model.canSave
                    ? "bg-market-palm active:bg-market-hero-pressed"
                    : "bg-market-line active:bg-market-line"
                  : undefined
              }
              trailingIcon="ArrowRight"
            >
              {isOffline
                ? "Reconnect to save item"
                : model.hasAttempt
                  ? "Retry same item"
                  : kind === "product"
                    ? "Save product"
                    : "Save service"}
            </ActionButton>
          </BottomSearchFooter>
        ) : null}

        {unitEditorDraft ? (
          <SellingUnitEditor
            currencyCode={currencyCode}
            isEditingUnit={isEditingUnit}
            multiplePriceOptions={multiplePriceOptions}
            onChangeDirection={changeUnitEditorDirection}
            onChangeDraft={updateUnitEditorDraft}
            onSave={saveUnitEditorDraft}
            onClose={() => {
              Keyboard.dismiss()
              setUnitEditorDraft(null)
              setUnitEditorError(null)
            }}
            unitEditorDraft={unitEditorDraft}
            unitEditorError={unitEditorError}
            unitName={unitName}
          />
        ) : null}

        <CatalogSetupConfirmation model={model} market={market} />

        <KeyboardInlineComposer
          disabled={model.locked}
          appearance={market ? "market-day" : "classic"}
          onHeightChange={setComposerHeight}
          closedOffset={0}
          canSubmit={
            variantComposerMode === "variant-value"
              ? composerText.trim().length > 0 ||
                (activeGroup?.values.length ?? 0) > 0
              : undefined
          }
          dismissKeyboardOnSubmit={variantComposerMode === "variant-value"}
          helperText={
            variantComposerMode === "variant-value"
              ? "Add one or more customer choices."
              : kind === "service"
                ? "What changes the price, delivery, or experience?"
                : "What changes the price, stock, or customer choice?"
          }
          largeTextPlaceholder={
            variantComposerMode === "variant-value"
              ? `${activeGroup?.name || "Option"} values`
              : "Option name"
          }
          onChangeText={changeVariantComposerText}
          onPillPress={pressVariantComposerPill}
          onRemovePill={removeComposerValue}
          onSubmit={submitVariantComposer}
          pills={composerPills}
          placeholder={
            variantComposerMode === "variant-value"
              ? `${activeGroup?.name || "Option"} values, separated by commas`
              : editingGroupId
                ? "Update option name"
                : "Option name or choose a suggestion"
          }
          ref={variantComposerInputRef}
          submitAccessibilityLabel={
            variantComposerMode === "variant-value"
              ? "Complete option values"
              : editingGroupId
                ? "Save option name"
                : "Add option"
          }
          submitIconName={
            variantComposerMode === "variant-value" ? "Check" : "Plus"
          }
          submitLabel={
            variantComposerMode === "variant-value" ? "Done" : "Add option"
          }
          title={
            variantComposerMode === "variant-value"
              ? `${activeGroup?.name || "Option"} choices`
              : `Add a ${kind} option`
          }
          value={composerText}
          visible={!!variantComposerMode}
        />
      </View>
    </VariableContextProvider>
  )
}

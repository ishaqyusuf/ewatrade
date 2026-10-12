import { ActionButton } from "@/components/mobile/action-button"
import * as Classic from "@/components/mobile/appearances/classic/catalog-setup"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import { KeyboardInlineComposer } from "@/components/mobile/keyboard-inline-composer"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { RetainedEditorStack } from "@/components/mobile/retained-editor-stack"
import { SetupAssistantEntry } from "@/components/mobile/setup-assistant/setup-assistant-entry"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import {
  findCatalogOptionSuggestion,
  getCatalogOptionValueHint,
} from "@ewatrade/utils/business-catalog-guidance"
import { VariableContextProvider } from "nativewind"
import { useRef, useState } from "react"
import { Keyboard, ScrollView, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { ClassicCategoryEditor } from "./catalog-category-editor"
import { CatalogSetupHelperPicker } from "./catalog-helper-picker"
import { CatalogIllustrationBrowser } from "./catalog-illustration-browser"
import { catalogIllustrationCategoryKey } from "./catalog-illustration-library"
import { CatalogSetupConfirmation } from "./catalog-setup-confirmation"
import {
  CATALOG_EDITOR_TITLES,
  type CatalogEditorKey,
  CatalogFocusedEditor,
  CatalogSetupDetailRows,
} from "./catalog-setup-details"
import { CatalogSetupEssentials } from "./catalog-setup-essentials"
import { SellingUnitEditor } from "./selling-unit-editor"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogSetupView({ model }: { model: CatalogSetupModel }) {
  const largeTextLayout = useLargeTextLayout()
  const businessName = useAuthContext().profile?.businessName
  const [footerHeight, setFooterHeight] = useState(88)
  const [composerHeight, setComposerHeight] = useState(88)
  const scrollRef = useRef<ScrollView>(null)
  // Category search lives in its footer; illustrations open full screen.
  const [categoryQuery, setCategoryQuery] = useState("")
  const [categorySearchFocused, setCategorySearchFocused] = useState(false)
  const [illustrationsOpen, setIllustrationsOpen] = useState(false)
  const [editors, setEditors] = useState<Array<{ key: CatalogEditorKey }>>([])
  // Editor Done bars ride above the keyboard, so focused fields clear them.
  const [editorFooterHeights, setEditorFooterHeights] = useState<
    Partial<Record<CatalogEditorKey, number>>
  >({})
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
    formGuidance,
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
  const openEditor = (key: CatalogEditorKey) => {
    if (model.locked) return
    hideVariantComposer()
    Keyboard.dismiss()
    if (key === "pricing") model.openPricingDetails()
    if (key === "category") setCategoryQuery("")
    setEditors((current) => [...current, { key }])
  }
  const backEditor = () => {
    hideVariantComposer()
    setEditors((current) => current.slice(0, -1))
  }
  const activeFooterHeight = variantComposerMode ? composerHeight : footerHeight
  const trackEditorFooter = (key: CatalogEditorKey) => (height: number) =>
    setEditorFooterHeights((current) =>
      current[key] === height ? current : { ...current, [key]: height },
    )
  const activeEditor = editors[editors.length - 1]
  const activeEditorFooterHeight = activeEditor
    ? editorFooterHeights[activeEditor.key]
    : undefined
  const editorBottomOffset = variantComposerMode
    ? composerHeight + 12
    : activeEditorFooterHeight === undefined
      ? 24
      : activeEditorFooterHeight + 12
  const enabledChoices = model.combinations.filter(
    (combination) =>
      (model.variantDrafts[combination.key] ?? model.makeDefaultVariantDraft())
        .enabled,
  ).length
  if (model.scopeChanged || !model.canManage)
    return (
      <View className="p-5">
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
      <View className="p-5">
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
        <View className="flex-1 px-[18px] pt-2">
          <View className="pb-3.5">
            <HeroCard
              label={`New item${businessName ? ` · ${businessName}` : ""}`}
              sub="Pick one. You can add details later."
              title="What are you adding?"
            />
          </View>
          <View className="gap-3">
            <Classic.KindChoice
              description="Something you keep and sell. Tracks stock."
              icon="Package"
              label="Product"
              tint="mint"
              onPress={() => setKind("product")}
              recommendation={
                businessProfile?.recommendedItemKinds.includes("product")
                  ? `Recommended for ${businessProfile.title}`
                  : undefined
              }
            />
            <Classic.KindChoice
              description="Work you price and deliver. No stock."
              icon="Wrench"
              label="Service"
              tint="sky"
              onPress={() => setKind("service")}
              recommendation={
                businessProfile?.recommendedItemKinds.includes("service")
                  ? `Recommended for ${businessProfile.title}`
                  : undefined
              }
            />
            <SetupAssistantEntry describe />
          </View>
        </View>
      </ScrollView>
    )
  }

  const unitOverlay = unitEditorDraft ? (
    <SellingUnitEditor
      currencyCode={currencyCode}
      referenceUnits={model.additionalUnits}
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
  ) : null
  const composer = (
    <KeyboardInlineComposer
      disabled={model.locked}
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
          ? getCatalogOptionValueHint(formGuidance, activeGroup?.name ?? "")
          : formGuidance.options.helperText
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
          ? (findCatalogOptionSuggestion(formGuidance, activeGroup?.name ?? "")
              ?.valuePlaceholder ?? "Enter values, separated by commas")
          : editingGroupId
            ? "Update option name"
            : formGuidance.options.namePlaceholder
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
  )

  return (
    <VariableContextProvider
      value={{ "--setup-main-bottom": activeFooterHeight + 24 }}
    >
      <View className="flex-1">
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
          enabled={
            editors.length === 0 && !unitEditorDraft && !helperPickerOpen
          }
          bottomOffset={activeFooterHeight + 12}
          extraKeyboardSpace={0}
          className="flex-1"
          disableScrollOnKeyboardHide
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onTouchStart={hideVariantComposer}
        >
          <View
            pointerEvents={model.locked ? "none" : "auto"}
            className="gap-5 px-4 pt-4 pb-[var(--setup-main-bottom)]"
          >
            {kind ? (
              <Classic.CatalogLivePreview
                currencyCode={model.currencyCode}
                kind={kind}
                name={model.name}
                price={model.price}
                quoteRequired={model.defaultQuoteRequired}
                unitName={model.unitName}
              />
            ) : null}
            <Pressable
              accessibilityHint="Apply a common setup pattern to this item."
              accessibilityLabel="Choose a quick setup"
              accessibilityRole="button"
              className="min-h-11 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 active:bg-accent"
              haptic
              onPress={() => setHelperPickerOpen(true)}
              transition
            >
              <Icon className="size-sm text-primary" name="LayoutGrid" />
              <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
                {selectedHelper
                  ? `Quick setup: ${selectedHelper.title}`
                  : "Quick setup"}
              </Text>
              {!selectedHelper ? (
                <Text className="text-xs font-bold text-primary">Optional</Text>
              ) : null}
              <Icon
                className="size-sm text-muted-foreground"
                name="ChevronRight"
              />
            </Pressable>
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

            <CatalogSetupEssentials
              model={model}
              focused
              onOpenCategory={() => openEditor("category")}
            />
            <CatalogSetupDetailRows model={model} open={openEditor} />
          </View>
        </KeyboardAwareScrollView>
        {!variantComposerMode && editors.length === 0 ? (
          <BottomSearchFooter
            accessibilityLabel="Catalog setup actions"
            onHeightChange={setFooterHeight}
            searchVisible={false}
            onChangeText={() => undefined}
            placeholder=""
            totalCount={0}
            value=""
          >
            {model.storesError && !isOffline && !isSaving ? (
              <ActionButton onPress={model.retryStores} variant="outline">
                Refresh Store information
              </ActionButton>
            ) : null}
            {!isOffline && saveReadiness.hint && !model.hasAttempt ? (
              <Text className="text-center text-xs text-muted-foreground">
                {saveReadiness.hint}
              </Text>
            ) : null}
            <ActionButton
              disabled={!model.canSave}
              isLoading={isSaving}
              loadingLabel="Saving item"
              onPress={model.hasAttempt ? submit : () => openEditor("review")}
              trailingIcon="ArrowRight"
            >
              {isOffline
                ? "Reconnect to save item"
                : model.hasAttempt
                  ? "Retry same item"
                  : kind === "product"
                    ? "Review product"
                    : "Review service"}
            </ActionButton>
          </BottomSearchFooter>
        ) : null}

        {editors.length > 0 ? (
          <RetainedEditorStack
            editors={editors.map((entry, index) => ({
              key: `${index}-${entry.key}`,
              title:
                entry.key === "images"
                  ? "Photos"
                  : entry.key === "units"
                    ? "Sell another way"
                    : entry.key === "codes"
                      ? "SKU and barcode"
                      : entry.key === "pricing"
                        ? "Prices and availability"
                        : CATALOG_EDITOR_TITLES[entry.key],
              footer:
                entry.key === "options" && kind === "product" ? (
                  <BottomSearchFooter
                    accessibilityLabel="Customer choices actions"
                    onHeightChange={trackEditorFooter(entry.key)}
                    onChangeText={() => undefined}
                    placeholder=""
                    searchVisible={false}
                    totalCount={0}
                    value=""
                    variant="action-bar"
                  >
                    <ActionButton icon="Check" onPress={backEditor}>
                      {enabledChoices
                        ? `Done · ${enabledChoices} ${enabledChoices === 1 ? "choice" : "choices"}`
                        : "Done"}
                    </ActionButton>
                  </BottomSearchFooter>
                ) : entry.key === "category" ? (
                  // Stays put on scroll, so the search is always at hand
                  // while picking a category.
                  <BottomSearchFooter
                    accessibilityLabel="Search all categories"
                    alwaysShowSearch
                    localSearch
                    onChangeText={setCategoryQuery}
                    onFocusChange={setCategorySearchFocused}
                    onHeightChange={trackEditorFooter(entry.key)}
                    placeholder="Search all categories"
                    totalCount={0}
                    value={categoryQuery}
                  />
                ) : ["stock", "codes", "pricing", "description"].includes(
                    entry.key,
                  ) ? (
                  <BottomSearchFooter
                    accessibilityLabel={`${CATALOG_EDITOR_TITLES[entry.key]} actions`}
                    onChangeText={() => undefined}
                    onHeightChange={trackEditorFooter(entry.key)}
                    placeholder=""
                    searchVisible={false}
                    totalCount={0}
                    value=""
                    variant="action-bar"
                  >
                    <ActionButton icon="Check" onPress={backEditor}>
                      Done
                    </ActionButton>
                  </BottomSearchFooter>
                ) : entry.key === "units" || entry.key === "images" ? (
                  <BottomSearchFooter
                    searchVisible={false}
                    totalCount={0}
                    value=""
                    onChangeText={() => undefined}
                    onHeightChange={trackEditorFooter(entry.key)}
                    placeholder=""
                    accessibilityLabel={
                      entry.key === "images"
                        ? "Image actions"
                        : "Selling units actions"
                    }
                    variant="action-bar"
                  >
                    <ActionButton
                      disabled={
                        entry.key === "images" && model.imageDraft.selecting
                      }
                      onPress={backEditor}
                    >
                      Done
                    </ActionButton>
                  </BottomSearchFooter>
                ) : undefined,
              content:
                entry.key === "category" ? (
                  <ClassicCategoryEditor
                    model={model}
                    query={categoryQuery}
                    searchFocused={categorySearchFocused}
                  />
                ) : (
                  <CatalogFocusedEditor
                    editor={entry.key}
                    model={model}
                    open={openEditor}
                    onOpenIllustrations={() => {
                      Keyboard.dismiss()
                      setIllustrationsOpen(true)
                    }}
                  />
                ),
            }))}
            onBack={backEditor}
            bottomOffset={editorBottomOffset}
            obscured={!!unitEditorDraft}
            onScrollTouch={hideVariantComposer}
          >
            {unitOverlay}
            <CatalogSetupConfirmation model={model} />
            {composer}
            {illustrationsOpen ? (
              <CatalogIllustrationBrowser
                kind={kind === "service" ? "service" : "product"}
                businessProfileKey={businessProfileKey}
                categoryKey={catalogIllustrationCategoryKey(model.category)}
                itemName={model.name}
                selectedId={model.imageDraft.illustrationId}
                onClose={() => setIllustrationsOpen(false)}
                onUse={(id) => {
                  model.imageDraft.chooseIllustration(id)
                  model.setImageUrl("")
                  setIllustrationsOpen(false)
                }}
              />
            ) : null}
          </RetainedEditorStack>
        ) : (
          <>
            {unitOverlay}
            <CatalogSetupConfirmation model={model} />
          </>
        )}
      </View>
    </VariableContextProvider>
  )
}

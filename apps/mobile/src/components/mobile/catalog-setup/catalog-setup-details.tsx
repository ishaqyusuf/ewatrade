import { ActionButton } from "@/components/mobile/action-button"
import { CatalogLivePreview } from "@/components/mobile/appearances/classic/catalog-setup"
import { FormField } from "@/components/mobile/form-field"
import { RowDivider } from "@/components/mobile/green-till/kit"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { getCatalogIllustrations } from "@ewatrade/utils/catalog-illustrations"
import { Image } from "expo-image"
import { useState } from "react"
import { Text as NativeText, View } from "react-native"
import { CatalogImagesEditor } from "../catalog-item/catalog-images-editor"
import {
  CatalogPhotoGalleryPicker,
  catalogGalleryLabel,
} from "../catalog-item/catalog-photo-gallery-picker"
import { SavedPhotoPreview } from "../catalog-item/saved-photo-preview"
import { DockedPhotoCamera } from "../docked-photo-camera"
import { CatalogIllustrationPreview } from "./catalog-illustration-library"
import { catalogIllustrationCategoryKey } from "./catalog-illustration-library"
import {
  CatalogSetupOptions,
  ClassicProductChoices,
} from "./catalog-setup-options"
import { CatalogSetupPricing } from "./catalog-setup-pricing"
import { CatalogSetupService } from "./catalog-setup-service"
import { CatalogSetupUnits } from "./catalog-setup-units"
import {
  ClassicCodes,
  ClassicDescription,
  ClassicOpeningStock,
  ClassicPricing,
} from "./classic-detail-editors"
import type { CatalogSetupModel } from "./use-catalog-setup"

export type CatalogEditorKey =
  | "images"
  | "category"
  | "description"
  | "stock"
  | "options"
  | "units"
  | "pricing"
  | "codes"
  | "work"
  | "guidance"
  | "review"

export const CATALOG_EDITOR_TITLES: Record<CatalogEditorKey, string> = {
  images: "Images",
  category: "Category",
  description: "Description",
  stock: "Opening stock",
  options: "Customer choices",
  units: "Selling units",
  pricing: "Prices & availability",
  codes: "SKU & barcode",
  work: "Track service work",
  guidance: "Customer guidance",
  review: "Review item",
}

export function CatalogDetailRow({
  label,
  description,
  icon,
  emoji,
  onPress,
  disabled = false,
}: {
  label: string
  description?: string
  icon: IconKeys
  emoji?: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={description}
      disabled={disabled}
      onPress={onPress}
      className="min-h-20 flex-row items-center gap-3 border-b border-border py-4 active:bg-accent"
    >
      <View className="size-11 items-center justify-center rounded-xl bg-secondary">
        {emoji ? (
          <Text accessible={false} className="text-2xl">
            {emoji}
          </Text>
        ) : (
          <Icon name={icon} className="size-sm text-primary" />
        )}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-bold text-foreground">{label}</Text>
        {description ? (
          <Text className="text-sm text-muted-foreground">{description}</Text>
        ) : null}
      </View>
      <Icon name="ChevronRight" className="size-sm text-muted-foreground" />
    </Pressable>
  )
}

type DetailTint = "mint" | "sky" | "lilac" | "amber"

/** More details as one card of tinted rows (01 Live Card). */
function ClassicDetailRows({
  model,
  open,
}: { model: CatalogSetupModel; open: (editor: CatalogEditorKey) => void }) {
  const product = model.kind === "product"
  // With choices, stock is counted per choice; otherwise the single quantity.
  const choiceKeys = model.showAdvanced
    ? model.combinations.map((combination) => combination.key)
    : ["default"]
  const choiceDraft = (key: string) =>
    model.variantDrafts[key] ?? model.makeDefaultVariantDraft()
  const counted = model.showAdvanced
    ? choiceKeys.filter((key) => choiceDraft(key).quantity.trim())
    : []
  const stockSummary = model.showAdvanced
    ? counted.length
      ? `${counted.reduce((sum, key) => sum + (Number(choiceDraft(key).quantity) || 0), 0)} ${model.unitName || "units"} · ${counted.length} of ${choiceKeys.length} choices`
      : null
    : model.openingStock
      ? `${model.openingStock} ${model.unitName || "main units"}`
      : null
  const soldInCount = model.stores.filter((store) =>
    choiceKeys.some((key) => choiceDraft(key).storeIds.includes(store.id)),
  ).length
  const hasImage = Boolean(
    model.imageDraft.illustrationId ||
      model.imageDraft.image ||
      model.imageDraft.reused ||
      model.imageDraft.assetIds.length ||
      model.imageUrl,
  )
  const rows: Array<{
    key: CatalogEditorKey
    label: string
    value: string
    set: boolean
    icon: IconKeys
    tint: DetailTint
    emoji?: string
  }> = [
    {
      key: "images",
      label: "Photos",
      value: hasImage
        ? model.imageDraft.illustrationId
          ? "Illustration selected"
          : model.imageDraft.assetIds.length
            ? `${model.imageDraft.assetIds.length} image${model.imageDraft.assetIds.length === 1 ? "" : "s"}`
            : model.imageDraft.reused
              ? "1 photo · from My images"
              : "1 photo · uploads when you save"
        : "Add a photo or illustration",
      set: hasImage,
      icon: "Image",
      tint: "sky",
    },
    {
      key: "category",
      label: "Category",
      value: model.category
        ? model.category.split(" / ").join(" › ")
        : "Uncategorized",
      set: Boolean(model.category),
      icon: "FolderPlus",
      tint: "lilac",
    },
    ...(product
      ? [
          {
            key: "units" as const,
            label: "Sell another way",
            value: model.additionalUnits.length
              ? `${model.additionalUnits.length} more selling ${model.additionalUnits.length === 1 ? "unit" : "units"}`
              : "Packs, trays or cartons",
            set: model.additionalUnits.length > 0,
            icon: "Layers" as IconKeys,
            tint: "sky" as const,
          },
        ]
      : [
          {
            key: "work" as const,
            label: "Track work after order",
            value: model.trackServiceWork
              ? "Tracked · creates a job"
              : "Charge only",
            set: model.trackServiceWork,
            icon: "Wrench" as IconKeys,
            tint: "sky" as const,
          },
        ]),
    {
      key: "options",
      label: product ? "Customer choices" : "Packages or customer choices",
      value: model.optionGroups.length
        ? `${model.optionGroups.length} option ${model.optionGroups.length === 1 ? "group" : "groups"}`
        : product
          ? "Sizes or grades"
          : "Price each package",
      set: model.optionGroups.length > 0,
      icon: "SlidersHorizontal",
      tint: "amber",
    },
    ...(product
      ? [
          {
            key: "stock" as const,
            label: "Opening stock",
            value: stockSummary ?? "Blank means not counted yet",
            set: Boolean(stockSummary),
            icon: "Package" as IconKeys,
            tint: "mint" as const,
          },
        ]
      : [
          {
            key: "guidance" as const,
            label: "Customer guidance",
            value: model.serviceGuidance || "What to prepare before the visit",
            set: Boolean(model.serviceGuidance),
            icon: "MessageCircle" as IconKeys,
            tint: "amber" as const,
          },
        ]),
    {
      key: "description",
      label: "Description",
      value: model.description || "What customers will receive",
      set: Boolean(model.description),
      icon: "FileText",
      tint: "amber",
    },
    {
      key: "pricing",
      label: product ? "Prices and availability" : "Price each choice",
      value: product
        ? `Sold in ${soldInCount} of ${model.stores.length || 1} ${(model.stores.length || 1) === 1 ? "Store" : "Stores"}`
        : "Fixed price or quote for each choice",
      set: false,
      icon: "Settings",
      tint: "mint",
    },
    ...(product
      ? [
          {
            key: "codes" as const,
            label: "SKU and barcode",
            value: model.seededBarcode
              ? model.scannedBarcodeChoice
                ? `Scanned barcode on ${model.scannedBarcodeChoice.name}`
                : "Scanned barcode · choose a choice"
              : "For scanning at the counter",
            set: Boolean(model.scannedBarcodeChoice),
            icon: "Hash" as IconKeys,
            tint: "lilac" as const,
          },
        ]
      : []),
  ]
  return (
    <View>
      <View className="mb-2.5 flex-row items-baseline justify-between">
        <Text className="text-base font-extrabold text-foreground">
          More details
        </Text>
        <Text className="text-xs font-bold text-muted-foreground">
          Optional
        </Text>
      </View>
      {/* Shadow outside, rounded clip inside: each row's feedback spans the
          card edge to edge without spilling past the corners. */}
      <View className="rounded-[20px] bg-card shadow-sm">
        <View className="overflow-hidden rounded-[20px] px-3.5">
          {rows.map(({ key, ...row }, index) => (
            <ClassicDetailRow
              key={key}
              border={index > 0}
              disabled={model.locked}
              {...row}
              onPress={() => open(key)}
            />
          ))}
        </View>
      </View>
    </View>
  )
}

function ClassicDetailRow({
  border,
  disabled,
  icon,
  label,
  onPress,
  set,
  tint,
  value,
}: {
  border: boolean
  disabled: boolean
  icon: IconKeys
  label: string
  onPress: () => void
  set: boolean
  tint: DetailTint
  value: string
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <Pressable
      accessibilityHint={value}
      accessibilityLabel={label}
      accessibilityRole="button"
      className="-mx-3.5 min-h-[62px] flex-row items-center gap-3 px-3.5 py-3 active:opacity-80"
      disabled={disabled}
      haptic
      onPress={onPress}
    >
      {border ? <RowDivider position="top" /> : null}
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette[tint],
          borderRadius: 11,
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <Icon
          className="size-[17px]"
          color={palette[`${tint}Foreground`]}
          name={icon}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-foreground">{label}</Text>
        <Text
          numberOfLines={1}
          className={
            set
              ? "text-xs font-bold text-primary"
              : "text-xs text-muted-foreground"
          }
        >
          {value}
        </Text>
      </View>
      <Icon className="size-[18px] text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}

export function CatalogSetupDetailRows({
  model,
  open,
}: {
  model: CatalogSetupModel
  open: (editor: CatalogEditorKey) => void
}) {
  return <ClassicDetailRows model={model} open={open} />
}

function CatalogImageEditor({
  model,
}: { model: CatalogSetupModel; onOpenIllustrations: () => void }) {
  if (!model.storeId)
    return (
      <Text className="text-xs text-muted-foreground">
        Choose a Store before adding images.
      </Text>
    )
  return (
    <CatalogImagesEditor
      storeId={model.storeId}
      contextKey={model.imageContextKey}
      facts={{
        kind: model.kind === "service" ? "SERVICE" : "PRODUCT",
        name: model.name,
        description: model.description,
        category: model.category,
      }}
      assetIds={model.imageDraft.assetIds}
      generationChoices={model.combinations.flatMap((choice) =>
        model.showAdvanced && model.variantDrafts[choice.key]?.enabled !== false
          ? [{ id: choice.key, name: choice.name }]
          : [],
      )}
      onChange={(ids, illustrationId) => {
        if (illustrationId) model.imageDraft.chooseIllustration(illustrationId)
        else model.imageDraft.chooseAssetIds(ids)
        model.setImageUrl("")
      }}
      disabled={model.locked || model.isOffline || !model.storeReady}
      onBusyChange={model.imageDraft.setMediaBusy}
      illustrationId={model.imageDraft.illustrationId}
    />
  )
}

export function CatalogFocusedEditor({
  editor,
  model,
  open,
  onOpenIllustrations,
}: {
  editor: CatalogEditorKey
  model: CatalogSetupModel
  open: (editor: CatalogEditorKey) => void
  onOpenIllustrations: () => void
}) {
  switch (editor) {
    case "codes":
      return <ClassicCodes model={model} />
    case "images":
      return (
        <CatalogImageEditor
          model={model}
          onOpenIllustrations={onOpenIllustrations}
        />
      )
    case "description":
      return <ClassicDescription model={model} />
    case "guidance":
      return (
        <FormField
          label="Customer guidance (optional)"
          helper="Information shown with this service, such as what to bring or how to prepare."
          maxLength={2000}
          multiline
          value={model.serviceGuidance}
          onChangeText={model.setServiceGuidance}
        />
      )
    case "stock":
      if (model.kind === "product") return <ClassicOpeningStock model={model} />
      return model.showAdvanced ? (
        <CatalogSetupPricing
          model={model}
          onLayout={() => undefined}
          onPageChange={() => undefined}
        />
      ) : (
        <FormField
          label={`Opening stock (${model.unitName || "main unit"})`}
          helper="Optional. Blank creates no opening-stock declaration."
          keyboardType="decimal-pad"
          placeholder="0"
          value={model.openingStock}
          onChangeText={(value) => {
            model.setShowOpeningStock(Boolean(value.trim()))
            model.setOpeningStock(value)
          }}
        />
      )
    case "units":
      return <CatalogSetupUnits model={model} />
    case "options":
      if (model.kind === "product")
        return (
          <ClassicProductChoices
            model={model}
            onOpenPricing={() => open("pricing")}
          />
        )
      return (
        <>
          <CatalogSetupOptions model={model} />
          {model.kind === "service" && !model.showAdvanced ? (
            <ActionButton onPress={model.openVariantComposer}>
              Add customer choices
            </ActionButton>
          ) : null}
          {model.showAdvanced ? (
            <CatalogDetailRow
              label="Price each choice"
              description="Set independent prices and details for the combinations you offer."
              icon="Settings"
              onPress={() => open("pricing")}
            />
          ) : null}
        </>
      )
    case "pricing":
      if (model.kind === "product") return <ClassicPricing model={model} />
      return (
        <CatalogSetupPricing
          model={model}
          onLayout={() => undefined}
          onPageChange={() => undefined}
        />
      )
    case "work":
      return (
        <>
          <Text className="text-sm text-muted-foreground">
            A tracked service creates work for your team. Choose when they may
            start.
          </Text>
          {!model.trackServiceWork ? (
            <ActionButton onPress={() => model.setTrackServiceWork(true)}>
              Track work after order
            </ActionButton>
          ) : (
            <CatalogSetupService model={model} focused />
          )}
        </>
      )
    case "review":
      return (
        <>
          {model.kind ? (
            <CatalogLivePreview
              currencyCode={model.currencyCode}
              kind={model.kind}
              label="Ready to sell"
              name={model.name}
              pill={model.hasAttempt ? "Not confirmed" : "Draft"}
              price={model.price}
              quoteRequired={model.defaultQuoteRequired}
              unitName={model.unitName}
            />
          ) : null}
          <CatalogSetupDetailRows model={model} open={open} />
          <StatusBanner
            icon="Info"
            message="Saves to your current Store. You can change anything later in your catalog."
            tone="primary"
          />
          {model.submitError ? (
            <StatusBanner tone="destructive" message={model.submitError} />
          ) : null}
          {model.saveReadiness.hint ? (
            <Text className="text-sm text-muted-foreground">
              {model.saveReadiness.hint}
            </Text>
          ) : null}
          <ActionButton
            disabled={!model.canSave}
            isLoading={model.isSaving}
            onPress={model.submit}
          >
            {model.hasAttempt ? "Retry same item" : `Save ${model.kind}`}
          </ActionButton>
        </>
      )
    case "category":
      return null
  }
}

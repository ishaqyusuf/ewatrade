import { ActionButton } from "@/components/mobile/action-button"
import { CatalogLivePreview } from "@/components/mobile/appearances/classic/catalog-setup"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { catalogCategoryLabelEmoji } from "@ewatrade/utils/catalog-category-emojis"
import {
  findCatalogIllustration,
  getCatalogIllustrations,
} from "@ewatrade/utils/catalog-illustrations"
import { Image } from "expo-image"
import { useState } from "react"
import { Text as NativeText, View } from "react-native"
import {
  CatalogIllustrationLibrary,
  CatalogIllustrationPreview,
} from "./catalog-illustration-library"
import { catalogIllustrationCategoryKey } from "./catalog-illustration-library"
import { CatalogInventoryCodes } from "./catalog-inventory-codes"
import { CatalogSetupOptions } from "./catalog-setup-options"
import { CatalogSetupPricing } from "./catalog-setup-pricing"
import { CatalogSetupService } from "./catalog-setup-service"
import { CatalogSetupUnits } from "./catalog-setup-units"
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
  const hasImage = Boolean(
    model.imageDraft.illustrationId || model.imageDraft.image || model.imageUrl,
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
            value: model.openingStock
              ? `${model.openingStock} ${model.unitName || "main units"}`
              : "Blank means not counted yet",
            set: Boolean(model.openingStock),
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
      label: product ? "Prices & availability" : "Price each choice",
      value: product
        ? "Per choice and per Store"
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
            value: "For scanning at the counter",
            set: false,
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
        <Text className="text-[13px] font-bold text-muted-foreground">
          Optional
        </Text>
      </View>
      <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
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
      className={cn(
        "min-h-[62px] flex-row items-center gap-3 py-3 active:opacity-70",
        border && "border-t border-border",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
    >
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
  market = true,
}: {
  model: CatalogSetupModel
  open: (editor: CatalogEditorKey) => void
  market?: boolean
}) {
  if (!market) return <ClassicDetailRows model={model} open={open} />
  return (
    <View className="gap-1">
      <CatalogDetailRow
        label="Images"
        description={
          model.imageDraft.illustrationId ||
          model.imageDraft.image ||
          model.imageUrl
            ? "1 image selected · preview or replace"
            : "Optional · show what customers will receive"
        }
        icon="Camera"
        disabled={model.locked}
        onPress={() => open("images")}
      />
      <Text className="pt-5 text-lg font-bold text-foreground">
        More details
      </Text>
      <Text className="pb-2 text-sm text-muted-foreground">
        Choose only what this {model.kind} needs. You can return to each detail.
      </Text>
      <CatalogDetailRow
        label="Category"
        emoji={catalogCategoryLabelEmoji(model.category)}
        description={model.category || "Optional · Uncategorized"}
        icon="FolderPlus"
        disabled={model.locked}
        onPress={() => open("category")}
      />
      <CatalogDetailRow
        label="Description"
        description={
          model.description || model.formGuidance.description.helperText
        }
        icon="FileText"
        disabled={model.locked}
        onPress={() => open("description")}
      />
      <CatalogDetailRow
        label={
          model.kind === "service"
            ? "Packages or customer choices"
            : "Customer choices"
        }
        description={
          model.optionGroups.length
            ? `${model.optionGroups.length} option groups · edit choices and prices`
            : model.formGuidance.options.helperText
        }
        icon="LayoutGrid"
        disabled={model.locked}
        onPress={() => open("options")}
      />
      {model.kind === "product" ? (
        <>
          <CatalogDetailRow
            label="Sell another way"
            description={
              model.additionalUnits.length
                ? `${model.additionalUnits.length} additional selling units`
                : "Optional · sell by pack, tray or carton"
            }
            icon="Warehouse"
            disabled={model.locked}
            onPress={() => open("units")}
          />
          <CatalogDetailRow
            label="Opening stock"
            description={
              model.showAdvanced
                ? "Set quantities for each choice and stock unit"
                : model.openingStock
                  ? `${model.openingStock} ${model.unitName || "main units"}`
                  : "Optional · record what you have now"
            }
            icon="Warehouse"
            disabled={model.locked}
            onPress={() => open("stock")}
          />
        </>
      ) : (
        <>
          <CatalogDetailRow
            label="Track work after order"
            description={
              model.trackServiceWork
                ? "Create jobs · review when work can start"
                : "Optional · create a job for your team"
            }
            icon="Briefcase"
            disabled={model.locked}
            onPress={() => open("work")}
          />
          <CatalogDetailRow
            label="Customer guidance"
            description={
              model.serviceGuidance ||
              "Optional · tell customers how to prepare"
            }
            icon="MessageCircle"
            disabled={model.locked}
            onPress={() => open("guidance")}
          />
        </>
      )}
      <CatalogDetailRow
        label={
          model.kind === "product"
            ? "Prices & availability"
            : "Price each choice"
        }
        description={
          model.kind === "product"
            ? "Optional · independent prices and availability"
            : "Set a fixed price or quote policy for each choice"
        }
        icon="Settings"
        disabled={model.locked}
        onPress={() => open("pricing")}
      />
      {model.kind === "product" ? (
        <CatalogDetailRow
          label="SKU & barcode"
          description="Optional · your reference and the printed scanning code"
          icon="Hash"
          disabled={model.locked}
          onPress={() => open("codes")}
        />
      ) : null}
    </View>
  )
}

function CatalogImageEditor({
  model,
  market,
  onOpenIllustrations,
}: {
  model: CatalogSetupModel
  market: boolean
  onOpenIllustrations?: () => void
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const { image, illustrationId, selecting, error, select, remove } =
    model.imageDraft
  const uri = image?.uri ?? model.imageUrl.trim()
  const disabled =
    model.locked || model.isOffline || !model.storeReady || selecting
  const removeImage = () => {
    remove()
    model.setImageUrl("")
    setFailedUrl(null)
  }
  if (!market && onOpenIllustrations)
    return (
      <ClassicPhotosEditor
        model={model}
        disabled={disabled}
        failed={Boolean(uri && failedUrl === uri)}
        onFailed={() => setFailedUrl(uri)}
        onOpenIllustrations={onOpenIllustrations}
        onRemove={removeImage}
        uri={uri}
      />
    )
  return (
    <>
      <View className="gap-2">
        <Text className="text-2xl font-bold text-foreground">
          Let customers see it.
        </Text>
        <Text className="text-sm text-muted-foreground">
          Add a clear {model.kind} image. You can do this later.
        </Text>
      </View>
      {illustrationId ? (
        <View className="items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <CatalogIllustrationPreview id={illustrationId} size={220} />
          <Text className="font-medium text-foreground">
            {findCatalogIllustration(illustrationId)?.label}
          </Text>
          <ActionButton
            variant="outline"
            disabled={disabled}
            onPress={removeImage}
          >
            Remove illustration
          </ActionButton>
        </View>
      ) : uri ? (
        <View className="gap-3">
          <View className="overflow-hidden rounded-2xl border border-border bg-card">
            <Image
              source={{ uri }}
              style={{ width: "100%", height: 240 }}
              contentFit="contain"
              accessibilityLabel={`Selected ${model.kind} image`}
              onError={() => setFailedUrl(uri)}
            />
          </View>
          <Text className="text-sm text-muted-foreground" numberOfLines={2}>
            {image?.fileName ?? "Selected image"} ·{" "}
            {image?.source === "camera" ? "Camera" : "Your photos"}
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <ActionButton
                variant="outline"
                icon="Camera"
                disabled={disabled}
                onPress={() => void select("photos")}
              >
                Replace image
              </ActionButton>
            </View>
            <View className="flex-1">
              <ActionButton
                variant="destructive"
                icon="Trash"
                disabled={disabled}
                onPress={removeImage}
              >
                Remove
              </ActionButton>
            </View>
          </View>
          <StatusBanner
            tone="warning"
            message="This photo will upload when you save. It stays private until its image check passes."
          />
        </View>
      ) : (
        <View className="min-h-52 items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-secondary/40 px-6 py-8">
          <View className="size-16 items-center justify-center rounded-2xl bg-accent">
            <Icon name="Camera" className="size-xl text-primary" />
          </View>
          <Text className="text-lg font-bold text-foreground">
            No image yet
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            Optional. Add it when you have a clear photo.
          </Text>
        </View>
      )}
      {selecting ? (
        <StatusBanner tone="default" message="Choosing your image…" />
      ) : null}
      {error ? <StatusBanner tone="warning" message={error} /> : null}
      {uri && failedUrl === uri ? (
        <StatusBanner
          tone="warning"
          message="The preview could not load. Choose another photo."
        />
      ) : null}
      <View className="gap-1">
        <CatalogDetailRow
          label="Choose a photo"
          icon="Camera"
          disabled={disabled}
          onPress={() => void select("photos")}
        />
        <CatalogDetailRow
          label="Take a photo"
          icon="Camera"
          disabled={disabled}
          onPress={() => void select("camera")}
        />
        <CatalogDetailRow
          label="Illustration library"
          description="Simple images recommended for your business."
          icon="LayoutGrid"
          disabled={disabled}
          onPress={() => setShowLibrary((current) => !current)}
        />
      </View>
      {showLibrary ? (
        <CatalogIllustrationLibrary
          kind={model.kind === "service" ? "service" : "product"}
          businessProfileKey={model.businessProfileKey}
          categoryKey={catalogIllustrationCategoryKey(model.category)}
          selectedId={illustrationId}
          disabled={disabled}
          onSelect={(id) => {
            model.imageDraft.chooseIllustration(id)
            model.setImageUrl("")
          }}
        />
      ) : null}
      <Text className="text-sm text-muted-foreground">
        Only the {model.kind} should be in the image. Choosing an image never
        publishes your item.
      </Text>
    </>
  )
}

/** Photos (01 Live Card, owner revision 9 Oct 2026). */
function ClassicPhotosEditor({
  model,
  disabled,
  failed,
  onFailed,
  onOpenIllustrations,
  onRemove,
  uri,
}: {
  model: CatalogSetupModel
  disabled: boolean
  failed: boolean
  onFailed: () => void
  onOpenIllustrations: () => void
  onRemove: () => void
  uri: string
}) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const palette = GREEN_TILL_THEME[colorScheme]
  const { illustrationId, selecting, error, select } = model.imageDraft
  const kind = model.kind === "service" ? "service" : "product"
  const strip = getCatalogIllustrations({
    kind,
    businessProfileKey: model.businessProfileKey,
    categoryKey: catalogIllustrationCategoryKey(model.category),
  })
    .filter((entry) => entry.recommended)
    .slice(0, 4)
  const hasImage = Boolean(illustrationId || uri)
  const tile = { aspectRatio: 1, borderRadius: 16, width: "31.4%" } as const
  return (
    <View className="gap-3.5">
      <Text className="text-[13px] text-muted-foreground">
        Show what customers will receive. Choosing another image replaces this
        one.
      </Text>
      <View className="flex-row flex-wrap gap-2.5">
        {hasImage ? (
          <View
            style={[
              tile,
              {
                alignItems: "center",
                backgroundColor: illustrationId ? palette.mint : colors.muted,
                justifyContent: "center",
                overflow: "hidden",
              },
            ]}
          >
            {illustrationId ? (
              <CatalogIllustrationPreview id={illustrationId} size={78} />
            ) : (
              <Image
                source={{ uri }}
                style={{ height: "100%", width: "100%" }}
                contentFit="cover"
                accessibilityLabel={`Selected ${kind} image`}
                onError={onFailed}
              />
            )}
            <View
              style={{
                backgroundColor: palette.overlayChip,
                borderRadius: 999,
                bottom: 6,
                left: 6,
                paddingHorizontal: 7,
                paddingVertical: 2,
                position: "absolute",
              }}
            >
              <NativeText
                style={{
                  color: palette.overlayForeground,
                  fontSize: 10,
                  fontWeight: "800",
                }}
              >
                Cover
              </NativeText>
            </View>
            <Pressable
              accessibilityLabel={
                illustrationId ? "Remove illustration" : "Remove photo"
              }
              accessibilityRole="button"
              disabled={disabled}
              hitSlop={10}
              onPress={onRemove}
              style={{
                alignItems: "center",
                backgroundColor: palette.overlayChip,
                borderRadius: 999,
                height: 24,
                justifyContent: "center",
                position: "absolute",
                right: 6,
                top: 6,
                width: 24,
              }}
            >
              <Icon
                className="size-[12px]"
                color={palette.overlayForeground}
                name="X"
              />
            </Pressable>
          </View>
        ) : null}
        {(
          [
            ["camera", "Take photo", "Camera"],
            ["photos", "Choose", "Image"],
          ] as const
        ).map(([source, label, icon]) => (
          <Pressable
            key={source}
            accessibilityLabel={
              source === "camera" ? "Take a photo" : "Choose a photo"
            }
            accessibilityRole="button"
            disabled={disabled}
            haptic
            onPress={() => void select(source)}
            style={[
              tile,
              {
                alignItems: "center",
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderStyle: "dashed",
                borderWidth: 1.5,
                gap: 4,
                justifyContent: "center",
                opacity: disabled ? 0.5 : 1,
              },
            ]}
          >
            <Icon className="size-[22px]" color={colors.primary} name={icon} />
            <NativeText
              style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}
            >
              {label}
            </NativeText>
          </Pressable>
        ))}
      </View>
      {selecting ? (
        <StatusBanner tone="default" message="Choosing your image…" />
      ) : null}
      {error ? <StatusBanner tone="warning" message={error} /> : null}
      {failed ? (
        <StatusBanner
          tone="warning"
          message="The preview could not load. Choose another photo."
        />
      ) : null}
      {uri && !illustrationId ? (
        <Text className="text-xs text-muted-foreground">
          Uploads when you save. It stays private until its image check passes.
        </Text>
      ) : null}
      <View className="mt-2 flex-row items-baseline justify-between">
        <Text className="text-base font-extrabold text-foreground">
          Or use an illustration
        </Text>
        <Pressable
          accessibilityLabel="See all illustrations"
          accessibilityRole="button"
          className="min-h-11 justify-center px-1"
          disabled={disabled}
          haptic
          onPress={onOpenIllustrations}
        >
          <Text className="text-[13px] font-bold text-primary">See all</Text>
        </Pressable>
      </View>
      <View className="gap-2.5 rounded-[20px] bg-card p-3.5 shadow-sm">
        <Text className="text-[12.5px] text-muted-foreground">
          Simple images for your business. Good when you have no photo yet.
        </Text>
        <View className="flex-row gap-2">
          {strip.map(({ illustration }) => {
            const on = illustrationId === illustration.id
            return (
              <Pressable
                key={illustration.id}
                accessibilityLabel={`Choose ${illustration.label}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                disabled={disabled}
                haptic
                onPress={() => {
                  model.imageDraft.chooseIllustration(illustration.id)
                  model.setImageUrl("")
                }}
                style={{
                  alignItems: "center",
                  aspectRatio: 1,
                  backgroundColor: palette.mint,
                  borderColor: on ? colors.primary : "transparent",
                  borderRadius: 14,
                  borderWidth: 2,
                  flex: 1,
                  justifyContent: "center",
                }}
              >
                <CatalogIllustrationPreview id={illustration.id} size={48} />
              </Pressable>
            )
          })}
        </View>
      </View>
      <StatusBanner
        icon="Info"
        tone="primary"
        message={`Only the ${kind} should be in the photo. Photos are checked before customers see them, and choosing one never publishes your item.`}
      />
    </View>
  )
}

export function CatalogFocusedEditor({
  editor,
  model,
  open,
  market = false,
  onOpenIllustrations,
}: {
  editor: CatalogEditorKey
  model: CatalogSetupModel
  open: (editor: CatalogEditorKey) => void
  market?: boolean
  onOpenIllustrations?: () => void
}) {
  switch (editor) {
    case "codes":
      return <CatalogInventoryCodes model={model} />
    case "images":
      return (
        <CatalogImageEditor
          model={model}
          market={market}
          onOpenIllustrations={onOpenIllustrations}
        />
      )
    case "description":
      return (
        <FormField
          label="Description (optional)"
          maxLength={2000}
          multiline
          textAlignVertical="top"
          helper={model.formGuidance.description.helperText}
          placeholder={model.formGuidance.description.placeholder}
          value={model.description}
          onChangeText={(value) => {
            model.setShowDescription(Boolean(value.trim()))
            model.setDescription(value)
          }}
        />
      )
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
      return model.showAdvanced ? (
        <CatalogSetupPricing
          model={model}
          market={false}
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
      return <CatalogSetupUnits model={model} market={false} />
    case "options":
      return (
        <>
          <CatalogSetupOptions model={model} market={false} />
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
      return (
        <CatalogSetupPricing
          model={model}
          market={false}
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
            <CatalogSetupService model={model} market={false} focused />
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
          <CatalogSetupDetailRows model={model} open={open} market={market} />
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

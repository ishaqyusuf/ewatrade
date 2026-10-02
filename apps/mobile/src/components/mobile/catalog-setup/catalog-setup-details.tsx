import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { Image } from "expo-image"
import { useState } from "react"
import { View } from "react-native"
import {
  CatalogIllustrationLibrary,
  CatalogIllustrationPreview,
} from "./catalog-illustration-library"
import { catalogIllustrationCategoryKey } from "./catalog-illustration-library"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import { CatalogInventoryCodes } from "./catalog-inventory-codes"
import { CatalogSetupOptions } from "./catalog-setup-options"
import { CatalogSetupPricing } from "./catalog-setup-pricing"
import { CatalogSetupService } from "./catalog-setup-service"
import { CatalogSetupUnits } from "./catalog-setup-units"
import { catalogCategoryLabelEmoji } from "@ewatrade/utils/catalog-category-emojis"
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
  description: string
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
        <Text className="text-sm text-muted-foreground">{description}</Text>
      </View>
      <Icon name="ChevronRight" className="size-sm text-muted-foreground" />
    </Pressable>
  )
}

export function CatalogSetupDetailRows({
  model,
  open,
}: { model: CatalogSetupModel; open: (editor: CatalogEditorKey) => void }) {
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

function CatalogImageEditor({ model }: { model: CatalogSetupModel }) {
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
          description="Select an image from this device."
          icon="Camera"
          disabled={disabled}
          onPress={() => void select("photos")}
        />
        <CatalogDetailRow
          label="Take a photo"
          description="Use your camera."
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

export function CatalogFocusedEditor({
  editor,
  model,
  open,
}: {
  editor: CatalogEditorKey
  model: CatalogSetupModel
  open: (editor: CatalogEditorKey) => void
}) {
  switch (editor) {
    case "codes":
      return <CatalogInventoryCodes model={model} />
    case "images":
      return <CatalogImageEditor model={model} />
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
          <Text className="text-2xl font-bold text-foreground">
            {model.name || "Unnamed item"}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {model.kind === "service" && model.defaultQuoteRequired
              ? "Quote each job"
              : model.price
                ? `${model.currencyCode} ${model.price}${model.kind === "product" ? ` per ${model.unitName}` : ""}`
                : "Price not set"}
          </Text>
          <CatalogSetupDetailRows model={model} open={open} />
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

import { ActionButton } from "@/components/mobile/action-button"
import { FloatingActionRow } from "@/components/mobile/floating-action-row"
import {
  FullScreenForm,
  useFullScreenFormBack,
} from "@/components/mobile/full-screen-form"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Input } from "@/components/ui/input-2"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import {
  type CatalogAiChoice,
  catalogAiAllowanceLabel,
} from "@ewatrade/utils/catalog-ai-images"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useCallback, useRef, useState } from "react"
import { ActivityIndicator, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import Svg, {
  Circle,
  Defs,
  Mask,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg"

export const catalogImageTile = {
  borderRadius: 24,
  overflow: "hidden",
} as const

const sources = [
  { id: "generate", label: "Generate with AI", icon: "Sparkles" },
  { id: "camera", label: "Take photo", icon: "Camera" },
  { id: "photos", label: "Choose from gallery", icon: "Image" },
  { id: "my-images", label: "From My Images", icon: "LayoutGrid" },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  icon: IconKeys
}>
type Source = (typeof sources)[number]["id"]

export function CatalogImageAddTile({
  size,
  disabled,
  hasGalleryImages,
  canGenerate,
  onChoose,
}: {
  size: number
  disabled: boolean
  hasGalleryImages: boolean
  canGenerate: boolean
  onChoose(source: Source): void
}) {
  const colors = useColors()
  const sheet = useModal()
  const pendingSource = useRef<Source | null>(null)
  const sheetOpen = useRef(false)
  const dismissSheet = sheet.dismiss
  useFullScreenFormBack(
    useCallback(() => {
      if (!sheetOpen.current) return false
      dismissSheet()
      return true
    }, [dismissSheet]),
  )
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add image"
        accessibilityState={{ disabled }}
        disabled={disabled}
        haptic
        onPress={() => {
          sheetOpen.current = true
          sheet.present()
        }}
        style={{
          ...catalogImageTile,
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.card,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.border,
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <View className="size-12 items-center justify-center rounded-full bg-muted">
          <Icon name="Plus" className="size-[24px] text-foreground" />
        </View>
      </Pressable>
      <Modal
        ref={sheet.ref}
        accessibilityLabel="Add image"
        enableDynamicSizing
        hideHeader
        onDismiss={() => {
          sheetOpen.current = false
          const source = pendingSource.current
          pendingSource.current = null
          if (source) onChoose(source)
        }}
      >
        <BottomSheetScrollView showsVerticalScrollIndicator={false}>
          <View className="px-5 pb-6">
            {sources.map(({ id, label, icon }) => {
              const unavailable =
                (id === "my-images" && !hasGalleryImages) ||
                (id === "generate" && !canGenerate)
              return (
                <FloatingActionRow
                  key={id}
                  icon={icon}
                  label={label}
                  disabled={unavailable}
                  onPress={() => {
                    pendingSource.current = id
                    sheet.dismiss()
                  }}
                />
              )
            })}
          </View>
        </BottomSheetScrollView>
      </Modal>
    </>
  )
}

function ChoiceCheckbox({
  checked,
  label,
  onPress,
}: { checked: boolean; label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-2"
      haptic
      onPress={onPress}
    >
      <View
        className={cn(
          "size-6 items-center justify-center rounded-md border",
          checked ? "border-primary bg-primary" : "border-border bg-background",
        )}
      >
        {checked ? (
          <Icon name="Check" className="size-[15px] text-primary-foreground" />
        ) : null}
      </View>
      <Text className="min-w-0 flex-1 text-sm text-foreground">{label}</Text>
    </Pressable>
  )
}

export function CatalogImageGenerateForm({
  note,
  onChangeNote,
  kind,
  choices,
  capacity,
  usage,
  onClose,
  onGenerate,
}: {
  note: string
  onChangeNote(note: string): void
  kind: "product" | "service"
  choices: readonly CatalogAiChoice[]
  capacity: number
  usage?: { remaining: number; period: "lifetime" | "monthly" }
  onClose(): void
  onGenerate(choices: CatalogAiChoice[]): void
}) {
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null)
  const selected = selectedIds
    ? choices.filter((choice) => selectedIds.includes(choice.id))
    : []
  const count = selectedIds ? selected.length : 1
  const max = Math.min(capacity, usage?.remaining ?? 0)
  return (
    <FullScreenForm
      visible
      title="Generate with AI"
      onClose={onClose}
      onBack={onClose}
      backLabel="Back to Images"
      footer={
        <ActionButton
          icon="Sparkles"
          disabled={count === 0 || count > max}
          onPress={() => onGenerate(selected)}
        >
          {count > 1 ? `Generate ${count} images` : "Generate image"}
        </ActionButton>
      }
    >
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        <Text className="text-sm text-muted-foreground">
          AI uses your {kind} title and description. Add a note if you want to
          give it more direction.
        </Text>
        <Input
          accessibilityLabel="Add a note (optional)"
          placeholder="Add a note (optional)"
          unstyled
          value={note}
          onChangeText={onChangeNote}
          multiline
          maxLength={500}
          textAlignVertical="top"
          className="min-h-36 rounded-2xl border border-border bg-card p-4"
        />
        {choices.length > 1 ? (
          <View className="rounded-2xl bg-card p-1">
            <ChoiceCheckbox
              label="Generate for each customer choice"
              checked={selectedIds !== null}
              onPress={() =>
                setSelectedIds(selectedIds ? null : choices.map(({ id }) => id))
              }
            />
            {selectedIds ? (
              <View className="ml-4 border-t border-border pt-1">
                {choices.map(({ id, name }) => (
                  <ChoiceCheckbox
                    key={id}
                    label={name}
                    checked={selectedIds.includes(id)}
                    onPress={() =>
                      setSelectedIds((current) =>
                        current?.includes(id)
                          ? current.filter((entry) => entry !== id)
                          : [...(current ?? []), id],
                      )
                    }
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {count > max ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-xs text-muted-foreground"
          >
            {max === 0
              ? "No image slots or generations are available."
              : `Choose up to ${max} for this run.`}
          </Text>
        ) : null}
        {usage ? (
          <Text className="text-xs text-muted-foreground">
            {catalogAiAllowanceLabel(usage.remaining, usage.period)}
          </Text>
        ) : null}
      </KeyboardAwareScrollView>
    </FullScreenForm>
  )
}

export function CatalogImageProgressTile({
  size,
  label,
  choice,
}: { size: number; label: string; choice?: string }) {
  const colors = useColors()
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={choice ? `${choice}: ${label}` : label}
      accessibilityState={{ busy: true }}
      style={{
        ...catalogImageTile,
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.muted,
      }}
    >
      <View pointerEvents="none" className="absolute inset-0">
        <Svg width="100%" height="100%" viewBox="0 0 180 180">
          <Defs>
            <Pattern
              id="dots"
              patternUnits="userSpaceOnUse"
              width="8"
              height="8"
            >
              <Circle cx="4" cy="4" r="0.85" fill={colors.foreground} />
            </Pattern>
            <RadialGradient id="fade" cx="80%" cy="26%" rx="65%" ry="64%">
              <Stop offset="0" stopColor="white" stopOpacity={0.42} />
              <Stop offset="1" stopColor="white" stopOpacity={0} />
            </RadialGradient>
            <Mask
              id="mask"
              x="0"
              y="0"
              width="180"
              height="180"
              maskUnits="userSpaceOnUse"
            >
              <Rect width="180" height="180" fill="url(#fade)" />
            </Mask>
          </Defs>
          <Rect width="180" height="180" fill="url(#dots)" mask="url(#mask)" />
        </Svg>
      </View>
      <ActivityIndicator size="large" color={colors.foreground} />
    </View>
  )
}

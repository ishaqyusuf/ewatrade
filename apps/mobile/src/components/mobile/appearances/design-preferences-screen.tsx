import { useRef, useState } from "react"
import { useRouter } from "expo-router"
import { ActionButton } from "@/components/mobile/action-button"
import { MobileScreen } from "@/components/mobile/screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useMobileDesignPreference } from "@/hooks/use-mobile-design"
import { shouldShowInternalDesignSystemEntry } from "@/lib/app-variant"
import { MODULARIZED_SCREENS } from "@/lib/mobile-design/release"
import {
  MOBILE_DESIGN_SCREENS,
  isMobileDesignScreen,
  type MobileDesign,
} from "@/lib/mobile-design/screens"
import { mobileDesignStore } from "@/store/mobile-design-store"

const CHOICES = [
  { value: null, label: "Inherit" },
  { value: "classic", label: "Classic" },
  { value: "market-day", label: "Market Day" },
] as const

function DesignChoices({
  value,
  onChange,
  disabled,
  label,
}: {
  value: MobileDesign | null
  onChange: (value: MobileDesign | null) => void
  disabled: boolean
  label: string
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className="flex-row flex-wrap gap-2"
    >
      {CHOICES.map((choice) => (
        <Pressable
          key={choice.label}
          accessibilityRole="radio"
          accessibilityLabel={`${label}: ${choice.label}`}
          accessibilityState={{ checked: value === choice.value, disabled }}
          disabled={disabled}
          haptic
          onPress={() => onChange(choice.value)}
          className={
            value === choice.value
              ? "min-h-11 flex-row items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 disabled:opacity-50"
              : "min-h-11 flex-row items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-3 disabled:opacity-50"
          }
        >
          <Text
            className={
              value === choice.value
                ? "text-sm font-semibold text-primary-foreground"
                : "text-sm font-semibold text-foreground"
            }
          >
            {choice.label}
          </Text>
          {value === choice.value ? (
            <Icon className="size-4 text-primary-foreground" name="Check" />
          ) : null}
        </Pressable>
      ))}
    </View>
  )
}

export function DesignPreferencesScreen() {
  const router = useRouter()
  const preference = useMobileDesignPreference()
  const saving = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(operation: () => Promise<void>) {
    if (saving.current) return
    saving.current = true
    setPending(true)
    setError(null)
    try {
      await operation()
    } catch {
      setError("The design preference could not be saved. Try again.")
    } finally {
      saving.current = false
      setPending(false)
    }
  }

  if (!shouldShowInternalDesignSystemEntry()) {
    return (
      <MobileScreen>
        <StatusBanner
          title="Design preview unavailable"
          message="This build uses the released appearance."
          icon="Lock"
          tone="warning"
        />
      </MobileScreen>
    )
  }

  return (
    <MobileScreen contentClassName="gap-6" keyboardBottomOffset={24}>
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="size-11 items-center justify-center rounded-full bg-secondary"
          haptic
          onPress={() => router.back()}
        >
          <Icon className="size-5 text-foreground" name="ArrowLeft" />
        </Pressable>
        <Text className="flex-1 text-2xl font-bold text-foreground">
          Design appearance
        </Text>
      </View>
      <Text className="text-sm [-rn-line-height:24] text-muted-foreground">
        Classic is the first release. Preview Market Day here, or choose a
        design for an individual screen. Light and Dark remain separate
        settings.
      </Text>
      {error ? (
        <StatusBanner
          title="Preference not saved"
          message={error}
          icon="TriangleAlert"
          tone="destructive"
        />
      ) : null}
      <View className="gap-3">
        <Text className="text-lg font-bold text-foreground">Whole app</Text>
        <DesignChoices
          label="Whole app"
          value={preference.defaultDesign}
          disabled={pending}
          onChange={(design) => {
            void save(() => mobileDesignStore.setDefault(design))
          }}
        />
        <Text className="text-xs [-rn-line-height:20] text-muted-foreground">
          Inherit follows the release configuration. Individual choices below
          take priority. Only extracted screens respond during migration.
        </Text>
      </View>
      <View className="gap-1">
        <Text className="text-lg font-bold text-foreground">
          Screen overrides
        </Text>
        <Text className="text-xs [-rn-line-height:20] text-muted-foreground">
          Available means source-integrated. Device acceptance is still pending.
        </Text>
      </View>
      {Object.entries(MOBILE_DESIGN_SCREENS).map(([screen, label]) => {
        if (!isMobileDesignScreen(screen)) return null
        const available = MODULARIZED_SCREENS.has(screen)
        return (
          <View key={screen} className="gap-3 border-b border-border pb-5">
            <Text className="text-base font-semibold text-foreground">
              {label}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {available
                ? "Available · QA pending"
                : "Module extraction pending"}
            </Text>
            <DesignChoices
              label={label}
              value={preference.screens[screen] ?? null}
              disabled={pending || !available}
              onChange={(design) => {
                void save(() => mobileDesignStore.setScreen(screen, design))
              }}
            />
          </View>
        )
      })}
      <ActionButton
        disabled={pending}
        variant="outline"
        onPress={() => {
          void save(mobileDesignStore.reset)
        }}
      >
        Reset to release appearance
      </ActionButton>
    </MobileScreen>
  )
}

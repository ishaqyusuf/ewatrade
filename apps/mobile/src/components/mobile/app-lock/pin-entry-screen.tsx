import { ActionButton } from "@/components/mobile/action-button"
import { AppLockPinPad } from "@/components/mobile/app-lock-pin-pad"
import { BrandMark } from "@/components/mobile/brand"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { APP_LOCK_CODE_LENGTH } from "@/lib/app-lock-store"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { ScrollView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg"

// Settings 21 / 01 One Gate: the unlock gate's full green screen and keypad,
// reused for every PIN step (unlock, create, enter again, change, turn off).

export type PinEntryLeading = {
  kind: "close" | "back"
  label: string
  onPress: () => void
}

export type PinEntryFooter =
  | { kind: "note"; text: string }
  | { kind: "action"; label: string; onPress: () => void }

function useGatePalette() {
  const { colorScheme } = useColorScheme()
  return GREEN_TILL_THEME[colorScheme]
}

/** Green gradient screen with a light status bar and a scrolling column. */
function GateShell({
  children,
  leading,
  testID,
}: {
  children: ReactNode
  leading?: PinEntryLeading
  testID?: string
}) {
  const palette = useGatePalette()
  const insets = useSafeAreaInsets()
  return (
    <VariableContextProvider
      value={{
        "--gate-bg": palette.heroTo,
        "--gate-chip": palette.heroChip,
        "--gate-error": palette.heroDown,
        "--gate-fg": palette.heroForeground,
        "--gate-muted": palette.heroMuted,
      }}
    >
      <View className="flex-1 bg-[var(--gate-bg)]" testID={testID}>
        <StatusBar style="light" />
        <View
          accessible={false}
          className="absolute inset-0"
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <Svg
            height="100%"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
            width="100%"
          >
            <Defs>
              <RadialGradient
                cx="80"
                cy="15"
                gradientTransform="scale(1 .66667)"
                gradientUnits="userSpaceOnUse"
                id="app-lock-gate-glow"
                r="120"
              >
                <Stop offset="0" stopColor={palette.heroHighlight} />
                <Stop offset="0.45" stopColor={palette.heroFrom} />
                <Stop offset="1" stopColor={palette.heroTo} />
              </RadialGradient>
            </Defs>
            <Rect fill="url(#app-lock-gate-glow)" height="100" width="100" />
          </Svg>
        </View>
        <ScrollView
          bounces={false}
          contentContainerStyle={{
            alignItems: "center",
            flexGrow: 1,
            paddingBottom: Math.max(insets.bottom, 16) + 10,
            paddingHorizontal: 24,
            paddingTop: insets.top + 8,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="h-11 w-full flex-row items-center">
            {leading ? (
              <Pressable
                accessibilityLabel={leading.label}
                accessibilityRole="button"
                className="size-11 items-center justify-center rounded-full bg-[var(--gate-chip)]"
                haptic
                onPress={leading.onPress}
              >
                <Icon
                  className={
                    leading.kind === "back" ? "size-[20px]" : "size-[18px]"
                  }
                  color={palette.heroForeground}
                  name={leading.kind === "back" ? "ChevronLeft" : "X"}
                />
              </Pressable>
            ) : null}
          </View>
          {children}
        </ScrollView>
      </View>
    </VariableContextProvider>
  )
}

export function PinEntryScreen({
  biometricLabel,
  disabled,
  error,
  footer,
  glyph,
  leading,
  message,
  onBiometricPress,
  onDeletePress,
  onDigitPress,
  showBiometric,
  subtitle,
  testID,
  title,
  value,
}: {
  biometricLabel?: string
  disabled?: boolean
  /** Rose dots and message after a wrong or mismatched PIN. */
  error?: boolean
  footer?: PinEntryFooter
  /** The brand mark on the unlock gate; an icon tile on the setup steps. */
  glyph: "brand" | IconKeys
  leading?: PinEntryLeading
  message?: string | null
  onBiometricPress?: () => void
  onDeletePress: () => void
  onDigitPress: (digit: string) => void
  showBiometric?: boolean
  subtitle: string
  testID?: string
  title: string
  value: string
}) {
  const palette = useGatePalette()
  return (
    <GateShell leading={leading} testID={testID}>
      {glyph === "brand" ? (
        <View className="mt-4">
          <BrandMark color={palette.brandMark} size={52} />
        </View>
      ) : (
        <View className="mt-4 size-[52px] items-center justify-center rounded-[18px] bg-[var(--gate-chip)]">
          <Icon
            className="size-[24px]"
            color={palette.heroForeground}
            name={glyph}
          />
        </View>
      )}
      <Text
        accessibilityRole="header"
        className="mt-3.5 text-center text-[22px] font-extrabold tracking-tight [-rn-line-height:28] text-[var(--gate-fg)]"
      >
        {title}
      </Text>
      <Text className="mt-1 max-w-[300px] text-center text-[13.5px] [-rn-line-height:19] text-[var(--gate-muted)]">
        {subtitle}
      </Text>
      <AppLockPinPad
        biometricLabel={biometricLabel}
        codeLength={APP_LOCK_CODE_LENGTH}
        disabled={disabled}
        error={error}
        message={
          <Text
            accessibilityLiveRegion="polite"
            className={
              error
                ? "min-h-5 max-w-[300px] text-center text-[13px] font-semibold [-rn-line-height:19] text-[var(--gate-error)]"
                : "min-h-5 max-w-[300px] text-center text-[13px] font-semibold [-rn-line-height:19] text-[var(--gate-muted)]"
            }
          >
            {message ?? " "}
          </Text>
        }
        onBiometricPress={onBiometricPress}
        onDeletePress={onDeletePress}
        onDigitPress={onDigitPress}
        showBiometric={showBiometric}
        value={value}
        variant="gate"
      />
      {footer ? (
        <View className="mt-auto w-full items-center pt-5">
          {footer.kind === "action" ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-11 justify-center px-4"
              haptic
              onPress={footer.onPress}
            >
              <Text className="text-center text-[13px] font-bold text-[var(--gate-muted)]">
                {footer.label}
              </Text>
            </Pressable>
          ) : (
            <Text className="min-h-11 px-4 text-center text-[13px] font-bold [-rn-line-height:19] text-[var(--gate-muted)]">
              {footer.text}
            </Text>
          )}
        </View>
      ) : null}
    </GateShell>
  )
}

/** One more green screen after a new PIN: offer the phone's biometrics. */
export function AppLockBiometricOffer({
  biometricName,
  businessName,
  busy,
  onAccept,
  onDecline,
}: {
  /** In-sentence name, such as "fingerprint" or "Face ID". */
  biometricName: string
  businessName?: string | null
  busy?: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  const palette = useGatePalette()
  const generic = biometricName === biometricName.toLowerCase()
  return (
    <GateShell testID="app-lock-biometric-offer">
      <View className="mt-12 size-24 items-center justify-center rounded-[32px] bg-[var(--gate-chip)]">
        <Icon
          className="size-[46px]"
          color={palette.brandMark}
          name="FingerPrintScan"
          strokeWidth={1.6}
        />
      </View>
      <Text
        accessibilityRole="header"
        className="mt-5 text-center text-[22px] font-extrabold tracking-tight [-rn-line-height:28] text-[var(--gate-fg)]"
      >
        {`Unlock with ${generic ? "your " : ""}${biometricName}?`}
      </Text>
      <Text className="mt-1 max-w-[300px] text-center text-[13.5px] [-rn-line-height:19] text-[var(--gate-muted)]">
        {`Open ${businessName?.trim() || "your business"} without typing your PIN. Your PIN still works.`}
      </Text>
      <View className="mt-6 w-full gap-2">
        <OfferFact
          icon="FingerPrint"
          text={`Uses the ${biometricName} already set up on this phone`}
        />
        <OfferFact icon="ShieldCheck" text="You can turn it off in App lock" />
      </View>
      <View className="mt-auto w-full gap-1 pt-6">
        <ActionButton
          disabled={busy}
          icon="FingerPrintScan"
          onPress={onAccept}
          testID="app-lock-biometric-accept"
          tone="cream"
        >
          {`Use ${biometricName}`}
        </ActionButton>
        <Pressable
          accessibilityRole="button"
          className="min-h-12 items-center justify-center"
          disabled={busy}
          haptic
          onPress={onDecline}
          testID="app-lock-biometric-decline"
        >
          <Text className="text-sm font-extrabold text-[var(--gate-fg)]">
            Not now
          </Text>
        </Pressable>
      </View>
    </GateShell>
  )
}

function OfferFact({ icon, text }: { icon: IconKeys; text: string }) {
  const palette = useGatePalette()
  return (
    <View className="flex-row items-center gap-2.5 rounded-[13px] bg-[var(--gate-chip)] px-3 py-2.5">
      <Icon className="size-[16px]" color={palette.gold} name={icon} />
      <Text className="min-w-0 flex-1 text-[13px] [-rn-line-height:18] text-[var(--gate-fg)]">
        {text}
      </Text>
    </View>
  )
}

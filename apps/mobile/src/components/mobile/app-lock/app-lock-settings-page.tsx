import { HeroCard } from "@/components/mobile/green-till/hero-card"
import {
  ListCard,
  RecordRow,
  SectionHeader,
} from "@/components/mobile/green-till/kit"
import { ScreenBar } from "@/components/mobile/green-till/screen-bar"
import { MobileScreen } from "@/components/mobile/screen"
import { Icon } from "@/components/ui/icon"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { appLockBiometricName } from "@/lib/app-lock-messages"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { StatusBar } from "expo-status-bar"
import { Text as NativeText, StyleSheet } from "react-native"

// Settings 21 / 01 Answer Card: "App lock is on/off" answer, then the rows.
// Biometrics stay hidden until a PIN exists.

const DEVICE_NOTE = "Works offline. Stored only on this phone."

export function AppLockSettingsPage({
  biometricLabel,
  biometricReason,
  biometricsAvailable,
  biometricsEnabled,
  businessName,
  hasLock,
  note,
  onChangePin,
  onClose,
  onCreatePin,
  onDisable,
  onToggleBiometrics,
}: {
  /** Platform name, such as "Fingerprint" or "Face ID". */
  biometricLabel: string
  biometricReason?: string | null
  biometricsAvailable: boolean
  biometricsEnabled: boolean
  businessName?: string | null
  hasLock: boolean
  /** Result of the last step, such as "PIN changed". */
  note?: string | null
  onChangePin: () => void
  onClose: () => void
  onCreatePin: () => void
  onDisable: () => void
  onToggleBiometrics: (enabled: boolean) => void
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const biometricsOn = hasLock && biometricsAvailable && biometricsEnabled
  const chevron = (
    <Icon name="ChevronRight" className="size-[16px] text-muted-foreground" />
  )

  return (
    <MobileScreen contentClassName="gap-4 px-[18px] py-4">
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <ScreenBar
        label="Close app lock settings"
        onPress={onClose}
        title="App lock"
      />
      <HeroCard
        label="This phone"
        pill={
          hasLock
            ? {
                label: biometricsOn
                  ? `PIN + ${appLockBiometricName(biometricLabel)}`
                  : "PIN",
                tone: "synced",
              }
            : undefined
        }
        labelAction={
          hasLock ? undefined : (
            <View
              accessibilityLabel="Off"
              accessible
              style={[styles.offPill, { backgroundColor: palette.gold }]}
            >
              <NativeText
                style={{
                  color: palette.goldForeground,
                  fontSize: 11,
                  fontWeight: "800",
                  includeFontPadding: false,
                  lineHeight: 14,
                }}
              >
                Off
              </NativeText>
            </View>
          )
        }
        title={hasLock ? "App lock is on" : "App lock is off"}
        sub={
          hasLock
            ? "Asks for your PIN each time you return to the app."
            : `Anyone holding this phone can open ${businessName?.trim() || "your business"}.`
        }
      />
      {note ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.note, { backgroundColor: palette.mint }]}
        >
          <Icon
            className="size-[17px]"
            color={palette.mintForeground}
            name="Check"
          />
          <NativeText
            style={[styles.noteText, { color: palette.mintForeground }]}
          >
            {note}
          </NativeText>
        </View>
      ) : null}
      {hasLock ? (
        <>
          <View>
            <SectionHeader title="Unlock" />
            <ListCard>
              <RecordRow
                avatar={{ icon: "SecurityPassword", tint: "lilac" }}
                meta="6 digits"
                onPress={onChangePin}
                status={chevron}
                testID="app-lock-change-pin"
                title="Change PIN"
              />
              <RecordRow
                avatar={{ icon: "FingerPrintScan", tint: "mint" }}
                meta={
                  biometricsAvailable
                    ? "Use it from the PIN pad"
                    : (biometricReason ?? "Not available on this phone")
                }
                onPress={
                  biometricsAvailable
                    ? () => onToggleBiometrics(!biometricsOn)
                    : undefined
                }
                status={
                  <Switch
                    accessibilityLabel={`${biometricLabel} unlock`}
                    checked={biometricsOn}
                    disabled={!biometricsAvailable}
                    onCheckedChange={onToggleBiometrics}
                  />
                }
                title={`${biometricLabel} unlock`}
              />
            </ListCard>
            <Text className="mt-3 px-1 text-xs leading-5 text-muted-foreground">
              {DEVICE_NOTE}
            </Text>
          </View>
          <ListCard>
            <RecordRow
              avatar={{ icon: "Lock", tint: "rose" }}
              danger
              meta="Asks for your PIN first"
              onPress={onDisable}
              testID="app-lock-turn-off"
              title="Turn off app lock"
            />
          </ListCard>
        </>
      ) : (
        <View>
          <SectionHeader title="Protect this phone" />
          <ListCard>
            <RecordRow
              avatar={{ icon: "SecurityPassword", tint: "lilac" }}
              meta="Takes 10 seconds"
              onPress={onCreatePin}
              status={chevron}
              testID="app-lock-create-pin"
              title="Create a 6-digit PIN"
            />
          </ListCard>
          <Text className="mt-3 px-1 text-xs leading-5 text-muted-foreground">
            {DEVICE_NOTE}
          </Text>
        </View>
      )}
    </MobileScreen>
  )
}

const styles = StyleSheet.create({
  note: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noteText: { flex: 1, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  offPill: {
    borderRadius: 999,
    height: 24,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
})

import { SafeArea } from "@/components/safe-area"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { APP_LOCK_QUIET_SEAL_LAYOUT } from "@/lib/app-lock-quiet-seal-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { DISPLAY_TEXT_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { StatusBar } from "expo-status-bar"
import type { ReactNode } from "react"
import {
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native"

type AppLockQuietSealScreenProps = {
  children: ReactNode
  contentStyle?: StyleProp<ViewStyle>
  eyebrow: string
  onClose?: () => void
  subtitle: string
  testID?: string
  title: string
}

export function AppLockQuietSealScreen({
  children,
  contentStyle,
  eyebrow,
  onClose,
  subtitle,
  testID,
  title,
}: AppLockQuietSealScreenProps) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <SafeArea style={{ backgroundColor: marketDay.paprika }}>
      <StatusBar backgroundColor={marketDay.paprika} style="light" />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { backgroundColor: marketDay.canvas },
        ]}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: marketDay.canvas }}
        testID={testID}
      >
        <View
          style={[
            styles.cap,
            largeTextLayout ? styles.capLargeText : null,
            { backgroundColor: marketDay.paprika },
          ]}
        >
          <View style={styles.topRow}>
            <Text
              numberOfLines={largeTextLayout ? undefined : 1}
              style={[styles.eyebrow, { color: marketDay.canopyAccent }]}
            >
              {eyebrow}
            </Text>

            {onClose ? (
              <Pressable
                accessibilityLabel="Close app lock settings"
                haptic
                hitSlop={6}
                onPress={onClose}
                style={({ pressed }) => [
                  styles.closeButton,
                  {
                    backgroundColor: pressed
                      ? "rgba(255,255,255,0.22)"
                      : "rgba(255,255,255,0.13)",
                  },
                ]}
              >
                <Icon color={marketDay.onPalm} name="X" size={20} />
              </Pressable>
            ) : (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.closePlaceholder}
              />
            )}
          </View>

          <View
            pointerEvents="none"
            style={[styles.capCut, { backgroundColor: marketDay.canvas }]}
          />

          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={styles.sealPosition}
          >
            <View
              style={[
                styles.sealShadow,
                { backgroundColor: marketDay.pulseShadow },
              ]}
            />
            <View
              style={[
                styles.seal,
                {
                  backgroundColor: marketDay.palm,
                  borderColor: marketDay.canvas,
                },
              ]}
            >
              <View
                style={[
                  styles.sealInner,
                  { borderColor: marketDay.onPalmMuted },
                ]}
              >
                <Icon color={marketDay.onPalm} name="Lock" size={39} />
              </View>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.body,
            largeTextLayout ? styles.bodyLargeText : null,
            contentStyle,
          ]}
        >
          <View style={styles.copy}>
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
              style={[
                styles.title,
                largeTextLayout ? styles.titleLargeText : null,
                { color: marketDay.ink },
              ]}
            >
              {title}
            </Text>
            <Text
              style={[
                styles.subtitle,
                largeTextLayout ? styles.subtitleLargeText : null,
                { color: marketDay.mutedInk },
              ]}
            >
              {subtitle}
            </Text>
          </View>

          {children}
        </View>
      </ScrollView>
    </SafeArea>
  )
}

export function AppLockQuietSealLengthChoice() {
  const marketDay = useMarketDayPalette()

  return (
    <View
      accessibilityLabel="Six digit PIN selected. Four digit PIN unavailable."
      style={[
        styles.choiceLine,
        {
          borderBottomColor: marketDay.line,
          borderTopColor: marketDay.line,
        },
      ]}
    >
      <Text
        maxFontSizeMultiplier={
          APP_LOCK_QUIET_SEAL_LAYOUT.choiceLabelFontScaleCap
        }
        numberOfLines={1}
        style={[styles.choiceMuted, { color: marketDay.mutedInk }]}
      >
        4 digit unavailable
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.choiceDot, { backgroundColor: marketDay.paprika }]}
      />
      <Text
        maxFontSizeMultiplier={
          APP_LOCK_QUIET_SEAL_LAYOUT.choiceLabelFontScaleCap
        }
        numberOfLines={1}
        style={[styles.choiceSelected, { color: marketDay.ink }]}
      >
        6 digit selected
      </Text>
    </View>
  )
}

export function AppLockQuietSealDeviceNote({
  children = "Stored only on this phone",
}: {
  children?: ReactNode
}) {
  const marketDay = useMarketDayPalette()

  return (
    <View style={styles.deviceNote}>
      <Icon color={marketDay.accentInk} name="ShieldCheck" size={15} />
      <Text
        maxFontSizeMultiplier={1.4}
        style={[styles.deviceNoteText, { color: marketDay.mutedInk }]}
      >
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
    gap: 22,
    paddingBottom: 20,
    paddingHorizontal: 26,
    paddingTop: APP_LOCK_QUIET_SEAL_LAYOUT.bodyPaddingTop,
  },
  bodyLargeText: {
    gap: 26,
    paddingHorizontal: 22,
    paddingTop: 98,
  },
  cap: {
    height: APP_LOCK_QUIET_SEAL_LAYOUT.capHeight,
    position: "relative",
    zIndex: 2,
  },
  capCut: {
    bottom: APP_LOCK_QUIET_SEAL_LAYOUT.capCutBottom,
    height: APP_LOCK_QUIET_SEAL_LAYOUT.capCutHeight,
    left: -18,
    position: "absolute",
    right: -18,
    transform: [{ rotate: "5deg" }],
  },
  capLargeText: {
    height: 195,
  },
  choiceDot: {
    borderRadius: 999,
    height: 5,
    width: 5,
  },
  choiceLine: {
    alignItems: "center",
    alignSelf: "center",
    borderBottomWidth: 1,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 30,
    maxWidth: "100%",
    paddingHorizontal: 10,
  },
  choiceMuted: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  choiceSelected: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  closeButton: {
    alignItems: "center",
    borderRadius: 999,
    height: APP_LOCK_QUIET_SEAL_LAYOUT.closeButtonSize,
    justifyContent: "center",
    width: APP_LOCK_QUIET_SEAL_LAYOUT.closeButtonSize,
  },
  closePlaceholder: {
    height: APP_LOCK_QUIET_SEAL_LAYOUT.closeButtonSize,
    width: APP_LOCK_QUIET_SEAL_LAYOUT.closeButtonSize,
  },
  copy: {
    alignItems: "center",
    gap: 8,
  },
  deviceNote: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 24,
  },
  deviceNoteText: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 16,
    textAlign: "center",
  },
  eyebrow: {
    flex: 1,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    lineHeight: 16,
    textTransform: "uppercase",
  },
  scrollContent: {
    flexGrow: 1,
  },
  seal: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 7,
    height: APP_LOCK_QUIET_SEAL_LAYOUT.sealSize,
    justifyContent: "center",
    transform: [{ rotate: "-4deg" }],
    width: APP_LOCK_QUIET_SEAL_LAYOUT.sealSize,
  },
  sealInner: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: 88,
    justifyContent: "center",
    width: 88,
  },
  sealPosition: {
    alignItems: "center",
    bottom: APP_LOCK_QUIET_SEAL_LAYOUT.sealBottom,
    height: 124,
    justifyContent: "center",
    left: "50%",
    marginLeft: -62,
    position: "absolute",
    width: 124,
  },
  sealShadow: {
    borderRadius: 999,
    height: APP_LOCK_QUIET_SEAL_LAYOUT.sealSize,
    left: 6,
    position: "absolute",
    top: 8,
    width: APP_LOCK_QUIET_SEAL_LAYOUT.sealSize,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 286,
    textAlign: "center",
  },
  subtitleLargeText: {
    lineHeight: 22,
    maxWidth: 320,
  },
  title: {
    fontFamily: "serif",
    fontSize: APP_LOCK_QUIET_SEAL_LAYOUT.titleFontSize,
    fontWeight: "900",
    letterSpacing: -1.2,
    lineHeight: APP_LOCK_QUIET_SEAL_LAYOUT.titleLineHeight,
    textAlign: "center",
  },
  titleLargeText: {
    fontSize: 31,
    lineHeight: 35,
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 18,
    paddingTop: APP_LOCK_QUIET_SEAL_LAYOUT.topRowPaddingTop,
  },
})

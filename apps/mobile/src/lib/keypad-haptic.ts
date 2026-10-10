import * as Haptics from "expo-haptics"
import { Platform } from "react-native"

/** Keypad tick on touch-down. Android's "light" impact is too faint to feel. */
export function keypadHaptic() {
  void Haptics.impactAsync(
    Platform.OS === "android"
      ? Haptics.ImpactFeedbackStyle.Medium
      : Haptics.ImpactFeedbackStyle.Light,
  ).catch(() => {
    // Haptic support is optional; a feedback failure must not block the key.
  })
}

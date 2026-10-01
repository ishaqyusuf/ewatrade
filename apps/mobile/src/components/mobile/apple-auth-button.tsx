import * as AppleAuthentication from "expo-apple-authentication"
import { useEffect, useState } from "react"
import { Platform } from "react-native"
import { useColorScheme } from "@/hooks/use-color"
import { View } from "@/components/ui/view"

export function AppleAuthButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const [available, setAvailable] = useState(false)
  const { colorScheme } = useColorScheme()
  useEffect(() => {
    let mounted = true
    if (Platform.OS === "ios") void AppleAuthentication.isAvailableAsync().then((value) => { if (mounted) setAvailable(value) }).catch(() => undefined)
    return () => { mounted = false }
  }, [])
  if (!available) return null
  return (
    <View pointerEvents={disabled ? "none" : "auto"} accessibilityState={{ disabled: Boolean(disabled) }}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={colorScheme === "dark" ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={12}
        style={{ width: "100%", height: 48, opacity: disabled ? 0.5 : 1 }}
        onPress={onPress}
      />
    </View>
  )
}

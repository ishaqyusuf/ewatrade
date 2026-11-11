import { ActionButton } from "@/components/mobile/action-button"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { CameraView, useCameraPermissions } from "expo-camera"
import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal as RNModal,
  View,
  useWindowDimensions,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const SHUTTER = 72
// Room the bottom control row takes, kept clear of the permission prompt.
const CONTROLS = SHUTTER + 32

/**
 * Live camera docked over the lower part of the current screen, in place of
 * the full-screen system camera. One tap on the round shutter takes the photo
 * and hands it over; the caller closes the camera. Without camera access it
 * offers the phone's photos instead.
 */
export function DockedPhotoCamera({
  open,
  onCapture,
  onClose,
  onChoosePhoto,
}: {
  open: boolean
  onCapture: (photo: { uri: string; mimeType: string }) => void
  onClose: () => void
  onChoosePhoto: () => void
}) {
  return (
    <RNModal
      animationType="fade"
      transparent
      visible={open}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {open ? (
        <DockedPhotoCameraBody
          onCapture={onCapture}
          onClose={onClose}
          onChoosePhoto={onChoosePhoto}
        />
      ) : null}
    </RNModal>
  )
}

function DockedPhotoCameraBody({
  onCapture,
  onClose,
  onChoosePhoto,
}: {
  onCapture: (photo: { uri: string; mimeType: string }) => void
  onClose: () => void
  onChoosePhoto: () => void
}) {
  const [permission, requestPermission, refreshPermission] =
    useCameraPermissions()
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  )
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [torch, setTorch] = useState(false)
  const [facing, setFacing] = useState<"back" | "front">("back")
  const [error, setError] = useState("")
  const camera = useRef<CameraView>(null)
  const active = useRef(true)
  const shooting = useRef(false)
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  // Icon reads only base theme tokens, so the light-on-camera colour is passed.
  const onCamera = palette.cream
  useEffect(() => {
    active.current = true
    const listener = AppState.addEventListener("change", (state) => {
      setForeground(state === "active")
      if (state === "active") void refreshPermission()
      else setReady(false)
    })
    return () => {
      active.current = false
      listener.remove()
    }
  }, [refreshPermission])
  const snap = async () => {
    if (!ready || !camera.current || shooting.current) return
    shooting.current = true
    setBusy(true)
    setError("")
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8 })
      if (!active.current) return
      if (!photo?.uri) {
        setError("The photo was not taken. Try again.")
        return
      }
      onCapture({
        uri: photo.uri,
        mimeType: photo.format === "png" ? "image/png" : "image/jpeg",
      })
    } catch {
      if (active.current)
        setError("The photo was not taken. Try again or choose a photo.")
    } finally {
      shooting.current = false
      if (active.current) setBusy(false)
    }
  }
  const round =
    "size-11 items-center justify-center rounded-full bg-overlay active:opacity-80"
  const live = Boolean(permission?.granted && foreground)
  return (
    <View style={{ flex: 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close camera"
        onPress={onClose}
        noRipple
        transition={false}
        style={{ flex: 1 }}
      />
      <View
        accessibilityViewIsModal
        className="overflow-hidden rounded-t-[20px] bg-overlay"
        style={{ height: Math.round(height * 0.62) }}
      >
        {live ? (
          <CameraView
            ref={camera}
            style={{ flex: 1 }}
            facing={facing}
            mode="picture"
            enableTorch={torch}
            onCameraReady={() => setReady(true)}
            onMountError={() => {
              setReady(false)
              setError("The camera is unavailable. Choose a photo instead.")
            }}
          />
        ) : (
          <View
            className="flex-1 items-center justify-center gap-3 px-6"
            style={{ paddingBottom: CONTROLS + insets.bottom }}
          >
            <Text className="text-center text-sm text-cream">
              {!permission
                ? "Checking camera access…"
                : "Allow camera access to take a product photo."}
            </Text>
            {permission && !permission.granted ? (
              <ActionButton
                onPress={
                  permission.canAskAgain
                    ? () => void requestPermission().catch(() => {})
                    : () => void Linking.openSettings()
                }
              >
                {permission.canAskAgain
                  ? "Allow camera"
                  : "Open camera settings"}
              </ActionButton>
            ) : null}
            {permission && !permission.granted ? (
              <ActionButton variant="outline" onPress={onChoosePhoto}>
                Choose from phone
              </ActionButton>
            ) : null}
          </View>
        )}
        {error ? (
          <View
            className="absolute inset-x-0 top-0 items-center px-4 pt-4"
            pointerEvents="none"
          >
            <Text className="rounded-full bg-overlay px-3.5 py-1.5 text-center text-xs font-bold text-cream">
              {error}
            </Text>
          </View>
        ) : null}
        <View
          className="absolute inset-x-0 bottom-0 flex-row items-center justify-between px-7"
          pointerEvents="box-none"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            className={round}
            haptic
            onPress={onClose}
          >
            <Icon className="size-[20px]" color={onCamera} name="ChevronLeft" />
          </Pressable>
          {live ? (
            <Pressable
              accessibilityLabel="Take photo"
              accessibilityRole="button"
              accessibilityState={{ busy, disabled: !ready || busy }}
              disabled={!ready || busy}
              haptic
              onPress={() => void snap()}
              style={{
                alignItems: "center",
                backgroundColor: colors.overlay,
                borderRadius: SHUTTER / 2,
                height: SHUTTER,
                justifyContent: "center",
                opacity: ready ? 1 : 0.6,
                width: SHUTTER,
              }}
            >
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: palette.overlayForeground,
                  borderRadius: (SHUTTER - 12) / 2,
                  height: SHUTTER - 12,
                  justifyContent: "center",
                  width: SHUTTER - 12,
                }}
              >
                {busy ? <ActivityIndicator color={colors.overlay} /> : null}
              </View>
            </Pressable>
          ) : null}
          <View
            style={{ height: SHUTTER, justifyContent: "center" }}
            pointerEvents="box-none"
          >
            {live ? (
              // Flash and flip stack above the close button, as in the design.
              <View
                className="gap-2"
                pointerEvents="box-none"
                style={{ bottom: SHUTTER - 14 + 8, position: "absolute" }}
              >
                <Pressable
                  accessibilityLabel={
                    torch ? "Turn off flashlight" : "Turn on flashlight"
                  }
                  accessibilityRole="switch"
                  accessibilityState={{ checked: torch }}
                  className={round}
                  disabled={!ready || facing === "front"}
                  haptic
                  onPress={() => setTorch((on) => !on)}
                >
                  <Icon
                    className="size-[20px]"
                    color={onCamera}
                    name={torch ? "Zap" : "FlashOff"}
                  />
                </Pressable>
                <Pressable
                  accessibilityLabel="Switch camera"
                  accessibilityRole="button"
                  className={round}
                  haptic
                  onPress={() => {
                    setTorch(false)
                    setFacing((side) => (side === "back" ? "front" : "back"))
                  }}
                >
                  <Icon
                    className="size-[20px]"
                    color={onCamera}
                    name="RefreshCw"
                  />
                </Pressable>
              </View>
            ) : null}
            <Pressable
              accessibilityLabel="Close camera"
              accessibilityRole="button"
              className={round}
              haptic
              onPress={onClose}
            >
              <Icon className="size-[20px]" color={onCamera} name="X" />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}

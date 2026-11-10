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

/**
 * Small live camera docked at the top of the current screen, in place of the
 * full-screen system camera. One tap on the round shutter takes the photo and
 * hands it over; the caller closes the camera. Without camera access it offers
 * the phone's photos instead.
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
        style={{
          backgroundColor: colors.overlay,
          bottom: 0,
          left: 0,
          position: "absolute",
          right: 0,
          top: 0,
        }}
      />
      <View
        accessibilityViewIsModal
        style={{
          height: Math.max(260, Math.round(height / 3)),
          marginHorizontal: 12,
          marginTop: insets.top + 12,
        }}
      >
        <View className="flex-1 overflow-hidden rounded-[24px] bg-overlay">
          {live ? (
            <CameraView
              ref={camera}
              style={{ flex: 1 }}
              facing="back"
              mode="picture"
              enableTorch={torch}
              onCameraReady={() => setReady(true)}
              onMountError={() => {
                setReady(false)
                setError("The camera is unavailable. Choose a photo instead.")
              }}
            />
          ) : (
            <View className="flex-1 items-center justify-center gap-3 px-6">
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
          <View
            className="absolute inset-x-0 top-0 flex-row items-start justify-between p-3"
            pointerEvents="box-none"
          >
            {live ? (
              <Pressable
                accessibilityLabel={
                  torch ? "Turn off flashlight" : "Turn on flashlight"
                }
                accessibilityRole="switch"
                accessibilityState={{ checked: torch }}
                className={round}
                disabled={!ready}
                haptic
                onPress={() => setTorch((on) => !on)}
              >
                <Icon
                  className="size-[20px]"
                  color={onCamera}
                  name={torch ? "FlashOff" : "Flashlight"}
                />
              </Pressable>
            ) : (
              <View />
            )}
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
          {error ? (
            <View
              className="absolute inset-x-0 items-center px-4"
              pointerEvents="none"
              style={{ bottom: SHUTTER + 28 }}
            >
              <Text className="rounded-full bg-overlay px-3.5 py-1.5 text-center text-xs font-bold text-cream">
                {error}
              </Text>
            </View>
          ) : null}
          {live ? (
            <View
              className="absolute inset-x-0 bottom-0 items-center pb-4"
              pointerEvents="box-none"
            >
              <Pressable
                accessibilityLabel="Take photo"
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: !ready || busy }}
                disabled={!ready || busy}
                haptic
                onPress={() => void snap()}
                style={{
                  alignItems: "center",
                  borderColor: palette.overlayForeground,
                  borderRadius: SHUTTER / 2,
                  borderWidth: 4,
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
                    borderRadius: (SHUTTER - 16) / 2,
                    height: SHUTTER - 16,
                    justifyContent: "center",
                    width: SHUTTER - 16,
                  }}
                >
                  {busy ? <ActivityIndicator color={colors.overlay} /> : null}
                </View>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

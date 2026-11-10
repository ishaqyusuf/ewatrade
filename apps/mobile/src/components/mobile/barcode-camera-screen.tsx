import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme } from "@/hooks/use-color"
import { barcodeScanValue, distinctScannedBarcodes } from "@/lib/barcode-scan"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import {
  type BarcodeType,
  CameraView,
  scanFromURLAsync,
  useCameraPermissions,
} from "expo-camera"
import { File } from "expo-file-system"
import * as Haptics from "expo-haptics"
import { useEffect, useRef, useState } from "react"
import { AppState, Linking, Platform, ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const BARCODE_TYPES: BarcodeType[] = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "code93",
  "itf14",
  "codabar",
  // QR text is only ever matched as an exact code; links are never opened.
  "qr",
]

export function BarcodeCameraScreen({
  onRead,
  onCancel,
  cancelLabel = "Enter barcode manually",
  instructions = "Point the camera at one barcode. The code fills automatically when it is read.",
}: {
  onRead: (code: string) => void
  onCancel: () => void
  cancelLabel?: string
  instructions?: string
}) {
  const [permission, requestPermission, refreshPermission] =
    useCameraPermissions()
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  )
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [choices, setChoices] = useState<string[]>([])
  const [torch, setTorch] = useState(false)
  const camera = useRef<CameraView>(null)
  const active = useRef(true)
  const accepted = useRef(false)
  const photoBusy = useRef(false)
  const insets = useSafeAreaInsets()
  useEffect(() => {
    active.current = true
    const listener = AppState.addEventListener("change", (state) => {
      setForeground(state === "active")
      if (state === "active") void refreshPermission()
    })
    return () => {
      active.current = false
      listener.remove()
    }
  }, [refreshPermission])
  const accept = (data: string) => {
    if (
      !active.current ||
      accepted.current ||
      AppState.currentState !== "active"
    )
      return
    const code = barcodeScanValue(data)
    if (!code) {
      setError(
        "This code cannot be used. Try another barcode or type it manually.",
      )
      return
    }
    accepted.current = true
    onRead(code)
  }
  const takePhoto = async () => {
    if (!ready || !camera.current || photoBusy.current || accepted.current)
      return
    photoBusy.current = true
    setBusy(true)
    setError("")
    let uri: string | undefined
    try {
      const photo = await camera.current.takePictureAsync({ quality: 1 })
      uri = photo?.uri
      if (!uri || !active.current) return
      const codes = distinctScannedBarcodes(
        await scanFromURLAsync(uri, BARCODE_TYPES),
      )
      if (!active.current) return
      const [code] = codes
      if (codes.length === 1 && code) accept(code)
      else if (codes.length > 1) setChoices(codes)
      else
        setError(
          "No barcode found. Move closer, keep the label sharp, and try again.",
        )
    } catch {
      if (active.current)
        setError(
          "The barcode could not be read. Try again or type the code manually.",
        )
    } finally {
      if (uri) {
        try {
          new File(uri).delete()
        } catch {
          /* Temporary scanner image only. */
        }
      }
      photoBusy.current = false
      if (active.current) setBusy(false)
    }
  }
  const allowCamera = async () => {
    try {
      await requestPermission()
    } catch {
      if (active.current)
        setError(
          "Camera access is unavailable. You can type the barcode instead.",
        )
    }
  }
  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 pt-4 pb-6"
      >
        <Text className="text-sm text-muted-foreground">{instructions}</Text>
        {error ? <StatusBanner tone="warning" message={error} /> : null}
        {!permission ? (
          <Text className="text-muted-foreground">Checking camera access…</Text>
        ) : !permission.granted ? (
          <View className="gap-4">
            <StatusBanner
              tone="default"
              message="Allow camera access to scan a barcode. Manual entry is always available."
            />
            <ActionButton
              onPress={
                permission.canAskAgain
                  ? allowCamera
                  : () => void Linking.openSettings()
              }
            >
              {permission.canAskAgain ? "Allow camera" : "Open camera settings"}
            </ActionButton>
          </View>
        ) : choices.length ? (
          <View className="gap-3">
            <Text
              accessibilityRole="header"
              className="font-bold text-foreground"
            >
              Choose the barcode to use
            </Text>
            {choices.map((code) => (
              <ActionButton
                key={code}
                variant="outline"
                onPress={() => accept(code)}
              >
                {code}
              </ActionButton>
            ))}
            <ActionButton variant="outline" onPress={() => setChoices([])}>
              Scan again
            </ActionButton>
          </View>
        ) : foreground ? (
          <View className="h-80 overflow-hidden rounded-2xl border border-border">
            <CameraView
              ref={camera}
              style={{ flex: 1 }}
              facing="back"
              mode="picture"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={
                busy
                  ? undefined
                  : ({ data }) => {
                      if (!photoBusy.current) accept(data)
                    }
              }
              onCameraReady={() => setReady(true)}
              onMountError={() => {
                setReady(false)
                setError(
                  "The camera is unavailable. Close the scanner and type the barcode, or try again.",
                )
              }}
            />
          </View>
        ) : null}
        {permission?.granted && !choices.length && foreground ? (
          <ActionButton
            icon={torch ? "FlashOff" : "Flashlight"}
            variant="outline"
            disabled={!ready}
            accessibilityState={{ checked: torch }}
            onPress={() => setTorch((on) => !on)}
          >
            {torch ? "Turn off flashlight" : "Turn on flashlight"}
          </ActionButton>
        ) : null}
        {permission?.granted && !choices.length && Platform.OS === "android" ? (
          <ActionButton
            icon="Camera"
            variant="outline"
            disabled={!ready || !foreground}
            isLoading={busy}
            onPress={takePhoto}
          >
            Take photo to read barcode
          </ActionButton>
        ) : null}
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom + 12 }}>
        <View className="border-t border-border px-4 pt-3">
          <ActionButton variant="outline" onPress={onCancel}>
            {cancelLabel}
          </ActionButton>
        </View>
      </View>
    </View>
  )
}

// A code must leave the frame this long before it counts as a new scan, so
// holding the camera on one label adds it once, not on every frame.
const RESCAN_GAP_MS = 1_200

/**
 * Camera docked in the lower half of a screen for continuous scanning: each
 * read is handed over and the camera stays open until closed. Round controls
 * close it and toggle the flashlight.
 */
export function DockedBarcodeScanner({
  onRead,
  onClose,
  paused = false,
}: {
  onRead: (code: string) => void
  onClose: () => void
  /** True while a choice about the last read is open. */
  paused?: boolean
}) {
  const [permission, requestPermission, refreshPermission] =
    useCameraPermissions()
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  )
  const [torch, setTorch] = useState(false)
  const [error, setError] = useState("")
  const lastSeen = useRef(new Map<string, number>())
  const { colorScheme } = useColorScheme()
  // Icon reads only base theme tokens, so the light-on-camera colour is passed.
  const onCamera = GREEN_TILL_THEME[colorScheme].cream
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      setForeground(state === "active")
      if (state === "active") void refreshPermission()
    })
    return () => listener.remove()
  }, [refreshPermission])
  const [unusable, setUnusable] = useState(false)
  useEffect(() => {
    if (!unusable) return
    const timer = setTimeout(() => setUnusable(false), 2_500)
    return () => clearTimeout(timer)
  }, [unusable])
  const seen = (data: string) => {
    if (paused || AppState.currentState !== "active") return
    const now = Date.now()
    const before = lastSeen.current.get(data)
    lastSeen.current.set(data, now)
    if (before !== undefined && now - before < RESCAN_GAP_MS) return
    const code = barcodeScanValue(data)
    // e.g. a multi-line text QR: say so instead of ignoring it silently.
    if (!code) {
      setUnusable(true)
      return
    }
    setUnusable(false)
    void Haptics.selectionAsync().catch(() => {})
    onRead(code)
  }
  const round =
    "size-12 items-center justify-center rounded-full bg-overlay active:opacity-80"
  return (
    <View className="flex-1 overflow-hidden rounded-t-[24px] bg-overlay">
      {permission?.granted && foreground ? (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onBarcodeScanned={({ data }) => seen(data)}
          onMountError={() =>
            setError("The camera is unavailable. Close it and search by name.")
          }
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Text className="text-center text-sm text-cream">
            {!permission
              ? "Checking camera access…"
              : "Allow camera access to scan barcodes."}
          </Text>
          {permission && !permission.granted ? (
            <ActionButton
              onPress={
                permission.canAskAgain
                  ? () => void requestPermission().catch(() => {})
                  : () => void Linking.openSettings()
              }
            >
              {permission.canAskAgain ? "Allow camera" : "Open camera settings"}
            </ActionButton>
          ) : null}
        </View>
      )}
      <View
        className="absolute inset-x-0 top-0 flex-row items-start justify-between p-3"
        pointerEvents="box-none"
      >
        <Pressable
          accessibilityLabel={
            torch ? "Turn off flashlight" : "Turn on flashlight"
          }
          accessibilityRole="switch"
          accessibilityState={{ checked: torch }}
          className={round}
          disabled={!permission?.granted}
          haptic
          onPress={() => setTorch((on) => !on)}
        >
          <Icon
            className="size-[22px]"
            color={onCamera}
            name={torch ? "FlashOff" : "Flashlight"}
          />
        </Pressable>
        <Pressable
          accessibilityLabel="Close scanner"
          accessibilityRole="button"
          className={round}
          haptic
          onPress={onClose}
        >
          <Icon className="size-[22px]" color={onCamera} name="X" />
        </Pressable>
      </View>
      <View
        className="absolute inset-x-0 bottom-0 items-center px-4 pb-4"
        pointerEvents="none"
      >
        <Text className="rounded-full bg-overlay px-3.5 py-1.5 text-xs font-bold text-cream">
          {error ||
            (unusable
              ? "That code isn't a product code. Try the item's barcode."
              : "Point at a barcode or QR code. Keep scanning to add more.")}
        </Text>
      </View>
    </View>
  )
}

import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { barcodeScanValue, distinctScannedBarcodes } from "@/lib/barcode-scan"
import {
  type BarcodeType,
  CameraView,
  scanFromURLAsync,
  useCameraPermissions,
} from "expo-camera"
import { File } from "expo-file-system"
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
]

export function BarcodeCameraScreen({
  onRead,
  onCancel,
}: {
  onRead: (code: string) => void
  onCancel: () => void
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
        <Text className="text-sm text-muted-foreground">
          Point the camera at one barcode. The code fills automatically when it
          is read.
        </Text>
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
            Enter barcode manually
          </ActionButton>
        </View>
      </View>
    </View>
  )
}

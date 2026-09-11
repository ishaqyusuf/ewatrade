import { AppLockPinPad } from "@/components/mobile/app-lock-pin-pad"
import {
  AppLockQuietSealDeviceNote,
  AppLockQuietSealLengthChoice,
  AppLockQuietSealScreen,
} from "@/components/mobile/app-lock-quiet-seal"
import { resolveAppLockQuietSealPresentation } from "@/lib/app-lock-quiet-seal-presentation"
import { APP_LOCK_CODE_LENGTH } from "@/lib/app-lock-store"
import { shouldShowInternalDesignSystemEntry } from "@/lib/app-variant"
import { Redirect, useLocalSearchParams, useRouter } from "expo-router"
import { useMemo, useState } from "react"
import { View } from "@/components/ui/view"

type PreviewState = "confirm" | "create" | "unlock"

function getPreviewState(value: string | string[] | undefined): PreviewState {
  const candidate = Array.isArray(value) ? value[0] : value

  if (candidate === "confirm" || candidate === "unlock") return candidate
  return "create"
}

export default function AppLockPreviewRoute() {
  const params = useLocalSearchParams<{ state?: string }>()
  const router = useRouter()
  const previewState = getPreviewState(params.state)
  const [code, setCode] = useState("")
  const presentation = useMemo(
    () => resolveAppLockQuietSealPresentation(previewState, "Amina Stores"),
    [previewState],
  )

  if (!shouldShowInternalDesignSystemEntry()) {
    return <Redirect href="/login" />
  }

  return (
    <AppLockQuietSealScreen
      contentClassName="justify-between"
      eyebrow={presentation.eyebrow}
      onClose={previewState === "unlock" ? undefined : router.back}
      subtitle={presentation.subtitle}
      testID={`app-lock-quiet-seal-${previewState}-preview`}
      title={presentation.title}
    >
      <View className="w-full items-center gap-[22px]">
        {previewState === "unlock" ? null : <AppLockQuietSealLengthChoice />}
        <AppLockPinPad
          codeLength={APP_LOCK_CODE_LENGTH}
          onBiometricPress={() => undefined}
          onDeletePress={() => setCode((value) => value.slice(0, -1))}
          onDigitPress={(digit) =>
            setCode((value) =>
              `${value}${digit}`.slice(0, APP_LOCK_CODE_LENGTH),
            )
          }
          showBiometric={previewState === "unlock"}
          value={code}
          variant="quiet-seal"
        />
      </View>

      <AppLockQuietSealDeviceNote>
        {previewState === "unlock"
          ? "Your PIN never leaves this phone"
          : "Stored only on this phone"}
      </AppLockQuietSealDeviceNote>
    </AppLockQuietSealScreen>
  )
}

import {
  AppLockQuietSealDeviceNote,
  AppLockQuietSealLengthChoice,
  AppLockQuietSealScreen,
} from "./app-lock-quiet-seal"
import type { AppLockPresentationProps } from "@/components/mobile/app-lock/app-lock-presentation"
import { View } from "@/components/ui/view"

const CONTENT_LAYOUTS = {
  entry: "justify-between",
  unlock: "justify-between",
  manage: "gap-[26px]",
} as const

export function MarketDayAppLockScreen({
  mode,
  eyebrow,
  title,
  subtitle,
  onClose,
  pinpad,
  feedback,
  recovery,
  management,
}: AppLockPresentationProps) {
  return (
    <AppLockQuietSealScreen
      contentClassName={CONTENT_LAYOUTS[mode]}
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      testID={
        mode === "unlock"
          ? "app-lock-quiet-seal-unlock"
          : "app-lock-quiet-seal-settings"
      }
    >
      {mode === "manage" ? (
        management
      ) : (
        <View
          className={
            mode === "entry"
              ? "w-full items-center gap-[22px]"
              : "w-full items-center gap-5"
          }
        >
          {mode === "entry" ? <AppLockQuietSealLengthChoice /> : null}
          {pinpad}
          {feedback}
          {recovery}
        </View>
      )}
      <AppLockQuietSealDeviceNote>
        {mode === "manage"
          ? "PIN and fingerprint settings stay on this phone"
          : "Your PIN never leaves this phone"}
      </AppLockQuietSealDeviceNote>
    </AppLockQuietSealScreen>
  )
}

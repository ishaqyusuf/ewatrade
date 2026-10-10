import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import type { AppLockManagementProps } from "./app-lock-presentation"

/** Market Day (Quiet Seal) App lock rows. Classic uses AppLockSettingsPage. */
export function AppLockManagement(props: AppLockManagementProps) {
  return (
    <View className="grow justify-between gap-6">
      <View className="border-t border-market-line">
        <ManagementRow
          icon="SecurityPassword"
          title={props.hasLock ? "Change PIN code" : "Create PIN code"}
          detail={
            props.hasLock
              ? "Change the 6 digit PIN used to unlock this app."
              : "Create a 6 digit PIN before turning on biometric unlock."
          }
          onPress={props.hasLock ? props.onChangePin : props.onCreatePin}
        />
        <ManagementRow
          icon="FingerPrintScan"
          title={`${props.biometricLabel} unlock`}
          detail={props.biometricDetail}
          disabled={!props.hasLock || !props.biometricsAvailable}
          trailing={
            <Switch
              checked={props.hasLock && props.biometricsEnabled}
              disabled={!props.hasLock || !props.biometricsAvailable}
              onCheckedChange={props.onToggleBiometrics}
            />
          }
        />
        {props.hasLock ? (
          <ManagementRow
            icon="XCircle"
            title="Turn off app lock"
            detail="Turn off PIN and biometric unlock on this phone."
            danger
            onPress={props.onDisable}
          />
        ) : null}
      </View>
      {props.message ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-center text-xs font-semibold leading-[18px] text-market-muted-ink"
        >
          {props.message}
        </Text>
      ) : null}
    </View>
  )
}

function ManagementRow({
  detail,
  disabled,
  icon,
  onPress,
  title,
  danger,
  trailing,
}: {
  detail: string
  disabled?: boolean
  icon: IconKeys
  onPress?: () => void
  title: string
  danger?: boolean
  trailing?: ReactNode
}) {
  const rowClass = cn(
    "min-h-[82px] flex-row items-center gap-3 border-b border-market-line px-1 py-3",
    disabled && "opacity-50",
  )
  const content = (
    <>
      <View className="size-[42px] items-center justify-center rounded-full bg-market-soft-band">
        <Icon
          className={
            danger
              ? "size-[21px] text-market-paprika"
              : "size-[21px] text-market-ink"
          }
          name={icon}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text
          className={
            danger
              ? "text-sm font-extrabold leading-[19px] text-market-paprika"
              : "text-sm font-extrabold leading-[19px] text-market-ink"
          }
        >
          {title}
        </Text>
        <Text className="text-xs leading-[17px] text-market-muted-ink">
          {detail}
        </Text>
      </View>
      {trailing ??
        (onPress ? (
          <Icon
            className="size-[17px] text-market-muted-ink"
            name="ChevronRight"
          />
        ) : null)}
    </>
  )
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      className={cn(rowClass, "active:bg-market-soft-band")}
      haptic
      onPress={onPress}
      transition
    >
      {content}
    </Pressable>
  ) : (
    <View className={rowClass}>{content}</View>
  )
}

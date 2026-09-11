import type { ReactNode } from "react"
import type { AppLockManagementProps } from "./app-lock-presentation"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { cn } from "@/lib/utils"

export function AppLockManagement(props: AppLockManagementProps) {
  const market = useMobileDesign("app-lock") === "market-day"
  return (
    <View className="grow justify-between gap-6">
      <View className={market ? "border-t border-market-line" : "gap-3"}>
        <ManagementRow
          icon="SecurityPassword"
          title={props.hasLock ? "Change PIN code" : "Create PIN code"}
          detail={
            props.hasLock
              ? "Change the 6 digit PIN used to unlock this app."
              : "Create a 6 digit PIN before turning on fingerprint unlock."
          }
          onPress={props.hasLock ? props.onChangePin : props.onCreatePin}
        />
        <ManagementRow
          icon="FingerPrintScan"
          title="Fingerprint unlock"
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
            detail="Turn off PIN and fingerprint unlock on this phone."
            danger
            onPress={props.onDisable}
          />
        ) : null}
      </View>
      {props.message ? (
        <Text
          accessibilityLiveRegion="polite"
          className={
            market
              ? "text-center text-xs font-semibold leading-[18px] text-market-muted-ink"
              : "text-center text-xs font-medium leading-5 text-muted-foreground"
          }
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
  const market = useMobileDesign("app-lock") === "market-day"
  const rowClass = cn(
    market
      ? "min-h-[82px] flex-row items-center gap-3 border-b border-market-line px-1 py-3"
      : "min-h-[76px] flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3",
    disabled && "opacity-50",
  )
  const content = (
    <>
      <View
        className={
          market
            ? "size-[42px] items-center justify-center rounded-full bg-market-soft-band"
            : "size-10 items-center justify-center rounded-full bg-muted"
        }
      >
        <Icon
          className={
            market
              ? danger
                ? "size-[21px] text-market-paprika"
                : "size-[21px] text-market-ink"
              : danger
                ? "size-base text-destructive"
                : "size-base text-muted-foreground"
          }
          name={icon}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text
          className={
            market
              ? danger
                ? "text-sm font-extrabold leading-[19px] text-market-paprika"
                : "text-sm font-extrabold leading-[19px] text-market-ink"
              : danger
                ? "text-sm font-semibold text-destructive"
                : "text-sm font-semibold text-foreground"
          }
        >
          {title}
        </Text>
        <Text
          className={
            market
              ? "text-xs leading-[17px] text-market-muted-ink"
              : "text-xs leading-4 text-muted-foreground"
          }
        >
          {detail}
        </Text>
      </View>
      {trailing ??
        (onPress ? (
          <Icon
            className={
              market
                ? "size-[17px] text-market-muted-ink"
                : "size-sm text-muted-foreground"
            }
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
      className={cn(
        rowClass,
        market ? "active:bg-market-soft-band" : "active:bg-accent",
      )}
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

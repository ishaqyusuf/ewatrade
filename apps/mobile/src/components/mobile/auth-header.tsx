import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import type { LinkProps } from "expo-router"
import type { ComponentProps, ReactNode } from "react"
import { View } from "react-native"
import Svg, { Path } from "react-native-svg"
import { ActionButton } from "./action-button"

type AuthHeaderProps = {
  align?: "center" | "start"
  badge?: string
  icon?: IconKeys
  subtitle: string
  title: string
}

const GOOGLE_LOGO_COLORS = {
  blue: "rgb(66, 133, 244)",
  green: "rgb(52, 168, 83)",
  red: "rgb(234, 67, 53)",
  yellow: "rgb(251, 188, 5)",
} as const

export function AuthHeader({
  align = "start",
  badge,
  icon = "Building2",
  subtitle,
  title,
}: AuthHeaderProps) {
  const isCentered = align === "center"
  const colors = useColors()

  return (
    <View className={cn("gap-6", isCentered && "items-center")}>
      <View
        className={cn(
          "w-full flex-row items-center gap-3",
          isCentered ? "justify-center" : "justify-between",
        )}
      >
        <View className="flex-row items-center gap-3">
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.primary,
              borderRadius: 999,
              height: 44,
              justifyContent: "center",
              width: 44,
            }}
          >
            <Icon className="size-base text-primary-foreground" name={icon} />
          </View>
          <View
            style={{
              backgroundColor: colors.border,
              height: 1,
              width: 40,
            }}
          />
        </View>
        {badge ? (
          <Text className="text-xs font-bold uppercase tracking-[1.5px] text-primary">
            {badge}
          </Text>
        ) : null}
      </View>
      <View className={cn("gap-3", isCentered && "items-center")}>
        <Text
          className={cn(
            "text-[34px] font-bold leading-[39px] text-foreground",
            isCentered && "text-center",
          )}
        >
          {title}
        </Text>
        <Text
          className={cn(
            "text-base leading-6 text-muted-foreground",
            isCentered && "text-center",
          )}
        >
          {subtitle}
        </Text>
      </View>
    </View>
  )
}

type AuthBrandHeaderProps = {
  subtitle: string
  title: string
}

export function AuthBrandHeader({ subtitle, title }: AuthBrandHeaderProps) {
  const colors = useColors()

  return (
    <View className="items-center gap-5">
      <View className="items-center gap-3">
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.primary,
            borderRadius: 18,
            height: 54,
            justifyContent: "center",
            width: 54,
          }}
        >
          <Icon className="size-lg text-primary-foreground" name="Wallet" />
        </View>
        <Text className="text-[28px] font-bold leading-8 text-primary">
          EwaTrade
        </Text>
      </View>
      <View className="items-center gap-2">
        <Text className="text-center text-xl font-bold leading-6 text-foreground">
          {title}
        </Text>
        <Text className="max-w-[260px] text-center text-xs leading-5 text-muted-foreground">
          {subtitle}
        </Text>
      </View>
    </View>
  )
}

type AuthMethodButtonProps = {
  brandIcon?: "google"
  disabled?: boolean
  icon?: IconKeys
  label: string
  loadingLabel?: string
  onPress: () => void
  pending?: boolean
  tone?: "primary" | "subtle"
}

export function AuthMethodButton({
  brandIcon,
  disabled,
  icon = "Globe",
  label,
  loadingLabel,
  onPress,
  pending,
  tone = "subtle",
}: AuthMethodButtonProps) {
  const colors = useColors()
  const isPrimary = tone === "primary"

  return (
    <Pressable
      disabled={disabled}
      haptic
      onPress={onPress}
      style={{
        backgroundColor: isPrimary ? colors.primary : colors.card,
        borderColor: isPrimary ? colors.primary : colors.border,
        borderRadius: 12,
        borderWidth: 1,
        opacity: disabled ? 0.55 : 1,
        paddingHorizontal: 12,
      }}
      transition
    >
      <View className="min-h-[50px] flex-row items-center justify-center gap-2.5">
        <View
          style={{
            alignItems: "center",
            backgroundColor: isPrimary ? colors.primaryForeground : colors.card,
            borderColor: isPrimary ? colors.primaryForeground : colors.border,
            borderRadius: 999,
            borderWidth: 1,
            height: 28,
            justifyContent: "center",
            width: 28,
          }}
        >
          {brandIcon === "google" ? (
            <GoogleLogo />
          ) : (
            <Icon
              className={cn(
                "size-sm",
                isPrimary ? "text-primary" : "text-muted-foreground",
              )}
              name={icon}
            />
          )}
        </View>
        <Text
          className={cn(
            "text-sm font-bold",
            isPrimary ? "text-primary-foreground" : "text-foreground",
          )}
          numberOfLines={1}
        >
          {pending && loadingLabel ? loadingLabel : label}
        </Text>
      </View>
    </Pressable>
  )
}

function GoogleLogo() {
  return (
    <Svg height={18} viewBox="0 0 18 18" width={18}>
      <Path
        d="M17.64 9.2045c0-.6382-.0573-1.2527-.1636-1.8409H9v3.4818h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2582h2.9082c1.7018-1.5677 2.6841-3.8741 2.6841-6.6155z"
        fill={GOOGLE_LOGO_COLORS.blue}
      />
      <Path
        d="M9 18c2.43 0 4.4673-.8059 5.956-2.18l-2.9083-2.2582c-.8059.54-1.8368.8591-3.0477.8591-2.3441 0-4.3282-1.5832-5.036-3.7105H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
        fill={GOOGLE_LOGO_COLORS.green}
      />
      <Path
        d="M3.964 10.7104c-.18-.54-.2827-1.1168-.2827-1.7104s.1027-1.1705.2827-1.7105V4.9577H.9573C.3477 6.1727 0 7.5477 0 9s.3477 2.8273.9573 4.0423l3.0068-2.3319z"
        fill={GOOGLE_LOGO_COLORS.yellow}
      />
      <Path
        d="M9 3.5791c1.3214 0 2.5077.4541 3.4405 1.3464l2.58-2.58C13.4627.8918 11.425 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9577L3.964 7.2895C4.6718 5.1623 6.6559 3.5791 9 3.5791z"
        fill={GOOGLE_LOGO_COLORS.red}
      />
    </Svg>
  )
}

type AuthDividerProps = {
  label: string
}

export function AuthDivider({ label }: AuthDividerProps) {
  const colors = useColors()

  return (
    <View className="flex-row items-center gap-3">
      <View style={{ backgroundColor: colors.border, height: 1, flex: 1 }} />
      <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
        {label}
      </Text>
      <View style={{ backgroundColor: colors.border, height: 1, flex: 1 }} />
    </View>
  )
}

type AuthFooterActionProps = {
  eyebrow: string
  href: LinkProps["href"]
  icon?: IconKeys
  label: string
}

export function AuthFooterAction({
  eyebrow,
  href,
  label,
}: AuthFooterActionProps) {
  return (
    <Pressable
      className="items-center justify-center active:opacity-80"
      haptic
      href={href}
      transition
    >
      <Text className="text-center text-xs leading-5 text-muted-foreground">
        {eyebrow} <Text className="font-bold text-primary">{label}</Text>
      </Text>
    </Pressable>
  )
}

type AuthActionButtonProps = Omit<
  ComponentProps<typeof ActionButton>,
  "children"
> & {
  children: ReactNode
}

export function AuthActionButton({
  children,
  ...props
}: AuthActionButtonProps) {
  return <ActionButton {...props}>{children}</ActionButton>
}

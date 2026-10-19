import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import type { LinkProps } from "expo-router"
import type { ComponentProps, ReactNode } from "react"
import { View } from "react-native"
import Svg, { Path } from "react-native-svg"
import { ActionButton } from "./action-button"
import { BrandMark, BrandWordmark } from "./brand"
import { WhatsAppMark } from "./whatsapp-mark"

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
  const { colorScheme } = useColorScheme()
  const largeTextLayout = useLargeTextLayout()

  return (
    <View className={cn(largeTextLayout ? "gap-4" : "items-center gap-5")}>
      <View
        className={cn(
          "gap-3",
          largeTextLayout
            ? "flex-row items-center"
            : "items-center justify-center",
        )}
      >
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
          <BrandMark color={colors.primaryForeground} size={32} />
        </View>
        <BrandWordmark reverse={colorScheme === "dark"} width={145} />
      </View>
      <View className={cn("gap-2", !largeTextLayout && "items-center")}>
        <Text
          className={cn(
            "text-xl font-bold leading-6 text-foreground",
            largeTextLayout ? "text-left" : "text-center",
          )}
        >
          {title}
        </Text>
        <Text
          className={cn(
            "text-xs [-rn-line-height:22] text-muted-foreground",
            largeTextLayout ? "w-full text-left" : "max-w-[260px] text-center",
          )}
        >
          {subtitle}
        </Text>
      </View>
    </View>
  )
}

type AuthMethodButtonProps = {
  brandIcon?: "google" | "whatsapp"
  disabled?: boolean
  icon?: IconKeys
  label: string
  loadingLabel?: string
  onPress: () => void
  pending?: boolean
  tone?: "primary" | "subtle"
  /** Green Till 03: 48pt, plain brand mark, heavier label. */
  variant?: "default" | "sso"
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
  variant = "default",
}: AuthMethodButtonProps) {
  const colors = useColors()
  const isPrimary = tone === "primary"
  if (variant === "sso")
    return (
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        haptic
        onPress={onPress}
        style={{
          alignItems: "center",
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1.5,
          flexDirection: "row",
          gap: 9,
          justifyContent: "center",
          minHeight: 48,
          opacity: disabled ? 0.45 : 1,
          paddingHorizontal: 12,
        }}
        transition
      >
        {brandIcon === "google" ? (
          <GoogleLogo />
        ) : brandIcon === "whatsapp" ? (
          <WhatsAppMark />
        ) : (
          <Icon className="size-sm text-foreground" name={icon} />
        )}
        <Text
          className="text-base font-extrabold [-rn-line-height:22] text-foreground"
          numberOfLines={1}
        >
          {pending && loadingLabel ? loadingLabel : label}
        </Text>
      </Pressable>
    )

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
        {brandIcon === "whatsapp" ? (
          <WhatsAppMark size={26} />
        ) : (
          <View
            style={{
              alignItems: "center",
              backgroundColor: isPrimary
                ? colors.primaryForeground
                : colors.card,
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
        )}
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
  /** Lowercase, untracked label for the Green Till 03 auth screens. */
  plain?: boolean
}

export function AuthDivider({ label, plain = false }: AuthDividerProps) {
  const colors = useColors()

  return (
    <View className="flex-row items-center gap-3">
      <View style={{ backgroundColor: colors.border, height: 1, flex: 1 }} />
      <Text
        className={
          plain
            ? "text-xs font-bold text-muted-foreground"
            : "text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground"
        }
      >
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
      <Text className="text-center text-xs [-rn-line-height:22] text-muted-foreground">
        {eyebrow}{" "}
        <Text className="text-xs font-extrabold text-primary">{label}</Text>
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

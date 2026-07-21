import { Button, type ButtonProps } from "@/components/ui/button"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import { ActivityIndicator, Text as NativeText } from "react-native"

type ActionButtonProps = ButtonProps & {
  children: ReactNode
  icon?: IconKeys
  isLoading?: boolean
  loadingLabel?: string
  textScale?: 1 | 1.5
  trailingIcon?: IconKeys
}

export function ActionButton({
  children,
  className,
  disabled,
  icon,
  isLoading,
  loadingLabel,
  textScale = 1,
  trailingIcon,
  variant,
  ...props
}: ActionButtonProps) {
  const colors = useColors()
  const isDisabled = !!disabled || !!isLoading
  const isDefaultVariant = !variant || variant === "default"
  const isOutlineVariant = variant === "outline"
  const foregroundClassName = cn(
    "text-sm font-bold leading-5",
    isDefaultVariant &&
      (isDisabled ? "text-muted-foreground" : "text-primary-foreground"),
    isOutlineVariant && "text-foreground",
    variant === "destructive" && "text-destructive",
    variant === "secondary" && "text-secondary-foreground",
    variant === "ghost" && "text-foreground",
    variant === "link" && "text-primary",
  )
  const foregroundColor = isDisabled
    ? colors.mutedForeground
    : isDefaultVariant
      ? colors.primaryForeground
      : isOutlineVariant || variant === "ghost"
        ? colors.foreground
        : variant === "destructive"
          ? colors.destructive
          : variant === "secondary"
            ? colors.secondaryForeground
            : colors.primary
  const iconClassName = cn("size-sm", foregroundClassName)

  return (
    <Button
      accessibilityState={{
        ...props.accessibilityState,
        busy: !!isLoading,
        disabled: isDisabled,
      }}
      className={cn(
        textScale === 1.5
          ? "min-h-[60px] w-full rounded-xl px-[18px]"
          : "min-h-[50px] w-full rounded-xl px-[18px]",
        isDefaultVariant &&
          (isDisabled
            ? "bg-muted active:bg-muted"
            : "bg-primary active:bg-primary/90"),
        isOutlineVariant && "bg-muted/60 active:bg-accent",
        variant === "destructive" &&
          "bg-destructive/10 active:bg-destructive/20",
        className,
      )}
      disabled={isDisabled}
      size="lg"
      variant={variant ?? "default"}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator
          color={isDisabled ? colors.mutedForeground : colors.successForeground}
          size="small"
        />
      ) : icon ? (
        <Icon className={iconClassName} name={icon} />
      ) : null}
      <NativeText
        numberOfLines={1}
        style={{
          color: foregroundColor,
          fontSize: 14 * textScale,
          fontWeight: "700",
          lineHeight: 20 * textScale,
        }}
      >
        {isLoading && loadingLabel ? loadingLabel : children}
      </NativeText>
      {!isLoading && trailingIcon ? (
        <Icon className={iconClassName} name={trailingIcon} />
      ) : null}
    </Button>
  )
}

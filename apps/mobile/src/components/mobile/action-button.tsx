import { Button, type ButtonProps } from "@/components/ui/button"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import { ActivityIndicator } from "react-native"

type ActionButtonProps = ButtonProps & {
  children: ReactNode
  icon?: IconKeys
  isLoading?: boolean
  loadingLabel?: string
  trailingIcon?: IconKeys
}

export function ActionButton({
  children,
  className,
  disabled,
  icon,
  isLoading,
  loadingLabel,
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
  const iconClassName = cn("size-sm", foregroundClassName)

  return (
    <Button
      accessibilityState={{
        ...props.accessibilityState,
        busy: !!isLoading,
        disabled: isDisabled,
      }}
      className={cn(
        "min-h-[50px] w-full rounded-xl px-[18px]",
        isDefaultVariant &&
          (isDisabled
            ? "bg-muted active:bg-muted"
            : "bg-primary active:bg-primary/90"),
        isOutlineVariant && "bg-muted/60 active:bg-accent",
        variant === "destructive" && "bg-destructive/10 active:bg-destructive/20",
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
      <Text className={foregroundClassName} numberOfLines={1}>
        {isLoading && loadingLabel ? loadingLabel : children}
      </Text>
      {!isLoading && trailingIcon ? (
        <Icon className={iconClassName} name={trailingIcon} />
      ) : null}
    </Button>
  )
}

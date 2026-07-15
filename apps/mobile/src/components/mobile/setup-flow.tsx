import { StatusBadge } from "@/components/mobile/status-badge"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import type { MobileDesignStatusTone } from "@/lib/design-foundation"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import { View } from "react-native"

type SetupFlowHeaderProps = {
  badgeIcon?: IconKeys
  badgeLabel: string
  badgeTone?: MobileDesignStatusTone
  currentStep: number
  description: string
  steps: string[]
  title: string
}

export function SetupFlowHeader({
  badgeIcon,
  badgeLabel,
  badgeTone = "primary",
  currentStep,
  description,
  steps,
  title,
}: SetupFlowHeaderProps) {
  return (
    <View className="gap-5">
      <View className="gap-3">
        <StatusBadge icon={badgeIcon} label={badgeLabel} tone={badgeTone} />
        <View className="gap-2">
          <Text className="text-2xl font-extrabold leading-8 text-foreground">
            {title}
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {description}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        {steps.map((step, index) => {
          const stepNumber = index + 1
          const isComplete = stepNumber < currentStep
          const isActive = stepNumber === currentStep

          return (
            <View className="min-w-0 flex-1 gap-2" key={step}>
              <View
                className={cn(
                  "h-1.5 rounded-full",
                  isActive || isComplete ? "bg-primary" : "bg-muted",
                )}
              />
              <Text
                className={cn(
                  "text-[11px] font-bold uppercase tracking-[1px]",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
                numberOfLines={1}
              >
                {step}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

type SetupSectionProps = {
  children: ReactNode
  description?: string
  title: string
}

export function SetupSection({
  children,
  description,
  title,
}: SetupSectionProps) {
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="text-base font-extrabold text-foreground">
          {title}
        </Text>
        {description ? (
          <Text className="text-xs leading-5 text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}

type SetupChoicePillProps = {
  children: ReactNode
  onPress: () => void
  selected?: boolean
}

export function SetupChoicePill({
  children,
  onPress,
  selected,
}: SetupChoicePillProps) {
  return (
    <Pressable
      className={cn(
        "min-h-10 items-center justify-center rounded-full px-4",
        selected ? "bg-primary" : "border border-border bg-background",
      )}
      haptic
      onPress={onPress}
      transition
    >
      <Text
        className={cn(
          "text-xs font-bold",
          selected ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {children}
      </Text>
    </Pressable>
  )
}

type SetupInlineNoticeProps = {
  icon: IconKeys
  text: string
  tone?: MobileDesignStatusTone
}

const noticeToneClassNames: Record<MobileDesignStatusTone, string> = {
  default: "text-muted-foreground",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warn",
}

export function SetupInlineNotice({
  icon,
  text,
  tone = "default",
}: SetupInlineNoticeProps) {
  const toneClassName = noticeToneClassNames[tone]

  return (
    <View className="flex-row items-start gap-2 border-y border-border py-3">
      <Icon className={cn("mt-0.5 size-sm", toneClassName)} name={icon} />
      <Text className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
        {text}
      </Text>
    </View>
  )
}

type SetupSummaryRowProps = {
  label: string
  value: string
}

export function SetupSummaryRow({ label, value }: SetupSummaryRowProps) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-border py-3">
      <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
        {label}
      </Text>
      <Text className="min-w-0 flex-1 text-right text-sm font-bold text-foreground">
        {value}
      </Text>
    </View>
  )
}

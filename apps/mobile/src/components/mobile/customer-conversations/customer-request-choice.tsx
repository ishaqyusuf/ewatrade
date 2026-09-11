import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { resolveCustomerRequestChoicePresentation } from "./customer-request-choice-presentation"
import type { CustomerRequestTarget } from "./use-customer-conversation-detail"

type Timeline =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]

export function CustomerRequestChoice({
  disabled,
  onSelect,
  requestKinds,
  requests,
  selecting,
}: {
  disabled: boolean
  onSelect: (target: CustomerRequestTarget) => void
  requestKinds: Timeline["availableRequestKinds"]
  requests: Timeline["requests"]
  selecting: boolean
}) {
  const presentation = resolveCustomerRequestChoicePresentation({
    requestKinds,
    requests,
  })

  return (
    <View className="w-full gap-1">
      <Text className="text-base font-bold text-foreground">
        {presentation.heading}
      </Text>
      <Text className="text-xs leading-5 text-muted-foreground">
        {presentation.lead}
      </Text>
      <View className="mt-1">
        {presentation.options.map((option, index) => (
          <ChoiceRow
            description={option.description}
            disabled={disabled}
            key={option.key}
            label={option.label}
            last={index === presentation.options.length - 1}
            onPress={() => onSelect(option.target)}
            primary={option.primary}
            selecting={selecting}
          />
        ))}
      </View>
    </View>
  )
}

function ChoiceRow({
  description,
  disabled,
  label,
  last,
  onPress,
  primary = false,
  selecting,
}: {
  description: string
  disabled: boolean
  label: string
  last: boolean
  onPress: () => void
  primary?: boolean
  selecting: boolean
}) {
  return (
    <Pressable
      accessibilityLabel={
        primary ? `Start a ${label.toLowerCase()}` : `Continue ${label}`
      }
      accessibilityRole="button"
      accessibilityHint={selecting ? "Selection in progress" : undefined}
      accessibilityState={{ busy: selecting, disabled }}
      className={`min-h-[58px] flex-row items-center gap-3 border-t border-border px-2 py-2 disabled:opacity-50 ${last ? "border-b" : ""}`}
      disabled={disabled}
      haptic
      onPress={onPress}
    >
      <View
        className={`size-9 items-center justify-center rounded-full ${primary ? "bg-primary" : "bg-muted"}`}
      >
        <Icon
          className={`size-sm ${primary ? "text-primary-foreground" : "text-muted-foreground"}`}
          name={primary ? "Plus" : "Link"}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
          {label}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {description}
        </Text>
      </View>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}

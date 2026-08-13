import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { CustomerRequestTarget } from "./use-customer-conversation-detail"

type Timeline =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]

export function CustomerRequestChoice({
  disabled,
  onSelect,
  requestKinds,
  requests,
}: {
  disabled: boolean
  onSelect: (target: CustomerRequestTarget) => void
  requestKinds: Timeline["availableRequestKinds"]
  requests: Timeline["requests"]
}) {
  return (
    <View className="ml-auto w-[92%] gap-2 rounded-2xl border border-border bg-card p-3">
      <Text className="font-bold text-foreground">
        What is this message about?
      </Text>
      <Text className="text-xs leading-5 text-muted-foreground">
        Choose where it belongs. EwaTrade will not infer this from your message.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {requests
          .filter((request) => request.lifecycle === "active")
          .map((request) => (
            <ChoiceButton
              disabled={disabled}
              key={`${request.kind}:${request.id}`}
              label={`Continue ${request.label}`}
              onPress={() =>
                onSelect({
                  kind: "existing_request",
                  requestId: request.id,
                  requestKind: request.kind,
                })
              }
            />
          ))}
        {requestKinds.includes("product_inquiry") ? (
          <ChoiceButton
            disabled={disabled}
            label="New product request"
            onPress={() => onSelect({ kind: "new_commerce_inquiry" })}
            primary
          />
        ) : null}
      </View>
      {requestKinds.some((kind) => kind !== "product_inquiry") ? (
        <Text className="text-xs text-muted-foreground">
          New service and prescription intake will be added to the app next.
        </Text>
      ) : null}
    </View>
  )
}

function ChoiceButton({
  disabled,
  label,
  onPress,
  primary = false,
}: {
  disabled: boolean
  label: string
  onPress: () => void
  primary?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className={
        primary
          ? "min-h-11 justify-center rounded-full bg-primary px-4"
          : "min-h-11 justify-center rounded-full border border-border px-4"
      }
      disabled={disabled}
      haptic
      onPress={onPress}
    >
      <Text
        className={
          primary
            ? "text-sm font-bold text-primary-foreground"
            : "text-sm font-bold text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

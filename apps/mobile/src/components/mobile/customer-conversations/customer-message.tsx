import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

type Message =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["messages"][number]

export function CustomerMessage({ message }: { message: Message }) {
  const isCustomer = message.author.kind === "customer"
  return (
    <View className={isCustomer ? "items-end" : "items-start"}>
      <View
        className={
          isCustomer
            ? "max-w-[86%] gap-1 rounded-2xl rounded-br-md bg-primary px-4 py-3"
            : "max-w-[86%] gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3"
        }
      >
        {message.request ? (
          <Text
            className={
              isCustomer
                ? "text-[11px] font-bold uppercase text-primary-foreground/75"
                : "text-[11px] font-bold uppercase text-muted-foreground"
            }
          >
            {message.request.kind.replaceAll("_", " ")}
          </Text>
        ) : null}
        <Text
          className={
            isCustomer
              ? "leading-6 text-primary-foreground"
              : "leading-6 text-foreground"
          }
        >
          {message.text}
        </Text>
        <Text
          className={
            isCustomer
              ? "text-[11px] text-primary-foreground/70"
              : "text-[11px] text-muted-foreground"
          }
        >
          {message.author.label} · {message.channel}
        </Text>
      </View>
    </View>
  )
}

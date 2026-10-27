import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { generalMoney } from "@ewatrade/assistant/general/contracts"
import * as Clipboard from "expo-clipboard"
import { useState } from "react"
import { Linking, Share } from "react-native"
import { ActionButton } from "../action-button"
import { ListCard } from "../green-till/kit"
import {
  type PaymentLink,
  type PaymentLinksReceipt,
  paymentLinkMessage,
} from "./native-payment-links-values"

function LinkRow({
  link,
  businessName,
}: {
  link: PaymentLink
  businessName?: string
}) {
  const [status, setStatus] = useState<string | null>(null)
  const large = useLargeTextLayout()
  const actionClass = large ? "w-full" : "min-h-[44px] w-auto px-3"
  const message = paymentLinkMessage(link, businessName)
  const copy = (text: string, done: string) =>
    void Clipboard.setStringAsync(text).then(
      () => setStatus(done),
      () => setStatus("Copy didn’t work. Try Share instead."),
    )
  return (
    <View className="gap-2 py-3">
      <View className="flex-row flex-wrap items-baseline justify-between gap-2">
        <Text className="text-base [-rn-line-height:22] font-bold text-foreground">
          {link.orderNumber}
          {link.customerName ? (
            <Text className="font-normal text-muted-foreground">
              {" "}
              · {link.customerName}
            </Text>
          ) : null}
        </Text>
        <Text className="text-base [-rn-line-height:22] font-bold tabular-nums text-foreground">
          {generalMoney(link.amountMinor, link.currencyCode)}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        className="text-sm [-rn-line-height:22] text-muted-foreground"
      >
        {link.url}
      </Text>
      <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
        Expires{" "}
        {new Date(link.expiresAt).toLocaleString([], {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <ActionButton
          className={actionClass}
          variant="outline"
          icon="Copy"
          onPress={() => copy(link.url, "Link copied.")}
        >
          Copy link
        </ActionButton>
        <ActionButton
          className={actionClass}
          variant="outline"
          icon="Copy"
          onPress={() => copy(message, "Message copied.")}
        >
          Copy message
        </ActionButton>
        <ActionButton
          className={actionClass}
          variant="outline"
          icon="Share"
          onPress={() =>
            void Share.share({ message }).catch(() =>
              setStatus("Sharing didn’t open. Copy the message instead."),
            )
          }
        >
          Share
        </ActionButton>
        {link.whatsappUrl ? (
          <ActionButton
            className={actionClass}
            variant="outline"
            icon="WhatsApp"
            onPress={() => {
              if (link.whatsappUrl)
                void Linking.openURL(link.whatsappUrl).catch(() =>
                  setStatus("WhatsApp didn’t open. Copy the message instead."),
                )
            }}
          >
            WhatsApp
          </ActionButton>
        ) : null}
      </View>
      {status ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-sm text-muted-foreground"
        >
          {status}
        </Text>
      ) : null}
    </View>
  )
}

/** Created payment links: one row per link with copy and share; no record to open. */
export function PaymentLinksResult({
  receipt,
  businessName,
}: {
  receipt: PaymentLinksReceipt
  businessName?: string
}) {
  return (
    <View className="gap-3">
      <Text className="text-base [-rn-line-height:22] font-bold text-foreground">
        {receipt.title}
      </Text>
      <ListCard>
        {receipt.links.map((link) => (
          <LinkRow key={link.orderId} link={link} businessName={businessName} />
        ))}
      </ListCard>
      <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
        Nothing was sent and no payment was recorded.
      </Text>
    </View>
  )
}

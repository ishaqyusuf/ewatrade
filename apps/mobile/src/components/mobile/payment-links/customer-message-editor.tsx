import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { Textarea } from "@/components/ui/textarea"
import { View } from "@/components/ui/view"
import * as Clipboard from "expo-clipboard"
import { useState } from "react"
import { Linking, Share } from "react-native"
import { whatsAppWithText } from "./payment-link-model"

/**
 * A prepared message the merchant edits and sends by hand. WhatsApp opens
 * with the text (they press Send there); nothing is sent automatically.
 */
export function CustomerMessageEditor({
  initialText,
  label,
  noPhoneMessage,
  whatsappUrl,
}: {
  initialText: string
  label: string
  /** Shown when the Order has no saved customer phone. */
  noPhoneMessage: string
  whatsappUrl: string | null
}) {
  const [text, setText] = useState(initialText)
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const target = whatsAppWithText(whatsappUrl, text.trim())
  const empty = !text.trim()
  return (
    <View className="gap-3">
      {whatsappUrl ? (
        <Text className="text-xs text-muted-foreground">
          Opens WhatsApp with the customer's saved number. You press Send there.
        </Text>
      ) : (
        <StatusBanner icon="Info" message={noPhoneMessage} tone="muted" />
      )}
      <Textarea
        accessibilityLabel={label}
        className="min-h-36 rounded-2xl border-0 bg-card px-3.5 py-3 text-base"
        numberOfLines={8}
        onChangeText={(value) => {
          setText(value)
          setStatus(null)
        }}
        value={text}
      />
      {target ? (
        <ActionButton
          disabled={empty}
          icon="WhatsApp"
          onPress={() => {
            setProblem(null)
            void Linking.openURL(target).then(
              () => setStatus("WhatsApp opened. Send it there."),
              () =>
                setProblem(
                  "WhatsApp couldn't be opened on this phone. Copy the message instead.",
                ),
            )
          }}
        >
          Open WhatsApp
        </ActionButton>
      ) : null}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <ActionButton
            disabled={empty}
            icon="Copy"
            variant={target ? "outline" : "default"}
            onPress={() => {
              setProblem(null)
              void Clipboard.setStringAsync(text).then(
                () => setStatus("Message copied."),
                () => setProblem("Copy didn't work. Select the text instead."),
              )
            }}
          >
            {target ? "Copy" : "Copy message"}
          </ActionButton>
        </View>
        {target ? (
          <View className="flex-1">
            <ActionButton
              disabled={empty}
              icon="Share"
              variant="outline"
              onPress={() => {
                setProblem(null)
                void Share.share({ message: text }).catch(() =>
                  setProblem(
                    "Sharing isn't available. Copy the message instead.",
                  ),
                )
              }}
            >
              Share
            </ActionButton>
          </View>
        ) : null}
      </View>
      {status ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-xs text-muted-foreground"
        >
          {status}
        </Text>
      ) : null}
      {problem ? <StatusBanner tone="destructive" message={problem} /> : null}
    </View>
  )
}

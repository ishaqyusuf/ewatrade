import { ActionButton } from "@/components/mobile/action-button"
import { PhoneField } from "@/components/mobile/phone-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { Textarea } from "@/components/ui/textarea"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { businessCountryCode } from "@/lib/business-country"
import { useBusinessStore } from "@/store/businessStore"
import { getCountry } from "@ewatrade/utils/countries"
import * as Clipboard from "expo-clipboard"
import { useState } from "react"
import { Linking, Share } from "react-native"
import { whatsAppDraftToNumber, whatsAppWithText } from "./payment-link-model"

/**
 * A prepared message the merchant edits and sends by hand. WhatsApp opens
 * with the text (they press Send there); nothing is sent automatically.
 * Without a saved customer phone, the merchant can type a number for this
 * draft only; it isn't saved anywhere.
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
  const savedTarget = whatsAppWithText(whatsappUrl, text.trim())
  const empty = !text.trim()

  const openDraft = (url: string, opened: string) => {
    setProblem(null)
    void Linking.openURL(url).then(
      () => setStatus(opened),
      () =>
        setProblem(
          "WhatsApp couldn't be opened on this phone. Copy the message instead.",
        ),
    )
  }

  return (
    <View className="gap-3">
      {savedTarget ? (
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
      {savedTarget ? (
        <ActionButton
          disabled={empty}
          icon="WhatsApp"
          onPress={() =>
            openDraft(savedTarget, "WhatsApp opened. Send it there.")
          }
        >
          Open WhatsApp
        </ActionButton>
      ) : (
        <DraftRecipient
          disabled={empty}
          onOpen={(draft) =>
            openDraft(
              draft.url,
              `WhatsApp draft opened for ${draft.display}. Send it there.`,
            )
          }
          text={text.trim()}
        />
      )}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <ActionButton
            disabled={empty}
            icon="Copy"
            variant="outline"
            onPress={() => {
              setProblem(null)
              void Clipboard.setStringAsync(text).then(
                () => setStatus("Message copied."),
                () => setProblem("Copy didn't work. Select the text instead."),
              )
            }}
          >
            Copy
          </ActionButton>
        </View>
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

/**
 * WhatsApp for an Order without a saved phone: reveals a number field for
 * this one draft. Cancel forgets the number; the message text stays.
 */
function DraftRecipient({
  disabled,
  onOpen,
  text,
}: {
  disabled: boolean
  onOpen: (draft: { display: string; url: string }) => void
  text: string
}) {
  const { profile } = useAuthContext()
  const businessCountry = useBusinessStore(
    (s) => s.businesses.find((b) => b.id === profile?.businessId)?.country,
  )
  const defaultCountry = businessCountryCode(
    profile?.countryCode,
    businessCountry,
  )
  const [open, setOpen] = useState(false)
  const [countryCode, setCountryCode] = useState<string | null>(null)
  const [digits, setDigits] = useState("")
  const [invalid, setInvalid] = useState(false)
  const country = getCountry(countryCode ?? defaultCountry)

  if (!open)
    return (
      <ActionButton
        accessibilityHint="Asks for a number for this draft"
        disabled={disabled}
        icon="WhatsApp"
        onPress={() => setOpen(true)}
      >
        WhatsApp
      </ActionButton>
    )

  return (
    <View
      accessibilityLabel="WhatsApp recipient"
      className="gap-3 rounded-[20px] bg-card p-3.5 shadow-sm"
    >
      <View className="gap-1.5">
        <PhoneField
          countryCode={country.code}
          label="WhatsApp number"
          onChangeText={(next) => {
            setDigits(next)
            setInvalid(false)
          }}
          onCountryChange={(code) => {
            setCountryCode(code)
            setInvalid(false)
          }}
          value={digits}
        />
        {invalid ? (
          <Text
            accessibilityLiveRegion="assertive"
            className="text-xs font-medium text-destructive"
          >
            Enter a valid phone number for {country.name}, or pick its country.
          </Text>
        ) : (
          <Text className="text-xs text-muted-foreground">
            For this draft only. Your saved customer details stay the same.
          </Text>
        )}
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <ActionButton
            variant="outline"
            onPress={() => {
              setOpen(false)
              setDigits("")
              setCountryCode(null)
              setInvalid(false)
            }}
          >
            Cancel
          </ActionButton>
        </View>
        <View className="flex-1">
          <ActionButton
            accessibilityLabel="Open WhatsApp draft"
            disabled={disabled || !digits}
            icon="WhatsApp"
            onPress={() => {
              const draft = whatsAppDraftToNumber(
                country.dialCode,
                digits,
                text,
              )
              if (!draft) {
                setInvalid(true)
                return
              }
              onOpen(draft)
            }}
          >
            Open draft
          </ActionButton>
        </View>
      </View>
    </View>
  )
}

import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useState } from "react"

type LegalAcceptancePanelProps = {
  version: string
  effectiveDate: string
  accepted: boolean
  pending: boolean
  onOpenPolicy: (path: "terms" | "privacy") => void
  onAccept: (version: string) => void
}

export function LegalAcceptancePanel({
  version,
  effectiveDate,
  accepted,
  pending,
  onOpenPolicy,
  onAccept,
}: LegalAcceptancePanelProps) {
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acknowledgedPrivacyNotice, setAcknowledgedPrivacyNotice] =
    useState(false)

  return (
    <View className="gap-3 rounded-lg border border-border p-4">
      <Text className="text-lg font-bold text-foreground">
        Terms and privacy
      </Text>
      <Text className="text-sm text-muted-foreground">
        Version {version} · Effective {effectiveDate}
      </Text>
      {accepted ? (
        <Text className="text-sm text-foreground">
          You accepted this version for your account.
        </Text>
      ) : (
        <>
          <Text className="text-sm leading-5 text-muted-foreground">
            Review both documents before accepting this version. A Privacy
            Notice acknowledgment is not consent to optional marketing.
          </Text>
          <Pressable
            accessibilityRole="link"
            className="min-h-11 justify-center"
            onPress={() => onOpenPolicy("terms")}
          >
            <Text className="font-semibold text-primary underline">
              Read Terms of Service
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            className="min-h-11 justify-center"
            onPress={() => onOpenPolicy("privacy")}
          >
            <Text className="font-semibold text-primary underline">
              Read Privacy Notice
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            className="min-h-11 justify-center"
            onPress={() => setAcceptedTerms((value) => !value)}
          >
            <Text className="text-foreground">
              {acceptedTerms ? "☑" : "☐"} I agree to the Terms of Service.
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acknowledgedPrivacyNotice }}
            className="min-h-11 justify-center"
            onPress={() => setAcknowledgedPrivacyNotice((value) => !value)}
          >
            <Text className="text-foreground">
              {acknowledgedPrivacyNotice ? "☑" : "☐"} I acknowledge the Privacy
              Notice.
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!acceptedTerms || !acknowledgedPrivacyNotice || pending}
            className="min-h-12 items-center justify-center rounded-lg bg-primary px-4 disabled:opacity-50"
            onPress={() => onAccept(version)}
          >
            <Text className="font-semibold text-primary-foreground">
              {pending ? "Recording…" : "Agree and acknowledge"}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  )
}

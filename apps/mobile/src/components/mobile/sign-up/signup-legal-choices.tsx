import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { publicLegalUrl } from "@/lib/public-legal-url"
import { useState } from "react"
import { Linking } from "react-native"

type SignupLegalChoicesProps = {
  effective: boolean
  signupAvailable: boolean
  version: string | null
  effectiveDate: string | null
  acceptedTerms: boolean
  acknowledgedPrivacyNotice: boolean
  onAcceptedTermsChange: (accepted: boolean) => void
  onAcknowledgedPrivacyNoticeChange: (acknowledged: boolean) => void
}

export function SignupLegalChoices({
  effective,
  signupAvailable,
  version,
  effectiveDate,
  acceptedTerms,
  acknowledgedPrivacyNotice,
  onAcceptedTermsChange,
  onAcknowledgedPrivacyNoticeChange,
}: SignupLegalChoicesProps) {
  const [linkError, setLinkError] = useState(false)
  const hasLegalPages = Boolean(publicLegalUrl("terms"))
  const openPolicy = async (path: "terms" | "privacy") => {
    const url = publicLegalUrl(path)
    if (!url) {
      setLinkError(true)
      return
    }
    try {
      await Linking.openURL(url)
      setLinkError(false)
    } catch {
      setLinkError(true)
    }
  }

  return (
    <View className="gap-2 border-t border-border pt-4">
      <Text className="font-semibold text-foreground">Terms and privacy</Text>
      <Text className="text-sm leading-5 text-muted-foreground">
        {effective
          ? hasLegalPages
            ? `Version ${version} · Effective ${effectiveDate}. Review both documents before creating your account.`
            : "Terms and Privacy are unavailable in this build. Account creation is disabled until they can be reviewed."
          : signupAvailable
            ? "These documents are under review. No legal acceptance is recorded yet."
            : "Account creation is paused until the Terms and Privacy Notice are effective."}
      </Text>
      <Pressable
        accessibilityRole="link"
        className="min-h-11 justify-center"
        onPress={() => void openPolicy("terms")}
      >
        <Text className="text-sm font-semibold text-primary underline">
          Read Terms of Service
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        className="min-h-11 justify-center"
        onPress={() => void openPolicy("privacy")}
      >
        <Text className="text-sm font-semibold text-primary underline">
          Read Privacy Notice
        </Text>
      </Pressable>
      {effective && hasLegalPages ? (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            className="min-h-11 justify-center"
            onPress={() => onAcceptedTermsChange(!acceptedTerms)}
          >
            <Text className="text-foreground">
              {acceptedTerms ? "☑" : "☐"} I agree to the Terms of Service.
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acknowledgedPrivacyNotice }}
            className="min-h-11 justify-center"
            onPress={() =>
              onAcknowledgedPrivacyNoticeChange(!acknowledgedPrivacyNotice)
            }
          >
            <Text className="text-foreground">
              {acknowledgedPrivacyNotice ? "☑" : "☐"} I acknowledge the Privacy
              Notice.
            </Text>
          </Pressable>
          <Text className="text-xs leading-5 text-muted-foreground">
            Privacy acknowledgment is not consent to optional marketing.
          </Text>
        </>
      ) : null}
      {linkError ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          The policy page is unavailable in this build or could not open. Try
          again when the approved pages are published.
        </Text>
      ) : null}
    </View>
  )
}

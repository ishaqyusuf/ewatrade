import NoAccessRoute from "@/app/no-access"
import { CustomerShellHeader } from "@/components/mobile/customer-conversations/customer-shell-header"
import { LegalAcceptancePanel } from "@/components/mobile/legal-acceptance-panel"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { Redirect, useLocalSearchParams } from "expo-router"
import { useState } from "react"

export default function CustomerAccountPrivacyQaRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const [showNoAccess, setShowNoAccess] = useState(mode === "no-access")
  const [acceptedLegal, setAcceptedLegal] = useState(false)
  if (!__DEV__) return <Redirect href="/design-system" />
  if (showNoAccess) return <NoAccessRoute />
  if (mode === "legal")
    return (
      <View className="flex-1 gap-6 bg-background px-5 py-6">
        <Text
          accessibilityRole="header"
          className="text-2xl font-bold text-foreground"
        >
          Account and privacy
        </Text>
        <LegalAcceptancePanel
          version="preview-only"
          effectiveDate="2026-09-25"
          accepted={acceptedLegal}
          pending={false}
          onOpenPolicy={() => {}}
          onAccept={() => setAcceptedLegal(true)}
        />
      </View>
    )

  return (
    <View className="flex-1 bg-background">
      <CustomerShellHeader
        accountControl={
          <Pressable
            accessibilityLabel="Linked device layout placeholder"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full bg-muted"
          >
            <Icon className="size-sm text-foreground" name="ShieldCheck" />
          </Pressable>
        }
        showAccountPrivacy
      />
      <View className="px-5 py-6">
        <Text className="text-muted-foreground">
          Development-only layout check for customer account controls.
        </Text>
        <Pressable
          accessibilityRole="button"
          className="min-h-12 justify-center"
          onPress={() => setShowNoAccess(true)}
        >
          <Text className="font-semibold text-primary">
            Preview no-workspace account
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

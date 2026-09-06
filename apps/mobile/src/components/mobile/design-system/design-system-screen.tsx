import { ActionButton } from "@/components/mobile/action-button"
import { AuthHeader } from "@/components/mobile/auth-header"
import { MobileScreen } from "@/components/mobile/screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { getAppVariant } from "@/lib/app-variant"
import { useRouter } from "expo-router"
import { ReferenceDecisionsSection } from "./reference-decisions/reference-decisions-section"

function isDesignSystemEnabled() {
  return __DEV__ || getAppVariant() !== "production"
}

function ProductionGuardNotice() {
  const appVariant = getAppVariant()
  const isEnabled = isDesignSystemEnabled()

  return (
    <StatusBanner
      icon={isEnabled ? "ShieldCheck" : "Lock"}
      message={
        isEnabled
          ? `Visible in ${appVariant} mode for design review and QA.`
          : "Hidden from production customer workflows."
      }
      title="Production visibility guard"
      tone={isEnabled ? "success" : "warning"}
    />
  )
}

export function DesignSystemScreen() {
  const router = useRouter()

  if (!isDesignSystemEnabled()) {
    return (
      <MobileScreen contentClassName="gap-4" keyboardBottomOffset={132} scroll>
        <AuthHeader
          badge="Internal"
          icon="Lock"
          subtitle="This approval surface is hidden from production customer workflows."
          title="Mobile Design System"
        />
        <ProductionGuardNotice />
      </MobileScreen>
    )
  }

  return (
    <MobileScreen contentClassName="gap-6" keyboardBottomOffset={132} scroll>
      <AuthHeader
        badge="Internal"
        icon="SlidersHorizontal"
        subtitle="Approve each reference-led mobile design before we move to the next one."
        title="Mobile Design System"
      />
      <ProductionGuardNotice />
      <ActionButton
        icon="WandSparkles"
        onPress={() => router.push("/design-system/startup-splash")}
        trailingIcon="ChevronRight"
        variant="outline"
      >
        Preview startup splash
      </ActionButton>
      <ActionButton
        icon="ShieldCheck"
        onPress={() => router.push("/design-system/staff-onboarding")}
        trailingIcon="ChevronRight"
        variant="outline"
      >
        Preview staff onboarding
      </ActionButton>
      <ActionButton
        icon="SecurityPassword"
        onPress={() => router.push("/design-system/app-lock")}
        trailingIcon="ChevronRight"
        variant="outline"
      >
        Preview app lock
      </ActionButton>
      <ReferenceDecisionsSection />
    </MobileScreen>
  )
}

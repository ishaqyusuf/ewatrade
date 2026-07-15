import { ActionButton } from "@/components/mobile/action-button"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { Image } from "react-native"
import { ReferenceScreenShell } from "../../references/reference-screen-shell"
import { DESIGN_01_PRIMARY_REFERENCE, DESIGN_01_ROUTES } from "./design-01.data"

export function Design01SourceImageScreen() {
  const reference = DESIGN_01_PRIMARY_REFERENCE

  return (
    <ReferenceScreenShell
      secondaryAccessibilityLabel="Open Design 01 home screen"
      secondaryHref={DESIGN_01_ROUTES.home}
      secondaryIcon="LayoutDashboard"
    >
      <View className="gap-5">
        <View className="gap-1">
          <Text className="text-xs font-bold uppercase tracking-[1px] text-primary">
            {reference.sourceLabel}
          </Text>
          <Text className="text-3xl font-extrabold leading-9 text-foreground">
            Source Image
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Use this fullscreen reference beside the implemented screen while
            checking spacing, hierarchy, and navigation rhythm.
          </Text>
        </View>

        <View className="overflow-hidden rounded-[32px] bg-card">
          <Image
            accessibilityLabel="Full home shell design reference"
            className="h-[620px] w-full"
            resizeMode="contain"
            source={reference.source}
          />
        </View>

        <ActionButton
          href={DESIGN_01_ROUTES.home}
          icon="LayoutDashboard"
          variant="outline"
        >
          Back to Design 01 home
        </ActionButton>
      </View>
    </ReferenceScreenShell>
  )
}

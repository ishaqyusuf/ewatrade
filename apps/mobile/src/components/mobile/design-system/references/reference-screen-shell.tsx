import { MobileScreen } from "@/components/mobile/screen"
import { View } from "@/components/ui/view"
import type { LinkProps } from "expo-router"
import type { ComponentProps, ReactNode } from "react"
import { ReferenceFabs } from "./reference-fabs"

type ReferenceScreenShellProps = {
  children: ReactNode
  secondaryAccessibilityLabel: string
  secondaryHref: LinkProps["href"]
  secondaryIcon: ComponentProps<typeof ReferenceFabs>["secondaryIcon"]
}

export function ReferenceScreenShell({
  children,
  secondaryAccessibilityLabel,
  secondaryHref,
  secondaryIcon,
}: ReferenceScreenShellProps) {
  return (
    <View className="flex-1 bg-background">
      <MobileScreen
        contentClassName="gap-6 pb-28"
        keyboardBottomOffset={132}
        scroll
      >
        {children}
      </MobileScreen>
      <ReferenceFabs
        secondaryAccessibilityLabel={secondaryAccessibilityLabel}
        secondaryHref={secondaryHref}
        secondaryIcon={secondaryIcon}
      />
    </View>
  )
}

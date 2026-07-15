import { Icon, type IconKeys } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { View as RNView } from "react-native"
import { ReferenceImmersiveScreenShell } from "../../references/reference-immersive-screen-shell"
import { DESIGN_01_ROUTES } from "./design-01.data"

type Design01WorkspaceScreenProps = {
  icon: IconKeys
  subtitle: string
  title: string
}

export function Design01WorkspaceScreen({
  icon,
  subtitle,
  title,
}: Design01WorkspaceScreenProps) {
  const colors = useColors()

  return (
    <ReferenceImmersiveScreenShell
      hero={
        <RNView
          style={{
            backgroundColor: colors.primary,
            borderBottomLeftRadius: 36,
            borderBottomRightRadius: 36,
            overflow: "hidden",
          }}
        >
          <View className="gap-4 px-6 pb-8 pt-16">
            <View className="size-14 items-center justify-center rounded-full bg-primary-foreground">
              <Icon className="size-lg text-primary" name={icon} />
            </View>
            <View className="gap-2">
              <Text className="text-xs font-bold uppercase tracking-[1px] text-primary-foreground">
                Design 01 workspace
              </Text>
              <Text className="text-3xl font-extrabold leading-9 text-primary-foreground">
                {title}
              </Text>
              <Text className="text-sm leading-5 text-primary-foreground">
                {subtitle}
              </Text>
            </View>
          </View>
        </RNView>
      }
      secondaryAccessibilityLabel="Open Design 01 reference system"
      secondaryHref={DESIGN_01_ROUTES.reference}
      secondaryIcon="LayoutDashboard"
      statusBarColor={colors.primary}
    >
      <View className="gap-4">
        <View className="rounded-[30px] bg-card p-5">
          <View className="gap-2">
            <Text className="text-xl font-extrabold text-foreground">
              Functional Route Ready
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              This screen is now part of the Design 01 app path and can be
              expanded with the next approved reference image for this feature.
            </Text>
          </View>
        </View>

        <View className="gap-3">
          {[
            "Shared shell",
            "Home-only bottom tabs",
            "Reference image access",
          ].map((item) => (
            <View
              className="flex-row items-center gap-3 rounded-[22px] bg-muted px-4 py-3"
              key={item}
            >
              <Icon className="size-sm text-primary" name="CheckCircle2" />
              <Text className="font-bold text-foreground">{item}</Text>
            </View>
          ))}
        </View>
      </View>
    </ReferenceImmersiveScreenShell>
  )
}

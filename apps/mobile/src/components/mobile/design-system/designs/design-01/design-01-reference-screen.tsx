import { ActionButton } from "@/components/mobile/action-button"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { Image } from "react-native"
import { ReferenceScreenShell } from "../../references/reference-screen-shell"
import {
  DESIGN_01_PRIMARY_REFERENCE,
  DESIGN_01_REFERENCE_IMAGES,
  DESIGN_01_ROUTES,
} from "./design-01.data"

export function Design01ReferenceScreen() {
  const reference = DESIGN_01_PRIMARY_REFERENCE

  return (
    <ReferenceScreenShell
      secondaryAccessibilityLabel="Open Design 01 source image"
      secondaryHref={DESIGN_01_ROUTES.image}
      secondaryIcon="Camera"
    >
      <View className="gap-6">
        <View className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-[1px] text-primary">
            Design 01
          </Text>
          <Text className="text-3xl font-extrabold leading-9 text-foreground">
            Reference System
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            This is the approval and build-up hub for every screen that belongs
            to Design 01.
          </Text>
        </View>

        <View className="gap-4 rounded-[32px] bg-card p-4">
          <View className="h-72 overflow-hidden rounded-[26px] bg-muted">
            <Image
              accessibilityLabel={`${reference.title} reference image`}
              className="h-full w-full"
              resizeMode="cover"
              source={reference.source}
            />
          </View>
          <View className="gap-1">
            <Text className="text-xs font-bold uppercase tracking-[1px] text-primary">
              {reference.sourceLabel}
            </Text>
            <Text className="text-xl font-extrabold text-foreground">
              {reference.title}
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {reference.subtitle}
            </Text>
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-xl font-extrabold text-foreground">
            Decisions To Carry Forward
          </Text>
          {reference.adoption.map((item) => (
            <View
              className="flex-row items-center gap-3 rounded-[22px] bg-muted px-4 py-3"
              key={item}
            >
              <Icon className="size-sm text-primary" name="CheckCircle2" />
              <Text className="min-w-0 flex-1 font-bold text-foreground">
                {item}
              </Text>
            </View>
          ))}
        </View>

        <View className="gap-3">
          <Text className="text-xl font-extrabold text-foreground">
            Reference Images
          </Text>
          {DESIGN_01_REFERENCE_IMAGES.map((image) => (
            <Pressable
              className="flex-row items-center gap-3 rounded-[22px] bg-muted p-3"
              href={image.route}
              key={image.id}
              transition
            >
              <View className="h-16 w-12 overflow-hidden rounded-[16px] bg-card">
                <Image
                  accessibilityLabel={`${image.title} thumbnail`}
                  className="h-full w-full"
                  resizeMode="cover"
                  source={image.source}
                />
              </View>
              <View className="min-w-0 flex-1 gap-1">
                <Text className="font-extrabold text-foreground">
                  {image.title}
                </Text>
                <Text className="text-xs font-semibold text-muted-foreground">
                  {image.sourceLabel}
                </Text>
              </View>
              <Icon
                className="size-sm text-muted-foreground"
                name="ChevronRight"
              />
            </Pressable>
          ))}
        </View>

        <ActionButton href={DESIGN_01_ROUTES.home} icon="LayoutDashboard">
          Open Design 01 home
        </ActionButton>
        <ActionButton
          href={DESIGN_01_ROUTES.image}
          icon="Camera"
          variant="outline"
        >
          Open source image
        </ActionButton>
        <ActionButton
          href={DESIGN_01_ROUTES.more}
          icon="more"
          variant="outline"
        >
          Open Admin Menu preview
        </ActionButton>
      </View>
    </ReferenceScreenShell>
  )
}

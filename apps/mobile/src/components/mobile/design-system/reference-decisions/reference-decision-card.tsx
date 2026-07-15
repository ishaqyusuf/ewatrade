import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { Image, View as RNView } from "react-native"
import type { DesignReferenceDecision } from "./data"

export function ReferenceDecisionCard({
  reference,
}: {
  reference: DesignReferenceDecision
}) {
  const colors = useColors()

  return (
    <Pressable
      accessibilityLabel={`Open ${reference.title}`}
      accessibilityRole="button"
      className="flex-row gap-4 rounded-[28px] bg-card p-3 active:bg-accent"
      href={reference.route}
      transition
    >
      <View className="h-32 w-24 overflow-hidden rounded-[24px] bg-muted">
        <Image
          accessibilityLabel={`${reference.title} thumbnail`}
          className="h-full w-full"
          resizeMode="cover"
          source={reference.source}
        />
      </View>

      <View className="min-w-0 flex-1 justify-between gap-3 py-1">
        <View className="gap-1">
          <Text className="text-xs font-bold uppercase tracking-[1px] text-primary">
            {reference.sourceLabel}
          </Text>
          <Text className="text-xl font-extrabold leading-7 text-foreground">
            {reference.title}
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {reference.subtitle}
          </Text>
        </View>

        <View className="flex-row items-center justify-between gap-3">
          <Text className="min-w-0 flex-1 text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
            Open implemented screen
          </Text>
          <RNView
            style={{
              alignItems: "center",
              backgroundColor: colors.primary,
              borderRadius: 999,
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            <Icon
              className="size-sm text-primary-foreground"
              name="ChevronRight"
            />
          </RNView>
        </View>
      </View>
    </Pressable>
  )
}

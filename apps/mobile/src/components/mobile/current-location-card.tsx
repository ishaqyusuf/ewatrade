import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import type { CurrentAddressStatus } from "@/hooks/use-current-address"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import {
  GEO_ADDRESS_ATTRIBUTION,
  type ResolvedAddress,
  mapsUrl,
} from "@ewatrade/utils/geo-address"
import { ActivityIndicator, Linking } from "react-native"

/**
 * The "Use my current location" button, and once found, a card with the
 * address, an Open in Maps link and Clear.
 */
export function CurrentLocationCard({
  address,
  error,
  onClear,
  onLocate,
  status,
}: {
  address: ResolvedAddress | null
  error: string | null
  onClear: () => void
  onLocate: () => void
  status: CurrentAddressStatus
}) {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]

  if (status === "found" && address)
    return (
      <View
        accessibilityLiveRegion="polite"
        className="flex-row gap-3 rounded-2xl bg-card px-3.5 py-3 shadow-sm"
        testID="current-location-card"
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: palette.mint,
            borderRadius: 11,
            height: 36,
            justifyContent: "center",
            width: 36,
          }}
        >
          <Icon
            className="size-[18px]"
            color={palette.mintForeground}
            name="MapPin"
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[13.5px] font-bold [-rn-line-height:19] text-foreground">
            Using your current location
          </Text>
          <Text className="text-xs [-rn-line-height:17] text-muted-foreground">
            {address.label}
          </Text>
          <View className="mt-1 flex-row gap-4">
            <Pressable
              accessibilityRole="link"
              className="min-h-9 flex-row items-center gap-1"
              hitSlop={6}
              onPress={() =>
                void Linking.openURL(
                  mapsUrl(address.latitude, address.longitude),
                )
              }
            >
              <Text className="text-[12.5px] font-extrabold text-primary">
                Open in Maps
              </Text>
              <Icon className="size-[13px] text-primary" name="Link" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="min-h-9 justify-center"
              hitSlop={6}
              onPress={onClear}
            >
              <Text className="text-[12.5px] font-extrabold text-primary">
                Clear
              </Text>
            </Pressable>
          </View>
          <Text className="text-[10.5px] text-muted-foreground">
            {GEO_ADDRESS_ATTRIBUTION}
          </Text>
        </View>
      </View>
    )

  const busy = status === "busy"
  return (
    <View className="gap-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        className="min-h-12 flex-row items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-primary/40 bg-accent px-4"
        disabled={busy}
        haptic
        onPress={onLocate}
        testID="use-current-location"
      >
        {busy ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Icon className="size-[18px] text-primary" name="LocateIcon" />
        )}
        <Text className="text-sm font-extrabold [-rn-line-height:20] text-primary">
          {busy ? "Finding your location…" : "Use my current location"}
        </Text>
      </Pressable>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-xs font-medium text-destructive"
        >
          {error}
        </Text>
      ) : null}
    </View>
  )
}

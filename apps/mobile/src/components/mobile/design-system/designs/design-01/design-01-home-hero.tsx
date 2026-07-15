import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { hexToRgba } from "@ewatrade/utils/colors"
import { View as RNView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function Design01HomeHero() {
  const colors = useColors()
  const insets = useSafeAreaInsets()

  return (
    <RNView
      style={{
        backgroundColor: colors.primary,
        borderBottomLeftRadius: 36,
        borderBottomRightRadius: 36,
        overflow: "hidden",
      }}
    >
      <RNView
        style={{
          paddingBottom: 28,
          paddingLeft: 24,
          paddingRight: 24,
          paddingTop: insets.top + 18,
        }}
      >
        <View className="gap-5">
          <View className="flex-row items-center justify-between gap-4">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-xs font-bold uppercase tracking-[1px] text-primary-foreground">
                Your location
              </Text>
              <View className="flex-row items-center gap-2">
                <Icon
                  className="size-sm text-primary-foreground"
                  name="MapPin"
                />
                <Text
                  className="text-lg font-extrabold text-primary-foreground"
                  numberOfLines={1}
                >
                  Rabi Feed Store
                </Text>
              </View>
            </View>
            <RNView
              style={{
                alignItems: "center",
                backgroundColor: hexToRgba(colors.primaryForeground, 0.15),
                borderRadius: 999,
                height: 44,
                justifyContent: "center",
                width: 44,
              }}
            >
              <Icon className="size-base text-primary-foreground" name="Bell" />
            </RNView>
          </View>

          <RNView
            style={{
              backgroundColor: colors.background,
              borderRadius: 999,
            }}
          >
            <View className="h-12 flex-row items-center gap-3 px-4">
              <Icon className="size-sm text-muted-foreground" name="Search" />
              <Text className="text-sm font-semibold text-muted-foreground">
                Search products, stock, customers
              </Text>
            </View>
          </RNView>

          <RNView
            style={{
              backgroundColor: hexToRgba(colors.primaryForeground, 0.12),
              borderRadius: 30,
            }}
          >
            <View className="flex-row items-center gap-4 p-4">
              <View className="min-w-0 flex-1 gap-2">
                <Text className="text-xs font-bold uppercase tracking-[1px] text-primary-foreground">
                  Your store, one tap away
                </Text>
                <Text className="text-3xl font-extrabold leading-9 text-primary-foreground">
                  NGN 284k
                </Text>
                <Text className="text-sm leading-5 text-primary-foreground">
                  Sales, stock, and staff status in one calm dashboard shell.
                </Text>
                <RNView
                  style={{
                    alignSelf: "flex-start",
                    backgroundColor: colors.primaryForeground,
                    borderRadius: 999,
                  }}
                >
                  <View className="px-4 py-2">
                    <Text className="text-xs font-extrabold text-primary">
                      Review sales
                    </Text>
                  </View>
                </RNView>
              </View>
              <RNView
                style={{
                  alignItems: "center",
                  backgroundColor: colors.primaryForeground,
                  borderRadius: 28,
                  height: 96,
                  justifyContent: "center",
                  width: 96,
                }}
              >
                <Icon className="size-2xl text-primary" name="BarChart3" />
              </RNView>
            </View>
          </RNView>
        </View>
      </RNView>
    </RNView>
  )
}

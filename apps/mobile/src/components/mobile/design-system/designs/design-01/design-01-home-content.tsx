import { StatusBadge } from "@/components/mobile/status-badge"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { Image, View as RNView } from "react-native"

export function Design01HomeContent() {
  const colors = useColors()

  return (
    <>
      <View className="gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-extrabold text-foreground">
            Service Categories
          </Text>
          <Text className="text-xs font-bold text-primary">View all</Text>
        </View>
        <View className="flex-row flex-wrap gap-3">
          <Design01HomeCategory icon="Receipt" label="Sales" />
          <Design01HomeCategory icon="Warehouse" label="Stock" />
          <Design01HomeCategory icon="Users" label="Staff" />
          <Design01HomeCategory icon="Share" label="Links" />
        </View>
      </View>

      <View className="gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-extrabold text-foreground">
            Popular Products
          </Text>
          <Text className="text-xs font-bold text-primary">View all</Text>
        </View>
        <View className="flex-row gap-4">
          <Design01HomeProductCard
            image={require("@assets/images/e-shop/banner.jpg")}
            meta="42 bags available"
            title="Feed bundle"
          />
          <Design01HomeProductCard
            image={require("@assets/images/e-shop/hair/olaplex-1.jpeg")}
            meta="18 shared orders"
            title="Campaign item"
          />
        </View>
      </View>

      <RNView style={{ backgroundColor: colors.card, borderRadius: 30 }}>
        <View className="gap-3 p-5">
          <View className="flex-row items-center justify-between gap-4">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-xl font-extrabold text-foreground">
                Current Operations
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Pin 2 becomes a compact owner home, not a generic marketing
                page.
              </Text>
            </View>
            <StatusBadge label="Live" tone="success" />
          </View>
          <Design01HomeRecord
            icon="Receipt"
            label="Sale 1024"
            meta="Cash sale synced"
            value="NGN 48,000"
          />
          <Design01HomeRecord
            icon="Warehouse"
            label="Low stock"
            meta="Premium rabbit feed"
            value="6 bags"
          />
        </View>
      </RNView>

      <View className="mb-24 min-h-12 flex-row items-center justify-center gap-2 rounded-full bg-muted px-4">
        <Icon className="size-sm text-success" name="CheckCircle2" />
        <Text className="text-sm font-bold text-foreground">
          Ready for owner visual review
        </Text>
      </View>
    </>
  )
}

function Design01HomeCategory({
  icon,
  label,
}: {
  icon: "Receipt" | "Share" | "Users" | "Warehouse"
  label: string
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="w-[47%] rounded-[24px] active:opacity-90"
      haptic
      onPress={() => undefined}
      transition
    >
      <View className="min-h-24 justify-center gap-3 rounded-[24px] bg-muted p-4">
        <View className="size-10 items-center justify-center rounded-full bg-card">
          <Icon className="size-sm text-primary" name={icon} />
        </View>
        <Text className="font-extrabold text-foreground">{label}</Text>
      </View>
    </Pressable>
  )
}

function Design01HomeProductCard({
  image,
  meta,
  title,
}: {
  image: number
  meta: string
  title: string
}) {
  const colors = useColors()

  return (
    <RNView style={{ backgroundColor: colors.card, borderRadius: 28, flex: 1 }}>
      <View className="min-w-0 gap-3 p-3">
        <View className="h-28 overflow-hidden rounded-[22px] bg-muted">
          <Image
            accessibilityLabel={title}
            className="h-full w-full"
            resizeMode="cover"
            source={image}
          />
        </View>
        <View className="gap-1">
          <Text className="font-extrabold text-foreground" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-xs font-semibold text-muted-foreground">
            {meta}
          </Text>
        </View>
      </View>
    </RNView>
  )
}

function Design01HomeRecord({
  icon,
  label,
  meta,
  value,
}: {
  icon: "Receipt" | "Warehouse"
  label: string
  meta: string
  value: string
}) {
  return (
    <View className="flex-row items-center gap-3 py-2">
      <View className="size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-sm text-primary" name={icon} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{label}</Text>
        <Text className="text-sm text-muted-foreground">{meta}</Text>
      </View>
      <Text className="font-extrabold text-foreground">{value}</Text>
    </View>
  )
}

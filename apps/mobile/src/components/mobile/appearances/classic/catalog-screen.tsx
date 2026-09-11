import {
  SecondaryOperationalRow,
  SecondarySheetHeader,
} from "@/components/mobile/secondary-operations"
import { StatusBadge } from "@/components/mobile/status-badge"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useColorScheme } from "@/hooks/use-color"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type {
  CatalogRow,
  CatalogFrameProps,
  CatalogMastheadProps,
} from "@/components/mobile/catalog/catalog-presentation"

export function ClassicCatalogFrame({
  children,
  presentation,
  bottomSpace,
}: CatalogFrameProps) {
  const insets = useSafeAreaInsets()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--catalog-list-top": presentation === "tab" ? insets.top + 24 : 0,
        "--catalog-list-bottom": bottomSpace,
        "--catalog-safe-top": insets.top,
      }}
    >
      <View className="flex-1 bg-background">
        {presentation === "tab" ? (
          <>
            <StatusBar
              animated
              style={colorScheme === "dark" ? "light" : "dark"}
            />
            <View
              pointerEvents="none"
              className="absolute inset-x-0 top-0 z-[100] h-[var(--catalog-safe-top)] bg-background"
            />
          </>
        ) : null}
        {children}
      </View>
    </VariableContextProvider>
  )
}
export function ClassicCatalogMasthead({
  firstItem,
  onLayout,
}: CatalogMastheadProps) {
  return (
    <View className="px-4" onLayout={onLayout}>
      {firstItem ? (
        <View className="gap-2">
          <Text className="text-[11px] font-extrabold uppercase tracking-[1.7px] text-primary">
            Your catalog
          </Text>
          <Text className="text-3xl font-extrabold tracking-tight text-foreground">
            What do you sell?
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Choose one to build your first listing. You can add the other type
            anytime.
          </Text>
        </View>
      ) : (
        <SecondarySheetHeader
          description="Products track stock. Services stay outside inventory."
          icon="Warehouse"
          title="Catalog items"
        />
      )}
    </View>
  )
}
export function ClassicCatalogFirstItemGate({
  onAddProduct,
  onAddService,
  disabled = false,
}: {
  disabled?: boolean
  onAddProduct: () => void
  onAddService: () => void
}) {
  const largeTextLayout = useLargeTextLayout()
  const choices = [
    {
      detail: "Goods you stock, count, and sell",
      icon: "Warehouse" as const,
      label: "Add a Product",
      onPress: onAddProduct,
    },
    {
      detail: "Work you price and deliver",
      icon: "Wrench" as const,
      label: "Add a Service",
      onPress: onAddService,
    },
  ]

  return (
    <View className="mx-4 gap-5">
      <View className="overflow-hidden rounded-3xl bg-primary p-5">
        <Text className="text-[11px] font-extrabold uppercase tracking-[1.7px] text-primary-foreground/75">
          Start with one item
        </Text>
        <Text className="mt-3 text-2xl font-extrabold tracking-tight text-primary-foreground">
          Make your store ready to take orders.
        </Text>
        <Text className="mt-2 text-sm leading-5 text-primary-foreground/80">
          Set a name and price now. Product stock and service delivery stay
          separate.
        </Text>

        <View className="mt-5 gap-3">
          {choices.map((choice) => (
            <Pressable
              accessibilityLabel={choice.label}
              accessibilityRole="button"
              className={
                largeTextLayout
                  ? "min-h-[72px] flex-row items-start gap-3 rounded-2xl bg-primary-foreground px-4 py-3 active:opacity-90"
                  : "min-h-[72px] flex-row items-center gap-3 rounded-2xl bg-primary-foreground px-4 py-3 active:opacity-90"
              }
              disabled={disabled}
              accessibilityState={{ disabled }}
              haptic={!disabled}
              key={choice.label}
              onPress={choice.onPress}
              transition
            >
              <View
                className={
                  largeTextLayout
                    ? "mt-1 size-11 items-center justify-center rounded-xl bg-primary/10"
                    : "size-11 items-center justify-center rounded-xl bg-primary/10"
                }
              >
                <Icon className="size-base text-primary" name={choice.icon} />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-extrabold text-primary">
                  {choice.label}
                </Text>
                <Text className="text-xs leading-4 text-primary/70">
                  {choice.detail}
                </Text>
              </View>
              <Icon
                className={
                  largeTextLayout
                    ? "mt-1 size-sm text-primary"
                    : "size-sm text-primary"
                }
                name="ChevronRight"
              />
            </Pressable>
          ))}
        </View>
      </View>

      <View className="flex-row items-start gap-3 px-1">
        <View className="size-9 items-center justify-center rounded-full bg-muted">
          <Icon className="size-sm text-primary" name="Info" />
        </View>
        <Text className="min-w-0 flex-1 pt-0.5 text-xs leading-4 text-muted-foreground">
          Your catalog list, search, and type filters appear here after the
          first item.
        </Text>
      </View>
    </View>
  )
}

export function ClassicCatalogRow({
  item,
  onPress,
}: {
  item: CatalogRow
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={`Open ${item.name}`}
      accessibilityRole="button"
      className="mx-2 px-2 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <SecondaryOperationalRow
        detail={item.detail}
        icon={item.kind === "service" ? "Wrench" : "Warehouse"}
        title={item.name}
        trailing={
          <StatusBadge
            label={item.kind === "service" ? "Service" : "Product"}
            tone={item.kind === "service" ? "primary" : "success"}
          />
        }
      />
    </Pressable>
  )
}

export function ClassicCatalogFilter({
  active,
  label,
  onPress,
}: {
  active: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={
        active
          ? "min-h-11 items-center justify-center rounded-full bg-primary px-4 py-2"
          : "min-h-11 items-center justify-center rounded-full bg-muted px-4 py-2"
      }
      haptic
      onPress={onPress}
      transition
    >
      <Text
        className={
          active
            ? "text-xs font-bold text-primary-foreground"
            : "text-xs font-bold text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

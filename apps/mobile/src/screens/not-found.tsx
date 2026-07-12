import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { FontAwesome } from "@expo/vector-icons"
import { Stack } from "expo-router"
import { View } from "react-native"

export default function NotFound() {
  const colors = useColors()

  return (
    <>
      <Stack.Screen options={{ title: "Oops! Not Found" }} />
      <View className="flex-1 items-center justify-center bg-background px-8">
        <View className="relative mb-10 h-64 w-full items-center justify-center">
          <View className="absolute h-56 w-56 rounded-full bg-muted opacity-40" />
          <View className="absolute h-40 w-40 rounded-full bg-accent opacity-30" />

          <View className="absolute">
            <Text className="text-9xl font-bold text-muted">404</Text>
          </View>
          <View className="absolute rounded-full bg-card p-6 shadow-lg">
            <FontAwesome name="compass" size={48} color={colors.success} />
          </View>
        </View>

        <View className="mb-10 items-center gap-3">
          <Text className="text-center text-3xl font-bold text-foreground">
            Page Not Found
          </Text>
          <Text className="px-4 text-center text-base leading-6 text-muted-foreground">
            Oops! The page you&apos;re looking for doesn&apos;t exist.
          </Text>
          <Text className="text-center text-base leading-6 text-muted-foreground">
            It might have been moved or deleted.
          </Text>
        </View>

        <Pressable
          className="rounded-2xl bg-primary px-8 py-4 shadow-lg"
          haptic
          href="/"
          transition
        >
          <View className="flex-row items-center gap-2">
            <FontAwesome
              name="home"
              size={20}
              color={colors.primaryForeground}
            />
            <Text className="text-lg font-bold text-primary-foreground">
              Go Back Home
            </Text>
          </View>
        </Pressable>

        <Text className="mt-8 text-center text-sm text-muted-foreground">
          Need help? Contact our support team
        </Text>
      </View>
    </>
  )
}

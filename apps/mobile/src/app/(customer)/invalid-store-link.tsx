import { ActionButton } from "@/components/mobile/action-button"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useRouter } from "expo-router"
export default function InvalidStoreLink() {
  const router = useRouter()
  return (
    <View className="flex-1 justify-center gap-4 bg-background px-[18px]">
      <Text
        accessibilityRole="header"
        className="text-2xl font-extrabold text-foreground"
      >
        This store link is invalid
      </Text>
      <Text className="text-sm text-muted-foreground">
        Ask the store for a new chat link. No conversation has been opened.
      </Text>
      <ActionButton onPress={() => router.replace("/(customer)/conversations")}>
        Back to conversations
      </ActionButton>
    </View>
  )
}

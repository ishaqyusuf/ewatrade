import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { ScrollView } from "react-native"
import { useAskAssistant } from "./use-ask-assistant"

/**
 * Home's way into the assistant (Workshop 01 Home v2, 02 Ask bar): a bar that
 * opens Ask with the keyboard up, and questions from Home's own figures that
 * open Ask with the question sent. Hidden offline and while the
 * assistant isn't launched for this business, like the other entries.
 */
export function HomeAskBar({ questions }: { questions: string[] }) {
  const assistant = useAskAssistant()
  const largeText = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  if (!assistant.enabled || !assistant.canOpen) return null
  const chips = questions.slice(0, 3).map((question) => (
    <View className="rounded-full bg-card" key={question}>
      <Pressable
        accessibilityLabel={`Ask: ${question}`}
        accessibilityRole="button"
        className="min-h-[38px] justify-center rounded-full border border-border px-3.5 py-1.5"
        haptic
        onPress={() => assistant.send(question)}
      >
        <Text
          className="text-sm font-bold [-rn-line-height:22] text-primary"
          numberOfLines={largeText ? undefined : 1}
        >
          {question}
        </Text>
      </Pressable>
    </View>
  ))
  return (
    <View className="mt-3" testID="home-ask-bar">
      <View className="rounded-full bg-card shadow-sm">
        <Pressable
          accessibilityLabel="Ask about your business"
          accessibilityRole="button"
          className="min-h-[52px] flex-row items-center gap-2.5 rounded-full border border-border py-2 pl-2.5 pr-4"
          haptic
          onPress={assistant.openFocused}
          testID="home-ask-bar-open"
        >
          <View className="size-8 items-center justify-center rounded-full bg-gold">
            <Icon
              className="size-[17px]"
              color={palette.goldForeground}
              name="Sparkles"
            />
          </View>
          <Text
            className="min-w-0 flex-1 text-base [-rn-line-height:24] text-muted-foreground"
            numberOfLines={largeText ? undefined : 1}
          >
            Ask about your business…
          </Text>
        </Pressable>
      </View>
      {chips.length ? (
        largeText ? (
          <View className="mt-2.5 flex-row flex-wrap gap-2">{chips}</View>
        ) : (
          <ScrollView
            contentContainerStyle={{
              gap: 8,
              paddingBottom: 4,
              paddingHorizontal: 18,
            }}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginHorizontal: -18, marginTop: 10 }}
          >
            {chips}
          </ScrollView>
        )
      ) : null}
    </View>
  )
}

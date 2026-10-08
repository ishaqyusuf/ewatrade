import { ActionButton } from "@/components/mobile/action-button"
import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import {
  ONBOARDING_STEPS,
  type OnboardingPresentationProps,
} from "@/components/mobile/onboarding/onboarding-presentation"
import { Icon } from "@/components/ui/icon"
import { MotionView } from "@/components/ui/motion"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"

export function ClassicOnboardingScreen({
  stepIndex,
  onContinue,
  onFinish,
}: OnboardingPresentationProps) {
  const index = Math.max(0, Math.min(stepIndex, ONBOARDING_STEPS.length - 1))
  const step = ONBOARDING_STEPS[index] ?? ONBOARDING_STEPS[0]
  const last = index === ONBOARDING_STEPS.length - 1
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <GreenTillAuthScreen
      title={step.title}
      subtitle={step.body}
      motionKey={index}
      testID={`green-gate-intro-${index + 1}`}
      headerContent={
        <MotionView key={index}>
          <View className="mt-6 gap-4">
            <View className="flex-row items-center justify-between gap-3">
              <View className="size-16 items-center justify-center rounded-[20px] bg-white/15">
                <Icon className="size-[30px] text-white" name={step.icon} />
              </View>
              <View className="rounded-full bg-white/15 px-3 py-1.5">
                <Text
                  style={{
                    color: palette.heroForeground,
                    fontSize: 12,
                    fontWeight: "800",
                    lineHeight: 18,
                  }}
                >
                  {index + 1} of 3
                </Text>
              </View>
            </View>
            <View className="gap-1.5">
              <Text
                accessibilityRole="header"
                style={{
                  color: palette.heroForeground,
                  fontSize: 26,
                  fontWeight: "800",
                  lineHeight: 31,
                  letterSpacing: -0.6,
                }}
              >
                {step.title}
              </Text>
              <Text
                style={{
                  color: palette.heroMuted,
                  fontSize: 14,
                  lineHeight: 21,
                }}
              >
                {step.body}
              </Text>
            </View>
          </View>
        </MotionView>
      }
    >
      <Text className="text-base font-extrabold [-rn-line-height:24] text-foreground">
        What happens next
      </Text>
      <View className="rounded-[20px] bg-muted px-4 py-1">
        {step.tasks.map((task, taskIndex) => (
          <View
            key={task.label}
            className="min-h-14 flex-row items-center gap-3 py-3"
          >
            <View className="size-7 items-center justify-center rounded-full bg-accent">
              <Text
                maxFontSizeMultiplier={1.3}
                className="text-xs font-bold [-rn-line-height:18] text-primary"
              >
                {taskIndex + 1}
              </Text>
            </View>
            <Text className="min-w-0 flex-1 text-sm font-semibold [-rn-line-height:21] text-foreground">
              {task.label}
            </Text>
          </View>
        ))}
      </View>
      <View className="min-h-6 flex-1" />
      <View className="gap-3">
        <View
          accessible
          accessibilityLabel={`Introduction ${index + 1} of 3`}
          className="flex-row justify-center gap-1.5 py-1"
        >
          {ONBOARDING_STEPS.map((item, itemIndex) => (
            <View
              key={item.title}
              style={{
                width: itemIndex === index ? 22 : 7,
                height: 7,
                borderRadius: 7,
                backgroundColor:
                  itemIndex === index ? palette.gold : colors.border,
              }}
            />
          ))}
        </View>
        <ActionButton onPress={onContinue} trailingIcon="ArrowRight">
          {last ? "Get started" : "Continue"}
        </ActionButton>
        {!last ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            className="min-h-11 items-center justify-center"
            onPress={onFinish}
            haptic
          >
            <Text className="text-sm font-bold [-rn-line-height:21] text-primary">
              Skip
            </Text>
          </Pressable>
        ) : null}
      </View>
    </GreenTillAuthScreen>
  )
}

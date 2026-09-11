import { ActionButton } from "@/components/mobile/action-button"
import { MobileScreen } from "@/components/mobile/screen"
import {
  ONBOARDING_STEPS,
  type OnboardingPresentationProps,
} from "@/components/mobile/onboarding/onboarding-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"

export function ClassicOnboardingScreen({
  stepIndex,
  onContinue,
  onFinish,
}: OnboardingPresentationProps) {
  const step = ONBOARDING_STEPS[stepIndex] ?? ONBOARDING_STEPS[0]
  const last = stepIndex === ONBOARDING_STEPS.length - 1
  const largeText = useLargeTextLayout()
  return (
    <MobileScreen
      contentClassName={
        largeText ? "justify-start gap-8" : "justify-between gap-8"
      }
    >
      <View className="gap-10">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View className="flex-row items-center gap-2 rounded-full bg-accent px-3 py-2">
            <Icon className="size-4 text-primary" name="ShieldCheck" />
            <Text className="text-xs font-bold uppercase text-primary">
              Business setup
            </Text>
          </View>
          {!last ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
              className="min-h-11 items-center justify-center rounded-full px-3 active:bg-muted"
              haptic
              onPress={onFinish}
            >
              <Text className="text-sm font-bold text-muted-foreground">
                Skip
              </Text>
            </Pressable>
          ) : null}
        </View>
        <View className="items-start gap-7">
          <View className="h-[126px] w-[150px] justify-center">
            <View className="absolute left-3 top-3 size-24 -rotate-[8deg] rounded-[30px] bg-accent" />
            <View className="absolute left-[66px] top-3 h-[38px] w-[68px] -rotate-[10deg] rounded-full bg-warn opacity-20" />
            <View className="size-24 items-center justify-center rounded-[30px] bg-primary">
              <Icon
                className="size-10 text-primary-foreground"
                name={step.icon}
              />
            </View>
          </View>
          <View className="gap-4">
            <Text className="text-5xl font-bold leading-tight text-foreground">
              {step.title}
            </Text>
            <Text className="text-lg [-rn-line-height:28] text-muted-foreground">
              {step.body}
            </Text>
          </View>
        </View>
        <View className="gap-5">
          <Text className="text-xs font-bold uppercase text-muted-foreground">
            What happens next
          </Text>
          <View className="gap-4">
            {step.tasks.map((task, index) => (
              <View key={task.label} className="flex-row items-center gap-4">
                <View
                  className={
                    index === 0
                      ? "size-[42px] items-center justify-center rounded-full bg-primary"
                      : "size-[42px] items-center justify-center rounded-full bg-accent"
                  }
                >
                  <Icon
                    className={
                      index === 0
                        ? "size-4 text-primary-foreground"
                        : "size-4 text-primary"
                    }
                    name={task.icon}
                  />
                </View>
                <Text className="flex-1 text-xl font-semibold text-foreground">
                  {task.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      <View className="gap-4 pb-8">
        <View className="flex-row items-center gap-2">
          {ONBOARDING_STEPS.map((item, index) => (
            <View
              key={item.title}
              className={
                index <= stepIndex
                  ? "h-1.5 flex-1 rounded-full bg-primary"
                  : "h-1.5 flex-1 rounded-full bg-muted"
              }
            />
          ))}
        </View>
        <ActionButton
          onPress={onContinue}
          trailingIcon={last ? "CircleCheck" : "ArrowRight"}
        >
          {last ? "Get started" : "Continue"}
        </ActionButton>
        <Text className="text-center text-xs font-semibold text-muted-foreground">
          Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
        </Text>
      </View>
    </MobileScreen>
  )
}

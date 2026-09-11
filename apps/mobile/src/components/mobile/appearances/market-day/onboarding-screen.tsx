import { MarketDayActionButton } from "@/components/mobile/action-button"
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
import { useMarketDayPalette } from "@/lib/market-day-theme"

const TASK_TONES = [
  "bg-market-paprika",
  "bg-market-marigold",
  "bg-market-sky",
] as const

export function MarketDayOnboardingScreen({
  stepIndex,
  onContinue,
  onFinish,
}: OnboardingPresentationProps) {
  const step = ONBOARDING_STEPS[stepIndex] ?? ONBOARDING_STEPS[0]
  const last = stepIndex === ONBOARDING_STEPS.length - 1
  const largeText = useLargeTextLayout()
  const palette = useMarketDayPalette()
  return (
    <MobileScreen
      backgroundColor={palette.canvas}
      contentClassName={
        largeText ? "justify-start gap-6" : "justify-between gap-8"
      }
    >
      <View
        pointerEvents="none"
        className="absolute -bottom-[72px] -left-[52px] h-[235px] w-[132%] -rotate-[8deg] bg-market-soft-band opacity-80"
      />
      <View
        pointerEvents="none"
        className="absolute -right-[30px] top-60 size-[68px] rounded-full bg-market-sky opacity-30"
      />
      <View className={largeText ? "gap-6" : "gap-8"}>
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View className="flex-row items-center gap-2 rounded-full bg-market-marigold px-3 py-2">
            <Icon
              className="size-4 text-market-on-marigold"
              name="ShieldCheck"
            />
            <Text className="text-xs font-bold uppercase text-market-on-marigold">
              Business setup
            </Text>
          </View>
          {!last ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
              className="min-h-11 items-center justify-center rounded-full px-3"
              haptic
              onPress={onFinish}
            >
              <Text className="text-sm font-bold text-market-muted-ink">
                Skip
              </Text>
            </Pressable>
          ) : null}
        </View>
        <View className="items-start gap-5">
          <View
            className={
              largeText
                ? "h-24 w-28 justify-center"
                : "h-[126px] w-[150px] justify-center"
            }
          >
            <View
              className={
                largeText
                  ? "absolute left-2 top-2.5 size-[76px] -rotate-[8deg] rounded-[30px] bg-market-marigold"
                  : "absolute left-3 top-3 size-24 -rotate-[8deg] rounded-[30px] bg-market-marigold"
              }
            />
            <View
              className={
                largeText
                  ? "absolute left-[52px] top-2 h-8 w-[50px] -rotate-[10deg] rounded-full bg-market-sky"
                  : "absolute left-[66px] top-3 h-[38px] w-[68px] -rotate-[10deg] rounded-full bg-market-sky"
              }
            />
            <View
              className={
                largeText
                  ? "size-[76px] items-center justify-center rounded-[22px] bg-market-paprika"
                  : "size-24 items-center justify-center rounded-[30px] bg-market-paprika"
              }
            >
              <Icon
                className="size-10 text-market-on-paprika"
                name={step.icon}
              />
            </View>
            <View
              className={
                largeText
                  ? "absolute bottom-[5px] right-0.5 size-4 rounded-full bg-market-palm"
                  : "absolute bottom-2.5 right-1 size-[22px] rounded-full bg-market-palm"
              }
            />
          </View>
          <View className="gap-3">
            <Text
              className={
                largeText
                  ? "text-[36px] font-bold [-rn-line-height:42] tracking-[-1.2px] text-market-ink"
                  : "text-[40px] font-bold [-rn-line-height:46] tracking-[-1.2px] text-market-ink"
              }
            >
              {step.title}
            </Text>
            <Text
              className={
                largeText
                  ? "text-base [-rn-line-height:26] text-market-muted-ink"
                  : "text-[17px] [-rn-line-height:26] text-market-muted-ink"
              }
            >
              {step.body}
            </Text>
          </View>
        </View>
        <View className="gap-4">
          <Text className="text-xs font-bold uppercase tracking-[1.5px] text-market-accent-ink">
            {stepIndex === 0 ? "Three quick stops" : "What happens next"}
          </Text>
          <View className="gap-3">
            {step.tasks.map((task, index) => (
              <View
                key={task.label}
                className={
                  index < step.tasks.length - 1
                    ? "min-h-[54px] flex-row items-center gap-4 border-b border-market-line pb-3"
                    : "min-h-[54px] flex-row items-center gap-4 pb-3"
                }
              >
                <View
                  className={`size-[42px] items-center justify-center rounded-full ${TASK_TONES[index] ?? TASK_TONES[0]}`}
                >
                  <Icon
                    className={
                      index === 0
                        ? "size-[17px] text-market-on-paprika"
                        : "size-[17px] text-market-on-marigold"
                    }
                    name={task.icon}
                  />
                </View>
                <Text
                  className={
                    largeText
                      ? "flex-1 text-lg font-semibold [-rn-line-height:25] text-market-ink"
                      : "flex-1 text-[19px] font-semibold [-rn-line-height:25] text-market-ink"
                  }
                >
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
                  ? "h-1.5 flex-1 rounded-full bg-market-paprika"
                  : "h-1.5 flex-1 rounded-full bg-market-line"
              }
            />
          ))}
        </View>
        <MarketDayActionButton
          onPress={onContinue}
          tone="paprika"
          trailingIcon={last ? "CircleCheck" : "ArrowRight"}
        >
          {last ? "Get started" : "Continue"}
        </MarketDayActionButton>
        <Text className="text-center text-xs font-semibold text-market-muted-ink">
          Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
        </Text>
      </View>
    </MobileScreen>
  )
}

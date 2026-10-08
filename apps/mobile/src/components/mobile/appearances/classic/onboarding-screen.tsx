import { ActionButton } from "@/components/mobile/action-button"
import {
  AuthStagePill,
  GreenTillAuthScreen,
} from "@/components/mobile/green-till/auth-screen"
import { IntroStage } from "@/components/mobile/green-till/auth-stage"
import {
  ONBOARDING_STEPS,
  type OnboardingPresentationProps,
} from "@/components/mobile/onboarding/onboarding-presentation"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { useEffect, useRef } from "react"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const ease = Easing.out(Easing.cubic)
const SWIPE_DISTANCE = 48

/** 03 Market Preview intro: example cards on the stage, copy and one action. */
export function ClassicOnboardingScreen({
  stepIndex,
  onContinue,
  onFinish,
  onPrevious,
}: OnboardingPresentationProps) {
  const index = Math.max(0, Math.min(stepIndex, ONBOARDING_STEPS.length - 1))
  const step = ONBOARDING_STEPS[index] ?? ONBOARDING_STEPS[0]
  const last = index === ONBOARDING_STEPS.length - 1
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const previousIndex = useRef(index)
  const direction: 1 | -1 = index >= previousIndex.current ? 1 : -1
  useEffect(() => {
    previousIndex.current = index
  }, [index])

  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-16, 16])
    .onEnd((event) => {
      if (event.translationX < -SWIPE_DISTANCE) runOnJS(onContinue)()
      else if (event.translationX > SWIPE_DISTANCE && onPrevious)
        runOnJS(onPrevious)()
    })

  return (
    <GestureDetector gesture={swipe}>
      <View className="flex-1">
        <GreenTillAuthScreen
          title={step.title}
          subtitle={step.body}
          testID={`market-preview-intro-${index + 1}`}
          stage={<IntroStage index={index} direction={direction} />}
          actions={
            <AuthStagePill
              label="Skip"
              accessibilityLabel="Skip introduction"
              onPress={onFinish}
            />
          }
          headerContent={
            <View className="gap-2">
              <IntroDots index={index} />
              <Animated.View
                key={`intro-copy-${index}`}
                entering={FadeInDown.duration(260)
                  .delay(80)
                  .easing(ease)
                  .withInitialValues({ transform: [{ translateY: 12 }] })
                  .reduceMotion(ReduceMotion.System)}
                style={{ gap: 4 }}
              >
                <Text
                  accessibilityRole="header"
                  className="text-[23px] font-extrabold tracking-tight [-rn-line-height:28] text-foreground"
                >
                  {step.title}
                </Text>
                <Text className="text-[13.5px] [-rn-line-height:20] text-muted-foreground">
                  {step.body}
                </Text>
              </Animated.View>
            </View>
          }
          footer={
            <View
              style={{
                backgroundColor: colors.background,
                paddingBottom: Math.max(insets.bottom, 12) + 8,
                paddingHorizontal: 18,
                paddingTop: 12,
              }}
            >
              <ActionButton onPress={onContinue} trailingIcon="ArrowRight">
                {last ? "Get started" : "Next"}
              </ActionButton>
            </View>
          }
        >
          {null}
        </GreenTillAuthScreen>
      </View>
    </GestureDetector>
  )
}

function IntroDots({ index }: { index: number }) {
  return (
    <View
      accessible
      accessibilityLabel={`Introduction ${index + 1} of 3`}
      style={{ flexDirection: "row", gap: 6, paddingVertical: 4 }}
    >
      {ONBOARDING_STEPS.map((item, itemIndex) => (
        <IntroDot key={item.title} active={itemIndex === index} />
      ))}
    </View>
  )
}

function IntroDot({ active }: { active: boolean }) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const reduceMotion = useReducedMotion()
  const gold = GREEN_TILL_THEME[colorScheme].gold
  const style = useAnimatedStyle(() => ({
    width: reduceMotion
      ? active
        ? 22
        : 7
      : withTiming(active ? 22 : 7, { duration: 240, easing: ease }),
    backgroundColor: active ? gold : colors.border,
  }))
  return <Animated.View style={[{ height: 7, borderRadius: 7 }, style]} />
}

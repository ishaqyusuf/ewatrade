import { MobileScreen } from "@/components/mobile"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useRouter } from "expo-router"
import { useState } from "react"
import { StyleSheet, View } from "react-native"

type OnboardingStep = {
  body: string
  icon: IconKeys
  tasks: Array<{
    icon: IconKeys
    label: string
  }>
  title: string
}

const ONBOARDING_STEPS = [
  {
    body: "Create the workspace your attendants, inventory, and daily sales will work from.",
    icon: "Building2",
    tasks: [
      { icon: "Building2", label: "Name your store" },
      { icon: "Warehouse", label: "Add opening stock" },
      { icon: "Users", label: "Bring in attendants" },
    ],
    title: "Set up your business",
  },
  {
    body: "Match how you really sell, from bags and half bags to custom units and prices.",
    icon: "Warehouse",
    tasks: [
      { icon: "ReceiptText", label: "Create the first product" },
      { icon: "Calculator", label: "Set unit prices" },
      { icon: "CircleCheck", label: "Track available quantity" },
    ],
    title: "Track stock your way",
  },
  {
    body: "Record sales, invite staff, and keep work queued safely when the connection drops.",
    icon: "Users",
    tasks: [
      { icon: "UserPlus", label: "Invite sales reps" },
      { icon: "Receipt", label: "Capture payments" },
      { icon: "Zap", label: "Sync when online" },
    ],
    title: "Sell with your team",
  },
] as const satisfies OnboardingStep[]

export default function OnboardingRoute() {
  const router = useRouter()
  const colors = useColors()
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const [stepIndex, setStepIndex] = useState(0)
  const step = ONBOARDING_STEPS[stepIndex] ?? ONBOARDING_STEPS[0]
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1

  const finishOnboarding = () => {
    completeOnboarding(true)
    router.replace("/login")
  }

  const continueOnboarding = () => {
    if (isLastStep) {
      finishOnboarding()
      return
    }

    setStepIndex((current) =>
      Math.min(current + 1, ONBOARDING_STEPS.length - 1),
    )
  }

  return (
    <MobileScreen contentClassName="justify-between gap-8">
      <View className="gap-10">
        <View className="flex-row items-center justify-between">
          <View
            style={[
              styles.badge,
              {
                backgroundColor: colors.accent,
              },
            ]}
          >
            <Icon className="size-sm text-primary" name="ShieldCheck" />
            <Text className="text-xs font-bold uppercase text-primary">
              Retail ops setup
            </Text>
          </View>

          {!isLastStep ? (
            <Pressable
              className="rounded-full px-3 py-2 active:bg-muted/60"
              haptic
              onPress={finishOnboarding}
            >
              <Text className="text-sm font-bold text-muted-foreground">
                Skip
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View className="items-start gap-7">
          <HeroMark icon={step.icon} />

          <View className="gap-4">
            <Text className="text-5xl font-bold leading-tight text-foreground">
              {step.title}
            </Text>
            <Text className="text-lg leading-7 text-muted-foreground">
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
              <View className="flex-row items-center gap-4" key={task.label}>
                <View
                  style={[
                    styles.taskIcon,
                    {
                      backgroundColor:
                        index === 0 ? colors.primary : colors.accent,
                    },
                  ]}
                >
                  <Icon
                    className={cn(
                      "size-sm",
                      index === 0 ? "text-primary-foreground" : "text-primary",
                    )}
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
              style={[
                styles.progressBar,
                {
                  backgroundColor:
                    index <= stepIndex ? colors.primary : colors.muted,
                },
              ]}
              key={item.title}
            />
          ))}
        </View>

        <Pressable
          haptic
          onPress={continueOnboarding}
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          transition
        >
          <Text className="text-base font-bold text-primary-foreground">
            {isLastStep ? "Get started" : "Continue"}
          </Text>
          <Icon
            className="size-sm text-primary-foreground"
            name={isLastStep ? "CircleCheck" : "ArrowRight"}
          />
        </Pressable>

        <Text className="text-center text-xs font-semibold text-muted-foreground">
          Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
        </Text>
      </View>
    </MobileScreen>
  )
}

function HeroMark({ icon }: { icon: IconKeys }) {
  const colors = useColors()

  return (
    <View style={styles.heroWrap}>
      <View
        style={[
          styles.heroGlow,
          { backgroundColor: withAlpha(colors.primary, 0.14) },
        ]}
      />
      <View
        style={[
          styles.heroAccent,
          { backgroundColor: withAlpha(colors.warn, 0.18) },
        ]}
      />
      <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
        <Icon className="size-2xl text-primary-foreground" name={icon} />
      </View>
    </View>
  )
}

function withAlpha(color: string, alpha: number) {
  return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`)
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroAccent: {
    borderRadius: 24,
    height: 44,
    left: 76,
    position: "absolute",
    top: 12,
    transform: [{ rotate: "-10deg" }],
    width: 76,
  },
  heroGlow: {
    borderRadius: 999,
    height: 132,
    left: 12,
    position: "absolute",
    top: 8,
    width: 132,
  },
  heroIcon: {
    alignItems: "center",
    borderRadius: 36,
    height: 112,
    justifyContent: "center",
    width: 112,
  },
  heroWrap: {
    height: 152,
    justifyContent: "center",
    width: 168,
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 18,
    flexDirection: "row",
    gap: 12,
    height: 56,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  progressBar: {
    borderRadius: 999,
    flex: 1,
    height: 6,
  },
  taskIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
})

import type { IconKeys } from "@/components/ui/icon"

type OnboardingStep = {
  body: string
  icon: IconKeys
  tasks: Array<{
    icon: IconKeys
    label: string
  }>
  title: string
}

export const ONBOARDING_STEPS = [
  {
    body: "Create one workspace for your team, catalog, orders, and daily work.",
    icon: "Building2",
    tasks: [
      { icon: "Building2", label: "Add business details" },
      { icon: "MapPin", label: "Confirm address and phone" },
      { icon: "Users", label: "Invite your team" },
    ],
    title: "Set up your business",
  },
  {
    body: "Add Products, Services, prices, options, and units only when you need them.",
    icon: "Warehouse",
    tasks: [
      { icon: "ReceiptText", label: "Create your first item" },
      { icon: "Calculator", label: "Set pricing" },
      { icon: "CircleCheck", label: "Choose stock or work tracking" },
    ],
    title: "Build your catalog",
  },
  {
    body: "Confirm orders, track service work, and keep supported actions queued when the connection drops.",
    icon: "Users",
    tasks: [
      { icon: "Receipt", label: "Create mixed orders" },
      { icon: "Wrench", label: "Track service progress" },
      { icon: "Zap", label: "Sync when online" },
    ],
    title: "Run daily work",
  },
] as const satisfies OnboardingStep[]

export type OnboardingPresentationProps = {
  stepIndex: number
  onContinue: () => void
  onFinish: () => void
}

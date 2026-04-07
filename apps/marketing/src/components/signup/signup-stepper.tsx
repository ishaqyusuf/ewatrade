import { CheckmarkCircle01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const STEPS = [
  { label: "Account type" },
  { label: "Workspace" },
  { label: "Business" },
  { label: "Your account" },
]

type SignupStepperProps = {
  currentStep: number // 1-indexed, steps 1–4 (step 5 is success)
}

export function SignupStepper({ currentStep }: SignupStepperProps) {
  return (
    <div className="mb-8 flex items-center justify-center gap-0">
      {STEPS.map((step, index) => {
        const stepNumber = index + 1
        const isCompleted = stepNumber < currentStep
        const isCurrent = stepNumber === currentStep
        const isUpcoming = stepNumber > currentStep

        return (
          <div key={step.label} className="flex items-center">
            {/* Step indicator */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-300 ${
                  isCompleted
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/50 text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <HugeiconsIcon
                    icon={CheckmarkCircle01Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                ) : (
                  <span>{stepNumber}</span>
                )}
              </div>
              <span
                className={`hidden text-[10px] font-medium sm:block ${
                  isCurrent
                    ? "text-primary"
                    : isCompleted
                      ? "text-muted-foreground"
                      : "text-muted-foreground/50"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (not after last step) */}
            {index < STEPS.length - 1 && (
              <div
                className={`mx-2 mb-5 h-px w-10 transition-colors duration-300 sm:w-16 ${
                  stepNumber < currentStep ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

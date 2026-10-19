import type { StepDirection } from "@/lib/step-motion"
import type { BusinessProfile } from "@ewatrade/utils"
import type { ReactNode } from "react"

export type SignUpStep = "businessType" | "profile" | "business" | "account"

export type SignUpPresentationProps = {
  children: ReactNode
  footer: ReactNode
  header: { step: number; subtitle: string; title: string }
  /** The owner's answers so far, shown as a preview of their Home. */
  preview?: SignUpPreview
  onBack: () => void
  step: SignUpStep
  /** Which way the last step change went, for the step motion. */
  direction?: StepDirection
}

export type SignUpPreview = {
  businessName: string
  chips: string[]
  ownerLine?: { title: string; subtitle: string }
}

export type SignUpCategoriesProps = {
  onSelect: (profile: BusinessProfile) => void
  profiles: BusinessProfile[]
  selectedKey: string
}

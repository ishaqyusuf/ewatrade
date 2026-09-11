import type { BusinessProfile } from "@ewatrade/utils"
import type { ReactNode } from "react"

export type SignUpStep = "businessType" | "profile" | "business" | "account"

export type SignUpPresentationProps = {
  children: ReactNode
  footer: ReactNode
  header: { step: number; subtitle: string; title: string }
  onBack: () => void
  step: SignUpStep
}

export type SignUpCategoriesProps = {
  onSelect: (profile: BusinessProfile) => void
  profiles: BusinessProfile[]
  selectedKey: string
}

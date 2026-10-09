import type { BusinessProfile } from "@ewatrade/utils"
import type { ReactNode } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"

export type SignUpStep = "businessType" | "profile" | "business" | "account"

export type SignUpPresentationProps = {
  children: ReactNode
  footer: ReactNode
  header: { step: number; subtitle: string; title: string }
  /** The owner's answers so far, shown as a preview of their Home. */
  preview?: SignUpPreview
  onBack: () => void
  /** Lets the screen's search footer hide while the form scrolls down. */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  step: SignUpStep
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

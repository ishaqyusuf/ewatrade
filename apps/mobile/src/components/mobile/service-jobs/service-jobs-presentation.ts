import type { ReactNode } from "react"
import type { WorkJob } from "./service-jobs-model"

export type ServiceHeaderProps = {
  mode: "queue" | "intake" | "job"
  title: string
  description: string
  meta?: string
}
export type ServiceJobRowProps = {
  job: WorkJob
  onPress: () => void
  /** Classic rows share one card: the first rounds the top, the last the bottom. */
  first?: boolean
  last?: boolean
}
export type ServiceSectionProps = {
  title: string
  description?: string
  children: ReactNode
}
export type ServiceChoiceProps = {
  title: string
  description?: string
  selected: boolean
  disabled?: boolean
  onPress: () => void
  role?: "checkbox" | "radio"
}

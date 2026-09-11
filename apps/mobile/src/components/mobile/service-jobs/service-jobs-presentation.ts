import type { ReactNode } from "react"
import type { WorkJob } from "./service-jobs-model"

export type ServiceHeaderProps = {
  mode: "queue" | "intake" | "job"
  title: string
  description: string
  meta?: string
}
export type ServiceJobRowProps = { job: WorkJob; onPress: () => void }
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

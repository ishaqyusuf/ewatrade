import { ActionButton } from "@/components/mobile/action-button"
import type { ComponentProps } from "react"

export function ServiceAction({
  tone = "palm",
  ...props
}: Omit<ComponentProps<typeof ActionButton>, "tone"> & {
  tone?: "palm" | "gold"
}) {
  return <ActionButton {...props} tone={tone === "gold" ? "gold" : undefined} />
}

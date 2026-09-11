import type { RetailOpsBusiness } from "@/store/businessStore"

export type WorkspaceHeaderProps = { count: number; currentName: string }
export type WorkspaceRowProps = {
  business: RetailOpsBusiness
  currentBusinessId: string | undefined
  disabled: boolean
  busy: boolean
  onPress: () => void
}

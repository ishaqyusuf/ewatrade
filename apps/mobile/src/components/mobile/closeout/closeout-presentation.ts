import type { CloseoutLine } from "./closeout-model"
import type { useCloseout } from "./use-closeout"
export type CloseoutViewModel = ReturnType<typeof useCloseout>
export type CloseoutHeaderProps = {
  attendantName: string
  storeName: string
  count: number | null
  changedCount: number | null
  loading?: boolean
  offline?: boolean
  updatedAt?: number
  completed?: boolean
  /** Green Till sub line: what differs, e.g. "Eggs −2 crate · Feed +1 bag". */
  differences?: string
}
export type CloseoutRowProps = {
  line: CloseoutLine
  index: number
  /** Last row of the counted list (rounds the card's bottom corners). */
  last?: boolean
  disabled: boolean
  onChange: (value: string) => void
}

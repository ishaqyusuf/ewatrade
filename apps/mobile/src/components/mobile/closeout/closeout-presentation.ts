import type { CloseoutLine } from "./closeout-model"
import type { useCloseout } from "./use-closeout"
export type CloseoutViewModel = ReturnType<typeof useCloseout>
export type CloseoutHeaderProps = {
  attendantName: string
  storeName: string
  count: number | null
  changedCount: number | null
}
export type CloseoutRowProps = {
  line: CloseoutLine
  index: number
  disabled: boolean
  onChange: (value: string) => void
}

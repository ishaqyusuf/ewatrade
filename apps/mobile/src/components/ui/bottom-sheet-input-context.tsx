import { useBottomSheetInternal } from "@gorhom/bottom-sheet"
import { type ReactNode, createContext, useContext } from "react"

const BottomSheetInputContext = createContext(false)

type BottomSheetInputProviderProps = {
  children: ReactNode
}

export function BottomSheetInputProvider({
  children,
}: BottomSheetInputProviderProps) {
  return (
    <BottomSheetInputContext.Provider value>
      {children}
    </BottomSheetInputContext.Provider>
  )
}

/** True only inside a Gorhom sheet, so a form shared by a sheet and a
 * full-screen view renders plain inputs when it is not in a sheet. */
export function useBottomSheetInput() {
  const sheet = useBottomSheetInternal(true)
  return useContext(BottomSheetInputContext) && sheet !== null
}

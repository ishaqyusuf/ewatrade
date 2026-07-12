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

export function useBottomSheetInput() {
  return useContext(BottomSheetInputContext)
}

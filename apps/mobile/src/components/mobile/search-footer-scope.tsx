import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { View } from "react-native"
import {
  BottomSearchFooter,
  type BottomSearchFooterProps,
} from "./bottom-search-footer"

type SearchProps = Pick<
  BottomSearchFooterProps,
  | "accessibilityLabel"
  | "autoFocus"
  | "editable"
  | "localSearch"
  | "maxLength"
  | "onChangeText"
  | "placeholder"
  | "value"
>
type Registration = { id: string; props: SearchProps }
const SearchContext = createContext<{
  register: (entry: Registration) => void
  unregister: (id: string) => void
  height: number
} | null>(null)

/** One owning viewport for an embedded search, using Global Search's exact dock.
 * Place inside a sheet to retain that sheet's keyboard owner. Nested scopes keep
 * picker searches independent of the screen beneath them. */
export function SearchFooterScope({
  children,
  className = "flex-1",
  sheet = false,
}: {
  children: ReactNode
  className?: string
  sheet?: boolean
}) {
  const [active, setActive] = useState<Registration | null>(null)
  const [height, setHeight] = useState(0)
  const register = useCallback((entry: Registration) => setActive(entry), [])
  const unregister = useCallback((id: string) => {
    setActive((current) => (current?.id === id ? null : current))
  }, [])
  const context = useMemo(
    () => ({ register, unregister, height: active ? height : 0 }),
    [register, unregister, height, active],
  )
  const footer = active ? (
    <BottomSearchFooter
      {...active.props}
      alwaysShowSearch
      includeSafeArea={!sheet}
      keyboardOwner={sheet ? "sheet" : "screen"}
      onHeightChange={setHeight}
      totalCount={0}
    />
  ) : null
  return (
    <SearchContext.Provider value={context}>
      <View className={className}>
        {children}
        {sheet ? (
          <BottomSheetInputProvider>{footer}</BottomSheetInputProvider>
        ) : (
          footer
        )}
      </View>
    </SearchContext.Provider>
  )
}

/** Declares search where its state lives; the nearest viewport owns the dock. */
export function SearchFooterField({
  accessibilityLabel,
  autoFocus,
  editable,
  localSearch,
  maxLength = 160,
  onChangeText,
  placeholder,
  value,
}: SearchProps) {
  const context = useContext(SearchContext)
  if (!context)
    throw new Error("SearchFooterField requires a SearchFooterScope")
  const { register, unregister } = context
  const id = useId()
  const change = useRef(onChangeText)
  change.current = onChangeText
  const onChange = useCallback((next: string) => change.current(next), [])
  useLayoutEffect(() => {
    register({
      id,
      props: {
        accessibilityLabel,
        autoFocus,
        editable,
        localSearch,
        maxLength,
        onChangeText: onChange,
        placeholder,
        value,
      },
    })
  }, [
    id,
    register,
    accessibilityLabel,
    autoFocus,
    editable,
    localSearch,
    maxLength,
    onChange,
    placeholder,
    value,
  ])
  useLayoutEffect(() => () => unregister(id), [id, unregister])
  return null
}

/** Reserve the measured floating dock inside the owning scroll content. */
export function SearchFooterSpacer() {
  const context = useContext(SearchContext)
  return context?.height ? (
    <View style={{ height: context.height + 24 }} />
  ) : null
}

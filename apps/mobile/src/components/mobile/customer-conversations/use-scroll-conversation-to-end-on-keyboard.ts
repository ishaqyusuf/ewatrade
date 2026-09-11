import type { RefObject } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native"

type ConversationListHandle = {
  scrollToOffset: (options: { animated?: boolean; offset: number }) => void
}

export function useConversationKeyboardInset(
  listRef: RefObject<ConversationListHandle | null>,
) {
  const scrollOffsetRef = useRef(0)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const onConversationScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetRef.current = event.nativeEvent.contentOffset.y
    },
    [],
  )

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      "keyboardDidShow",
      (event) => {
        setKeyboardInset(Math.max(0, event.endCoordinates.height))
      },
    )
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardInset(0)
    })

    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [])

  useEffect(() => {
    if (keyboardInset <= 0) return

    const scrollTimer = setTimeout(() => {
      listRef.current?.scrollToOffset({
        animated: true,
        offset: scrollOffsetRef.current + keyboardInset,
      })
    }, 180)

    return () => {
      clearTimeout(scrollTimer)
    }
  }, [keyboardInset, listRef])

  return { keyboardInset, onConversationScroll }
}

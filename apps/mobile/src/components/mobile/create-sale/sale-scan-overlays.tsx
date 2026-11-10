import { ActionButton } from "@/components/mobile/action-button"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { BottomSheetView } from "@gorhom/bottom-sheet"
import { useEffect, useRef } from "react"
import { View as NativeView } from "react-native"
import type { SaleScan } from "./use-sale-scan"
import type { SaleScanLink } from "./use-sale-scan-link"

// Workshop Mobile Quality 02 v3, direction 01 "Grouped by item".

/**
 * The camera closes and this floating sheet asks what to do with a code no
 * item uses. Catalog editors can link it or create an item; anyone can cancel,
 * which reopens the camera. The chosen action runs once the sheet has closed.
 */
export function SaleScanUnknownSheet({
  scan,
  link,
}: {
  scan: SaleScan
  link: SaleScanLink
}) {
  const sheet = useModal()
  const code = scan.notice?.kind === "unknown" ? scan.notice.code : undefined
  const next = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (code) sheet.present()
  }, [code, sheet.present])
  const choose = (action: () => void) => {
    next.current = action
    sheet.dismiss()
  }
  const reopen = () => scan.open()
  return (
    <Modal
      ref={sheet.ref}
      enableDynamicSizing
      snapPoints={[]}
      title="No item uses this code"
      onDismiss={() => {
        // A swipe or backdrop tap is Cancel: back to scanning.
        const action = next.current ?? reopen
        next.current = null
        scan.dismissNotice()
        action()
      }}
    >
      <BottomSheetView
        style={{ gap: 12, paddingBottom: 24, paddingHorizontal: 20 }}
      >
        <View className="flex-row items-center gap-2.5 self-start rounded-full bg-muted px-3.5 py-2">
          <Icon
            className="size-[18px] text-muted-foreground"
            name="BarcodeScan"
          />
          <Text className="text-[15px] font-extrabold tabular-nums text-foreground">
            {code ?? ""}
          </Text>
        </View>
        {link.canLink && code ? (
          <>
            <ActionButton
              icon="Link"
              onPress={() => choose(() => link.start(code))}
            >
              Link to an item
            </ActionButton>
            <ActionButton
              icon="Plus"
              onPress={() => choose(() => link.create(code))}
              variant="outline"
            >
              Create new item
            </ActionButton>
          </>
        ) : (
          <ActionButton icon="Search" onPress={() => choose(scan.searchByName)}>
            Search by name
          </ActionButton>
        )}
        <ActionButton onPress={() => choose(reopen)} variant="ghost">
          Cancel
        </ActionButton>
      </BottomSheetView>
    </Modal>
  )
}

/**
 * Added / "is now 2" with Undo, full width: at the top edge while scanning,
 * otherwise above the search footer. Position lives on a plain native view
 * because the shared View drops className styles when `style` is passed.
 */
export function SaleScanAddedBar({
  scan,
  bottom,
}: {
  scan: SaleScan
  bottom?: number
}) {
  // Icon resolves only base theme tokens; Green Till colours are passed in.
  const palette = GREEN_TILL_THEME[useColorScheme().colorScheme]
  if (!scan.added) return null
  const { name, previous, quantity } = scan.added
  return (
    <NativeView
      pointerEvents="box-none"
      style={[
        { left: 12, position: "absolute", right: 12 },
        bottom === undefined ? { top: 8 } : { bottom },
      ]}
    >
      <View
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-2.5 rounded-2xl bg-foreground px-4 py-3 shadow-sm"
      >
        <View className="size-6 items-center justify-center rounded-full bg-gold">
          <Icon
            className="size-[14px]"
            color={palette.goldForeground}
            name="Check"
          />
        </View>
        <Text
          className="min-w-0 flex-1 text-sm font-bold text-background"
          numberOfLines={1}
        >
          {previous === null ? `Added ${name}` : `${name} is now ${quantity}`}
        </Text>
        <Pressable
          accessibilityLabel={`Undo adding ${name}`}
          accessibilityRole="button"
          haptic
          hitSlop={8}
          onPress={scan.undo}
        >
          <Text className="text-sm font-extrabold text-gold">Undo</Text>
        </Pressable>
      </View>
    </NativeView>
  )
}

/** "Barcode linked to …" at the bottom edge after Link barcode saves. */
export function SaleScanLinkedToast({
  name,
  bottom,
}: {
  name: string | null
  bottom: number
}) {
  const palette = GREEN_TILL_THEME[useColorScheme().colorScheme]
  if (!name) return null
  return (
    <NativeView
      pointerEvents="none"
      style={{ bottom, left: 16, position: "absolute", right: 16 }}
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        className="flex-row items-center gap-2.5 self-center rounded-full bg-foreground px-4 py-2.5 shadow-sm"
      >
        <Icon className="size-[16px]" color={palette.gold} name="Link" />
        <Text
          className="shrink text-sm font-bold text-background"
          numberOfLines={1}
        >
          {`Barcode linked to ${name}`}
        </Text>
      </View>
    </NativeView>
  )
}

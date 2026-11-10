import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { BottomSheetView } from "@gorhom/bottom-sheet"
import { Suspense, lazy, useEffect } from "react"
import { saleScanMatchName, saleScanNoticeCopy } from "./sale-scan-model"
import type { SaleScan } from "./use-sale-scan"

const DockedBarcodeScanner = lazy(() =>
  import("../barcode-camera-screen").then((module) => ({
    default: module.DockedBarcodeScanner,
  })),
)

/** Unknown code, QR link or a failed check, with the manual route first. */
export function SaleScanNoticeCard({
  scan,
  onLink,
  onCreate,
}: {
  scan: SaleScan
  /** Catalog editors only: attach an unknown code to an item. */
  onLink?: (code: string) => void
  onCreate?: (code: string) => void
}) {
  if (!scan.notice) return null
  const copy = saleScanNoticeCopy(scan.notice)
  const unknownCode =
    scan.notice.kind === "unknown" ? scan.notice.code : undefined
  return (
    <View
      accessibilityLiveRegion="polite"
      className="gap-3 rounded-[18px] border-l-4 border-l-gold bg-card px-4 py-3"
    >
      <View className="gap-1">
        <Text className="text-[15px] font-extrabold text-foreground">
          {copy.title}
        </Text>
        <Text className="text-sm text-muted-foreground">{copy.message}</Text>
      </View>
      {unknownCode && (onLink || onCreate) ? (
        <View className="flex-row flex-wrap gap-2">
          {onLink ? (
            <ActionButton icon="Link" onPress={() => onLink(unknownCode)}>
              Link to an item
            </ActionButton>
          ) : null}
          {onCreate ? (
            <ActionButton
              icon="Plus"
              onPress={() => onCreate(unknownCode)}
              variant="secondary"
            >
              Create new item
            </ActionButton>
          ) : null}
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <ActionButton icon="Search" onPress={scan.searchByName}>
          Search by name
        </ActionButton>
        {scan.available ? (
          <ActionButton
            icon="BarcodeScan"
            onPress={scan.open}
            variant="secondary"
          >
            Scan again
          </ActionButton>
        ) : null}
      </View>
    </View>
  )
}

/**
 * Short confirmation with Undo: above the search footer, or at the top edge
 * while the docked scanner is open.
 */
export function SaleScanAddedBar({
  scan,
  bottom,
}: {
  scan: SaleScan
  bottom?: number
}) {
  if (!scan.added) return null
  const { name, previous, quantity } = scan.added
  return (
    <View
      accessibilityLiveRegion="polite"
      className="absolute inset-x-3 flex-row items-center gap-2.5 rounded-2xl bg-foreground px-4 py-3"
      pointerEvents="box-none"
      style={bottom === undefined ? { top: 8 } : { bottom }}
    >
      <Icon className="size-[18px] text-gold" name="Check" />
      <Text className="min-w-0 flex-1 text-sm font-bold text-background">
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
  )
}

/** The docked camera and the shared-code choice. */
export function SaleScanLayers({ scan }: { scan: SaleScan }) {
  const chooser = useModal()
  const open = Boolean(scan.choices)
  useEffect(() => {
    if (open) chooser.present()
    else chooser.dismiss()
  }, [open, chooser.present, chooser.dismiss])
  return (
    <>
      {scan.scanning ? (
        // Docked in the lower half: the sale stays visible above and the
        // camera keeps scanning until it is closed.
        <View className="h-1/2">
          <Suspense
            fallback={
              <View className="flex-1 gap-4 rounded-t-[24px] bg-card px-4 pt-4">
                <StatusBanner message="Opening camera…" tone="default" />
                <ActionButton
                  icon="Search"
                  onPress={scan.searchByName}
                  variant="outline"
                >
                  Search by name instead
                </ActionButton>
              </View>
            }
          >
            <DockedBarcodeScanner
              onClose={scan.close}
              onRead={(code) => void scan.read(code)}
              paused={Boolean(scan.choices)}
            />
          </Suspense>
        </View>
      ) : null}
      <Modal
        onDismiss={scan.dismissChoices}
        ref={chooser.ref}
        title="Which item is this?"
      >
        <BottomSheetView
          style={{ gap: 12, paddingBottom: 28, paddingHorizontal: 20 }}
        >
          <Text className="text-sm text-muted-foreground">
            {`${scan.choices?.matches.length ?? 0} items use code ${scan.choices?.code ?? ""}.`}
          </Text>
          <View className="overflow-hidden rounded-[18px] border border-border">
            {scan.choices?.matches.map((match, index) => (
              <Pressable
                accessibilityRole="button"
                className={
                  index ? "border-t border-border px-4 py-3" : "px-4 py-3"
                }
                haptic
                key={match.offeringId}
                onPress={() => scan.choose(match)}
              >
                <View className="flex-row items-center gap-3">
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-bold text-foreground">
                      {saleScanMatchName(match)}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {`${match.unitName} · ${match.matchedBy === "barcode" ? "barcode" : "SKU"}`}
                    </Text>
                  </View>
                  <Icon
                    className="size-[18px] text-muted-foreground"
                    name="ChevronRight"
                  />
                </View>
              </Pressable>
            ))}
          </View>
          <ActionButton
            icon="Search"
            onPress={scan.searchByName}
            variant="ghost"
          >
            Search by name instead
          </ActionButton>
        </BottomSheetView>
      </Modal>
    </>
  )
}

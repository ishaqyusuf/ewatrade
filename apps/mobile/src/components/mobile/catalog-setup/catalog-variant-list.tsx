import { ClassicCatalogVariantRow } from "@/components/mobile/appearances/classic/catalog-variant-manager"
import { MarketCatalogVariantRow } from "@/components/mobile/appearances/market-day/catalog-variant-manager"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "react-native"
import { useState } from "react"
import { catalogSetupClassName } from "./catalog-setup-presentation"
import type { CatalogVariantRow } from "./catalog-variant-model"

const PAGE_SIZE = 12

// This lives inside the setup's keyboard-aware scroll. A bounded window avoids
// nested virtualized lists and thousands of mounted native option/unit rows.
export function CatalogVariantList({
  rows,
  kind,
  market,
  disabled,
  onEdit,
  onMenu,
  onPageChange,
}: {
  rows: CatalogVariantRow[]
  kind: "product" | "service"
  market: boolean
  disabled: boolean
  onEdit: (key: string, unitId?: string) => void
  onMenu: (key: string, unitId?: string) => void
  onPageChange?: () => void
}) {
  const [requestedPage, setRequestedPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const page = Math.min(requestedPage, pages - 1)
  const start = page * PAGE_SIZE
  const visibleRows = rows.slice(start, start + PAGE_SIZE)
  const Row = market ? MarketCatalogVariantRow : ClassicCatalogVariantRow
  const changePage = (next: number) => {
    if (disabled) return
    setRequestedPage(Math.max(0, Math.min(next, pages - 1)))
    onPageChange?.()
  }
  const navigation =
    pages > 1 ? (
      <View className="gap-2 py-3">
        <Text
          accessibilityLiveRegion="polite"
          className={catalogSetupClassName(
            "text-xs text-muted-foreground",
            market,
          )}
        >
          Listings {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of{" "}
          {rows.length} · Page {page + 1} of {pages}
        </Text>
        <View className="flex-row flex-wrap gap-3">
          <PageButton
            market={market}
            disabled={disabled || page === 0}
            label="Previous"
            icon="ChevronLeft"
            onPress={() => changePage(page - 1)}
          />
          <PageButton
            market={market}
            disabled={disabled || page === pages - 1}
            label="Next"
            icon="ChevronRight"
            onPress={() => changePage(page + 1)}
          />
        </View>
      </View>
    ) : null
  return (
    <View className={market ? "gap-1" : "border-t border-border"}>
      {navigation}
      {visibleRows.map((row) => (
        <Row
          key={row.key}
          row={row}
          kind={kind}
          disabled={disabled}
          onEdit={() => onEdit(row.combinationKey, row.unitId)}
          onMenu={() => onMenu(row.combinationKey, row.unitId)}
        />
      ))}
      {rows.length === 0 ? (
        <Text
          className={catalogSetupClassName(
            "py-5 text-sm text-muted-foreground",
            market,
          )}
        >
          Add an option value to configure its price.
        </Text>
      ) : null}
      {navigation}
    </View>
  )
}

function PageButton({
  market,
  disabled,
  label,
  icon,
  onPress,
}: {
  market: boolean
  disabled: boolean
  label: string
  icon: "ChevronLeft" | "ChevronRight"
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} option listings`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={catalogSetupClassName(
        `min-h-11 flex-row items-center justify-center gap-2 rounded-full border border-border px-4 py-2 ${disabled ? "opacity-40" : "active:bg-muted"}`,
        market,
      )}
    >
      {icon === "ChevronLeft" ? (
        <Icon
          name={icon}
          className={catalogSetupClassName("size-xs text-foreground", market)}
        />
      ) : null}
      <Text
        className={catalogSetupClassName(
          "text-sm font-bold text-foreground [-rn-line-height:20] [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
          market,
        )}
      >
        {label}
      </Text>
      {icon === "ChevronRight" ? (
        <Icon
          name={icon}
          className={catalogSetupClassName("size-xs text-foreground", market)}
        />
      ) : null}
    </Pressable>
  )
}

import { ClassicCatalogVariantRow } from "@/components/mobile/appearances/classic/catalog-variant-manager"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useState } from "react"
import { View } from "react-native"
import type { CatalogVariantRow } from "./catalog-variant-model"

const PAGE_SIZE = 12

// This lives inside the setup's keyboard-aware scroll. A bounded window avoids
// nested virtualized lists and thousands of mounted native option/unit rows.
export function CatalogVariantList({
  rows,
  kind,
  disabled,
  onEdit,
  onMenu,
  onPageChange,
}: {
  rows: CatalogVariantRow[]
  kind: "product" | "service"
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
          className="text-xs text-muted-foreground"
        >
          Listings {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of{" "}
          {rows.length} · Page {page + 1} of {pages}
        </Text>
        <View className="flex-row flex-wrap gap-3">
          <PageButton
            disabled={disabled || page === 0}
            label="Previous"
            icon="ChevronLeft"
            onPress={() => changePage(page - 1)}
          />
          <PageButton
            disabled={disabled || page === pages - 1}
            label="Next"
            icon="ChevronRight"
            onPress={() => changePage(page + 1)}
          />
        </View>
      </View>
    ) : null
  return (
    <View className="border-t border-border">
      {navigation}
      {visibleRows.map((row) => (
        <ClassicCatalogVariantRow
          key={row.key}
          row={row}
          kind={kind}
          disabled={disabled}
          onEdit={() => onEdit(row.combinationKey, row.unitId)}
          onMenu={() => onMenu(row.combinationKey, row.unitId)}
        />
      ))}
      {rows.length === 0 ? (
        <Text className="py-5 text-sm text-muted-foreground">
          Add an option value to configure its price.
        </Text>
      ) : null}
      {navigation}
    </View>
  )
}

function PageButton({
  disabled,
  label,
  icon,
  onPress,
}: {
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
      className={`min-h-11 flex-row items-center justify-center gap-2 rounded-full border border-border px-4 py-2 ${disabled ? "opacity-40" : "active:bg-muted"}`}
    >
      {icon === "ChevronLeft" ? (
        <Icon name={icon} className="size-xs text-foreground" />
      ) : null}
      <Text className="text-sm font-bold text-foreground [-rn-line-height:22] [-rn-include-font-padding:false] [-rn-text-align-vertical:center]">
        {label}
      </Text>
      {icon === "ChevronRight" ? (
        <Icon name={icon} className="size-xs text-foreground" />
      ) : null}
    </Pressable>
  )
}

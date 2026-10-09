import { ActionButton } from "@/components/mobile/action-button"
import { ConversionRow as ClassicRow } from "@/components/mobile/appearances/classic/unit-conversion"
import { ConversionRow as MarketRow } from "@/components/mobile/appearances/market-day/unit-conversion"
import { FormField } from "@/components/mobile/form-field"
import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useState } from "react"
import {
  type ConversionBalance,
  conversionCustody,
} from "./unit-conversion-model"

export function ConversionBalanceChoices({
  rows,
  selectedId,
  disabled,
  market,
  label,
  emptyMessage,
  onSelect,
  onPageChange,
}: {
  rows: ConversionBalance[]
  selectedId: string
  disabled: boolean
  market: boolean
  label: string
  emptyMessage: string
  onSelect: (id: string) => void
  onPageChange: () => void
}) {
  const chooser = useModal()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const palette = useMarketDayPalette()
  const Row = market ? MarketRow : ClassicRow
  const filtered = rows.filter((row) =>
    `${row.productName} ${row.variantName} ${row.inventoryUnitName} ${conversionCustody(row)}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12))
  const currentPage = Math.min(page, pageCount - 1)
  const selected = rows.find((row) => row.balanceSourceId === selectedId)
  const muted = market ? "text-market-muted-ink" : "text-muted-foreground"
  const content = (
    <View className="gap-3">
      <View accessibilityRole="radiogroup" accessibilityLabel={label}>
        {filtered.slice(currentPage * 12, (currentPage + 1) * 12).map((row) => (
          <Row
            key={row.balanceSourceId}
            row={row}
            selected={selectedId === row.balanceSourceId}
            disabled={disabled}
            onPress={() => {
              onSelect(row.balanceSourceId)
              if (!market) chooser.dismiss()
            }}
          />
        ))}
      </View>
      {!filtered.length ? (
        <Text className={`text-sm ${muted}`}>
          {query ? "No matching balances. Try another search." : emptyMessage}
        </Text>
      ) : null}
      {rows.length > 0 || query ? (
        <FormField
          accessibilityLabel={`Search ${label.toLowerCase()}`}
          label={`Find ${label.toLowerCase()}`}
          maxLength={160}
          variant={market ? "market-search" : "search"}
          value={query}
          onChangeText={(value) => {
            setQuery(value)
            setPage(0)
          }}
          placeholder="Product, variant, unit, custody"
        />
      ) : null}
      {pageCount > 1 ? (
        <View className="gap-2">
          <Text className={`text-xs ${muted}`}>
            Page {currentPage + 1} of {pageCount} · {filtered.length} matching
            balances
          </Text>
          <ActionButton
            variant="outline"
            disabled={currentPage === 0}
            onPress={() => {
              setPage(currentPage - 1)
              onPageChange()
            }}
            foregroundColor={market ? palette.ink : undefined}
            className={
              market ? "border-market-line bg-market-field" : undefined
            }
          >
            Previous balances
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={currentPage + 1 === pageCount}
            onPress={() => {
              setPage(currentPage + 1)
              onPageChange()
            }}
            foregroundColor={market ? palette.ink : undefined}
            className={
              market ? "border-market-line bg-market-field" : undefined
            }
          >
            Next balances
          </ActionButton>
        </View>
      ) : null}
      {selected ? (
        <Text className={`text-xs ${muted}`}>
          Selected: {selected.productName} · {selected.variantName} ·{" "}
          {selected.inventoryUnitName} · {conversionCustody(selected)}
        </Text>
      ) : null}
    </View>
  )
  return market ? (
    content
  ) : (
    <>
      <ActionButton
        variant="outline"
        disabled={disabled}
        onPress={() => chooser.present()}
      >
        {selected
          ? `${selected.productName} · ${selected.inventoryUnitName} · ${selected.onHandQuantity} available`
          : `Choose ${label.toLowerCase()}`}
      </ActionButton>
      <Modal
        ref={chooser.ref}
        title={label}
        snapPoints={["80%"]}
        enableDynamicSizing={false}
      >
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 18, paddingBottom: 32 }}
        >
          {content}
        </BottomSheetScrollView>
      </Modal>
    </>
  )
}

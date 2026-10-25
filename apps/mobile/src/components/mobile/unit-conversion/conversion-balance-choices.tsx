import { ActionButton } from "@/components/mobile/action-button"
import { ConversionRow } from "@/components/mobile/appearances/classic/unit-conversion"
import {
  SearchFooterField,
  SearchFooterScope,
  SearchFooterSpacer,
} from "@/components/mobile/search-footer-scope"
import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
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
  label,
  emptyMessage,
  onSelect,
  onPageChange,
}: {
  rows: ConversionBalance[]
  selectedId: string
  disabled: boolean
  label: string
  emptyMessage: string
  onSelect: (id: string) => void
  onPageChange: () => void
}) {
  const chooser = useModal()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const filtered = rows.filter((row) =>
    `${row.productName} ${row.variantName} ${row.inventoryUnitName} ${conversionCustody(row)}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12))
  const currentPage = Math.min(page, pageCount - 1)
  const selected = rows.find((row) => row.balanceSourceId === selectedId)
  const content = (
    <View className="gap-3">
      <View accessibilityRole="radiogroup" accessibilityLabel={label}>
        {filtered.slice(currentPage * 12, (currentPage + 1) * 12).map((row) => (
          <ConversionRow
            key={row.balanceSourceId}
            row={row}
            selected={selectedId === row.balanceSourceId}
            disabled={disabled}
            onPress={() => {
              onSelect(row.balanceSourceId)
              chooser.dismiss()
            }}
          />
        ))}
      </View>
      {!filtered.length ? (
        <Text className="text-sm text-muted-foreground">
          {query ? "No matching balances. Try another search." : emptyMessage}
        </Text>
      ) : null}
      {rows.length > 0 || query ? (
        <SearchFooterField
          localSearch
          accessibilityLabel={`Search ${label.toLowerCase()}`}
          maxLength={160}
          value={query}
          onChangeText={(value) => {
            setQuery(value)
            setPage(0)
          }}
          placeholder="Item, variant, unit, custody"
        />
      ) : null}
      {pageCount > 1 ? (
        <View className="gap-2">
          <Text className="text-xs text-muted-foreground">
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
          >
            Next balances
          </ActionButton>
        </View>
      ) : null}
      {selected ? (
        <Text className="text-xs text-muted-foreground">
          Selected: {selected.productName} · {selected.variantName} ·{" "}
          {selected.inventoryUnitName} · {conversionCustody(selected)}
        </Text>
      ) : null}
    </View>
  )
  return (
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
        <SearchFooterScope sheet>
          <BottomSheetScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 18, paddingBottom: 32 }}
          >
            {content}
            <SearchFooterSpacer />
          </BottomSheetScrollView>
        </SearchFooterScope>
      </Modal>
    </>
  )
}

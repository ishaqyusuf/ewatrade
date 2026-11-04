import { ActionButton } from "@/components/mobile/action-button"
import { ConversionRow } from "@/components/mobile/appearances/classic/unit-conversion"
import { FullScreenModal } from "@/components/mobile/full-screen-form"
import {
  SearchFooterField,
  SearchFooterScope,
  SearchFooterSpacer,
} from "@/components/mobile/search-footer-scope"
import type { useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useState } from "react"
import { ScrollView } from "react-native"
import {
  type ConversionBalance,
  conversionCustody,
} from "./unit-conversion-model"

/** The From / To balance list: full screen, since it has a search. */
export function ConversionBalanceChooser({
  chooser,
  title,
  rows,
  selectedId,
  disabled,
  label,
  emptyMessage,
  onSelect,
  onPageChange,
}: {
  chooser: Pick<ReturnType<typeof useModal>, "ref" | "dismiss">
  title: string
  rows: ConversionBalance[]
  selectedId: string
  disabled: boolean
  label: string
  emptyMessage: string
  onSelect: (id: string) => void
  onPageChange: () => void
}) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const filtered = rows.filter((row) =>
    `${row.productName} ${row.variantName} ${row.inventoryUnitName} ${conversionCustody(row)}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12))
  const currentPage = Math.min(page, pageCount - 1)
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
    </View>
  )
  return (
    <FullScreenModal
      ref={chooser.ref}
      title={title}
      bottomInset={false}
      onDismiss={() => {
        setQuery("")
        setPage(0)
      }}
    >
      <SearchFooterScope>
        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 18, paddingBottom: 32 }}
        >
          {content}
          <SearchFooterSpacer />
        </ScrollView>
      </SearchFooterScope>
    </FullScreenModal>
  )
}

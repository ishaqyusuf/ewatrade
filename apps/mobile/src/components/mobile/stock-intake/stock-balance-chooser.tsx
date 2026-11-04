import { ActionButton } from "@/components/mobile/action-button"
import { StockRow as Row } from "@/components/mobile/appearances/classic/stock-intake"
import { FullScreenModal } from "@/components/mobile/full-screen-form"
import {
  SearchFooterField,
  SearchFooterScope,
  SearchFooterSpacer,
} from "@/components/mobile/search-footer-scope"
import type { useModal } from "@/components/ui/modal"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useEffect, useState } from "react"
import { ScrollView } from "react-native"
import {
  stockCustodyLabel,
  stockFactsLabel,
  stockKindLabel,
} from "./stock-intake-model"
import type { StockIntakeModel } from "./use-stock-intake"

/** Up to five balances are a short list; more get the full presentation. */
export function stockChooserLayout(total: number) {
  return total <= 5 ? "compact" : "full"
}
/** Bottom search: always past seven; for six or seven only when it overflows. */
export function stockChooserSearch(total: number, overflows: boolean) {
  return total > 7 || (total > 5 && overflows)
}
/**
 * Skeletons only until this screen's first authoritative balance read
 * (model.loading follows the hook's fresh-read gate, so old cache never shows
 * as zero choices). Background refreshes after that read never show skeletons.
 */
export function stockChooserLoading(
  model: Pick<StockIntakeModel, "loading" | "loadError">,
) {
  return model.loading && !model.loadError
}

type Chooser = Pick<ReturnType<typeof useModal>, "ref" | "dismiss">

/**
 * Choose stock balance: one full-screen list (three skeleton rows while
 * balances first load) that adds the bottom search once the list is long.
 * Thresholds use the unfiltered eligible count, so a search narrowing the
 * list never hides the search. It can take typing, so it is never a sheet.
 */
export function StockBalanceChooser({
  modal,
  model,
}: {
  modal: Chooser
  model: StockIntakeModel
}) {
  const loading = stockChooserLoading(model)
  const failed = !loading && Boolean(model.loadError) && !model.totalRows
  const total = model.totalRows
  const layout = loading || failed ? "compact" : stockChooserLayout(total)
  const [viewport, setViewport] = useState(0)
  const [content, setContent] = useState(0)
  // Once the search appears for an open it stays until the list closes.
  const [searchShown, setSearchShown] = useState(false)
  const overflows = viewport > 0 && content > viewport
  const search =
    layout === "full" && (searchShown || stockChooserSearch(total, overflows))
  useEffect(() => {
    if (search && !searchShown) setSearchShown(true)
  }, [search, searchShown])
  // A short list has no search: never leave it filtered by a stale query.
  const { query, setQuery } = model
  useEffect(() => {
    if (layout === "compact" && query) setQuery("")
  }, [layout, query, setQuery])

  const body = loading ? (
    <SkeletonGroup accessibilityLabel="Loading stock balances">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} height={64} />
      ))}
    </SkeletonGroup>
  ) : failed ? (
    <View className="gap-3">
      <Text className="text-sm text-muted-foreground">
        {model.loadError ?? "Stock balances could not load."}
      </Text>
      <ActionButton icon="RefreshCw" onPress={model.retryLoad} tone="soft">
        Try again
      </ActionButton>
    </View>
  ) : (
    <>
      {model.rows.map((item) => (
        <Row
          key={item.balanceSourceId}
          icon="Warehouse"
          title={item.productName}
          subtitle={`${item.variantName} · ${stockKindLabel(item)} · ${stockCustodyLabel(item, model.people)}`}
          quantityLabel={stockFactsLabel(item)}
          selected={model.selected?.balanceSourceId === item.balanceSourceId}
          disabled={model.locked}
          onPress={() => {
            model.edit({ balanceId: item.balanceSourceId })
            modal.dismiss()
          }}
        />
      ))}
      {!model.rows.length ? <Text>No matching stock balances.</Text> : null}
    </>
  )

  return (
    <FullScreenModal
      ref={modal.ref}
      title="Choose stock balance"
      closeLabel="Close stock balances"
      bottomInset={!search}
      onDismiss={() => {
        setSearchShown(false)
        setContent(0)
      }}
    >
      <SearchFooterScope>
        {search ? (
          <SearchFooterField
            accessibilityLabel="Find balance"
            localSearch
            maxLength={160}
            onChangeText={setQuery}
            placeholder="Item, variant, unit, custody"
            value={query}
          />
        ) : null}
        <ScrollView
          contentContainerStyle={{
            padding: 18,
            paddingTop: 4,
            gap: 12,
            paddingBottom: 24,
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
          onContentSizeChange={(_width, next) => setContent(next)}
        >
          {body}
          <SearchFooterSpacer />
        </ScrollView>
      </SearchFooterScope>
    </FullScreenModal>
  )
}

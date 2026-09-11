import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { formatMinorMoney } from "@ewatrade/utils"
import { useState } from "react"
import { ServiceAction } from "./service-action"
import { useServiceAppearance } from "./use-service-appearance"
import type { ServiceJobsModel } from "./use-service-jobs"

const PAGE_SIZE = 12

export function ServiceOfferingChoices({
  model,
  onPageChange,
}: { model: ServiceJobsModel; onPageChange: () => void }) {
  const {
    market,
    ServiceChoice: Choice,
    ServiceSection: Section,
  } = useServiceAppearance()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const rows = model.offerings.filter((row) =>
    row.displayName.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const lastPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  const start = currentPage * PAGE_SIZE
  const disabled = model.isOfflineMode || model.intakeMutation.isPending
  const muted = market ? "text-market-muted-ink" : "text-muted-foreground"
  return (
    <Section
      title="Services"
      description="Choose active fixed-price services. Your selections remain when changing pages."
    >
      {model.catalogQuery.isError && !model.isOfflineMode ? (
        <View className="gap-3">
          <StatusBanner
            icon="AlertCircle"
            title="Could not load services"
            message={model.catalogQuery.error.message}
            tone="destructive"
          />
          <ServiceAction
            variant="outline"
            onPress={() => void model.catalogQuery.refetch()}
            isLoading={model.catalogQuery.isFetching}
          >
            Retry services
          </ServiceAction>
        </View>
      ) : null}
      {model.catalogQuery.isPending && !model.isOfflineMode ? (
        <StatusBanner
          icon="Loader2"
          message="Loading available service offerings."
        />
      ) : rows.length === 0 ? (
        <StatusBanner
          icon="Info"
          title={query ? "No matching services" : "No direct-intake services"}
          message={
            query
              ? "Change or clear the search below."
              : "Add an available fixed-price Service Offering to the Catalog first."
          }
        />
      ) : null}
      {rows.slice(start, start + PAGE_SIZE).map((offering) => {
        const selected = model.quantities[offering.id] !== undefined
        const priceKnown = offering.fixedPriceMinor !== null
        return (
          <View key={offering.id} className="gap-3 py-1">
            <Choice
              title={offering.displayName}
              description={
                (priceKnown
                  ? formatMinorMoney(
                      offering.fixedPriceMinor ?? 0,
                      offering.currencyCode,
                    )
                  : "Price unavailable") +
                " · " +
                (offering.serviceWorkPolicy?.workPolicy === "TRACKED"
                  ? "Tracked work"
                  : "Order only")
              }
              selected={selected}
              disabled={disabled || !priceKnown}
              role="checkbox"
              onPress={() =>
                model.setQuantities((current) => {
                  if (selected) {
                    const next = { ...current }
                    delete next[offering.id]
                    return next
                  }
                  return { ...current, [offering.id]: "1" }
                })
              }
            />
            {selected ? (
              <FormField
                variant={market ? "market" : "filled"}
                label="Quantity"
                keyboardType="decimal-pad"
                maxLength={40}
                editable={!disabled}
                value={model.quantities[offering.id]}
                onChangeText={(value) =>
                  model.setQuantities((current) => ({
                    ...current,
                    [offering.id]: value,
                  }))
                }
              />
            ) : null}
          </View>
        )
      })}
      <Text className={muted + " text-xs"}>
        {rows.length
          ? start +
            1 +
            "–" +
            Math.min(start + PAGE_SIZE, rows.length) +
            " of " +
            rows.length +
            " matching services"
          : "0 matching services"}{" "}
        · {Object.keys(model.quantities).length} selected
      </Text>
      {lastPage > 0 ? (
        <View className="flex-row gap-2">
          <View className="flex-1">
            <ServiceAction
              variant="outline"
              disabled={currentPage === 0}
              onPress={() => {
                setPage(currentPage - 1)
                onPageChange()
              }}
            >
              Previous
            </ServiceAction>
          </View>
          <View className="flex-1">
            <ServiceAction
              variant="outline"
              disabled={currentPage === lastPage}
              onPress={() => {
                setPage(currentPage + 1)
                onPageChange()
              }}
            >
              Next
            </ServiceAction>
          </View>
        </View>
      ) : null}
      <FormField
        variant={market ? "market" : "filled"}
        label="Find a service"
        accessibilityLabel="Search available service offerings"
        leadingIcon="Search"
        autoCapitalize="none"
        maxLength={160}
        value={query}
        onChangeText={(value) => {
          setQuery(value)
          setPage(0)
        }}
      />
    </Section>
  )
}

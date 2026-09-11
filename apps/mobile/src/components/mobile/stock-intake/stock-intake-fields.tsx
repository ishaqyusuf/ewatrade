import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import * as Classic from "@/components/mobile/appearances/classic/stock-intake"
import * as Market from "@/components/mobile/appearances/market-day/stock-intake"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import type { StockIntakeModel } from "./use-stock-intake"
import { stockCustodyLabel } from "./stock-intake-model"

export function StockIntakeFields({
  model,
  market,
}: { model: StockIntakeModel; market: boolean }) {
  const {
    StockSection: Section,
    StockChoice: Choice,
    StockRow: Row,
  } = market ? Market : Classic
  const palette = useMarketDayPalette()
  const { draft, selected } = model
  const muted = market ? "text-market-muted-ink" : "text-muted-foreground"
  return (
    <View className="gap-6 pt-6">
      {selected ? (
        <Section
          title="Selected balance"
          description={`${selected.productName} · ${selected.variantName}`}
        >
          <Text className={`text-sm ${muted}`}>
            {selected.inventoryUnitName} ·{" "}
            {stockCustodyLabel(selected, model.people)} · Revision{" "}
            {selected.revision}
          </Text>
        </Section>
      ) : null}
      {draft.mode === "adjustment" ? (
        <Section title="Adjustment direction">
          <View
            accessibilityRole="radiogroup"
            className="flex-row flex-wrap gap-2"
          >
            {(["increase", "decrease"] as const).map((direction) => (
              <Choice
                key={direction}
                label={direction === "increase" ? "Increase" : "Decrease"}
                selected={draft.direction === direction}
                disabled={model.locked}
                onPress={() => model.edit({ direction })}
              />
            ))}
          </View>
        </Section>
      ) : null}
      {draft.mode === "custody" ? (
        <Section
          title="Move to"
          description="Custody moves keep the same Store and inventory unit."
        >
          <View
            accessibilityRole="radiogroup"
            className="flex-row flex-wrap gap-2"
          >
            <Choice
              label="Team member"
              selected={draft.targetCustodyType === "staff"}
              disabled={model.locked}
              onPress={() => model.edit({ targetCustodyType: "staff" })}
            />
            <Choice
              label="Central store"
              selected={draft.targetCustodyType === "store"}
              disabled={model.locked}
              onPress={() => model.edit({ targetCustodyType: "store" })}
            />
          </View>
          {draft.targetCustodyType === "staff" ? (
            <View className="gap-3">
              <FormField
                label="Find team member"
                variant={market ? "market-search" : "search"}
                value={model.personQuery}
                maxLength={160}
                onChangeText={model.setPersonQuery}
                editable={!model.locked}
              />
              {model.peopleLoading ? (
                <Text className={muted}>Loading team members…</Text>
              ) : model.peopleError ? (
                <StatusBanner
                  tone="destructive"
                  message={model.peopleError}
                  actionLabel={model.offline ? undefined : "Try again"}
                  onActionPress={model.retryPeople}
                />
              ) : model.visiblePeople.length ? (
                <View accessibilityRole="radiogroup">
                  {model.visiblePeople.map((person) => (
                    <Row
                      key={person.id}
                      icon="User"
                      title={person.name}
                      subtitle={person.email}
                      quantityLabel="Team member"
                      selected={draft.targetCustodyReferenceId === person.id}
                      disabled={model.locked}
                      onPress={() =>
                        model.edit({ targetCustodyReferenceId: person.id })
                      }
                    />
                  ))}
                </View>
              ) : (
                <Text className={muted}>No matching team members.</Text>
              )}
              {model.personPageCount > 1 ? (
                <View className="gap-2">
                  <Text className={muted}>
                    Team page {model.personPage + 1} of {model.personPageCount}
                  </Text>
                  <ActionButton
                    variant="outline"
                    disabled={model.personPage === 0 || model.locked}
                    onPress={() => model.setPersonPage(model.personPage - 1)}
                    foregroundColor={market ? palette.ink : undefined}
                    className={
                      market ? "border-market-line bg-market-field" : undefined
                    }
                  >
                    Previous members
                  </ActionButton>
                  <ActionButton
                    variant="outline"
                    disabled={
                      model.personPage + 1 >= model.personPageCount ||
                      model.locked
                    }
                    onPress={() => model.setPersonPage(model.personPage + 1)}
                    foregroundColor={market ? palette.ink : undefined}
                    className={
                      market ? "border-market-line bg-market-field" : undefined
                    }
                  >
                    Next members
                  </ActionButton>
                </View>
              ) : null}
              {draft.targetCustodyReferenceId ? (
                <Text className={`text-xs ${muted}`}>
                  Selected:{" "}
                  {model.people.find(
                    (person) => person.id === draft.targetCustodyReferenceId,
                  )?.name ?? "Team member no longer available"}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Section>
      ) : null}
      <Section
        title={draft.mode === "count" ? "Observed stock" : "Movement details"}
        description={
          selected
            ? `Enter ${selected.inventoryUnitName}. Up to ${Math.min(6, selected.inventoryUnitTransactionScale)} decimal places; no unit conversion is applied here.`
            : "Select a balance before entering its quantity."
        }
      >
        <FormField
          label={draft.mode === "count" ? "Observed quantity" : "Quantity"}
          keyboardType="decimal-pad"
          maxLength={40}
          variant="filled"
          value={draft.quantity}
          editable={!model.locked && Boolean(selected)}
          onChangeText={(quantity) => model.edit({ quantity })}
          placeholder={
            selected ? `In ${selected.inventoryUnitName}` : "Choose a balance"
          }
        />
        {draft.mode === "count" ? (
          <Text className={`text-xs ${muted}`}>
            Count sets the observed quantity, not an additional receipt. The
            current API requires a positive observation.
          </Text>
        ) : null}
        <FormField
          label="Reason"
          multiline
          maxLength={500}
          variant="filled"
          value={draft.reason}
          editable={!model.locked}
          onChangeText={(reason) => model.edit({ reason })}
          placeholder="Why is this stock movement being recorded?"
        />
      </Section>
    </View>
  )
}

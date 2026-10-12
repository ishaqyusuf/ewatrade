import { ActionButton } from "@/components/mobile/action-button"
import {
  StockChoice as Choice,
  StockRow as Row,
  StockSection as Section,
} from "@/components/mobile/appearances/classic/stock-intake"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { ExactQuantityStepper } from "./exact-quantity-stepper"
import { StockCategoriesInput } from "./stock-categories-input"
import type { StockIntakeModel } from "./use-stock-intake"

export function StockIntakeFields({ model }: { model: StockIntakeModel }) {
  const { draft, selected } = model
  return (
    <View className="gap-6 pt-6">
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
                variant="search"
                value={model.personQuery}
                maxLength={160}
                onChangeText={model.setPersonQuery}
                editable={!model.locked}
              />
              {model.peopleLoading ? (
                <Text className="text-muted-foreground">
                  Loading team members…
                </Text>
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
                <Text className="text-muted-foreground">
                  No matching team members.
                </Text>
              )}
              {model.personPageCount > 1 ? (
                <View className="gap-2">
                  <Text className="text-muted-foreground">
                    Team page {model.personPage + 1} of {model.personPageCount}
                  </Text>
                  <ActionButton
                    variant="outline"
                    disabled={model.personPage === 0 || model.locked}
                    onPress={() => model.setPersonPage(model.personPage - 1)}
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
                  >
                    Next members
                  </ActionButton>
                </View>
              ) : null}
              {draft.targetCustodyReferenceId ? (
                <Text className="text-xs text-muted-foreground">
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
        <View className="gap-2 rounded-[20px] bg-card p-4 shadow-sm">
          <ExactQuantityStepper
            label={
              draft.mode === "count"
                ? "Counted on hand"
                : draft.mode === "receipt"
                  ? "Quantity received"
                  : draft.mode === "adjustment"
                    ? "Quantity to adjust"
                    : "Quantity to move"
            }
            value={draft.quantity}
            onChange={(quantity) => model.edit({ quantity })}
            disabled={model.locked || !selected}
          />
          {selected ? (
            <Text className="text-center text-xs text-muted-foreground">
              In {selected.inventoryUnitName}
            </Text>
          ) : null}
        </View>
        {draft.mode === "count" ? (
          <Text className="text-xs text-muted-foreground">
            Count sets the observed quantity, not an additional receipt. The
            current API requires a positive observation.
          </Text>
        ) : null}
        {draft.mode === "receipt" || draft.mode === "adjustment" ? (
          <StockCategoriesInput
            value={draft.categories}
            input={draft.categoryInput}
            disabled={model.locked}
            onChange={(categories) => model.edit({ categories })}
            onInputChange={(categoryInput) => model.edit({ categoryInput })}
          />
        ) : (
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
        )}
      </Section>
    </View>
  )
}

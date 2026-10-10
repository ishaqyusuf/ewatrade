import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useRouter } from "expo-router"
import { ActionButton } from "../action-button"
import { ListCard, StatusPill } from "../green-till/kit"
import {
  type SetupEntity,
  setupEntityPayload,
  setupErrorSummary,
  setupRecordRoute,
  setupSource,
  setupSummary,
} from "./setup-model"
export function SetupRecordCard({
  entity,
  currency,
  disabled,
  onState,
  onEdit,
  onAdd,
}: {
  entity: SetupEntity
  currency: string
  disabled: boolean
  onState: (state: "CONFIRMED" | "PROPOSED" | "SKIPPED") => void
  onEdit: () => void
  onAdd: () => void
}) {
  const router = useRouter()
  const large = useLargeTextLayout()
  const actionClass = large ? "w-full" : "min-h-[44px] w-auto px-3"
  const p = setupEntityPayload(entity)
  const receipt = setupRecordRoute(entity)
  const source = setupSource(entity)
  const label = {
    PROPOSED: "To check",
    NEEDS_INPUT: "Needs details",
    CONFIRMED: "Confirmed",
    COMMITTED: "Added",
    FAILED: "Check this",
    SKIPPED: "Skipped",
  }[entity.state]
  const questions = Array.isArray(entity.openQuestions)
    ? entity.openQuestions.flatMap((q) =>
        q &&
        typeof q === "object" &&
        "question" in q &&
        typeof q.question === "string"
          ? [q.question]
          : [],
      )
    : []
  return (
    <ListCard>
      <View className="gap-3 p-3">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
            {p?.name ?? "Record to review"}
          </Text>
          <StatusPill
            label={label}
            tone={
              entity.state === "COMMITTED" || entity.state === "CONFIRMED"
                ? "ok"
                : entity.state === "FAILED"
                  ? "danger"
                  : "muted"
            }
          />
        </View>
        <Text className="text-xs text-muted-foreground">
          {setupSummary(entity, currency)}
        </Text>
        {source ? (
          <Text className="text-xs text-tint-sky-foreground">{source}</Text>
        ) : null}
        {questions.map((q) => (
          <Text key={q} className="text-xs text-tint-amber-foreground">
            {q}
          </Text>
        ))}
        {entity.errorCode ? (
          <Text className="text-xs text-tint-amber-foreground">
            {setupErrorSummary(entity)}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          {receipt ? (
            <ActionButton
              className={actionClass}
              variant="outline"
              onPress={() => router.push(receipt as never)}
            >
              Open in{" "}
              {entity.kind === "CUSTOMER"
                ? "Customers"
                : entity.kind === "MONEY_ACCOUNT"
                  ? "Finance"
                  : "Catalog"}
            </ActionButton>
          ) : entity.state === "SKIPPED" ? (
            <ActionButton
              className={actionClass}
              variant="outline"
              disabled={disabled || !p}
              onPress={() => onState("PROPOSED")}
            >
              Restore
            </ActionButton>
          ) : entity.state !== "COMMITTED" ? (
            <>
              {entity.state === "CONFIRMED" ? (
                <>
                  <ActionButton
                    className={actionClass}
                    disabled={disabled}
                    icon="Plus"
                    onPress={onAdd}
                  >
                    Add to my business
                  </ActionButton>
                  <ActionButton
                    className={actionClass}
                    disabled={disabled}
                    variant="outline"
                    onPress={() => onState("PROPOSED")}
                  >
                    Undo
                  </ActionButton>
                </>
              ) : (
                <ActionButton
                  className={actionClass}
                  disabled={disabled || !p || entity.state === "NEEDS_INPUT"}
                  onPress={() => onState("CONFIRMED")}
                >
                  Confirm
                </ActionButton>
              )}
              <ActionButton
                className={actionClass}
                disabled={disabled || !p}
                variant="outline"
                onPress={onEdit}
              >
                Add details
              </ActionButton>
              <ActionButton
                className={actionClass}
                disabled={disabled}
                variant="ghost"
                onPress={() => onState("SKIPPED")}
              >
                Skip
              </ActionButton>
            </>
          ) : null}
        </View>
      </View>
    </ListCard>
  )
}

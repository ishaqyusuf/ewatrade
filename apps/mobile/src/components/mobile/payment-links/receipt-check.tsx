import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useState } from "react"
import { FactCard } from "./payment-link-parts"
import {
  type ReceiptAssessment,
  type ReceiptExtraction,
  receiptCheckView,
  receiptExtractionFacts,
} from "./receipt-check-model"

/**
 * The server's advisory receipt check for the merchant. It never confirms a
 * payment; Refresh only re-reads the report (there is no merchant retry).
 */
export function ReceiptCheck({
  assessment,
  extraction,
  onRefresh,
  refreshing,
}: {
  assessment: ReceiptAssessment | null
  extraction: ReceiptExtraction | null
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const colors = useColors()
  const [showReading, setShowReading] = useState(false)
  const view = receiptCheckView(assessment)
  if (!view) return null
  const reading =
    assessment?.state === "complete" ? receiptExtractionFacts(extraction) : null
  return (
    <View className="gap-3">
      <StatusBanner
        icon={view.tone === "warning" ? "TriangleAlert" : "ReceiptText"}
        title={view.title}
        message={view.message}
        tone={view.tone}
        actionLabel={view.inProgress && onRefresh ? "Refresh" : undefined}
        onActionPress={view.inProgress && !refreshing ? onRefresh : undefined}
      />
      {view.findings.length ? (
        <View className="gap-2 rounded-[20px] bg-card p-3.5 shadow-sm">
          {view.findings.map((finding) => (
            <View key={finding.text} className="flex-row gap-2">
              <Icon
                className="mt-0.5 size-[14px]"
                color={
                  finding.severity === "review"
                    ? colors.foreground
                    : colors.mutedForeground
                }
                name={finding.severity === "review" ? "AlertCircle" : "Info"}
              />
              <Text
                className={
                  finding.severity === "review"
                    ? "min-w-0 flex-1 text-xs font-bold text-foreground"
                    : "min-w-0 flex-1 text-xs text-muted-foreground"
                }
              >
                {finding.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {view.facts.length ? <FactCard facts={view.facts} /> : null}
      {reading ? (
        <>
          <ActionButton
            accessibilityLabel={
              showReading
                ? "Hide what the receipt says"
                : "Show what the receipt says"
            }
            icon={showReading ? "ChevronUp" : "ChevronDown"}
            variant="outline"
            onPress={() => setShowReading((value) => !value)}
          >
            {showReading ? "Hide receipt details" : "What the receipt says"}
          </ActionButton>
          {showReading ? <FactCard facts={reading} /> : null}
        </>
      ) : null}
    </View>
  )
}

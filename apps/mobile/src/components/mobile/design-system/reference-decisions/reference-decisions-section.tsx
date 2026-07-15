import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { DESIGN_REFERENCE_DECISIONS } from "./data"
import { ReferenceDecisionCard } from "./reference-decision-card"

export function ReferenceDecisionsSection() {
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="text-lg font-extrabold text-foreground">
          Reference Decisions
        </Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          Each approved reference becomes its own implemented mobile screen. The
          source image is the visual entry point, not a separate foundation
          section.
        </Text>
      </View>

      {DESIGN_REFERENCE_DECISIONS.map((reference) => (
        <ReferenceDecisionCard key={reference.id} reference={reference} />
      ))}

      <StatusBanner
        icon="ShieldCheck"
        message="Only the first reference is implemented in this pass. The next reference stays locked until owner approval."
        title="Approval-gated sequence"
        tone="primary"
      />
    </View>
  )
}

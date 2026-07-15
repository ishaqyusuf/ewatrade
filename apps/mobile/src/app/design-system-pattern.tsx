import { DesignSystemPatternScreen } from "@/components/mobile/design-system-playground"
import { useLocalSearchParams } from "expo-router"

export default function DesignSystemPatternRoute() {
  const { pattern } = useLocalSearchParams<{ pattern?: string }>()

  // design-system-pattern-screen route marker for source QA.
  return <DesignSystemPatternScreen patternId={pattern} />
}

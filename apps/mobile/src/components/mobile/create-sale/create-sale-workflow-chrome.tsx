import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { useMobileDesign } from "@/hooks/use-mobile-design"

export function CreateSaleWorkflowChrome(props: WorkflowModalChromeProps) {
  // Classic draws its own step bar (title, step, business and close).
  const classic = useMobileDesign("create-sale") !== "market-day"
  return (
    <MobileWorkflowChrome
      {...props}
      hideHeader={props.hideHeader || classic}
      screen="create-sale"
    />
  )
}

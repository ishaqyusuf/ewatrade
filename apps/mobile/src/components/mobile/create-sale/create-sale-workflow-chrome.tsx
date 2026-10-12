import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"

export function CreateSaleWorkflowChrome(props: WorkflowModalChromeProps) {
  // The sale view draws its own step bar (title, step, business and close).
  return <MobileWorkflowChrome {...props} hideHeader />
}

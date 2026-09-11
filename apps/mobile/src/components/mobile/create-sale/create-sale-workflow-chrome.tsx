import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"

export function CreateSaleWorkflowChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="create-sale" />
}

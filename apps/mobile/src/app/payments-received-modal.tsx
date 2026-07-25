import {
  PaymentsReceivedScreen,
  WorkflowModalScreen,
} from "@/components/mobile"

export default function PaymentsReceivedModalRoute() {
  return (
    <WorkflowModalScreen
      closeLabel="Close payments received"
      title="Payments received"
    >
      <PaymentsReceivedScreen />
    </WorkflowModalScreen>
  )
}

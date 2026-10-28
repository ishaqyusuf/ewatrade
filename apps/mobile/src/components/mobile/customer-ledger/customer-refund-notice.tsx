import { SectionHeader } from "../green-till/kit"
import { CustomerMessageEditor } from "../payment-links/customer-message-editor"

/**
 * Optional message about a recorded return. The merchant edits it and sends
 * it themselves; EwaTrade sends nothing. The ledger has no checked WhatsApp
 * link for the customer, so the number is typed for this draft only.
 */
export function CustomerRefundNotice({ text }: { text: string }) {
  return (
    <>
      <SectionHeader title="Tell the customer" />
      <CustomerMessageEditor
        key={text}
        initialText={text}
        label="Refund message to customer"
        noPhoneMessage="Add the customer's WhatsApp number for this draft, or copy or share the message. Nothing is sent until you press Send."
        whatsappUrl={null}
      />
    </>
  )
}

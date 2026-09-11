import { CommerceCustomerRow, CommerceFilterChip } from "../../commerce"
import { Text } from "@/components/ui/text"
import type {
  CustomerBookHeaderProps,
  CustomerBookRowProps,
  CustomerBookFilterProps,
} from "../../customer-book/customer-book-view"

export function ClassicCustomerBookHeader(_props: CustomerBookHeaderProps) {
  return (
    <Text className="text-sm leading-5 text-muted-foreground">
      Save customer details once, then reuse them in future orders.
    </Text>
  )
}

export function ClassicCustomerBookRow(props: CustomerBookRowProps) {
  return <CommerceCustomerRow {...props} className="px-2" />
}

export function ClassicCustomerBookFilter(props: CustomerBookFilterProps) {
  return <CommerceFilterChip {...props} />
}

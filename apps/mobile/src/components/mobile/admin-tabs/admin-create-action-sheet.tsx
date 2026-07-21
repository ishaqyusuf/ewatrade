import { Icon } from "@/components/ui/icon"
import { Modal, type useModal } from "@/components/ui/modal"
import { useRouter } from "expo-router"
import { View } from "react-native"

import type { MobileWorkspaceFeatureAvailability } from "@/lib/workspace-feature-availability"
import { SecondaryOperationalRow } from "../secondary-operations"

type AdminCreateActionSheetProps = {
  availability: MobileWorkspaceFeatureAvailability
  modal: ReturnType<typeof useModal>
}

type CreateAction = {
  detail: string
  disabled?: boolean
  label: string
  route: string
}

export function AdminCreateActionSheet({
  availability,
  modal,
}: AdminCreateActionSheetProps) {
  const router = useRouter()
  const actions: CreateAction[] = [
    {
      detail: "Add a stock-tracked item to your catalog.",
      label: "Product",
      route: "/first-product-setup-modal?kind=product",
    },
    {
      detail: "Add work that you price and deliver.",
      label: "Service",
      route: "/first-product-setup-modal?kind=service",
    },
    {
      detail: "Open the customer book and customer activity.",
      label: "Customer",
      route: "/customer-book-modal",
    },
    {
      detail: availability.hasActiveSellableItems
        ? "Create an order from active Products or Services."
        : "Create your first Product or Service before creating an Order.",
      disabled: !availability.hasActiveSellableItems,
      label: "Order",
      route: "/create-sale-modal",
    },
    ...(availability.hasProductItems
      ? [
          {
            detail: "Receive, count, adjust, or assign stock.",
            label: "Stock Entry",
            route: "/stock-intake-modal",
          },
        ]
      : []),
    {
      detail: "Invite a team member into this workspace.",
      label: "Staff",
      route: "/staff-invite-modal",
    },
  ]

  function openRoute(route: string) {
    modal.dismiss()
    requestAnimationFrame(() => router.push(route as never))
  }

  return (
    <Modal
      accessibilityLabel="Create"
      hideHeader
      ref={modal.ref}
      snapPoints={[actions.length > 5 ? "60%" : "52%"]}
    >
      <View className="px-5 pb-6">
        {actions.map((action) => (
          <SecondaryOperationalRow
            detail={action.detail}
            disabled={action.disabled}
            icon="Plus"
            key={action.label}
            onPress={() => openRoute(action.route)}
            title={action.label}
            trailing={
              <Icon
                className="mt-2 size-sm text-muted-foreground"
                name="ChevronRight"
              />
            }
          />
        ))}
      </View>
    </Modal>
  )
}

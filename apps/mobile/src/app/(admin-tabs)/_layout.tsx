import {
  AdminCreateActionSheet,
  AdminTabBar,
  AdminTabsProvider,
} from "@/components/mobile/admin-tabs"
import { useModal } from "@/components/ui/modal"
import { useAuthContext } from "@/hooks/use-auth"
import {
  getAdminCatalogTabLabel,
  getAdminTabDefinitions,
} from "@/lib/admin-navigation"
import {
  mergeMobileWorkspaceFeatureAvailability,
} from "@/lib/workspace-feature-availability"
import {
  activeBusinessOfflineCommands,
  getOfflineProvisionalProjection,
  useOfflineCommandStore,
} from "@/store/offlineCommandStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { Tabs } from "expo-router"
import { useMemo, useState } from "react"

export default function AdminTabsLayout() {
  const createModal = useModal()
  const [isDockHidden, setDockHidden] = useState(false)
  const trpc = useTRPC()
  const { profile } = useAuthContext()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const allCommands = useOfflineCommandStore((state) => state.commands)
  const commands = activeBusinessOfflineCommands(
    allCommands,
    profile?.businessId,
  )
  const provisional = getOfflineProvisionalProjection(commands)
  const availabilityQuery = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      enabled: !isOffline,
      retry: false,
    }),
  )
  const availability = mergeMobileWorkspaceFeatureAvailability(
    availabilityQuery.data,
    provisional,
  )
  const catalogLabel = getAdminCatalogTabLabel(availability)
  const definitions = getAdminTabDefinitions(catalogLabel)
  const provisionalOrders = useMemo(
    () =>
      commands.flatMap((command) =>
        command.localStatus === "pending" &&
        command.payload.kind === "commercial_order"
          ? [
              {
                clientCommandId: command.clientCommandId,
                createdAtClient: new Date(
                  command.createdAtClient as string | Date,
                ),
                customerName: command.payload.customerName,
                customerPhone: command.payload.customerPhone,
                lineCount: command.payload.lines.length,
              },
            ]
          : [],
      ),
    [commands],
  )
  const contextValue = useMemo(
    () => ({
      availability,
      isDockHidden,
      isOffline,
      openCreate: createModal.present,
      provisionalOrders,
      setDockHidden,
      syncAlertCount: commands.filter((command) =>
        ["blocked", "pending", "review"].includes(command.localStatus),
      ).length,
    }),
    [
      availability,
      commands,
      createModal.present,
      isDockHidden,
      isOffline,
      provisionalOrders,
    ],
  )

  return (
    <AdminTabsProvider value={contextValue}>
      <Tabs
        backBehavior="initialRoute"
        initialRouteName="admin-home"
        screenOptions={{ headerShown: false }}
        tabBar={(props) => (
          <AdminTabBar
            {...props}
            definitions={definitions}
            isHidden={isDockHidden}
            onCreate={createModal.present}
          />
        )}
      >
        <Tabs.Screen name="admin-home" options={{ title: "Home" }} />
        <Tabs.Screen name="orders" options={{ title: "Orders" }} />
        <Tabs.Screen name="catalog" options={{ title: catalogLabel }} />
        <Tabs.Screen name="more" options={{ title: "More" }} />
      </Tabs>
      <AdminCreateActionSheet
        availability={availability}
        modal={createModal}
      />
    </AdminTabsProvider>
  )
}

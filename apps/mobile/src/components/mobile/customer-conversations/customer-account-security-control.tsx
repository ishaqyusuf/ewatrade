import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { clearCustomerConversationSession } from "@/lib/customer-conversation-store"
import { useCustomerTRPC } from "@/trpc/customer-client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useRef, useState } from "react"
import { Alert } from "react-native"

const deviceDate = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

export function CustomerAccountSecurityControl() {
  const modal = useModal()
  const trpc = useCustomerTRPC()
  const queryClient = useQueryClient()
  const operations = useRef(new Map<string, string>())
  const [error, setError] = useState<string | null>(null)
  const devices = useQuery(
    trpc.serviceCommerce.mobileStoreConversationAccountDevices.queryOptions(
      {},
      { enabled: false, retry: false },
    ),
  )
  const revoke = useMutation(
    trpc.serviceCommerce.revokeMobileStoreConversationAccountDevice.mutationOptions(),
  )

  const open = () => {
    setError(null)
    modal.present()
    void devices.refetch()
  }

  const revokeDevice = async (device: {
    current: boolean
    deviceId: string
  }) => {
    const clientOperationId =
      operations.current.get(device.deviceId) ??
      `account-device-${Crypto.randomUUID()}`
    operations.current.set(device.deviceId, clientOperationId)
    setError(null)
    try {
      await revoke.mutateAsync({
        clientOperationId,
        confirmed: true,
        deviceId: device.deviceId,
      })
      operations.current.delete(device.deviceId)
      if (device.current) clearCustomerConversationSession()
      await queryClient.invalidateQueries({
        queryKey:
          trpc.serviceCommerce.mobileStoreConversationAccountDevices.queryKey(),
      })
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "This device could not be removed.",
      )
    }
  }

  return (
    <>
      <Pressable
        accessibilityHint="Review guest devices linked to your signed-in account"
        accessibilityLabel="Account security"
        accessibilityRole="button"
        className="size-11 items-center justify-center rounded-full bg-muted active:bg-accent"
        haptic
        onPress={open}
      >
        <Icon className="size-sm text-foreground" name="ShieldCheck" />
      </Pressable>

      <Modal
        enableDynamicSizing
        maxDynamicContentSize={720}
        ref={modal.ref}
        snapPoints={["78%"]}
        title="Linked devices"
      >
        <BottomSheetKeyboardAwareScrollView
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          <View className="gap-4 px-5 pb-6">
            <Text className="text-sm leading-5 text-muted-foreground">
              These are guest browsers and app installations that proved access
              to conversations linked to your account. Removing one does not
              delete the conversation or sign out your Ẹ̀wáTrade account.
            </Text>

            {error ? <StatusBanner message={error} tone="destructive" /> : null}
            {devices.isLoading || devices.isFetching ? (
              <Text
                accessibilityLiveRegion="polite"
                className="py-6 text-center text-muted-foreground"
              >
                Loading linked devices…
              </Text>
            ) : null}
            {devices.isError && !error ? (
              <StatusBanner
                actionLabel="Retry"
                message="Linked devices could not be loaded."
                onActionPress={() => void devices.refetch()}
                tone="warning"
              />
            ) : null}
            {devices.data?.length === 0 ? (
              <Text className="py-6 text-center text-muted-foreground">
                No guest devices are linked to these conversations.
              </Text>
            ) : null}
            {devices.data?.map((device) => {
              const removable = device.status === "active"
              const pending =
                revoke.isPending &&
                revoke.variables?.deviceId === device.deviceId
              return (
                <View
                  className="min-h-20 flex-row items-center gap-3 rounded-2xl bg-muted/60 px-4 py-3"
                  key={device.deviceId}
                >
                  <View className="size-10 items-center justify-center rounded-full bg-background">
                    <Icon
                      className="size-sm text-foreground"
                      name={device.purpose === "mobile" ? "Phone" : "Globe"}
                    />
                  </View>
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="font-bold capitalize text-foreground">
                      {device.purpose} device
                      {device.current ? " · This device" : ""}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {device.status} · Last used{" "}
                      {deviceDate.format(new Date(device.lastUsedAt))}
                    </Text>
                  </View>
                  {removable ? (
                    <Pressable
                      accessibilityLabel={`Remove ${device.current ? "this" : device.purpose} guest device`}
                      accessibilityRole="button"
                      className="min-h-11 justify-center rounded-full px-3 active:bg-destructive/10 disabled:opacity-50"
                      disabled={revoke.isPending}
                      haptic
                      onPress={() =>
                        Alert.alert(
                          "Remove guest device?",
                          device.current
                            ? "This device will lose guest access. Your signed-in account and linked conversation remain available."
                            : "That device will lose guest access. Your account and linked conversation remain available.",
                          [
                            { style: "cancel", text: "Keep device" },
                            {
                              onPress: () => void revokeDevice(device),
                              style: "destructive",
                              text: "Remove",
                            },
                          ],
                        )
                      }
                    >
                      <Text className="text-sm font-bold text-destructive">
                        {pending ? "Removing…" : "Remove"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              )
            })}
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </Modal>
    </>
  )
}

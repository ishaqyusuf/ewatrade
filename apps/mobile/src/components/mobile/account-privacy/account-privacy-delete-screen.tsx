import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { Alert } from "react-native"
import { LEAVE_BUSINESS_NOTE } from "../account-privacy-screen"
import { ActionButton } from "../action-button"
import { PhoneDeletionContact } from "../phone-deletion-contact"
import { MobileScreen } from "../screen"
import { StatusBanner } from "../status-banner"
import { QuietGroup, QuietHeader, QuietRow } from "./quiet-settings"
import { useOpenPolicy } from "./use-open-policy"

/** Explains what a deletion request does, then sends it (Workshop 04). */
export function AccountPrivacyDeleteScreen() {
  const router = useRouter()
  const trpc = useTRPC()
  const { linkError, openPolicy } = useOpenPolicy()
  const [contactEmail, setContactEmail] = useState("")
  const [contactCode, setContactCode] = useState("")
  const [contactNotice, setContactNotice] = useState<string | null>(null)
  const sendContactCode = useMutation(
    trpc.accountPrivacy.requestDeletionContactCode.mutationOptions({
      onSuccess: (data) => {
        setContactCode("")
        setContactNotice(
          data.devCode
            ? `Local test code: ${data.devCode}. No email was sent.`
            : "Check your contact email. The code expires in ten minutes.",
        )
      },
    }),
  )
  const request = useQuery(
    trpc.accountPrivacy.deletionRequest.queryOptions(undefined, {
      retry: false,
    }),
  )
  const deletionIntake = useQuery(
    trpc.accountPrivacy.deletionIntakeAvailability.queryOptions(undefined, {
      retry: false,
    }),
  )
  const submit = useMutation(
    trpc.accountPrivacy.requestDeletion.mutationOptions({
      onSuccess: () => {
        void request.refetch()
      },
    }),
  )
  const statusError = request.error ?? deletionIntake.error
  const actionError =
    submit.error?.message ?? sendContactCode.error?.message ?? linkError
  const available = deletionIntake.data?.available === true
  const needsContact = deletionIntake.data?.requiresContactVerification === true
  const contactReady =
    !needsContact ||
    (Boolean(contactEmail.trim()) && /^\d{6}$/.test(contactCode))
  const checking = request.isPending || deletionIntake.isPending
  const requestDeletion = () =>
    Alert.alert(
      "Request account deletion?",
      "We will verify your request and review associated data. This does not immediately erase your account or close your business. An owner may need to arrange a handover; records requiring retention will be explained in your outcome. You may be asked to sign in again.",
      [
        { text: "Keep account", style: "cancel" },
        {
          text: "Request deletion",
          style: "destructive",
          onPress: () =>
            submit.mutate({
              confirmation: "DELETE MY ACCOUNT",
              ...(needsContact
                ? { contactEmail: contactEmail.trim(), contactCode }
                : {}),
            }),
        },
      ],
    )
  return (
    <MobileScreen contentClassName="gap-5 px-[18px] py-2">
      <QuietHeader
        backLabel="Account"
        onBack={() => router.back()}
        title="Delete account"
      />
      {statusError ? (
        <StatusBanner
          title="Couldn’t load your deletion status"
          message={statusError.message}
          tone="destructive"
          actionLabel="Retry"
          actionDisabled={request.isFetching || deletionIntake.isFetching}
          onActionPress={() => {
            void request.refetch()
            void deletionIntake.refetch()
          }}
        />
      ) : null}
      {request.data ? (
        <QuietGroup footer="Received doesn’t mean erased. Your outcome will explain anything we must keep.">
          <QuietRow
            title="Status"
            value={request.data.status.toLowerCase().replaceAll("_", " ")}
          />
          <QuietRow title="Reference" value={request.data.id} />
        </QuietGroup>
      ) : (
        <>
          <View className="gap-3 px-1">
            <Text className="text-base leading-6 text-foreground">
              A deletion request starts a review. It does not immediately erase
              your account or close your business.
            </Text>
            <Text className="text-sm leading-6 text-muted-foreground">
              An owner may need to arrange a handover. Records requiring
              retention will be explained in your outcome. You may be asked to
              sign in again.
            </Text>
            <Text className="text-sm leading-6 text-muted-foreground">
              {LEAVE_BUSINESS_NOTE}
            </Text>
          </View>
          {needsContact && available ? (
            <View className="rounded-[14px] bg-card px-3.5">
              <PhoneDeletionContact
                email={contactEmail}
                code={contactCode}
                status={
                  submit.isPending
                    ? "submitting-request"
                    : sendContactCode.isPending
                      ? "sending-code"
                      : "ready"
                }
                notice={contactNotice}
                onEmailChange={(value) => {
                  setContactEmail(value)
                  setContactCode("")
                  setContactNotice(null)
                  sendContactCode.reset()
                  submit.reset()
                }}
                onCodeChange={setContactCode}
                onSendCode={() =>
                  sendContactCode.mutate({ email: contactEmail.trim() })
                }
              />
            </View>
          ) : null}
          {checking ? (
            <Text className="px-1 text-sm text-muted-foreground">
              Checking availability…
            </Text>
          ) : available ? (
            <ActionButton
              variant="destructive"
              isLoading={submit.isPending}
              loadingLabel="Submitting request…"
              disabled={
                !contactReady || sendContactCode.isPending || submit.isPending
              }
              onPress={requestDeletion}
            >
              Request account deletion
            </ActionButton>
          ) : (
            <Text className="px-1 text-sm leading-6 text-muted-foreground">
              Requests can’t be sent from the app right now. See deletion
              information for guidance.
            </Text>
          )}
        </>
      )}
      <Pressable
        accessibilityRole="link"
        className="min-h-11 justify-center self-start px-1"
        onPress={() => void openPolicy("delete-account")}
      >
        <Text className="text-sm font-semibold text-primary">
          How account deletion works
        </Text>
      </Pressable>
      {actionError ? (
        <StatusBanner message={actionError} tone="destructive" />
      ) : null}
    </MobileScreen>
  )
}

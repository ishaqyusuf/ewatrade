import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  type GeneralCashCountAction,
  cashCountAction,
} from "@ewatrade/assistant/general/contracts"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useRef, useState } from "react"
import { ActionButton } from "../action-button"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "../finance/finance-workspace-gate"
import { FormField } from "../form-field"
import { ListCard } from "../green-till/kit"
import {
  type NativeCashCountValues,
  nativeCashCountCandidate,
  nativeCashCountValues,
} from "./native-cash-count-values"

type Props = {
  initial: GeneralCashCountAction
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}

/** Workshop01 Amount first. The parent's proposal confirmation owns every write. */
export function GeneralCashCountEditor(props: Props) {
  const { profile } = useAuthContext()
  const parsed = cashCountAction.safeParse(props.initial)
  if (!parsed.success)
    return (
      <Text accessibilityRole="alert" className="p-5">
        This cash count draft is invalid. Ask for a fresh draft.
      </Text>
    )
  if (
    !profile?.id ||
    !profile.businessId ||
    (profile.status !== undefined && profile.status !== "ACTIVE") ||
    !["OWNER", "ADMIN"].includes(profile.role ?? "")
  )
    return (
      <Text accessibilityRole="alert" className="p-5">
        Current Owner or Admin access is required to edit a cash count.
      </Text>
    )
  const scope = JSON.stringify([
    profile.id,
    profile.businessId,
    profile.storeId,
    profile.role,
    profile.staffAccessMode,
    profile.catalogEditor,
    profile.status,
    parsed.data,
  ])
  return (
    <FinanceWorkspaceGate
      key={scope}
      expectedBookId={parsed.data.bookId}
      requireOnline
    >
      {(workspace) => (
        <CountEditor
          initial={parsed.data}
          disabled={props.disabled}
          onSave={props.onSave}
          workspace={workspace}
        />
      )}
    </FinanceWorkspaceGate>
  )
}

function CountEditor({
  initial,
  disabled,
  onSave,
  workspace,
}: Props & { workspace: FinanceWorkspace }) {
  const fields = useRef(nativeCashCountValues(initial))
  const [values, setValues] = useState(fields.current)
  const [afterCode, setAfterCode] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  function change<K extends keyof NativeCashCountValues>(
    key: K,
    value: NativeCashCountValues[K],
  ) {
    fields.current = { ...fields.current, [key]: value }
    setValues(fields.current)
  }
  return (
    <BottomSheetInputProvider>
      <BottomSheetKeyboardAwareScrollView
        contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 32 }}
      >
        <CashAccountPage
          key={afterCode ?? "first"}
          initial={initial}
          workspace={workspace}
          afterCode={afterCode}
          disabled={disabled}
          onPage={setAfterCode}
        >
          {(account) => (
            <>
              <ListCard>
                <View className="gap-1 py-4">
                  <Text className="text-xs text-muted-foreground">
                    Fixed cash account
                  </Text>
                  <Text className="text-xl font-bold text-foreground">
                    {account.name}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    Current business Finance Book ·{" "}
                    {workspace.book.currencyCode} · Cash · {account.code}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    The reviewed Book and cash account stay selected. Ask in
                    chat to change them.
                  </Text>
                </View>
              </ListCard>
              <ListCard>
                <View className="gap-4 py-4">
                  <FormField
                    label={`Cash physically counted (${workspace.book.currencyCode})`}
                    inputClassName="text-3xl font-semibold"
                    value={values.amount}
                    keyboardType="decimal-pad"
                    maxLength={40}
                    editable={!disabled}
                    onChangeText={(amount) => change("amount", amount)}
                  />
                  <FormField
                    label="Count date and time (UTC)"
                    value={values.date}
                    placeholder="YYYY-MM-DDTHH:mm:ss.sssZ"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!disabled}
                    onChangeText={(date) => change("date", date)}
                  />
                  <Text className="text-xs text-muted-foreground">
                    Enter explicit UTC with seconds and Z. Unchanged original
                    fractional seconds are preserved.
                  </Text>
                  <FormField
                    label="Count reference"
                    value={values.reference}
                    maxLength={200}
                    editable={!disabled}
                    onChangeText={(reference) => change("reference", reference)}
                  />
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel="I physically counted this cash"
                    accessibilityState={{
                      checked: values.acknowledged,
                      disabled,
                    }}
                    disabled={disabled}
                    onPress={() => {
                      if (!disabled)
                        change("acknowledged", !fields.current.acknowledged)
                    }}
                    className={`min-h-11 rounded-xl border p-3 ${values.acknowledged ? "border-primary bg-secondary" : "border-border bg-background"}`}
                  >
                    <Text className="text-sm text-foreground">
                      I physically counted this cash.
                    </Text>
                  </Pressable>
                </View>
              </ListCard>
              <Text className="text-sm text-muted-foreground">
                Zero is valid. This amount is the physical observation from your
                draft, never a ledger balance. Save returns to a fresh canonical
                review before separate confirmation. Confirmation records the
                count and its difference; it does not post an adjustment, move
                money, finalize stock closeout or close/reopen a financial
                period.
              </Text>
              {error ? (
                <Text
                  accessibilityRole="alert"
                  className="text-sm text-destructive"
                >
                  {error}
                </Text>
              ) : null}
              <ActionButton
                disabled={disabled}
                onPress={() => {
                  if (disabled) return
                  const result = nativeCashCountCandidate(
                    initial,
                    fields.current,
                    {
                      bookId: workspace.book.id,
                      account: {
                        id: account.id,
                        bookId: account.bookId,
                        purpose: account.purpose,
                        archivedAt: null,
                      },
                    },
                  )
                  if (!result.ok) return setError(result.error)
                  setError(null)
                  onSave(result.payload)
                }}
              >
                Save and review
              </ActionButton>
            </>
          )}
        </CashAccountPage>
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}

function CashAccountPage({
  initial,
  workspace,
  afterCode,
  disabled,
  onPage,
  children,
}: {
  initial: GeneralCashCountAction
  workspace: FinanceWorkspace
  afterCode?: string
  disabled: boolean
  onPage: (afterCode: string | undefined) => void
  children: (account: {
    id: string
    name: string
    code: string
    purpose: string
    bookId: string
  }) => ReactNode
}) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.finance.moneyAccounts.queryOptions(
        { bookId: initial.bookId, limit: 50, afterCode },
        {
          retry: false,
          staleTime: 0,
          gcTime: 0,
          refetchOnMount: "always",
          trpc: { abortOnUnmount: true },
        },
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  if (read.state === "checking")
    return (
      <Text className="text-sm text-muted-foreground">
        Checking your current access to the reviewed cash account…
      </Text>
    )
  const page = read.state === "ready" ? read.data : null
  if (
    !page ||
    page.book.id !== initial.bookId ||
    page.book.id !== workspace.book.id ||
    page.book.currencyCode !== workspace.book.currencyCode ||
    page.coverage !== "ACTIVE_MONEY_ACCOUNT_IDENTITIES"
  )
    return (
      <View className="gap-3">
        <Text accessibilityRole="alert">
          The original cash account is unavailable for the reviewed Book or your
          current access. No amount or variance is inferred.
        </Text>
        <ActionButton
          variant="outline"
          disabled={disabled}
          onPress={() => {
            if (!disabled) void query.refetch()
          }}
        >
          Retry cash account
        </ActionButton>
      </View>
    )
  const matches = page.accounts.filter(
    (account) => account.id === initial.accountId,
  )
  const account =
    matches.length === 1 && matches[0]?.purpose === "CASH" ? matches[0] : null
  if (!account)
    return (
      <View className="gap-3">
        <Text accessibilityRole="alert">
          The reviewed active cash account was not found on this bounded choices
          page. Continue or ask in chat to review its availability; another
          account has not been selected.
        </Text>
        {afterCode ? (
          <ActionButton
            variant="outline"
            disabled={disabled}
            onPress={() => {
              if (!disabled) onPage(undefined)
            }}
          >
            First account page
          </ActionButton>
        ) : null}
        {page.nextCursor ? (
          <ActionButton
            variant="outline"
            disabled={disabled}
            onPress={() => {
              if (!disabled) onPage(page.nextCursor ?? undefined)
            }}
          >
            Next account page
          </ActionButton>
        ) : null}
        <ActionButton
          variant="outline"
          disabled={disabled}
          onPress={() => {
            if (!disabled) void query.refetch()
          }}
        >
          Refresh cash account page
        </ActionButton>
      </View>
    )
  // ACTIVE_MONEY_ACCOUNT_IDENTITIES is the canonical active/nonarchived lookup;
  // each row is scoped by its returned Book, never by a user-entered account ID.
  return (
    <View className="gap-4">
      {children({ ...account, bookId: page.book.id })}
      <ActionButton
        variant="outline"
        disabled={disabled}
        onPress={() => {
          if (!disabled) void query.refetch()
        }}
      >
        Refresh cash account
      </ActionButton>
    </View>
  )
}

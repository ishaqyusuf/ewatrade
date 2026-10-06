import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { financeBankStatementCsvHeaders } from "@ewatrade/utils/finance-bank-statement"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { usePreventRemove } from "@react-navigation/native"
import * as DocumentPicker from "expo-document-picker"
import { File, Paths } from "expo-file-system"
import { type Href, useNavigation, useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { Alert, Platform, View } from "react-native"
import { FinanceBankDateField } from "./finance-bank-date-field"
import { decodeNativeFinanceBankStatementCsv } from "./finance-bank-import-state"
import { readNativeBankPickedFile } from "./finance-bank-picked-file"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { FinanceFormBody } from "./finance-form-body"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useNativeBankImport } from "./use-native-bank-import"

type Draft = {
  accountId: string
  reference: string
  startsOn: string
  endsOn: string
  openingBalance: string
  closingBalance: string
  units: "MINOR" | "MAJOR"
  columns: {
    transactionId: string
    date: string
    amount: string
    description: string
  }
  bytes: Uint8Array | null
  fileName: string
  headers: readonly string[]
}
// Private drafts live only in this process; durable recovery stores identities/digest.
const drafts = new Map<string, Draft>()

export function FinanceBankImportScreen({ accountId }: { accountId?: string }) {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <BankImportWorkspace
          key={JSON.stringify([
            workspace.actorUserId,
            workspace.tenantId,
            workspace.book.id,
          ])}
          {...workspace}
          accountId={accountId}
        />
      )}
    </FinanceWorkspaceGate>
  )
}

function BankImportWorkspace(
  workspace: FinanceWorkspace & { accountId?: string },
) {
  const { book, actorUserId, tenantId } = workspace
  const router = useRouter()
  const navigation = useNavigation()
  const importer = useNativeBankImport(workspace)
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const scope = JSON.stringify([actorUserId, tenantId, book.id])
  const accounts = book.accounts.filter(
    (a) =>
      a.kind === "ASSET" &&
      ["BANK", "CLEARING"].includes(a.purpose) &&
      !a.archivedAt,
  )
  const [draft, setDraft] = useState<Draft>(
    () =>
      drafts.get(scope) ?? {
        accountId:
          accounts.find((a) => a.id === workspace.accountId)?.id ??
          accounts[0]?.id ??
          "",
        reference: "",
        startsOn: "",
        endsOn: "",
        openingBalance: "",
        closingBalance: "",
        units: "MAJOR",
        columns: { transactionId: "", date: "", amount: "", description: "" },
        bytes: null,
        fileName: "",
        headers: [],
      },
  )
  const [reading, setReading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [recorded, setRecorded] = useState(false)
  const pickerGeneration = useRef(0)
  const mounted = useRef(true)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const dirty = Boolean(
    draft.bytes ||
      draft.reference ||
      draft.startsOn ||
      draft.endsOn ||
      draft.openingBalance ||
      draft.closingBalance,
  )
  const busy = reading || importer.preparing || importer.command.pending
  const disabled = busy || offline || !importer.command.ready
  const beganWrite = useRef(false)
  const uncertainBeforeWrite = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pickerGeneration.current += 1
    }
  }, [])
  useEffect(() => {
    if (dirty && !recorded) drafts.set(scope, draft)
  }, [scope, draft, dirty, recorded])
  useEffect(() => {
    if (recorded)
      router.replace({
        pathname: "/finance-bank-modal",
        params: { imported: "1", accountId: draft.accountId },
      } as Href)
  }, [recorded, router, draft.accountId])

  usePreventRemove(
    !recorded && (dirty || importer.command.pending),
    ({ data }) => {
      if (importer.command.pending) {
        Alert.alert(
          "Import is being checked",
          "Wait for the result before leaving this review.",
        )
        return
      }
      drafts.set(scope, draftRef.current)
      Alert.alert(
        "Keep this draft for later?",
        "The CSV stays only in this app session. After restarting, choose the original file again.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Save for later",
            onPress: () => navigation.dispatch(data.action),
          },
        ],
      )
    },
  )

  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    importer.invalidate()
    pickerGeneration.current += 1
    setReading(false)
    setDraft((current) => ({ ...current, [key]: value }))
  }
  function finish() {
    drafts.delete(scope)
    setRecorded(true)
  }

  async function selectFile() {
    if (disabled) return
    importer.invalidate()
    const token = ++pickerGeneration.current
    setFileError(null)
    setReading(true)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: [
          "text/csv",
          "text/comma-separated-values",
          "application/csv",
          "application/vnd.ms-excel",
          "text/plain",
        ],
      })
      if (result.canceled) return
      const asset = result.assets[0]
      if (!asset) throw new Error("Choose a CSV statement.")
      if (mounted.current && token === pickerGeneration.current)
        setDraft((current) => ({
          ...current,
          bytes: null,
          fileName: "",
          headers: [],
          columns: { transactionId: "", date: "", amount: "", description: "" },
        }))
      const bytes = await readNativeBankPickedFile({
        asset,
        web: Platform.OS === "web",
        cacheUri: Platform.OS === "web" ? "" : Paths.cache.uri,
        openFile: (uri) => new File(uri),
        isCurrent: () =>
          mounted.current &&
          token === pickerGeneration.current &&
          !useOperationalModeStore.getState().isOfflineMode,
      })
      if (!bytes) return
      const headers = financeBankStatementCsvHeaders(
        decodeNativeFinanceBankStatementCsv(bytes),
      )
      if (headers.length < 4)
        throw new Error(
          "Map four distinct transaction ID, date, amount and description columns.",
        )
      if (
        !mounted.current ||
        token !== pickerGeneration.current ||
        useOperationalModeStore.getState().isOfflineMode
      )
        return
      const guess = (pattern: RegExp) =>
        headers.find((h) => pattern.test(h.toLowerCase())) ?? ""
      setDraft((current) => ({
        ...current,
        bytes,
        fileName: asset.name,
        headers,
        columns: {
          transactionId: guess(/transaction.?id|^id$|reference.?id/),
          date: guess(/date/),
          amount: guess(/amount|signed/),
          description: guess(/description|narration|details/),
        },
      }))
    } catch (failure) {
      if (mounted.current && token === pickerGeneration.current)
        setFileError(
          failure instanceof Error
            ? failure.message
            : "The CSV could not be read.",
        )
    } finally {
      if (mounted.current && token === pickerGeneration.current)
        setReading(false)
    }
  }

  const preview = importer.review?.preview
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const minimum = new Date(book.startsAt).toISOString().slice(0, 10)
  const feedback = (
    <FinanceCommandFeedback
      command={importer.command}
      onRecorded={() => {
        // Acknowledgement may refer to an earlier import, not the current draft.
        // Only this draft's successful confirm() is allowed to clear it.
        importer.invalidate()
      }}
      onRejected={() => importer.invalidate()}
    />
  )
  const error = fileError ?? importer.error
  return (
    <FinanceFormBody>
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <Text className="text-xl font-bold">
          {preview ? "Review statement" : "Import bank statement"}
        </Text>
        <ActionButton
          variant="outline"
          disabled={importer.command.pending}
          onPress={() => router.replace("/finance-bank-modal" as Href)}
        >
          Close import
        </ActionButton>
      </View>
      <Text className="text-sm text-muted-foreground">
        Original CSV evidence · {book.currencyCode}. Importing records evidence
        and does not send money.
      </Text>
      {feedback}
      {error ? (
        <StatusBanner
          tone="destructive"
          title="Statement needs attention"
          message={error}
        />
      ) : null}
      {accounts.length === 0 ? (
        <StatusBanner message="Create an active bank or clearing account on the dashboard before importing." />
      ) : preview ? (
        <>
          <Text className="text-lg font-semibold">{preview.reference}</Text>
          <Text>
            {accounts.find((a) => a.id === preview.accountId)?.name} ·{" "}
            {draft.fileName}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {preview.startsAt.toISOString().slice(0, 10)} –{" "}
            {preview.endsAt.toISOString().slice(0, 10)} UTC ·{" "}
            {preview.rows.length} transactions
          </Text>
          <View className="gap-3 border-y border-border py-4">
            {[
              ["Opening balance", preview.openingBalanceMinor],
              ["Transactions", preview.transactionTotalMinor],
              ["Closing balance", preview.closingBalanceMinor],
            ].map(([label, amount]) => (
              <View key={label} className="gap-1">
                <Text className="text-sm text-muted-foreground">{label}</Text>
                <Text className="text-lg font-bold">
                  {formatFinanceMoney(amount ?? "0", book.currencyCode)}
                </Text>
              </View>
            ))}
          </View>
          <Text className="font-semibold">
            Original rows · first {Math.min(preview.rows.length, 10)}
          </Text>
          {preview.rows.slice(0, 10).map((row) => (
            <View
              key={row.externalId}
              className="gap-1 border-b border-border py-3"
            >
              <Text>{row.description}</Text>
              <Text>
                {formatFinanceMoney(
                  row.amountMinor.toString(),
                  book.currencyCode,
                )}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {row.occurredAt.toISOString().slice(0, 10)} UTC ·{" "}
                {row.externalId}
              </Text>
            </View>
          ))}
          <ActionButton
            disabled={disabled}
            isLoading={importer.command.pending}
            onPress={async () => {
              if (!beganWrite.current)
                uncertainBeforeWrite.current = Boolean(
                  importer.command.retained,
                )
              beganWrite.current = true
              if (await importer.confirm()) finish()
            }}
          >
            Confirm original statement import
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={
              importer.command.pending ||
              (beganWrite.current &&
                !uncertainBeforeWrite.current &&
                Boolean(importer.command.retained))
            }
            onPress={() => importer.invalidate()}
          >
            Back to details
          </ActionButton>
        </>
      ) : (
        <>
          <Text className="font-semibold">Bank account</Text>
          {accounts.map((a) => (
            <ActionButton
              key={a.id}
              disabled={disabled}
              variant={a.id === draft.accountId ? "secondary" : "outline"}
              onPress={() => edit("accountId", a.id)}
            >
              {a.name}
            </ActionButton>
          ))}
          <ActionButton
            variant="outline"
            disabled={disabled}
            isLoading={reading}
            onPress={() => void selectFile()}
          >
            {draft.fileName ? "Choose another CSV" : "Choose CSV statement"}
          </ActionButton>
          {draft.fileName ? (
            <Text className="text-sm text-muted-foreground">
              {draft.fileName} · {draft.bytes?.byteLength} bytes
            </Text>
          ) : null}
          <FormField
            label="Statement reference"
            value={draft.reference}
            onChangeText={(v) => edit("reference", v)}
            editable={!disabled}
            maxLength={160}
          />
          <FinanceBankDateField
            label="Starts on"
            value={draft.startsOn}
            onChange={(v) => edit("startsOn", v)}
            minimum={minimum}
            maximum={yesterday}
            disabled={disabled}
          />
          <FinanceBankDateField
            label="Ends on"
            value={draft.endsOn}
            onChange={(v) => edit("endsOn", v)}
            minimum={minimum}
            maximum={yesterday}
            disabled={disabled}
          />
          <FormField
            label={`Opening balance (${book.currencyCode})`}
            value={draft.openingBalance}
            onChangeText={(v) => edit("openingBalance", v)}
            editable={!disabled}
            helper="Signed major units, for example -125.50"
            autoCapitalize="none"
          />
          <FormField
            label={`Closing balance (${book.currencyCode})`}
            value={draft.closingBalance}
            onChangeText={(v) => edit("closingBalance", v)}
            editable={!disabled}
            helper="Opening plus transactions must equal closing."
            autoCapitalize="none"
          />
          {draft.headers.length ? (
            <>
              <Text className="text-lg font-semibold">
                Map original CSV columns
              </Text>
              {(
                ["transactionId", "date", "amount", "description"] as const
              ).map((field) => (
                <View key={field} className="gap-2">
                  <Text className="font-semibold">
                    {
                      {
                        transactionId: "Transaction ID",
                        date: "UTC date",
                        amount: "Signed amount",
                        description: "Description",
                      }[field]
                    }
                  </Text>
                  <View className="gap-2">
                    {draft.headers.map((header) => (
                      <ActionButton
                        key={header}
                        disabled={disabled}
                        variant={
                          draft.columns[field] === header
                            ? "secondary"
                            : "outline"
                        }
                        onPress={() =>
                          edit("columns", { ...draft.columns, [field]: header })
                        }
                      >
                        {header}
                      </ActionButton>
                    ))}
                  </View>
                </View>
              ))}
              <Text className="font-semibold">CSV amount units</Text>
              <ActionButton
                variant={draft.units === "MAJOR" ? "secondary" : "outline"}
                disabled={disabled}
                onPress={() => edit("units", "MAJOR")}
              >
                Major units · 125.50
              </ActionButton>
              <ActionButton
                variant={draft.units === "MINOR" ? "secondary" : "outline"}
                disabled={disabled}
                onPress={() => edit("units", "MINOR")}
              >
                Minor units · 12550
              </ActionButton>
            </>
          ) : null}
          <ActionButton
            disabled={disabled || !draft.bytes}
            isLoading={importer.preparing}
            onPress={() => {
              if (draft.bytes)
                void importer.prepare({
                  selectedAccountId: draft.accountId,
                  bytes: draft.bytes,
                  columns: draft.columns,
                  units: draft.units,
                  reference: draft.reference,
                  startsOn: draft.startsOn,
                  endsOn: draft.endsOn,
                  openingBalance: draft.openingBalance,
                  closingBalance: draft.closingBalance,
                })
            }}
          >
            Review statement
          </ActionButton>
        </>
      )}
    </FinanceFormBody>
  )
}

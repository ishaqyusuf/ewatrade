import type { createFinanceCommandRunner } from "@/lib/finance-command-runner"
import {
  FinanceCommandNotSentError,
  type PendingFinanceCommand,
} from "@ewatrade/utils/finance-command-identity"
import {
  type NativeFinanceBankImportSource,
  type NativeFinanceBankStatementImportPreview,
  prepareNativeFinanceBankStatementImportPreview,
  toNativeFinanceBankStatementImportPayload,
} from "./finance-bank-import-state"

export type NativeBankImportDraft = Omit<
  Parameters<typeof prepareNativeFinanceBankStatementImportPreview>[0],
  "source" | "now"
>
type Runner = ReturnType<typeof createFinanceCommandRunner>
type ImportPayload = ReturnType<
  typeof toNativeFinanceBankStatementImportPayload
>

export function nativeBankImportRecoveryRevision(
  retained: PendingFinanceCommand | undefined,
  accountId: string,
  currentRevision: string,
) {
  if (!retained) return currentRevision
  const metadata = retained.recoveryMetadata
  if (
    retained.operation !== "importBankStatement" ||
    metadata?.accountId !== accountId ||
    !metadata.expectedBankRevision
  )
    throw new Error(
      "Confirm the earlier submission, or re-enter its original bank account and statement details.",
    )
  return metadata.expectedBankRevision
}

function assertCurrent(isCurrent: () => boolean) {
  if (!isCurrent())
    throw new Error(
      "Finance access or connection changed. Review the statement again.",
    )
}

export async function prepareNativeBankImportReview(input: {
  draft: NativeBankImportDraft
  readSource: () => Promise<NativeFinanceBankImportSource>
  retained?: PendingFinanceCommand
  isCurrent: () => boolean
  now?: Date
}) {
  assertCurrent(input.isCurrent)
  const source = await input.readSource()
  assertCurrent(input.isCurrent)
  return prepareNativeFinanceBankStatementImportPreview({
    ...input.draft,
    source: {
      ...source,
      bankRevision: nativeBankImportRecoveryRevision(
        input.retained,
        input.draft.selectedAccountId,
        source.bankRevision,
      ),
    },
    now: input.now,
  })
}

/** A retry keeps its original digest/revision; only the runner owns command IDs. */
export async function submitNativeBankImportReview(input: {
  preview: NativeFinanceBankStatementImportPreview
  run: (...args: Parameters<Runner["run"]>) => Promise<unknown>
  readSource: () => Promise<NativeFinanceBankImportSource>
  isCurrent: () => boolean
  write: (payload: ImportPayload) => Promise<unknown>
}) {
  const preview = {
    ...input.preview,
    startsAt: new Date(input.preview.startsAt.getTime()),
    endsAt: new Date(input.preview.endsAt.getTime()),
    columns: { ...input.preview.columns },
  }
  assertCurrent(input.isCurrent)
  const payload = {
    bookId: preview.bookId,
    accountId: preview.accountId,
    expectedRevision: preview.expectedRevision,
    currencyCode: preview.currencyCode,
    reference: preview.reference,
    startsAt: new Date(preview.startsAt.getTime()),
    endsAt: new Date(preview.endsAt.getTime()),
    openingBalanceMinor: preview.openingBalanceMinor,
    closingBalanceMinor: preview.closingBalanceMinor,
    csv: preview.csv,
    columns: { ...preview.columns },
    units: preview.units,
  }
  return input.run(
    "importBankStatement",
    payload,
    async (clientCommandId) => {
      let command: ImportPayload
      try {
        assertCurrent(input.isCurrent)
        const currentSource = await input.readSource()
        assertCurrent(input.isCurrent)
        command = toNativeFinanceBankStatementImportPayload({
          preview,
          currentSource,
          clientCommandId,
        })
        assertCurrent(input.isCurrent)
      } catch (failure) {
        throw new FinanceCommandNotSentError(
          failure instanceof Error
            ? failure.message
            : "Review the bank statement again.",
        )
      }
      // Only pre-transport failures carry NotSent. Transport errors remain uncertain.
      return input.write(command)
    },
    {
      recoveryMetadata: {
        accountId: payload.accountId,
        expectedBankRevision: payload.expectedRevision,
      },
    },
  )
}

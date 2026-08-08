import { describe, expect, test } from "bun:test"

import { createDeterministicOcrProvider } from "@ewatrade/prescriptions"

import { runPrescriptionTranscription } from "./prescription-transcription"

describe("prescription transcription job", () => {
  test("passes identifiers through the job and persists normalized lines", async () => {
    const completed: unknown[] = []
    await runPrescriptionTranscription(
      { transcriptionId: "transcription-1" },
      1,
      {
        claim: async () => ({
          mediaRevision: 2,
          objectKeys: ["private/page-1"],
          requestId: "request-1",
          transcriptionId: "transcription-1",
        }),
        complete: async (input) => {
          completed.push(input)
        },
        provider: createDeterministicOcrProvider(),
        retry: async () => undefined,
      },
    )

    expect(completed).toHaveLength(1)
    expect(completed[0]).toMatchObject({
      lines: [{ draftText: "Transcribed line 1", lineNumber: 1 }],
      providerKey: "deterministic-fake",
      transcriptionId: "transcription-1",
    })
  })

  test("releases a failed claim for retry without putting sensitive records in the payload", async () => {
    let retried = false
    await expect(
      runPrescriptionTranscription(
        { transcriptionId: "transcription-1" },
        1,
        {
          claim: async () => ({
            mediaRevision: 1,
            objectKeys: ["private/page-1"],
            requestId: "request-1",
            transcriptionId: "transcription-1",
          }),
          complete: async () => undefined,
          provider: createDeterministicOcrProvider(),
          retry: async () => {
            retried = true
          },
        },
        "timeout",
      ),
    ).rejects.toThrow("provider_timeout")
    expect(retried).toBe(true)
  })
})

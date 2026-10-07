/**
 * Turns one uploaded attachment into bounded, untrusted extraction data:
 * deterministic parsing for files, transcription for voice notes and a
 * transcription-style read for photos. Storage, providers and persistence are
 * injected so the job, tests and QA rehearsal share this logic.
 */
import type {
  AssistantImageReader,
  AssistantMediaCall,
  AssistantTranscriber,
} from "@ewatrade/ai/media"
import { SetupFileParseError, parseSpreadsheet } from "../files/spreadsheet"
import {
  SETUP_ATTACHMENT_LIMITS,
  type SetupAttachmentExtraction,
  type SetupAttachmentKind,
} from "./attachments"
import { SETUP_IMAGE_READ_INSTRUCTIONS, setupImageReadSchema } from "./vision"

export const SETUP_ATTACHMENT_MAX_ATTEMPTS = 3
export const SETUP_ATTACHMENT_LEASE_MS = 3 * 60 * 1000

export type ClaimedSetupAttachment = {
  id: string
  tenantId: string
  conversationId: string
  actorUserId: string
  kind: SetupAttachmentKind
  contentDigest: string
  contentType: string
  sizeBytes: number
  durationMs: number | null
  processingAttempts: number
}

export type SetupAttachmentProcessingDeps = {
  claim: (attachmentId: string) => Promise<ClaimedSetupAttachment | null>
  readBytes: (attachment: ClaimedSetupAttachment) => Promise<Uint8Array>
  /** Null when no media provider is configured for this business. */
  media: (attachment: ClaimedSetupAttachment) => Promise<{
    transcribe: AssistantTranscriber
    readImage: AssistantImageReader
  } | null>
  /** Decodes (incl. HEIC), strips metadata and downsizes a photo for reading. */
  prepareImage: (
    bytes: Uint8Array,
    contentType: string,
  ) => Promise<{
    bytes: Uint8Array
    mediaType: "image/webp" | "image/jpeg" | "image/png"
  }>
  reserveMedia: (
    attachment: ClaimedSetupAttachment,
    request: { audioSeconds?: number; images?: number },
  ) => Promise<boolean>
  recordUsage: (
    attachment: ClaimedSetupAttachment,
    usage: AssistantMediaCall & {
      requestClass: "transcribe" | "vision" | "extract"
      outcome: "success" | "failed"
      audioSeconds?: number
      imageCount?: number
      durationMs: number
    },
  ) => Promise<void>
  complete: (input: {
    attachmentId: string
    transcript: string | null
    extraction: SetupAttachmentExtraction
    durationMs: number | null
  }) => Promise<boolean>
  fail: (input: {
    attachmentId: string
    errorCode: string
    retryable: boolean
  }) => Promise<void>
  now?: () => number
}

export type SetupAttachmentProcessingResult =
  | { status: "skipped" }
  | { status: "ready"; kind: SetupAttachmentKind }
  | { status: "failed"; errorCode: string; retryable: boolean }

class ProcessingRefusal extends Error {
  constructor(
    readonly errorCode: string,
    readonly retryable: boolean,
  ) {
    super(errorCode)
    this.name = "ProcessingRefusal"
  }
}

function decodeText(bytes: Uint8Array, maxChars = 40_000) {
  const text = new TextDecoder("utf-8", { fatal: true })
    .decode(bytes)
    .replace(/^﻿/, "")
  return {
    type: "text" as const,
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
  }
}

const PARSER = { provider: "ewatrade", model: "setup-file-parser-v1" }

async function extract(
  attachment: ClaimedSetupAttachment,
  bytes: Uint8Array,
  deps: SetupAttachmentProcessingDeps,
): Promise<{
  extraction: SetupAttachmentExtraction
  transcript: string | null
  durationMs: number | null
  call: AssistantMediaCall
  requestClass: "transcribe" | "vision" | "extract"
  audioSeconds?: number
  imageCount?: number
}> {
  switch (attachment.kind) {
    case "SPREADSHEET":
      return {
        extraction: parseSpreadsheet(bytes, attachment.contentType, {
          limits: { maxRows: SETUP_ATTACHMENT_LIMITS.SPREADSHEET.maxRows },
        }),
        transcript: null,
        durationMs: null,
        call: PARSER,
        requestClass: "extract",
      }
    case "PDF": {
      // Loaded on demand so importing this module never loads PDF.js.
      const { extractPdfText } = await import("../files/pdf-text")
      return {
        extraction: await extractPdfText(bytes, {
          maxPages: SETUP_ATTACHMENT_LIMITS.PDF.maxPages,
        }),
        transcript: null,
        durationMs: null,
        call: PARSER,
        requestClass: "extract",
      }
    }
    case "TEXT":
      return {
        extraction: decodeText(bytes),
        transcript: null,
        durationMs: null,
        call: PARSER,
        requestClass: "extract",
      }
    case "AUDIO": {
      const media = await deps.media(attachment)
      if (!media) throw new ProcessingRefusal("MEDIA_UNAVAILABLE", false)
      // The client's duration is a lower bound; a 10 MB note is ~2 minutes.
      const audioSeconds = Math.max(
        1,
        Math.ceil((attachment.durationMs ?? 0) / 1000),
        Math.ceil(attachment.sizeBytes / 64_000),
      )
      if (!(await deps.reserveMedia(attachment, { audioSeconds })))
        throw new ProcessingRefusal("BUDGET_EXHAUSTED", false)
      const result = await media.transcribe({ audio: bytes })
      if (!result.text) throw new ProcessingRefusal("NO_SPEECH", false)
      const seconds = result.durationSeconds ?? audioSeconds
      return {
        extraction: {
          type: "transcript",
          language: result.language,
          durationSeconds: result.durationSeconds,
        },
        transcript: result.text.slice(0, 8_000),
        durationMs: attachment.durationMs ?? Math.round(seconds * 1000),
        call: result,
        requestClass: "transcribe",
        audioSeconds: Math.ceil(seconds),
      }
    }
    case "IMAGE": {
      const media = await deps.media(attachment)
      if (!media) throw new ProcessingRefusal("MEDIA_UNAVAILABLE", false)
      if (!(await deps.reserveMedia(attachment, { images: 1 })))
        throw new ProcessingRefusal("BUDGET_EXHAUSTED", false)
      let prepared: Awaited<ReturnType<typeof deps.prepareImage>>
      try {
        prepared = await deps.prepareImage(bytes, attachment.contentType)
      } catch {
        throw new ProcessingRefusal("IMAGE_UNREADABLE", false)
      }
      const result = await media.readImage({
        schema: setupImageReadSchema,
        instructions: SETUP_IMAGE_READ_INSTRUCTIONS,
        image: prepared.bytes,
        mediaType: prepared.mediaType,
      })
      return {
        extraction: { type: "image", ...result.output },
        transcript: null,
        durationMs: null,
        call: result,
        requestClass: "vision",
        imageCount: 1,
      }
    }
  }
}

export async function processSetupAttachment(
  attachmentId: string,
  deps: SetupAttachmentProcessingDeps,
): Promise<SetupAttachmentProcessingResult> {
  const now = deps.now ?? Date.now
  const attachment = await deps.claim(attachmentId)
  if (!attachment) return { status: "skipped" }
  const startedAt = now()
  try {
    const bytes = await deps.readBytes(attachment)
    const result = await extract(attachment, bytes, deps)
    await deps
      .recordUsage(attachment, {
        ...result.call,
        requestClass: result.requestClass,
        outcome: "success",
        audioSeconds: result.audioSeconds,
        imageCount: result.imageCount,
        durationMs: now() - startedAt,
      })
      .catch(() => undefined)
    await deps.complete({
      attachmentId: attachment.id,
      transcript: result.transcript,
      extraction: result.extraction,
      durationMs: result.durationMs,
    })
    return { status: "ready", kind: attachment.kind }
  } catch (error) {
    const refusal =
      error instanceof ProcessingRefusal
        ? error
        : error instanceof SetupFileParseError
          ? new ProcessingRefusal(`FILE_${error.code}`, false)
          : new ProcessingRefusal(
              "PROCESSING_UNAVAILABLE",
              attachment.processingAttempts < SETUP_ATTACHMENT_MAX_ATTEMPTS,
            )
    await deps.fail({
      attachmentId: attachment.id,
      errorCode: refusal.errorCode,
      retryable: refusal.retryable,
    })
    return {
      status: "failed",
      errorCode: refusal.errorCode,
      retryable: refusal.retryable,
    }
  }
}

/** Owner-facing reason for a failed attachment; codes never reach the UI raw. */
export function describeSetupAttachmentError(errorCode: string | null) {
  switch (errorCode) {
    case "BUDGET_EXHAUSTED":
      return "This business has used its setup allowance for voice notes and photos. You can still type your list."
    case "MEDIA_UNAVAILABLE":
      return "Voice notes and photos can't be read right now. Type your list instead."
    case "NO_SPEECH":
      return "No speech was found in this voice note. Try recording again closer to the phone."
    case "IMAGE_UNREADABLE":
      return "This photo could not be opened. Try a JPEG or PNG photo."
    case "FILE_ENCRYPTED":
      return "This file is password protected. Remove the password and try again."
    case "FILE_EMPTY":
      return "Nothing readable was found in this file. For scanned pages, send a photo instead."
    case "FILE_UNREADABLE":
      return "This file could not be read. Save it as CSV or XLSX and try again."
    default:
      return "This file could not be read right now. Remove it and try again."
  }
}

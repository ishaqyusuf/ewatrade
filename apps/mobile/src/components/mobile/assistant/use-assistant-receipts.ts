import { getBaseUrl } from "@/lib/base-url"
import {
  ORDER_ATTACHMENT_MAX_BYTES,
  ORDER_ATTACHMENT_TYPES,
  readOrderAttachmentFile,
} from "@/lib/order-attachment-upload"
import { getSession } from "@/lib/session-store"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import * as DocumentPicker from "expo-document-picker"
import { File } from "expo-file-system"
import * as ImagePicker from "expo-image-picker"
import { fetch } from "expo/fetch"
import { useCallback, useEffect, useRef, useState } from "react"

export type AssistantReceipt = {
  localId: string
  /** Voice notes are written out into the box, never sent as files. */
  audio: boolean
  fileName: string
  phase: "uploading" | "reading" | "ready" | "failed"
  attachmentId: string | null
  error: string | null
}

const MAX_FILES = 4

const refusal: Record<string, string> = {
  ATTACHMENT_LIMIT: "This chat has reached its file limit. Start a new chat.",
  PHOTOS_UNAVAILABLE: "Photos can't be read right now. Send a PDF or type it.",
  TOO_LARGE: "Choose a file smaller than 10 MB.",
  UNSUPPORTED_TYPE: "Send a photo (JPG, PNG, WebP, HEIC) or a PDF.",
  UPLOADS_UNAVAILABLE: "Files can't be sent right now.",
}

/** Longest edge sent to the assistant; the photo reader downsizes past this. */
const PHOTO_EDGE = 2048

/**
 * Shrinks a camera photo before it is sent: full-size photos can pass the
 * API's ~4.5 MB request cap on Vercel, and the reader gains nothing from them.
 * Loaded on demand so older dev builds without the module still work.
 */
async function shrinkPhoto(asset: ImagePicker.ImagePickerAsset) {
  try {
    const { ImageManipulator, SaveFormat } = await import(
      "expo-image-manipulator"
    )
    const longest = Math.max(asset.width, asset.height)
    const context = ImageManipulator.manipulate(asset.uri)
    if (longest > PHOTO_EDGE)
      context.resize(
        asset.width >= asset.height
          ? { width: PHOTO_EDGE }
          : { height: PHOTO_EDGE },
      )
    const image = await context.renderAsync()
    const saved = await image.saveAsync({
      compress: 0.8,
      format: SaveFormat.JPEG,
    })
    return {
      fileName: `${(asset.fileName ?? "receipt").replace(/\.[^.]+$/, "")}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: new File(saved.uri).size,
      uri: saved.uri,
    }
  } catch {
    return null
  }
}

async function uploadBytes(path: string, buffer: ArrayBuffer, type: string) {
  const session = getSession()
  if (!session?.token || !session.profile.businessSlug)
    throw new Error("Sign in again before sending files.")
  // Hermes has no AbortSignal.timeout.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90_000)
  const response = await fetch(`${getBaseUrl()}${path}`, {
    body: buffer,
    headers: {
      "Content-Type": type,
      "x-app-authorization": `Bearer ${session.token}`,
      "x-tenant-slug": session.profile.businessSlug,
      ...(session.profile.storeId
        ? { "x-store-id": session.profile.storeId }
        : {}),
      "x-trpc-source": "mobile",
    },
    method: "PUT",
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))
  if (response.ok) return
  const body: unknown = await response.json().catch(() => null)
  throw new Error(
    body && typeof body === "object" && "error" in body
      ? String(body.error)
      : "The file didn't upload. Try again.",
  )
}

/** Receipt photos and PDFs for the business chat: pick, upload, wait until read. */
export function useAssistantReceipts(
  conversationId: string,
  onTranscript: (text: string) => void = () => undefined,
  resetKey: string | number = 0,
) {
  const scope = useRef({ conversationId, resetKey, generation: 0 })
  if (
    scope.current.conversationId !== conversationId ||
    scope.current.resetKey !== resetKey
  )
    scope.current = {
      conversationId,
      resetKey,
      generation: scope.current.generation + 1,
    }
  const generation = scope.current.generation
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript
  const trpc = useTRPC()
  const createIntent = useMutation(
    trpc.setupAssistant.attachments.createIntent.mutationOptions(),
  )
  const remove = useMutation(
    trpc.setupAssistant.attachments.remove.mutationOptions(),
  )
  type ScopedReceipt = AssistantReceipt & { generation: number }
  const [storedItems, setItemsState] = useState<ScopedReceipt[]>([])
  // A changed chat hides old files in this render, before effects run.
  const items = storedItems.filter((item) => item.generation === generation)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const setItems = useCallback(
    (updater: (current: ScopedReceipt[]) => ScopedReceipt[]) => {
      itemsRef.current = updater(
        itemsRef.current.filter(
          (item) => item.generation === scope.current.generation,
        ),
      )
      setItemsState(itemsRef.current)
    },
    [],
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: release old items when the scope generation changes.
  useEffect(() => {
    // Release hidden previous-chat items as well as fencing their callbacks.
    setItems((current) => current)
  }, [generation, setItems])
  const mounted = useRef(true)
  const current = () =>
    mounted.current && scope.current.generation === generation
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const update = (localId: string, patch: Partial<AssistantReceipt>) => {
    if (current())
      setItems((current) =>
        current.map((item) =>
          item.localId === localId ? { ...item, ...patch } : item,
        ),
      )
  }
  const reading = items.flatMap((item) =>
    item.phase === "reading" && item.attachmentId ? [item.attachmentId] : [],
  )
  // Files are read in the background; poll until each is ready or failed.
  const status = useQuery(
    trpc.setupAssistant.attachments.list.queryOptions(
      { attachmentIds: reading },
      { enabled: reading.length > 0, refetchInterval: 1_500, retry: false },
    ),
  )
  useEffect(() => {
    for (const row of status.data ?? []) {
      if (row.status !== "READY" && row.status !== "FAILED") continue
      const item = itemsRef.current.find(
        (entry) => entry.attachmentId === row.id && entry.phase === "reading",
      )
      if (!item) continue
      if (item.audio && row.status === "READY") {
        // Written out: the words go into the box; the recording is not sent.
        if (row.transcript?.trim()) onTranscriptRef.current(row.transcript)
        setItems((current) =>
          current.filter((entry) => entry.localId !== item.localId),
        )
        continue
      }
      setItems((current) =>
        current.map((entry) =>
          entry.localId === item.localId
            ? row.status === "READY"
              ? { ...entry, phase: "ready" }
              : {
                  ...entry,
                  phase: "failed",
                  error: item.audio
                    ? "The voice note could not be written out."
                    : "This file could not be read.",
                }
            : entry,
        ),
      )
    }
  }, [status.data, setItems])

  async function add(
    file: {
      uri: string
      mimeType: string
      fileName: string
      sizeBytes: number
    },
    options: { audio?: boolean } = {},
  ) {
    if (!current() || !conversationId) return
    const audio = options.audio === true
    const localId = Crypto.randomUUID()
    const failed = (error: string) =>
      update(localId, { error, phase: "failed" })
    setItems((current) => [
      ...current,
      {
        attachmentId: null,
        audio,
        error: null,
        fileName: file.fileName,
        localId,
        phase: "uploading",
        generation,
      },
    ])
    if (
      !audio &&
      !(ORDER_ATTACHMENT_TYPES as readonly string[]).includes(file.mimeType)
    )
      return failed(refusal.UNSUPPORTED_TYPE ?? "")
    if (file.sizeBytes <= 0 || file.sizeBytes > ORDER_ATTACHMENT_MAX_BYTES)
      return failed(refusal.TOO_LARGE ?? "")
    try {
      const read = await readOrderAttachmentFile(file.uri)
      if (!current()) return
      const intent = await createIntent.mutateAsync({
        clientRequestId: localId,
        contentDigest: read.contentDigest,
        contentType: file.mimeType,
        conversationId,
        fileName: file.fileName,
        sizeBytes: read.sizeBytes,
      })
      if (!current()) return
      if (!intent.ok)
        return failed(refusal[intent.reason] ?? "This file can't be sent.")
      update(localId, { attachmentId: intent.attachment.id })
      await uploadBytes(intent.uploadPath, read.buffer, file.mimeType)
      update(localId, { phase: "reading" })
    } catch (error) {
      failed(error instanceof Error ? error.message : "Upload failed.")
    }
  }

  async function pick(source: "camera" | "library" | "pdf") {
    if (items.length >= MAX_FILES) return
    if (source === "pdf") {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ["application/pdf"],
      })
      const asset = result.canceled ? undefined : result.assets[0]
      if (asset)
        await add({
          fileName: asset.name,
          mimeType: asset.mimeType ?? "application/pdf",
          sizeBytes: asset.size ?? new File(asset.uri).size,
          uri: asset.uri,
        })
      return
    }
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) return
    }
    const options: ImagePicker.ImagePickerOptions = {
      allowsEditing: false,
      mediaTypes: ["images"],
      quality: 0.8,
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options)
    const asset = result.canceled ? undefined : result.assets[0]
    if (!asset?.mimeType) return
    await add(
      (await shrinkPhoto(asset)) ?? {
        fileName: asset.fileName ?? `receipt.${asset.mimeType.split("/")[1]}`,
        mimeType: asset.mimeType,
        sizeBytes: asset.fileSize ?? new File(asset.uri).size,
        uri: asset.uri,
      },
    )
  }

  function discard(localId: string) {
    const item = items.find((row) => row.localId === localId)
    setItems((current) => current.filter((row) => row.localId !== localId))
    if (item?.attachmentId)
      void remove
        .mutateAsync({ attachmentId: item.attachmentId })
        .catch(() => undefined)
  }

  return {
    items: items.filter((item) => !item.audio),
    /** A voice note is uploading or being written out. */
    transcribing: items.some((item) => item.audio && item.phase !== "failed"),
    voiceError: items.find((item) => item.audio && item.phase === "failed")
      ?.error,
    addRecording: (file: { uri: string; size: number }) =>
      add(
        {
          fileName: "voice-note.m4a",
          mimeType: "audio/mp4",
          sizeBytes: file.size,
          uri: file.uri,
        },
        { audio: true },
      ),
    clear: () => {
      scope.current.generation += 1
      setItems(() => [])
    },
    ready: items.flatMap((item) =>
      !item.audio && item.phase === "ready" && item.attachmentId
        ? [{ attachmentId: item.attachmentId, fileName: item.fileName }]
        : [],
    ),
    canAdd: items.length < MAX_FILES,
    pick,
    discard,
  }
}

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
import { useEffect, useRef, useState } from "react"

export type AssistantReceipt = {
  localId: string
  fileName: string
  phase: "uploading" | "reading" | "ready" | "failed"
  attachmentId: string | null
  error: string | null
}

const MAX_FILES = 4

const refusal: Record<string, string> = {
  ATTACHMENT_LIMIT: "This chat has reached its file limit. Start a new chat.",
  TOO_LARGE: "Choose a file smaller than 10 MB.",
  UNSUPPORTED_TYPE: "Send a photo (JPG, PNG, WebP, HEIC) or a PDF.",
  UPLOADS_UNAVAILABLE: "Files can't be sent right now.",
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
export function useAssistantReceipts(conversationId: string) {
  const trpc = useTRPC()
  const createIntent = useMutation(
    trpc.setupAssistant.attachments.createIntent.mutationOptions(),
  )
  const remove = useMutation(
    trpc.setupAssistant.attachments.remove.mutationOptions(),
  )
  const [items, setItems] = useState<AssistantReceipt[]>([])
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )
  const update = (localId: string, patch: Partial<AssistantReceipt>) => {
    if (mounted.current)
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
    for (const row of status.data ?? [])
      if (row.status === "READY" || row.status === "FAILED")
        setItems((current) =>
          current.map((item) =>
            item.attachmentId === row.id && item.phase === "reading"
              ? row.status === "READY"
                ? { ...item, phase: "ready" }
                : {
                    ...item,
                    phase: "failed",
                    error: "This file could not be read.",
                  }
              : item,
          ),
        )
  }, [status.data])

  async function add(file: {
    uri: string
    mimeType: string
    fileName: string
    sizeBytes: number
  }) {
    const localId = Crypto.randomUUID()
    const failed = (error: string) =>
      update(localId, { error, phase: "failed" })
    setItems((current) => [
      ...current,
      {
        attachmentId: null,
        error: null,
        fileName: file.fileName,
        localId,
        phase: "uploading",
      },
    ])
    if (!(ORDER_ATTACHMENT_TYPES as readonly string[]).includes(file.mimeType))
      return failed(refusal.UNSUPPORTED_TYPE ?? "")
    if (file.sizeBytes <= 0 || file.sizeBytes > ORDER_ATTACHMENT_MAX_BYTES)
      return failed(refusal.TOO_LARGE ?? "")
    try {
      const read = await readOrderAttachmentFile(file.uri)
      const intent = await createIntent.mutateAsync({
        clientRequestId: localId,
        contentDigest: read.contentDigest,
        contentType: file.mimeType,
        conversationId,
        fileName: file.fileName,
        sizeBytes: read.sizeBytes,
      })
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
    if (asset?.mimeType)
      await add({
        fileName: asset.fileName ?? `receipt.${asset.mimeType.split("/")[1]}`,
        mimeType: asset.mimeType,
        sizeBytes: asset.fileSize ?? new File(asset.uri).size,
        uri: asset.uri,
      })
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
    items,
    ready: items.flatMap((item) =>
      item.phase === "ready" && item.attachmentId
        ? [{ attachmentId: item.attachmentId, fileName: item.fileName }]
        : [],
    ),
    canAdd: items.length < MAX_FILES,
    pick,
    discard,
  }
}

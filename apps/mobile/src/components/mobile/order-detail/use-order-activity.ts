import {
  ORDER_ATTACHMENT_MAX_BYTES,
  ORDER_ATTACHMENT_TYPES,
  ORDER_VIDEO_MAX_BYTES,
  ORDER_VIDEO_TYPES,
  readOrderAttachmentFile,
  uploadOrderAttachment,
  uploadOrderAttachmentDirect,
} from "@/lib/order-attachment-upload"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import * as DocumentPicker from "expo-document-picker"
import { File } from "expo-file-system"
import * as ImagePicker from "expo-image-picker"
import { useRef, useState } from "react"
import { Keyboard } from "react-native"

export type OrderActivityDraftFile = {
  id: string
  uri: string
  mimeType: string
  fileName: string
  sizeBytes: number
}

const MAX_FILES = 6

const isVideo = (mimeType: string) =>
  (ORDER_VIDEO_TYPES as readonly string[]).includes(mimeType)

/** Order notes, photos, PDFs and videos: load, pick, then post and upload. */
export function useOrderActivity(orderId: string, isOffline: boolean) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const activity = useQuery(
    trpc.orders.activity.list.queryOptions(
      { orderId },
      { enabled: !isOffline, retry: false },
    ),
  )
  const addMutation = useMutation(trpc.orders.activity.add.mutationOptions())
  const uploadTarget = useMutation(
    trpc.orders.activity.uploadTarget.mutationOptions(),
  )
  const confirmUpload = useMutation(
    trpc.orders.activity.confirmUpload.mutationOptions(),
  )
  const [progress, setProgress] = useState<number | null>(null)
  const [body, setBody] = useState("")
  const [files, setFiles] = useState<OrderActivityDraftFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPosting, setIsPosting] = useState(false)
  // Kept across retries so a failed upload resumes the same entry.
  const clientActivityId = useRef(`activity-${Crypto.randomUUID()}`)

  function addFile(file: Omit<OrderActivityDraftFile, "id">) {
    const video = isVideo(file.mimeType)
    if (
      !video &&
      !(ORDER_ATTACHMENT_TYPES as readonly string[]).includes(file.mimeType)
    ) {
      setError("Attach a photo (JPG, PNG, WebP, HEIC), a PDF or a video.")
      return
    }
    if (
      file.sizeBytes <= 0 ||
      file.sizeBytes >
        (video ? ORDER_VIDEO_MAX_BYTES : ORDER_ATTACHMENT_MAX_BYTES)
    ) {
      setError(
        video
          ? "Videos can be up to 100 MB. Record a shorter one."
          : "Choose a file smaller than 10 MB.",
      )
      return
    }
    setError(null)
    setFiles((current) =>
      current.length >= MAX_FILES
        ? current
        : [...current, { ...file, id: Crypto.randomUUID() }],
    )
  }

  async function pickPhoto(source: "camera" | "library") {
    if (isPosting || files.length >= MAX_FILES) return
    Keyboard.dismiss()
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) {
        setError(
          "Camera access is off. Choose a photo instead, or enable camera access in Settings.",
        )
        return
      }
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.7,
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options)
    if (result.canceled) return
    const asset = result.assets[0]
    if (!asset?.mimeType) {
      setError("This photo could not be read. Try another one.")
      return
    }
    addFile({
      fileName: asset.fileName ?? `photo.${asset.mimeType.split("/")[1]}`,
      mimeType: asset.mimeType,
      sizeBytes: asset.fileSize ?? new File(asset.uri).size,
      uri: asset.uri,
    })
  }

  /** Up to a minute, so it stays within the 100 MB limit. */
  async function pickVideo(source: "camera" | "library") {
    if (isPosting || files.length >= MAX_FILES) return
    Keyboard.dismiss()
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) {
        setError(
          "Camera access is off. Choose a video instead, or enable camera access in Settings.",
        )
        return
      }
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["videos"],
      allowsEditing: false,
      videoMaxDuration: 60,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options)
    if (result.canceled) return
    const asset = result.assets[0]
    // Android reports some MP4s without a type; the file name settles it.
    const mimeType =
      asset?.mimeType ??
      (asset?.uri.toLowerCase().endsWith(".mov")
        ? "video/quicktime"
        : "video/mp4")
    if (!asset) return
    addFile({
      fileName:
        asset.fileName ??
        `video.${mimeType === "video/quicktime" ? "mov" : "mp4"}`,
      mimeType,
      sizeBytes: asset.fileSize ?? new File(asset.uri).size,
      uri: asset.uri,
    })
  }

  async function pickDocument() {
    if (isPosting || files.length >= MAX_FILES) return
    Keyboard.dismiss()
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: ["application/pdf"],
    })
    if (result.canceled) return
    const asset = result.assets[0]
    if (!asset) return
    addFile({
      fileName: asset.name,
      mimeType: asset.mimeType ?? "application/pdf",
      sizeBytes: asset.size ?? new File(asset.uri).size,
      uri: asset.uri,
    })
  }

  function removeFile(fileId: string) {
    if (isPosting) return
    setFiles((current) => current.filter((file) => file.id !== fileId))
  }

  async function post() {
    if (isPosting || isOffline) return
    if (!body.trim() && files.length === 0) {
      setError("Write a note or attach a photo or file.")
      return
    }
    setIsPosting(true)
    setError(null)
    Keyboard.dismiss()
    try {
      const read = await Promise.all(
        files.map(async (file) => ({
          file,
          ...(await readOrderAttachmentFile(file.uri)),
        })),
      )
      const entry = await addMutation.mutateAsync({
        attachments: read.map(({ file, contentDigest, sizeBytes }) => ({
          contentDigest,
          contentType: file.mimeType,
          fileName: file.fileName,
          sizeBytes,
        })),
        body: body.trim() || undefined,
        clientActivityId: clientActivityId.current,
        orderId,
      })
      const pending = [...entry.attachments]
      for (const item of read) {
        const index = pending.findIndex(
          (attachment) =>
            attachment.contentType === item.file.mimeType &&
            attachment.sizeBytes === item.sizeBytes,
        )
        const attachment = index >= 0 ? pending.splice(index, 1)[0] : undefined
        if (attachment?.status !== "PENDING_UPLOAD") continue
        const route = await uploadTarget.mutateAsync({
          attachmentId: attachment.id,
        })
        if (route.mode === "direct") {
          await uploadOrderAttachmentDirect({
            buffer: item.buffer,
            clientToken: route.clientToken,
            contentType: route.contentType,
            onProgress: setProgress,
            pathname: route.pathname,
          })
          await confirmUpload.mutateAsync({ attachmentId: attachment.id })
        } else
          await uploadOrderAttachment({
            buffer: item.buffer,
            contentType: item.file.mimeType,
            path: route.path,
          })
      }
      setBody("")
      setFiles([])
      clientActivityId.current = `activity-${Crypto.randomUUID()}`
    } catch (failure) {
      setError(
        failure instanceof Error
          ? `${failure.message} Tap Post to try again.`
          : "Could not save. Tap Post to try again.",
      )
    } finally {
      setIsPosting(false)
      setProgress(null)
      await queryClient.invalidateQueries({
        queryKey: trpc.orders.activity.list.queryKey({ orderId }),
      })
    }
  }

  return {
    entries: activity.data ?? [],
    isLoading: activity.isLoading,
    loadError: activity.error?.message ?? null,
    body,
    setBody: (value: string) => {
      if (!isPosting) setBody(value)
    },
    files,
    canAddFiles: files.length < MAX_FILES && !isPosting,
    error,
    isPosting,
    /** Direct upload progress, 0–100, while a live file is sending. */
    progress,
    pickPhoto,
    pickVideo,
    pickDocument,
    removeFile,
    post,
  }
}

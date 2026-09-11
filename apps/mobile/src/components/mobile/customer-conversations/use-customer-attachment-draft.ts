import {
  type StoreConversationAttachmentDraft,
  type StoreConversationAttachmentPolicy,
  createStoreConversationAttachmentDraft,
  reduceStoreConversationAttachmentDraft,
} from "@ewatrade/utils"
import * as Crypto from "expo-crypto"
import * as DocumentPicker from "expo-document-picker"
import { File } from "expo-file-system"
import * as ImagePicker from "expo-image-picker"
import { useCallback, useEffect, useRef, useState } from "react"

type SelectedNativeFile = {
  discardOnRemove?: boolean
  mimeType: string
  name: string
  size: number
  uri: string
}

export function useCustomerAttachmentDraft(input: {
  enabled: boolean
  onCancelUpload?: () => void
  onUpload: (input: {
    draft: StoreConversationAttachmentDraft
    file: SelectedNativeFile
    updateProgress: (progress: number) => void
  }) => Promise<void>
  policy: StoreConversationAttachmentPolicy
  scopeKey: string
}) {
  const [draft, setDraft] = useState<StoreConversationAttachmentDraft | null>(
    null,
  )
  const [notice, setNotice] = useState<string | null>(null)
  const selectedFile = useRef<SelectedNativeFile | null>(null)
  const attemptGeneration = useRef(0)
  const activeScope = useRef(input.scopeKey)
  const cancelUploadRef = useRef(input.onCancelUpload)
  cancelUploadRef.current = input.onCancelUpload

  const discardSelectedFile = useCallback(() => {
    const file = selectedFile.current
    if (file?.discardOnRemove) {
      try {
        new File(file.uri).delete()
      } catch {
        // A missing device-local recording is already discarded.
      }
    }
    selectedFile.current = null
  }, [])

  useEffect(() => {
    activeScope.current = input.scopeKey
    attemptGeneration.current += 1
    cancelUploadRef.current?.()
    discardSelectedFile()
    setDraft(null)
    setNotice(null)
    return () => {
      attemptGeneration.current += 1
      cancelUploadRef.current?.()
      discardSelectedFile()
    }
  }, [discardSelectedFile, input.scopeKey])

  function acceptSelectedFile(file: SelectedNativeFile) {
    const next = createStoreConversationAttachmentDraft({
      file: {
        localReference: file.uri,
        mimeType: file.mimeType,
        name: file.name,
        size: file.size,
      },
      operationId: Crypto.randomUUID(),
      policy: input.policy,
    })
    if (!next.ok) {
      if (file.discardOnRemove) {
        try {
          new File(file.uri).delete()
        } catch {
          // The recorder may already have removed the rejected local file.
        }
      }
      setNotice(next.message)
      return
    }
    discardSelectedFile()
    selectedFile.current = file
    setDraft(next.draft)
  }

  async function pickImage() {
    if (!input.enabled || !input.policy.allowedKinds.includes("image")) return
    const scope = activeScope.current
    setNotice(null)
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ["images"],
        quality: 0.9,
      })
      if (activeScope.current !== scope) return
      const asset = result.canceled ? undefined : result.assets[0]
      if (!asset) return
      if (!asset.fileSize || !asset.mimeType) {
        setNotice(
          "This image could not be checked on your device. Choose another image.",
        )
        return
      }
      acceptSelectedFile({
        mimeType: asset.mimeType,
        name: asset.fileName ?? `customer-image-${Date.now()}.jpg`,
        size: asset.fileSize,
        uri: asset.uri,
      })
    } catch {
      if (activeScope.current !== scope) return
      setNotice("Photos could not be opened. Check photo access and try again.")
    }
  }

  async function pickDocument() {
    if (!input.enabled || !input.policy.allowedKinds.includes("document"))
      return
    const scope = activeScope.current
    setNotice(null)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: "application/pdf",
      })
      if (activeScope.current !== scope) return
      const asset = result.canceled ? undefined : result.assets[0]
      if (!asset) return
      if (!asset.size || asset.mimeType !== "application/pdf") {
        setNotice("Choose one PDF document with readable file details.")
        return
      }
      acceptSelectedFile({
        mimeType: asset.mimeType,
        name: asset.name,
        size: asset.size,
        uri: asset.uri,
      })
    } catch {
      if (activeScope.current !== scope) return
      setNotice("Documents could not be opened. Try the PDF picker again.")
    }
  }

  function acceptVoiceNote(file: { name: string; size: number; uri: string }) {
    if (!input.enabled || !input.policy.allowedKinds.includes("audio")) {
      try {
        new File(file.uri).delete()
      } catch {
        // The recording may already have been removed by the audio session.
      }
      return false
    }
    acceptSelectedFile({
      discardOnRemove: true,
      mimeType: "audio/mp4",
      ...file,
    })
    return true
  }

  async function upload() {
    if (
      !draft ||
      !selectedFile.current ||
      !input.enabled ||
      draft.status === "uploading"
    )
      return false
    const attempt = attemptGeneration.current + 1
    attemptGeneration.current = attempt
    const uploading = reduceStoreConversationAttachmentDraft(draft, {
      type: "upload_started",
    })
    setDraft(uploading)
    setNotice(null)
    try {
      await input.onUpload({
        draft: uploading,
        file: selectedFile.current,
        updateProgress: (progress) => {
          if (attemptGeneration.current !== attempt) return
          setDraft((current) =>
            current
              ? reduceStoreConversationAttachmentDraft(current, {
                  progress,
                  type: "upload_progressed",
                })
              : current,
          )
        },
      })
      if (attemptGeneration.current !== attempt) return false
      discardSelectedFile()
      setDraft(null)
      return true
    } catch (error) {
      if (attemptGeneration.current !== attempt) return false
      setDraft((current) =>
        current
          ? reduceStoreConversationAttachmentDraft(current, {
              message:
                error instanceof Error
                  ? error.message
                  : "Upload interrupted. Try again.",
              type: "upload_failed",
            })
          : current,
      )
      return false
    }
  }

  function cancel() {
    attemptGeneration.current += 1
    input.onCancelUpload?.()
    setDraft((current) =>
      current
        ? reduceStoreConversationAttachmentDraft(current, {
            type: "upload_cancelled",
          })
        : current,
    )
  }

  function retry() {
    setDraft((current) =>
      current
        ? reduceStoreConversationAttachmentDraft(current, {
            type: "upload_retried",
          })
        : current,
    )
    setNotice(null)
  }

  function remove() {
    attemptGeneration.current += 1
    discardSelectedFile()
    setDraft(null)
    setNotice(null)
  }

  return {
    acceptVoiceNote,
    cancel,
    draft,
    notice,
    pickDocument,
    pickImage,
    remove,
    retry,
    upload,
  }
}

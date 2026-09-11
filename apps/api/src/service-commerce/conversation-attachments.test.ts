import { describe, expect, test } from "bun:test"
import { ServiceCommerceMediaError } from "@ewatrade/db/queries"

import {
  StoreConversationAttachmentTransportError,
  parseGuestStoreConversationAttachmentRequest,
  processGuestStoreConversationAttachment,
  resolveStoreConversationAttachmentCapability,
  storeConversationAttachmentErrorResponse,
} from "./conversation-attachments"

const baseInput = {
  channel: "web" as const,
  clientMediaId: "client-media-1",
  clientOperationId: "attachment-operation-1",
  conversationId: "conversation-1",
  credentialToken: "c".repeat(32),
  fileName: "prescription.pdf",
  kind: "document" as const,
  mimeType: "application/pdf",
  publicToken: "p".repeat(32),
  target: {
    kind: "new_prescription_request" as const,
  },
}

const authorizeTestUpload = async () => ({
  channel: "web" as const,
  conversationId: "conversation-1",
  credentialDigest: "d".repeat(64),
  expiresAt: "2030-01-01T00:00:00.000Z",
  installationDigest: null,
  publicToken: "p".repeat(32),
  target: { kind: "new_commerce_inquiry" as const },
  version: 1 as const,
})

describe("Store Conversation attachment transport", () => {
  test("binds native attachment capability to the installation-scoped mobile credential purpose", async () => {
    const calls: unknown[] = []
    await expect(
      resolveStoreConversationAttachmentCapability(
        {
          channel: "mobile",
          conversationId: "conversation-1",
          credentialToken: "c".repeat(32),
          installationToken: "i".repeat(32),
          publicToken: "p".repeat(32),
          target: { kind: "new_commerce_inquiry" },
        },
        {
          resolveCapability: async (_db, input) => {
            calls.push(input)
            return {
              acceptedMimeTypes: [
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/heic",
                "image/heif",
                "application/pdf",
              ],
              allowedKinds: ["image", "document"],
              available: true,
              blockers: [],
              limits: {
                maxAudioBytes: 5_000_000,
                maxBytes: 10_000_000,
                maxCount: 1,
                maxDurationMs: 60_000,
              },
              uploadAuthorization: null,
            }
          },
        },
      ),
    ).resolves.toMatchObject({ available: true })
    expect(calls[0]).toMatchObject({
      channel: "mobile",
      installationToken: "i".repeat(32),
      purpose: "MOBILE_DEVICE",
    })
  })

  test("requires explicit clinical consent before provider storage or Request creation", async () => {
    let dependencyCalled = false
    await expect(
      processGuestStoreConversationAttachment(
        {
          ...baseInput,
          bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
          prescriptionConsentAccepted: undefined,
        },
        new Proxy({} as never, {
          get() {
            dependencyCalled = true
            throw new Error("must not run")
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
    expect(dependencyCalled).toBe(false)
  })

  test("stores a verified generic PDF, queues identifier-only safety, and commits its exact Request", async () => {
    const calls: unknown[] = []
    const result = await processGuestStoreConversationAttachment(
      {
        ...baseInput,
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
        target: {
          kind: "existing_request",
          request: {
            id: "inquiry-1",
            kind: "commerce_inquiry",
            revision: 2,
          },
        },
      },
      {
        append: async (_db, input) => {
          calls.push(["append", input.owner, input.request])
          return { message: { id: "message-1" }, replayed: false } as never
        },
        createInquiry: async () => {
          throw new Error("not used")
        },
        deleteGeneric: async () => {
          throw new Error("not used")
        },
        deletePrescription: async () => {
          throw new Error("not used")
        },
        enqueueGenericSafety: async (input) => {
          calls.push(["enqueue", input])
        },
        enqueuePrescriptionSafety: async () => {
          throw new Error("not used")
        },
        findPrescriptionMedia: async () => {
          throw new Error("not used")
        },
        findPrescriptionReplay: async () => null,
        recordGeneric: async (_db, input) => {
          calls.push(["record", input.signatureMimeType])
          return {
            attachment: { id: "source-attachment-1" },
            media: { id: "media-1", lifecycle: "pending_upload" },
            replayed: false,
          } as never
        },
        recordGenericSafety: async (_db, input) => {
          calls.push(["safety", input.mediaAssetId])
          return {} as never
        },
        recordGenericStored: async (_db, input) => {
          calls.push(["stored", input.verifiedMediaType])
          return {} as never
        },
        resolveCreatedInquiryTarget: async () => {
          throw new Error("not used")
        },
        resolveUpload: async () =>
          ({
            actorUserId: "public_store_conversation",
            capability: {
              acceptedMimeTypes: ["application/pdf"],
              allowedKinds: ["document"],
              available: true,
              blockers: [],
              limits: {
                maxAudioBytes: 5_000_000,
                maxBytes: 10_000_000,
                maxCount: 1,
                maxDurationMs: 60_000,
              },
              uploadAuthorization: null,
            },
            channel: "web",
            conversationId: "conversation-1",
            intakeContext: {
              entryPointId: "entry-1",
              entryPointRevision: 1,
              kind: "entry_point",
            },
            storeId: "store-1",
            target: {
              kind: "generic",
              source: { id: "inquiry-1", kind: "commerce_inquiry" },
              sourceLineId: "line-1",
              sourceVersion: "source-version-1",
            },
            tenantId: "tenant-1",
            vertical: "service",
          }) as never,
        storeGeneric: async () => ({ storageReference: "private:media-1" }),
        storePrescription: async () => {
          throw new Error("not used")
        },
        submitPrescription: async () => {
          throw new Error("not used")
        },
        commitPrescription: async () => {
          throw new Error("not used")
        },
      },
    )

    expect(result).toMatchObject({ replayed: false })
    expect(calls).toEqual([
      ["record", "application/pdf"],
      ["stored", "application/pdf"],
      [
        "append",
        { kind: "generic", sourceAttachmentId: "source-attachment-1" },
        { id: "inquiry-1", kind: "commerce_inquiry", revision: 2 },
      ],
      ["safety", "media-1"],
      [
        "enqueue",
        { mediaAssetId: "media-1", storeId: "store-1", tenantId: "tenant-1" },
      ],
    ])
  })

  test("resolves a newly created Product Request without requiring a pre-existing conversation link", async () => {
    const calls: unknown[] = []
    let uploadResolutions = 0
    const result = await processGuestStoreConversationAttachment(
      {
        ...baseInput,
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
        target: { kind: "new_commerce_inquiry" },
      },
      {
        append: async (_db, input) => {
          calls.push(["append", input.request])
          return { message: { id: "message-1" }, replayed: false } as never
        },
        commitPrescription: async () => {
          throw new Error("not used")
        },
        createInquiry: async () => ({ id: "inquiry-1" }) as never,
        deleteGeneric: async () => undefined,
        deletePrescription: async () => undefined,
        enqueueGenericSafety: async () => undefined,
        enqueuePrescriptionSafety: async () => undefined,
        findPrescriptionMedia: async () => null,
        findPrescriptionReplay: async () => null,
        recordGeneric: async () =>
          ({
            attachment: { id: "source-attachment-1" },
            media: { id: "media-1", lifecycle: "safety_pending" },
            replayed: true,
          }) as never,
        recordGenericSafety: async () => undefined as never,
        recordGenericStored: async () => undefined as never,
        resolveCreatedInquiryTarget: async (_db, input) => {
          calls.push(["resolve-created", input])
          return {
            kind: "generic",
            source: { id: input.inquiryId, kind: "commerce_inquiry" },
            sourceLineId: "line-1",
            sourceVersion: "source-version-1",
          }
        },
        resolveUpload: async () => {
          uploadResolutions += 1
          return {
            actorUserId: "public_store_conversation",
            capability: {
              acceptedMimeTypes: ["application/pdf"],
              allowedKinds: ["document"],
              available: true,
              blockers: [],
              limits: {
                maxAudioBytes: 5_000_000,
                maxBytes: 10_000_000,
                maxCount: 1,
                maxDurationMs: 60_000,
              },
              uploadAuthorization: null,
            },
            channel: "web",
            conversationId: "conversation-1",
            intakeContext: {
              entryPointId: "entry-1",
              entryPointRevision: 1,
              kind: "entry_point",
            },
            storeId: "store-1",
            target: { kind: "new_commerce_inquiry" },
            tenantId: "tenant-1",
            vertical: "service",
          } as never
        },
        storeGeneric: async () => {
          throw new Error("not used")
        },
        storePrescription: async () => {
          throw new Error("not used")
        },
        submitPrescription: async () => {
          throw new Error("not used")
        },
      },
    )

    expect(result).toMatchObject({ replayed: false })
    expect(uploadResolutions).toBe(1)
    expect(calls).toEqual([
      [
        "resolve-created",
        {
          actorUserId: "public_store_conversation",
          inquiryId: "inquiry-1",
          storeId: "store-1",
          tenantId: "tenant-1",
        },
      ],
      ["append", { id: "inquiry-1", kind: "commerce_inquiry", revision: 1 }],
    ])
  })

  test("advances a replayed stored generic asset to safety before re-enqueue", async () => {
    const calls: string[] = []
    const result = await processGuestStoreConversationAttachment(
      {
        ...baseInput,
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
        target: {
          kind: "existing_request",
          request: {
            id: "inquiry-1",
            kind: "commerce_inquiry",
            revision: 2,
          },
        },
      },
      {
        append: async () => {
          calls.push("append")
          return { message: { id: "message-1" }, replayed: false } as never
        },
        enqueueGenericSafety: async () => calls.push("enqueue"),
        recordGeneric: async () =>
          ({
            attachment: { id: "source-attachment-1" },
            media: { id: "media-1", lifecycle: "stored" },
            replayed: true,
          }) as never,
        recordGenericSafety: async () => calls.push("request-safety"),
        recordGenericStored: async () => {
          throw new Error("stored media must not be stored twice")
        },
        resolveUpload: async () =>
          ({
            actorUserId: "public_store_conversation",
            storeId: "store-1",
            target: {
              kind: "generic",
              source: { id: "inquiry-1", kind: "commerce_inquiry" },
              sourceLineId: "line-1",
              sourceVersion: "source-version-1",
            },
            tenantId: "tenant-1",
          }) as never,
        storeGeneric: async () => {
          throw new Error("stored media must not be stored twice")
        },
      } as never,
    )

    expect(result).toMatchObject({ replayed: false })
    expect(calls).toEqual(["append", "request-safety", "enqueue"])
  })

  test("deletes a newly stored generic object if its authoritative storage receipt fails", async () => {
    const calls: unknown[] = []
    await expect(
      processGuestStoreConversationAttachment(
        {
          ...baseInput,
          bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
          target: {
            kind: "existing_request",
            request: {
              id: "inquiry-1",
              kind: "commerce_inquiry",
              revision: 2,
            },
          },
        },
        {
          deleteGeneric: async (input: {
            mediaAssetId: string
            storageReference: string
          }) => {
            calls.push(["delete", input])
          },
          recordGeneric: async () =>
            ({
              attachment: { id: "source-attachment-1" },
              media: { id: "media-1", lifecycle: "pending_upload" },
              replayed: false,
            }) as never,
          recordGenericStored: async () => {
            throw new Error("database unavailable")
          },
          resolveUpload: async () =>
            ({
              actorUserId: "public_store_conversation",
              storeId: "store-1",
              target: {
                kind: "generic",
                source: { id: "inquiry-1", kind: "commerce_inquiry" },
                sourceLineId: "line-1",
                sourceVersion: "source-version-1",
              },
              tenantId: "tenant-1",
            }) as never,
          storeGeneric: async () => ({ storageReference: "private:media-1" }),
        } as never,
      ),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" })
    expect(calls).toEqual([
      [
        "delete",
        { mediaAssetId: "media-1", storageReference: "private:media-1" },
      ],
    ])
  })

  test("returns a safe conflict when a generic replay uses different bytes", async () => {
    let caught: unknown
    try {
      await processGuestStoreConversationAttachment(
        {
          ...baseInput,
          bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x32]),
          target: {
            kind: "existing_request",
            request: {
              id: "inquiry-1",
              kind: "commerce_inquiry",
              revision: 2,
            },
          },
        },
        {
          recordGeneric: async () => {
            throw new ServiceCommerceMediaError(
              "IDEMPOTENCY_MISMATCH",
              "private digest mismatch detail",
            )
          },
          resolveUpload: async () =>
            ({
              actorUserId: "public_store_conversation",
              storeId: "store-1",
              target: {
                kind: "generic",
                source: { id: "inquiry-1", kind: "commerce_inquiry" },
                sourceLineId: "line-1",
                sourceVersion: "source-version-1",
              },
              tenantId: "tenant-1",
            }) as never,
        } as never,
      )
    } catch (error) {
      caught = error
    }
    const response = storeConversationAttachmentErrorResponse(caught)
    const redacted = response.clone()
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: "CONFLICT",
      message:
        "This attachment retry does not match the original file. Remove it and choose the file again.",
    })
    expect(await redacted.text()).not.toContain("private digest")
  })

  test("deletes a new clinical object if authoritative Prescription intake fails", async () => {
    const calls: unknown[] = []
    await expect(
      processGuestStoreConversationAttachment(
        {
          ...baseInput,
          bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
          prescriptionConsentAccepted: true,
        },
        {
          deletePrescription: async (objectKey: string) => {
            calls.push(["delete", objectKey])
          },
          findPrescriptionReplay: async () => null,
          resolveUpload: async () =>
            ({
              actorUserId: "public_store_conversation",
              intakeContext: {
                entryPointId: "entry-1",
                entryPointRevision: 1,
                kind: "entry_point",
              },
              storeId: "store-1",
              target: { kind: "new_prescription_request" },
              tenantId: "tenant-1",
            }) as never,
          storePrescription: async () => ({
            clientMediaId: "client-media-1",
            mediaType: "application/pdf",
            objectKey: "prescriptions/store-1/object-1",
            originalFileName: "prescription.pdf",
            pageNumber: 1,
            sha256: "a".repeat(64),
            sizeBytes: 6,
          }),
          submitPrescription: async () => {
            throw new Error("database unavailable")
          },
        } as never,
      ),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" })
    expect(calls).toEqual([["delete", "prescriptions/store-1/object-1"]])
  })

  test("appends verified media to an existing clinical Request through clinical authority", async () => {
    const calls: unknown[] = []
    const result = await processGuestStoreConversationAttachment(
      {
        ...baseInput,
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
        target: {
          kind: "existing_request",
          request: {
            id: "prescription-1",
            kind: "prescription_request",
            revision: 3,
          },
        },
      },
      {
        append: async () => {
          throw new Error("not used")
        },
        commitPrescription: async (_db, input) => {
          calls.push([
            "clinical-commit",
            input.expectedMediaRevision,
            input.requestId,
            input.clientOperationId,
          ])
          return { message: { id: "message-1" }, replayed: false } as never
        },
        createInquiry: async () => {
          throw new Error("not used")
        },
        deleteGeneric: async () => {
          throw new Error("not used")
        },
        deletePrescription: async (objectKey) => {
          calls.push(["delete", objectKey])
        },
        enqueueGenericSafety: async () => {
          throw new Error("not used")
        },
        enqueuePrescriptionSafety: async (requestId) => {
          calls.push(["enqueue", requestId])
          throw new Error(
            "direct queue unavailable; recovery schedule owns retry",
          )
        },
        findPrescriptionMedia: async () => {
          throw new Error("not used")
        },
        findPrescriptionReplay: async () => null,
        recordGeneric: async () => {
          throw new Error("not used")
        },
        recordGenericSafety: async () => {
          throw new Error("not used")
        },
        recordGenericStored: async () => {
          throw new Error("not used")
        },
        resolveCreatedInquiryTarget: async () => {
          throw new Error("not used")
        },
        resolveUpload: async () =>
          ({
            actorUserId: "public_store_conversation",
            capability: {
              acceptedMimeTypes: ["application/pdf"],
              allowedKinds: ["document"],
              available: true,
              blockers: [],
              limits: {
                maxAudioBytes: 5_000_000,
                maxBytes: 10_000_000,
                maxCount: 1,
                maxDurationMs: 60_000,
              },
              uploadAuthorization: null,
            },
            channel: "web",
            conversationId: "conversation-1",
            intakeContext: {
              entryPointId: "entry-1",
              entryPointRevision: 1,
              kind: "entry_point",
            },
            storeId: "store-1",
            target: { kind: "prescription", requestId: "prescription-1" },
            tenantId: "tenant-1",
            vertical: "pharmacy",
          }) as never,
        storeGeneric: async () => {
          throw new Error("not used")
        },
        storePrescription: async () => ({
          clientMediaId: "client-media-1",
          mediaType: "application/pdf",
          objectKey: "prescriptions/store-1/object-1",
          originalFileName: "prescription.pdf",
          pageNumber: 1,
          sha256: "a".repeat(64),
          sizeBytes: 6,
        }),
        submitPrescription: async () => {
          throw new Error("not used")
        },
      },
    )

    expect(result).toMatchObject({ replayed: false })
    expect(calls).toEqual([
      ["clinical-commit", 3, "prescription-1", "attachment-operation-1"],
      ["enqueue", "prescription-1"],
    ])
  })

  test("retries new clinical intake through the existing Request and media after message failure", async () => {
    const calls: unknown[] = []
    let submitCount = 0
    let appendCount = 0
    const deps = {
      append: async () => {
        appendCount += 1
        if (appendCount === 1) throw new Error("message commit interrupted")
        return {
          message: { id: "message-1" },
          replayed: appendCount > 2,
        } as never
      },
      commitPrescription: async () => {
        throw new Error("not used")
      },
      createInquiry: async () => {
        throw new Error("not used")
      },
      deleteGeneric: async () => {
        throw new Error("not used")
      },
      deletePrescription: async (objectKey: string) =>
        calls.push(["delete", objectKey]),
      enqueueGenericSafety: async () => {
        throw new Error("not used")
      },
      enqueuePrescriptionSafety: async (requestId: string) =>
        calls.push(["enqueue", requestId]),
      findPrescriptionMedia: async () => ({ id: "prescription-media-1" }),
      findPrescriptionReplay: async () =>
        submitCount === 0
          ? null
          : {
              clientMediaId: "client-media-1",
              id: "prescription-media-1",
              mediaType: "application/pdf",
              originalFileName: "prescription.pdf",
              requestId: "prescription-1",
              sha256:
                "21af8e71c8703196df7fe1ff901869a88fe64c07bbaa83d838efb45a52b4f303",
              sizeBytes: 6,
            },
      recordGeneric: async () => {
        throw new Error("not used")
      },
      recordGenericSafety: async () => {
        throw new Error("not used")
      },
      recordGenericStored: async () => {
        throw new Error("not used")
      },
      resolveUpload: async () =>
        ({
          actorUserId: "public_store_conversation",
          capability: {
            acceptedMimeTypes: ["application/pdf"],
            allowedKinds: ["document"],
            available: true,
            blockers: [],
            limits: {
              maxAudioBytes: 5_000_000,
              maxBytes: 10_000_000,
              maxCount: 1,
              maxDurationMs: 60_000,
            },
            uploadAuthorization: null,
          },
          channel: "web",
          conversationId: "conversation-1",
          intakeContext: {
            entryPointId: "entry-1",
            entryPointRevision: 1,
            kind: "entry_point",
          },
          storeId: "store-1",
          target: { kind: "new_prescription_request" },
          tenantId: "tenant-1",
          vertical: "pharmacy",
        }) as never,
      storeGeneric: async () => {
        throw new Error("not used")
      },
      storePrescription: async () => {
        submitCount += 1
        return {
          clientMediaId: "client-media-1",
          mediaType: "application/pdf" as const,
          objectKey: `prescriptions/store-1/object-${submitCount}`,
          originalFileName: "prescription.pdf",
          pageNumber: 1,
          sha256: "a".repeat(64),
          sizeBytes: 6,
        }
      },
      submitPrescription: async () => ({
        created: submitCount === 1,
        reference: "RX-1",
        requestId: "prescription-1",
        statusToken: submitCount === 1 ? "status" : null,
        statusTokenExpiresAt: new Date(),
      }),
    }

    await expect(
      processGuestStoreConversationAttachment(
        {
          ...baseInput,
          bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
          prescriptionConsentAccepted: true,
        },
        deps as never,
      ),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" })

    const retried = await processGuestStoreConversationAttachment(
      {
        ...baseInput,
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
        prescriptionConsentAccepted: true,
      },
      deps as never,
    )
    expect(retried).toMatchObject({ replayed: false })
    const lostResponseReplay = await processGuestStoreConversationAttachment(
      {
        ...baseInput,
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
        prescriptionConsentAccepted: true,
      },
      deps as never,
    )
    expect(lostResponseReplay).toMatchObject({ replayed: true })
    expect(calls).toEqual([["enqueue", "prescription-1"]])
  })

  test("rejects malicious bytes before authorization or private persistence", async () => {
    let dependencyCalled = false

    await expect(
      processGuestStoreConversationAttachment(
        {
          ...baseInput,
          bytes: new TextEncoder().encode("<script>not a pdf</script>"),
          prescriptionConsentAccepted: true,
        },
        {
          resolveUpload: async () => {
            dependencyCalled = true
            throw new Error("must not run")
          },
        } as never,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
    expect(dependencyCalled).toBe(false)
  })

  test("requires exactly one multipart file and the purpose-bound guest credential", async () => {
    const form = new FormData()
    form.set("conversationId", "conversation-1")
    form.set("publicToken", "p".repeat(32))

    await expect(
      parseGuestStoreConversationAttachmentRequest(
        new Request("https://chat.ewatrade.com/api/attachments", {
          body: form,
          method: "POST",
        }),
        { channel: "web", credentialToken: null },
      ),
    ).rejects.toMatchObject({ code: "GUEST_CREDENTIAL_EXPIRED" })

    await expect(
      parseGuestStoreConversationAttachmentRequest(
        new Request("https://chat.ewatrade.com/api/attachments", {
          body: form,
          method: "POST",
        }),
        {
          channel: "web",
          credentialToken: "c".repeat(32),
          uploadAuthorization: "test-authorization",
        },
        { authorizeUpload: authorizeTestUpload },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
  })

  test("bounds the body before multipart parsing", async () => {
    const request = new Request("https://api.ewatrade.com/api/attachments", {
      headers: { "content-length": "11000000" },
      method: "POST",
    })
    await expect(
      parseGuestStoreConversationAttachmentRequest(request, {
        channel: "mobile",
        credentialToken: "c".repeat(32),
        installationToken: "i".repeat(32),
      }),
    ).rejects.toMatchObject({ code: "TOO_LARGE" })
  })

  test("rejects upload authorization before reading multipart bytes", async () => {
    let parsedBody = false
    await expect(
      parseGuestStoreConversationAttachmentRequest(
        {
          formData: async () => {
            parsedBody = true
            throw new Error("must not parse")
          },
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "content-length" ? "512" : null,
          },
          url: "https://chat.ewatrade.com/api/attachments",
        },
        {
          channel: "web",
          credentialToken: "c".repeat(32),
          uploadAuthorization: "invalid",
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(parsedBody).toBe(false)
  })

  test("rejects missing or invalid Content-Length before reading the multipart body", async () => {
    for (const contentLength of [undefined, "not-a-number"]) {
      const request = new Request("https://api.ewatrade.com/api/attachments", {
        ...(contentLength
          ? { headers: { "content-length": contentLength } }
          : {}),
        method: "POST",
      })
      await expect(
        parseGuestStoreConversationAttachmentRequest(request, {
          channel: "mobile",
          credentialToken: "c".repeat(32),
          installationToken: "i".repeat(32),
        }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" })
    }
  })

  test("caps the UTF-8 filename bytes before media persistence", async () => {
    const form = new FormData()
    form.set(
      "file",
      new File([new Uint8Array([0xff, 0xd8, 0xff])], `${"🧪".repeat(70)}.jpg`, {
        type: "image/jpeg",
      }),
    )
    form.set("clientMediaId", "client-media-1")
    form.set("clientOperationId", "attachment-operation-1")
    form.set("conversationId", "conversation-1")
    form.set("kind", "image")
    form.set("publicToken", "p".repeat(32))
    form.set("target", JSON.stringify({ kind: "new_commerce_inquiry" }))

    await expect(
      parseGuestStoreConversationAttachmentRequest(
        new Request("https://chat.ewatrade.com/api/attachments", {
          body: form,
          method: "POST",
        }),
        {
          channel: "web",
          credentialToken: "c".repeat(32),
          uploadAuthorization: "test-authorization",
        },
        { authorizeUpload: authorizeTestUpload },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
  })

  test("maps provider failures to a typed response without private detail", async () => {
    const response = storeConversationAttachmentErrorResponse(
      new Error("s3://private-bucket/object-secret"),
    )
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({
      code: "UNAVAILABLE",
      message: "Attachments are currently unavailable.",
    })
    expect(JSON.stringify(body)).not.toContain("private-bucket")
  })

  test("maps stale capability to a non-leaking recovery response", async () => {
    const response = storeConversationAttachmentErrorResponse(
      new StoreConversationAttachmentTransportError(
        "NOT_READY",
        "Choose a current Request for this attachment.",
      ),
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      code: "NOT_READY",
      message: "Choose a current Request for this attachment.",
    })
  })
})

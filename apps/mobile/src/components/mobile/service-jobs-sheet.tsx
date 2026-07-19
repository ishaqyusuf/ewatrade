import { ActionButton } from "@/components/mobile/action-button";
import { EmptyState } from "@/components/mobile/empty-state";
import { FormField } from "@/components/mobile/form-field";
import { StatusBadge } from "@/components/mobile/status-badge";
import { StatusBanner } from "@/components/mobile/status-banner";
import { Icon } from "@/components/ui/icon";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { useAuthContext } from "@/hooks/use-auth";
import {
  activeBusinessOfflineCommands,
  useOfflineCommandStore,
} from "@/store/offlineCommandStore";
import { useOperationalModeStore } from "@/store/operationalModeStore";
import { useTRPC } from "@/trpc/client";
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app";
import { formatMinorMoney } from "@ewatrade/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

type WorkJob = RouterOutputs["services"]["queue"][number];
type CatalogItem = RouterOutputs["catalog"]["listItems"][number];
type PendingEvidence = {
  assetReference: string;
  capturedAt: Date;
  clientEvidenceId: string;
  label: string;
  mediaType: "photo" | "video";
  purpose: "intake_condition" | "progress";
  uploadStatus: "local";
};

function textLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function statusTone(summary: WorkJob["summary"]) {
  if (summary === "blocked") return "warning" as const;
  if (summary === "ready_for_handoff" || summary === "partially_ready")
    return "primary" as const;
  return "muted" as const;
}

function actions(status: WorkJob["lines"][number]["status"]) {
  if (status === "QUEUED")
    return [
      "in_progress",
      "ready_for_handoff",
      "completed",
      "blocked",
    ] as const;
  if (status === "IN_PROGRESS")
    return ["ready_for_handoff", "completed", "blocked"] as const;
  if (status === "BLOCKED") return ["in_progress", "cancelled"] as const;
  if (status === "READY_FOR_HANDOFF")
    return ["completed", "in_progress"] as const;
  return [] as const;
}

function actionLabel(action: ReturnType<typeof actions>[number]) {
  if (action === "in_progress") return "Start work";
  if (action === "ready_for_handoff") return "Mark ready";
  if (action === "completed") return "Complete";
  if (action === "blocked") return "Block";
  return "Cancel";
}

function offeringDisplayName(itemName: string, variantName: string) {
  const normalizedItemName = itemName.trim().toLocaleLowerCase();
  const normalizedVariantName = variantName.trim().toLocaleLowerCase();

  if (
    normalizedVariantName === normalizedItemName ||
    normalizedVariantName.startsWith(`${normalizedItemName} ·`)
  ) {
    return variantName;
  }

  return `${itemName} · ${variantName}`;
}

function serviceOfferings(items: CatalogItem[]) {
  return items.flatMap((item) =>
    item.variants.flatMap((variant) =>
      variant.offerings
        .filter(
          (offering) =>
            offering.kind === "service" && offering.status === "active",
        )
        .map((offering) => ({
          ...offering,
          displayName:
            item.variants.length > 1
              ? offeringDisplayName(item.name, variant.name)
              : item.name,
        })),
    ),
  );
}

function evidenceFileExtension(
  asset: ImagePicker.ImagePickerAsset,
  mediaType: "photo" | "video",
) {
  const fileNameExtension = asset.fileName?.split(".").pop()?.toLowerCase();
  if (fileNameExtension?.match(/^[a-z0-9]{2,5}$/)) return fileNameExtension;
  if (asset.mimeType === "image/png") return "png";
  if (asset.mimeType === "image/heic") return "heic";
  if (asset.mimeType === "video/quicktime") return "mov";
  return mediaType === "photo" ? "jpg" : "mp4";
}

function retainEvidenceAsset(
  asset: ImagePicker.ImagePickerAsset,
  clientEvidenceId: string,
  mediaType: "photo" | "video",
) {
  const evidenceDirectory = new Directory(Paths.document, "service-evidence");
  evidenceDirectory.create({ idempotent: true, intermediates: true });
  const retainedAsset = new File(
    evidenceDirectory,
    `${clientEvidenceId}.${evidenceFileExtension(asset, mediaType)}`,
  );
  new File(asset.uri).copy(retainedAsset);
  return retainedAsset.uri;
}

function discardRetainedEvidence(evidence: PendingEvidence) {
  try {
    new File(evidence.assetReference).delete();
  } catch {
    // A missing local file is already discarded.
  }
}

export function ServiceJobsContent({
  onCreateOrder: _onCreateOrder,
}: {
  onCreateOrder?: () => void;
} = {}) {
  const trpc = useTRPC();
  const { profile } = useAuthContext();
  const isOfflineMode = useOperationalModeStore((state) => state.isOfflineMode);
  const queueCommand = useOfflineCommandStore((state) => state.queueCommand);
  const allOfflineCommands = useOfflineCommandStore((state) => state.commands);
  const offlineCommands = activeBusinessOfflineCommands(
    allOfflineCommands,
    profile?.businessId,
  );
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [jobNote, setJobNote] = useState("");
  const [pendingIntakeEvidence, setPendingIntakeEvidence] = useState<
    PendingEvidence[]
  >([]);

  const catalogQuery = useQuery(
    trpc.catalog.listItems.queryOptions({ kind: "service" }, { retry: false }),
  );
  const jobsQuery = useQuery(
    trpc.services.queue.queryOptions(
      { limit: 200 },
      { enabled: !isOfflineMode, retry: false },
    ),
  );
  const offerings = useMemo(
    () =>
      serviceOfferings(catalogQuery.data ?? []).filter(
        (offering) => offering.pricingPolicy === "fixed",
      ),
    [catalogQuery.data],
  );
  const jobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    const current = jobsQuery.data ?? [];
    if (!query) return current;
    return current.filter((job) =>
      [
        job.orderNumber,
        job.summary,
        ...job.lines.map((line) => line.catalogItemName),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [jobsQuery.data, search]);
  const selectedJob = jobsQuery.data?.find((job) => job.id === selectedJobId);
  const pendingServiceCommands = offlineCommands.filter(
    (command) =>
      command.localStatus === "pending" &&
      command.payload.kind.startsWith("service_"),
  ).length;
  const intakeCreatesTrackedWork = offerings.some(
    (offering) =>
      quantities[offering.id] !== undefined &&
      offering.serviceWorkPolicy?.workPolicy === "TRACKED",
  );

  const evidenceMutation = useMutation(
    trpc.services.captureEvidence.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: () => {
        setNotice("Private evidence saved on this device.");
        void jobsQuery.refetch();
      },
    }),
  );
  const intakeMutation = useMutation(
    trpc.services.createAndConfirmIntake.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async (result) => {
        const job = result.jobs[0];
        const evidenceResults =
          job && pendingIntakeEvidence.length > 0
            ? await Promise.allSettled(
                pendingIntakeEvidence.map((evidence) =>
                  evidenceMutation.mutateAsync({
                    ...evidence,
                    jobId: job.id,
                  }),
                ),
              )
            : [];
        const failedEvidence = evidenceResults.filter(
          (entry) => entry.status === "rejected",
        ).length;
        setError(null);
        setNotice(
          result.jobs.length > 0
            ? pendingIntakeEvidence.length > 0
              ? "Service order, tracked work, and private evidence created."
              : "Service order and tracked work created."
            : "Service order created.",
        );
        if (failedEvidence > 0) {
          setError(
            `${failedEvidence} private evidence record${failedEvidence === 1 ? "" : "s"} could not be attached. The files remain on this device.`,
          );
        }
        setCreating(false);
        setQuantities({});
        setCustomerName("");
        setCustomerPhone("");
        setDueAt("");
        setInstructions("");
        setShowDetails(false);
        setPendingIntakeEvidence([]);
        void jobsQuery.refetch();
      },
    }),
  );
  const transitionMutation = useMutation(
    trpc.services.transitionLine.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: () => {
        setError(null);
        void jobsQuery.refetch();
      },
    }),
  );
  const noteMutation = useMutation(
    trpc.services.addNote.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: () => {
        setJobNote("");
        void jobsQuery.refetch();
      },
    }),
  );
  const assignMutation = useMutation(
    trpc.services.assignJob.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: () => void jobsQuery.refetch(),
    }),
  );
  const submitIntake = () => {
    const lines = Object.entries(quantities)
      .filter(([, quantity]) => quantity.trim())
      .map(([offeringId, quantity]) => ({
        offeringId,
        quantity: quantity.trim(),
      }));
    if (lines.length === 0) {
      setError("Select at least one service and enter its quantity.");
      return;
    }
    const payload = {
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      dueCommitmentAt: dueAt.trim() ? new Date(dueAt.trim()) : undefined,
      instructions: instructions.trim() || undefined,
      lines,
      priority: "normal" as const,
    };
    if (
      payload.dueCommitmentAt &&
      Number.isNaN(payload.dueCommitmentAt.getTime())
    ) {
      setError("Enter the promised date in a valid date and time format.");
      return;
    }
    if (pendingIntakeEvidence.length > 0 && !intakeCreatesTrackedWork) {
      setError("Private evidence requires at least one tracked Service item.");
      return;
    }
    const clientIntakeId = `intake-${Crypto.randomUUID()}`;
    if (isOfflineMode) {
      queueCommand({
        clientCommandId: clientIntakeId,
        dependencyClientIds: [],
        eventVersion: 1,
        payload: { kind: "service_intake", ...payload },
      });
      for (const evidence of pendingIntakeEvidence) {
        queueCommand({
          clientCommandId: evidence.clientEvidenceId,
          dependencyClientIds: [clientIntakeId],
          eventVersion: 1,
          payload: {
            ...evidence,
            intakeClientId: clientIntakeId,
            kind: "service_evidence_capture",
          },
        });
      }
      setCreating(false);
      setQuantities({});
      setPendingIntakeEvidence([]);
      setNotice(
        pendingIntakeEvidence.length > 0
          ? "Service intake and private evidence records queued in dependency order."
          : "Service intake queued. It is provisional until sync completes.",
      );
      return;
    }
    intakeMutation.mutate({
      clientIntakeId,
      schemaVersion: 1,
      ...payload,
    });
  };

  const transition = (
    line: WorkJob["lines"][number],
    toStatus:
      | "blocked"
      | "cancelled"
      | "completed"
      | "in_progress"
      | "ready_for_handoff",
  ) => {
    const commandId = `service-${Crypto.randomUUID()}`;
    const input = {
      expectedRevision: line.revision,
      lineId: line.id,
      reason:
        toStatus === "blocked" || toStatus === "cancelled"
          ? "Updated from mobile Job Workspace"
          : undefined,
      toStatus,
    };
    if (isOfflineMode) {
      queueCommand({
        clientCommandId: commandId,
        dependencyClientIds: [],
        eventVersion: 1,
        payload: { kind: "service_transition", ...input },
      });
      setNotice("Work update queued as provisional.");
      return;
    }
    transitionMutation.mutate({
      clientCommandId: commandId,
      schemaVersion: 1,
      source: "mobile_job_workspace",
      ...input,
    });
  };

  const addNote = (job: WorkJob) => {
    if (!jobNote.trim()) return;
    const clientCommandId = `note-${Crypto.randomUUID()}`;
    if (isOfflineMode) {
      queueCommand({
        clientCommandId,
        dependencyClientIds: [],
        eventVersion: 1,
        payload: { body: jobNote.trim(), jobId: job.id, kind: "service_note" },
      });
      setJobNote("");
      setNotice("Private note queued as provisional.");
      return;
    }
    noteMutation.mutate({
      body: jobNote.trim(),
      clientCommandId,
      jobId: job.id,
    });
  };

  const assignToMe = (job: WorkJob) => {
    if (!profile?.id) return;
    if (isOfflineMode) {
      queueCommand({
        dependencyClientIds: [],
        eventVersion: 1,
        payload: {
          expectedRevision: job.revision,
          jobId: job.id,
          kind: "service_self_assignment",
          reason: "Self-assigned from mobile",
        },
      });
      setNotice("Self-assignment queued as provisional.");
      return;
    }
    assignMutation.mutate({
      assigneeUserId: profile.id,
      expectedRevision: job.revision,
      jobId: job.id,
      reason: "Self-assigned from mobile",
    });
  };

  const captureLocalEvidence = async (
    mediaType: "photo" | "video",
    purpose: PendingEvidence["purpose"],
  ): Promise<PendingEvidence | null> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required to capture evidence.");
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes:
        mediaType === "photo"
          ? ImagePicker.MediaTypeOptions.Images
          : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
      videoMaxDuration: 60,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return null;
    const clientEvidenceId = `evidence-${Crypto.randomUUID()}`;
    let assetReference: string;
    try {
      assetReference = retainEvidenceAsset(asset, clientEvidenceId, mediaType);
    } catch {
      setError("The captured file could not be retained on this device.");
      return null;
    }
    return {
      assetReference,
      capturedAt: new Date(),
      clientEvidenceId,
      label: mediaType === "photo" ? "Work photo" : "Work video",
      mediaType,
      purpose,
      uploadStatus: "local" as const,
    };
  };

  const captureEvidence = async (
    job: WorkJob,
    mediaType: "photo" | "video",
  ) => {
    const evidence = await captureLocalEvidence(mediaType, "progress");
    if (!evidence) return;
    const payload = { ...evidence, jobId: job.id };
    if (isOfflineMode) {
      queueCommand({
        dependencyClientIds: [],
        eventVersion: 1,
        payload: { kind: "service_evidence_capture", ...payload },
      });
      setNotice(
        "Private evidence saved on this device. Its record will sync later.",
      );
      return;
    }
    evidenceMutation.mutate(payload);
  };

  const captureIntakeEvidence = async (mediaType: "photo" | "video") => {
    const evidence = await captureLocalEvidence(mediaType, "intake_condition");
    if (!evidence) return;
    setPendingIntakeEvidence((current) => [...current, evidence]);
    setNotice("Private intake evidence retained on this device.");
  };

  return (
    <KeyboardAwareScrollView
      bottomOffset={120}
      className="flex-1"
      contentContainerStyle={{
        gap: 20,
        paddingBottom: 48,
        paddingHorizontal: 20,
      }}
      disableScrollOnKeyboardHide
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      {error ? (
        <StatusBanner
          icon="AlertCircle"
          message={error}
          title="Could not complete action"
          tone="destructive"
        />
      ) : null}
      {notice ? (
        <StatusBanner
          icon="ClipboardCheck"
          message={notice}
          title="Service work"
          tone="success"
        />
      ) : null}
      {isOfflineMode ? (
        <StatusBanner
          icon="Wind"
          message={`${pendingServiceCommands} service command${pendingServiceCommands === 1 ? "" : "s"} waiting. Queued changes are provisional until replay.`}
          title="Offline"
          tone="warning"
        />
      ) : null}

      {creating ? (
        <View className="gap-5">
          <View className="gap-1">
            <Text className="text-xl font-extrabold text-foreground">
              New service
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Select the items. Customer and delivery details are optional.
            </Text>
          </View>
          <View className="border-y border-border">
            {offerings.map((offering, index) => {
              const selected = quantities[offering.id] !== undefined;
              return (
                <View
                  className={`gap-3 py-4 ${
                    index < offerings.length - 1 ? "border-b border-border" : ""
                  }`}
                  key={offering.id}
                >
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    className="min-h-11 flex-row items-center justify-between gap-3"
                    haptic
                    onPress={() =>
                      setQuantities((current) => {
                        if (selected) {
                          const next = { ...current };
                          delete next[offering.id];
                          return next;
                        }
                        return { ...current, [offering.id]: "1" };
                      })
                    }
                  >
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="font-bold text-foreground">
                        {offering.displayName}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {formatMinorMoney(
                          offering.fixedPriceMinor ?? 0,
                          offering.currencyCode,
                        )}{" "}
                        ·{" "}
                        {offering.serviceWorkPolicy?.workPolicy === "TRACKED"
                          ? "Tracked work"
                          : "Order only"}
                      </Text>
                    </View>
                    <Icon
                      className={
                        selected
                          ? "size-sm text-primary"
                          : "size-sm text-muted-foreground"
                      }
                      name={selected ? "CircleCheck" : "CheckSquare"}
                    />
                  </Pressable>
                  {selected ? (
                    <FormField
                      keyboardType="decimal-pad"
                      label="Quantity"
                      onChangeText={(value) =>
                        setQuantities((current) => ({
                          ...current,
                          [offering.id]: value,
                        }))
                      }
                      value={quantities[offering.id]}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
          {offerings.length === 0 ? (
            <StatusBanner
              icon="Info"
              message="Add an available fixed-price Service Offering to the Catalog first."
              title="No direct-intake services"
            />
          ) : null}
          <View className="gap-3">
            <FormField
              label="Customer name"
              onChangeText={setCustomerName}
              value={customerName}
            />
            <FormField
              keyboardType="phone-pad"
              label="Phone"
              onChangeText={setCustomerPhone}
              value={customerPhone}
            />
          </View>
          <Pressable
            className="min-h-11 justify-center"
            onPress={() => setShowDetails((value) => !value)}
          >
            <Text className="font-bold text-primary">
              {showDetails
                ? "Hide details"
                : "Add date, instructions, photo or video"}
            </Text>
          </Pressable>
          {showDetails ? (
            <View className="gap-5 border-y border-border py-5">
              <FormField
                autoCapitalize="none"
                helper="Example: 2026-07-21 16:00"
                label="Promised delivery"
                onChangeText={setDueAt}
                value={dueAt}
              />
              <FormField
                label="Instructions"
                multiline
                onChangeText={setInstructions}
                value={instructions}
              />
              <View className="gap-3">
                <View className="gap-1">
                  <Text className="font-bold text-foreground">
                    Photo or video package
                  </Text>
                  <Text className="text-xs leading-5 text-muted-foreground">
                    Optional and private. Available when at least one selected
                    Service creates tracked work.
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <ActionButton
                      disabled={!intakeCreatesTrackedWork}
                      onPress={() => void captureIntakeEvidence("photo")}
                      variant="outline"
                    >
                      Take photo
                    </ActionButton>
                  </View>
                  <View className="flex-1">
                    <ActionButton
                      disabled={!intakeCreatesTrackedWork}
                      onPress={() => void captureIntakeEvidence("video")}
                      variant="outline"
                    >
                      Record video
                    </ActionButton>
                  </View>
                </View>
                {pendingIntakeEvidence.map((evidence) => (
                  <View
                    className="flex-row items-center justify-between gap-3 border-t border-border pt-3"
                    key={evidence.clientEvidenceId}
                  >
                    <Text className="min-w-0 flex-1 text-sm text-foreground">
                      {evidence.label}
                    </Text>
                    <ActionButton
                      onPress={() => {
                        discardRetainedEvidence(evidence);
                        setPendingIntakeEvidence((current) =>
                          current.filter(
                            (entry) =>
                              entry.clientEvidenceId !==
                              evidence.clientEvidenceId,
                          ),
                        );
                      }}
                      variant="ghost"
                    >
                      Remove
                    </ActionButton>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          <ActionButton
            isLoading={intakeMutation.isPending}
            loadingLabel="Creating"
            onPress={submitIntake}
          >
            {isOfflineMode ? "Queue service" : "Create service order"}
          </ActionButton>
          <ActionButton
            onPress={() => {
              pendingIntakeEvidence.forEach(discardRetainedEvidence);
              setPendingIntakeEvidence([]);
              setCreating(false);
            }}
            variant="ghost"
          >
            Cancel
          </ActionButton>
        </View>
      ) : selectedJob ? (
        <View className="gap-4">
          <Pressable
            className="min-h-11 flex-row items-center gap-2"
            onPress={() => setSelectedJobId(null)}
          >
            <Icon className="size-sm text-primary" name="ArrowLeft" />
            <Text className="font-bold text-primary">Work queue</Text>
          </Pressable>
          <View className="gap-1">
            <Text className="text-xl font-extrabold text-foreground">
              {selectedJob.orderNumber}
            </Text>
            <Text className="capitalize text-sm text-muted-foreground">
              {textLabel(selectedJob.summary)}
            </Text>
          </View>
          {profile?.id && selectedJob.currentAssigneeUserId !== profile.id ? (
            <ActionButton
              isLoading={assignMutation.isPending}
              onPress={() => assignToMe(selectedJob)}
              variant="outline"
            >
              Assign to me
            </ActionButton>
          ) : null}
          <View className="border-y border-border">
            {selectedJob.lines.map((line, index) => (
              <View
                className={`gap-4 py-4 ${
                  index < selectedJob.lines.length - 1
                    ? "border-b border-border"
                    : ""
                }`}
                key={line.id}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="font-bold text-foreground">
                      {line.catalogItemName}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {line.offeringName} · {line.allocatedQuantity}
                    </Text>
                  </View>
                  <StatusBadge label={textLabel(line.status)} tone="muted" />
                </View>
                {line.authorizationStatus !== "AUTHORIZED" ? (
                  <StatusBanner
                    icon="Lock"
                    message={`Work is waiting for ${textLabel(line.authorizationStatus)}.`}
                    tone="warning"
                  />
                ) : null}
                {actions(line.status).length > 0 ? (
                  <View className="gap-2">
                    <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Update status
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {actions(line.status).map((action, actionIndex) => (
                        <View className="min-w-[46%] flex-1" key={action}>
                          <ActionButton
                            disabled={line.authorizationStatus !== "AUTHORIZED"}
                            onPress={() => transition(line, action)}
                            variant={actionIndex === 0 ? "default" : "outline"}
                          >
                            {actionLabel(action)}
                          </ActionButton>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          <View className="gap-4 border-t border-border pt-4">
            <View className="gap-1">
              <Text className="font-bold text-foreground">
                Private work record
              </Text>
              <Text className="text-xs leading-5 text-muted-foreground">
                Notes and evidence are internal unless a manager explicitly
                publishes reviewed evidence.
              </Text>
            </View>
            <FormField
              label="Internal note"
              multiline
              onChangeText={setJobNote}
              value={jobNote}
            />
            <ActionButton
              disabled={!jobNote.trim()}
              isLoading={noteMutation.isPending}
              onPress={() => addNote(selectedJob)}
              variant="outline"
            >
              Add note
            </ActionButton>
            {selectedJob.notes.slice(-3).map((entry) => (
              <View className="rounded-xl bg-muted p-3" key={entry.id}>
                <Text className="text-sm text-foreground">{entry.body}</Text>
              </View>
            ))}
            <View className="flex-row gap-2">
              <View className="flex-1">
                <ActionButton
                  isLoading={evidenceMutation.isPending}
                  onPress={() => void captureEvidence(selectedJob, "photo")}
                  variant="outline"
                >
                  Take photo
                </ActionButton>
              </View>
              <View className="flex-1">
                <ActionButton
                  isLoading={evidenceMutation.isPending}
                  onPress={() => void captureEvidence(selectedJob, "video")}
                  variant="outline"
                >
                  Record video
                </ActionButton>
              </View>
            </View>
            {selectedJob.evidence.slice(-4).map((entry) => (
              <View
                className="flex-row items-center justify-between gap-3 rounded-xl bg-muted p-3"
                key={entry.id}
              >
                <Text className="min-w-0 flex-1 text-sm text-foreground">
                  {entry.label || textLabel(entry.purpose)}
                </Text>
                <StatusBadge
                  label={textLabel(entry.uploadStatus)}
                  tone={entry.uploadStatus === "FAILED" ? "warning" : "muted"}
                />
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View className="gap-5">
          <Text className="text-sm leading-5 text-muted-foreground">
            Charge-only services stay in Orders. Tracked offerings appear here
            after confirmation.
          </Text>
          <ActionButton icon="Plus" onPress={() => setCreating(true)}>
            New service
          </ActionButton>
          <FormField
            autoCapitalize="none"
            label="Search"
            leadingIcon="Search"
            onChangeText={setSearch}
            placeholder="Receipt or service"
            value={search}
          />
          {jobsQuery.isLoading ? (
            <StatusBanner
              icon="Loader2"
              message="Loading current service work."
              title="Work queue"
            />
          ) : jobs.length === 0 ? (
            <EmptyState
              icon="ClipboardList"
              message="Create a tracked service order to start work."
              title="No active work"
            />
          ) : (
            <View className="border-y border-border">
              {jobs.map((job, index) => (
                <Pressable
                  className={`gap-3 py-4 ${
                    index < jobs.length - 1 ? "border-b border-border" : ""
                  }`}
                  haptic
                  key={job.id}
                  onPress={() => setSelectedJobId(job.id)}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="font-bold text-foreground">
                        {job.orderNumber}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {job.lines
                          .map((line) => line.catalogItemName)
                          .join(", ")}
                      </Text>
                    </View>
                    <StatusBadge
                      label={textLabel(job.summary)}
                      tone={statusTone(job.summary)}
                    />
                  </View>
                  <Text className="text-xs text-muted-foreground">
                    {job.priority === "urgent"
                      ? "Urgent"
                      : job.currentAssigneeUserId
                        ? "Assigned"
                        : "Unassigned"}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}

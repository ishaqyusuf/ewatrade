import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app";
import * as Crypto from "expo-crypto";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getSession } from "@/lib/session-store";
import { zustandStorage } from "./mmkv";

type ReplayInput = RouterInputs["offline"]["replay"];
type ReplayCommand = ReplayInput["commands"][number];
type ReplayResult = RouterOutputs["offline"]["replay"][number];

export type LocalOfflineCommand = ReplayCommand & {
  authoritativeState?: unknown;
  conflictCode?: string | null;
  conflictMessage?: string | null;
  businessId: string;
  localStatus: "applied" | "blocked" | "discarded" | "pending" | "review";
  result?: unknown;
};

type OfflineCommandState = {
  commands: LocalOfflineCommand[];
  deviceId: string;
  hasHydrated: boolean;
  applyReplayResults: (results: ReplayResult[]) => void;
  discardCommand: (clientCommandId: string) => void;
  queueCommand: (
    command: Omit<ReplayCommand, "clientCommandId" | "createdAtClient"> & {
      clientCommandId?: string;
      createdAtClient?: Date;
    },
  ) => string;
  retryCommand: (clientCommandId: string) => void;
  setHasHydrated: (value: boolean) => void;
};

function localStatus(status: ReplayResult["status"]) {
  if (status === "APPLIED") return "applied" as const;
  if (status === "DISCARDED") return "discarded" as const;
  if (status === "BLOCKED") return "blocked" as const;
  if (status === "REVIEW_REQUIRED") return "review" as const;
  return "pending" as const;
}

export function getOfflineProvisionalProjection(
  commands: LocalOfflineCommand[],
) {
  const provisional = commands.filter(
    (command) => command.localStatus === "pending",
  );
  return {
    catalogItems: provisional.flatMap((command) =>
      command.payload.kind === "product_setup"
        ? [
            {
              clientCommandId: command.clientCommandId,
              label: command.payload.name,
              provisional: true as const,
            },
          ]
        : [],
    ),
    commercialOrders: provisional.filter(
      (command) => command.payload.kind === "commercial_order",
    ).length,
    inventoryOperations: provisional.filter((command) =>
      [
        "custody_move",
        "inventory_closeout",
        "stock_count",
        "stock_receipt",
      ].includes(command.payload.kind),
    ).length,
    serviceOperations: provisional.filter((command) =>
      command.payload.kind.startsWith("service_"),
    ).length,
  };
}

export function activeBusinessOfflineCommands(
  commands: LocalOfflineCommand[],
  businessId: string | null | undefined,
) {
  if (!businessId) return [];
  return commands.filter((command) => command.businessId === businessId);
}

export const useOfflineCommandStore = create<OfflineCommandState>()(
  persist(
    (set) => ({
      commands: [],
      deviceId: `device-${Crypto.randomUUID()}`,
      hasHydrated: false,
      applyReplayResults: (results) =>
        set((state) => ({
          commands: state.commands.map((command) => {
            const result = results.find(
              (candidate) =>
                candidate.clientCommandId === command.clientCommandId,
            );
            return result
              ? {
                  ...command,
                  authoritativeState: result.authoritativeState,
                  conflictCode: result.conflictCode,
                  conflictMessage: result.conflictMessage,
                  localStatus: localStatus(result.status),
                  result: result.result,
                }
              : command;
          }),
        })),
      discardCommand: (clientCommandId) =>
        set((state) => ({
          commands: state.commands.map((command) =>
            command.clientCommandId === clientCommandId
              ? { ...command, localStatus: "discarded" }
              : command,
          ),
        })),
      queueCommand: (input) => {
        const businessId = getSession()?.profile.businessId;
        if (!businessId) {
          throw new Error(
            "Offline work requires an authenticated business workspace.",
          );
        }
        const clientCommandId =
          input.clientCommandId ?? `command-${Crypto.randomUUID()}`;
        set((state) => ({
          commands: [
            ...state.commands,
            {
              ...input,
              businessId,
              clientCommandId,
              createdAtClient: input.createdAtClient ?? new Date(),
              localStatus: "pending",
            },
          ],
        }));
        return clientCommandId;
      },
      retryCommand: (clientCommandId) =>
        set((state) => ({
          commands: state.commands.map((command) =>
            command.clientCommandId === clientCommandId
              ? {
                  ...command,
                  authoritativeState: undefined,
                  conflictCode: null,
                  conflictMessage: null,
                  localStatus: "pending",
                }
              : command,
          ),
        })),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      // This is an intentional clean schema boundary. A version mismatch starts
      // with an empty command queue; events from an incompatible schema are never read.
      migrate: () => ({
        commands: [],
        deviceId: `device-${Crypto.randomUUID()}`,
        hasHydrated: false,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<OfflineCommandState>;
        return {
          ...current,
          ...saved,
          commands: (saved.commands ?? []).map((command) => ({
            ...command,
            createdAtClient: new Date(
              command.createdAtClient as unknown as string | Date,
            ),
          })),
          hasHydrated: current.hasHydrated,
        };
      },
      name: "ewatrade-mobile-offline-commands",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        void zustandStorage.removeItem("ewatrade-mobile-retail-ops");
      },
      partialize: (state) => ({
        commands: state.commands,
        deviceId: state.deviceId,
      }),
      storage: createJSONStorage(() => zustandStorage),
      version: 2,
    },
  ),
);

export function pendingOfflineCommands(
  state: OfflineCommandState,
  businessId: string | null | undefined,
) {
  return activeBusinessOfflineCommands(state.commands, businessId)
    .filter((command) => command.localStatus === "pending")
    .map((command) => ({
      clientCommandId: command.clientCommandId,
      createdAtClient: command.createdAtClient,
      dependencyClientIds: command.dependencyClientIds,
      eventVersion: command.eventVersion,
      payload: command.payload,
    }));
}

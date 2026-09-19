import type { IntegrationType } from "@timetracker/core/schemas";
import type { IntegrationAdapter } from "./types";
import { workfrontAdapter } from "./workfront";
import { dynamicsAdapter } from "./dynamics";

const adapters: Record<IntegrationType, IntegrationAdapter> = {
  workfront: workfrontAdapter,
  dynamics: dynamicsAdapter,
};

export function getAdapter(type: IntegrationType): IntegrationAdapter {
  return adapters[type];
}

export * from "./types";

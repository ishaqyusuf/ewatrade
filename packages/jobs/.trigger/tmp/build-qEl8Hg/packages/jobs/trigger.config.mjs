import {
  defineConfig
} from "../../chunk-WAWVICCR.mjs";
import "../../chunk-HBB5TASG.mjs";
import "../../chunk-2GZR26C3.mjs";
import "../../chunk-EUQU77DM.mjs";
import "../../chunk-IQYMHLKB.mjs";
import "../../chunk-TGD5O53U.mjs";
import {
  __name,
  init_esm
} from "../../chunk-43KALBCX.mjs";

// trigger.config.ts
init_esm();
function getTriggerProjectId() {
  return process.env.TRIGGER_PROJECT_ID?.trim() || "ewatrade-jobs";
}
__name(getTriggerProjectId, "getTriggerProjectId");
var trigger_config_default = defineConfig({
  project: getTriggerProjectId(),
  runtime: "node-22",
  logLevel: "log",
  maxDuration: 60,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1e3,
      maxTimeoutInMs: 1e4,
      factor: 2,
      randomize: true
    }
  },
  build: {},
  dirs: ["./src/tasks"]
});
var resolveEnvVars = void 0;
export {
  trigger_config_default as default,
  resolveEnvVars
};
//# sourceMappingURL=trigger.config.mjs.map

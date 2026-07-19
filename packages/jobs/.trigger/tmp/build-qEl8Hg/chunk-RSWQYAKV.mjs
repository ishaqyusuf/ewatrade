import {
  __commonJS,
  __require,
  init_esm
} from "./chunk-43KALBCX.mjs";

// ../../node_modules/.bun/@opentelemetry+resources@2.0.1+460773ef8ff1e07c/node_modules/@opentelemetry/resources/build/src/detectors/platform/node/machine-id/execAsync.js
var require_execAsync = __commonJS({
  "../../node_modules/.bun/@opentelemetry+resources@2.0.1+460773ef8ff1e07c/node_modules/@opentelemetry/resources/build/src/detectors/platform/node/machine-id/execAsync.js"(exports) {
    "use strict";
    init_esm();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.execAsync = void 0;
    var child_process = __require("child_process");
    var util = __require("util");
    exports.execAsync = util.promisify(child_process.exec);
  }
});

export {
  require_execAsync
};
//# sourceMappingURL=chunk-RSWQYAKV.mjs.map

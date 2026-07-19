import {
  __commonJS,
  __name,
  init_esm
} from "./chunk-43KALBCX.mjs";

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/common.js
var require_common = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/common.js"(exports) {
    "use strict";
    init_esm();
    Object.defineProperty(exports, "__esModule", { value: true });
    var commonConverter = /* @__PURE__ */ __name(function(description, converters) {
      var _a, _b;
      var jsonSchema = {};
      jsonSchema.type = description.type;
      if (description.nullable) {
        jsonSchema.type = [jsonSchema.type, "null"];
      }
      if (((_a = description.oneOf) === null || _a === void 0 ? void 0 : _a.length) > 0) {
        jsonSchema.enum = description.oneOf;
      }
      if (((_b = description.notOneOf) === null || _b === void 0 ? void 0 : _b.length) > 0) {
        jsonSchema.not = {
          enum: description.notOneOf
        };
      }
      if (description.label) {
        jsonSchema.title = description.label;
      }
      if (description.default !== void 0) {
        jsonSchema.default = description.default;
      }
      return jsonSchema;
    }, "commonConverter");
    exports.default = commonConverter;
  }
});

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/string.js
var require_string = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/string.js"(exports) {
    "use strict";
    init_esm();
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.uuidRegExPattern = void 0;
    var common_1 = __importDefault(require_common());
    exports.uuidRegExPattern = "^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$";
    var stringConverter = /* @__PURE__ */ __name(function(description, converters) {
      var jsonSchema = common_1.default(description, converters);
      var meta = description.meta || {};
      description.tests.forEach(function(test) {
        var _a, _b, _c, _d;
        switch (test.name) {
          case "length":
            if (((_a = test.params) === null || _a === void 0 ? void 0 : _a.length) !== void 0) {
              jsonSchema.minLength = Number(test.params.length);
              jsonSchema.maxLength = Number(test.params.length);
            }
            break;
          case "min":
            if (((_b = test.params) === null || _b === void 0 ? void 0 : _b.min) !== void 0) {
              jsonSchema.minLength = Number(test.params.min);
            }
            break;
          case "max":
            if (((_c = test.params) === null || _c === void 0 ? void 0 : _c.max) !== void 0) {
              jsonSchema.maxLength = Number(test.params.max);
            }
            break;
          case "matches":
            if ((_d = test.params) === null || _d === void 0 ? void 0 : _d.regex) {
              jsonSchema.pattern = test.params.regex.toString().replace(/^\/(.*)\/[gimusy]*$/, "$1");
            }
            break;
          case "email":
            jsonSchema.format = "email";
            break;
          case "url":
            jsonSchema.format = "uri";
            break;
          case "uuid":
            jsonSchema.format = "uuid";
            jsonSchema.pattern = exports.uuidRegExPattern;
            break;
        }
      });
      return Object.assign(jsonSchema, meta.jsonSchema);
    }, "stringConverter");
    exports.default = stringConverter;
  }
});

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/number.js
var require_number = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/number.js"(exports) {
    "use strict";
    init_esm();
    var __spreadArrays = exports && exports.__spreadArrays || function() {
      for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
      for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
          r[k] = a[j];
      return r;
    };
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    var common_1 = __importDefault(require_common());
    var numberConverter = /* @__PURE__ */ __name(function(description, converters) {
      var jsonSchema = common_1.default(description, converters);
      var meta = description.meta || {};
      description.tests.forEach(function(test) {
        var _a, _b, _c, _d;
        switch (test.name) {
          case "min":
            if (((_a = test.params) === null || _a === void 0 ? void 0 : _a.min) !== void 0) {
              jsonSchema.minimum = Number(test.params.min);
            }
            if (((_b = test.params) === null || _b === void 0 ? void 0 : _b.more) !== void 0) {
              jsonSchema.exclusiveMinimum = Number(test.params.more);
            }
            break;
          case "max":
            if (((_c = test.params) === null || _c === void 0 ? void 0 : _c.max) !== void 0) {
              jsonSchema.maximum = Number(test.params.max);
            }
            if (((_d = test.params) === null || _d === void 0 ? void 0 : _d.less) !== void 0) {
              jsonSchema.exclusiveMaximum = Number(test.params.less);
            }
            break;
          case "integer":
            if (jsonSchema.type === "number") {
              jsonSchema.type = "integer";
            } else {
              jsonSchema.type = __spreadArrays(jsonSchema.type, ["integer"]).filter(function(type) {
                return type !== "number";
              });
            }
        }
      });
      return Object.assign(jsonSchema, meta.jsonSchema);
    }, "numberConverter");
    exports.default = numberConverter;
  }
});

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/boolean.js
var require_boolean = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/boolean.js"(exports) {
    "use strict";
    init_esm();
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    var common_1 = __importDefault(require_common());
    var booleanConverter = /* @__PURE__ */ __name(function(description, converters) {
      var jsonSchema = common_1.default(description, converters);
      var meta = description.meta || {};
      return Object.assign(jsonSchema, meta.jsonSchema);
    }, "booleanConverter");
    exports.default = booleanConverter;
  }
});

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/date.js
var require_date = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/date.js"(exports) {
    "use strict";
    init_esm();
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    var common_1 = __importDefault(require_common());
    var dateConverter = /* @__PURE__ */ __name(function(description, converters) {
      var jsonSchema = common_1.default(description, converters);
      var meta = description.meta || {};
      jsonSchema.type = "string";
      jsonSchema.format = "date-time";
      return Object.assign(jsonSchema, meta.jsonSchema);
    }, "dateConverter");
    exports.default = dateConverter;
  }
});

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/array.js
var require_array = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/array.js"(exports) {
    "use strict";
    init_esm();
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    var common_1 = __importDefault(require_common());
    var arrayConverter = /* @__PURE__ */ __name(function(description, converters) {
      var jsonSchema = common_1.default(description, converters);
      var meta = description.meta || {};
      var innerType = description.innerType;
      if (innerType) {
        var converter = converters[innerType.type];
        jsonSchema.items = converter(innerType, converters);
      }
      description.tests.forEach(function(test) {
        var _a, _b, _c;
        switch (test.name) {
          case "length":
            if (((_a = test.params) === null || _a === void 0 ? void 0 : _a.length) !== void 0) {
              jsonSchema.minItems = jsonSchema.maxItems = Number(test.params.length);
            }
            break;
          case "min":
            if (((_b = test.params) === null || _b === void 0 ? void 0 : _b.min) !== void 0) {
              jsonSchema.minItems = Number(test.params.min);
            }
            break;
          case "max":
            if (((_c = test.params) === null || _c === void 0 ? void 0 : _c.max) !== void 0) {
              jsonSchema.maxItems = Number(test.params.max);
            }
            break;
        }
      });
      return Object.assign(jsonSchema, meta.jsonSchema);
    }, "arrayConverter");
    exports.default = arrayConverter;
  }
});

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/object.js
var require_object = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/object.js"(exports) {
    "use strict";
    init_esm();
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    var common_1 = __importDefault(require_common());
    var objectConverter = /* @__PURE__ */ __name(function(description, converters) {
      var jsonSchema = common_1.default(description, converters);
      var meta = description.meta || {};
      var properties = {};
      var required = [];
      Object.keys(description.fields).forEach(function(fieldName) {
        var fieldDescription = description.fields[fieldName];
        var converter = converters[fieldDescription.type];
        properties[fieldName] = converter(fieldDescription, converters);
        if (!fieldDescription.optional) {
          required.push(fieldName);
        }
      });
      if (Object.keys(properties).length > 0) {
        jsonSchema.properties = properties;
      }
      if (Object.keys(required).length > 0) {
        jsonSchema.required = required;
      }
      return Object.assign(jsonSchema, meta.jsonSchema);
    }, "objectConverter");
    exports.default = objectConverter;
  }
});

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/tuple.js
var require_tuple = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/tuple.js"(exports) {
    "use strict";
    init_esm();
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    var common_1 = __importDefault(require_common());
    var tupleConverter = /* @__PURE__ */ __name(function(description, converters) {
      var jsonSchema = common_1.default(description, converters);
      var meta = description.meta || {};
      jsonSchema.type = "array";
      jsonSchema.items = description.innerType.map(function(description2) {
        var converter = converters[description2.type];
        return converter(description2, converters);
      });
      jsonSchema.minItems = jsonSchema.items.length;
      jsonSchema.maxItems = jsonSchema.items.length;
      return Object.assign(jsonSchema, meta.jsonSchema);
    }, "tupleConverter");
    exports.default = tupleConverter;
  }
});

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/mixed.js
var require_mixed = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/mixed.js"(exports) {
    "use strict";
    init_esm();
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    var common_1 = __importDefault(require_common());
    var getType = /* @__PURE__ */ __name(function(item) {
      switch (typeof item) {
        case "string":
          return "string";
        case "number":
          return "number";
        case "boolean":
          return "boolean";
        case "object":
          if (Array.isArray(item)) {
            return "array";
          } else if (item === null) {
            return "null";
          } else if (item instanceof Date) {
            return "string";
          } else {
            return "object";
          }
        default:
          return "null";
      }
    }, "getType");
    var mixedConverter = /* @__PURE__ */ __name(function(description, converters) {
      var _a;
      var jsonSchema = common_1.default(description, converters);
      var meta = description.meta || {};
      var types = Array.isArray(description.type) ? description.type : [description.type];
      types = types.filter(function(type) {
        return type !== "mixed";
      });
      if (((_a = description.oneOf) === null || _a === void 0 ? void 0 : _a.length) > 0) {
        description.oneOf.forEach(function(item) {
          types.push(getType(item));
        });
      }
      if (description.default !== void 0) {
        types.push(getType(description.default));
      }
      types = types.filter(function(type, index, self) {
        return self.indexOf(type) === index;
      });
      jsonSchema.type = types;
      return Object.assign(jsonSchema, meta.jsonSchema);
    }, "mixedConverter");
    exports.default = mixedConverter;
  }
});

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/lazy.js
var require_lazy = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/lazy.js"(exports) {
    "use strict";
    init_esm();
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    var common_1 = __importDefault(require_common());
    var lazyConverter = /* @__PURE__ */ __name(function(description, converters) {
      var jsonSchema = common_1.default(description, converters);
      var meta = description.meta || {};
      return Object.assign(jsonSchema, meta.jsonSchema);
    }, "lazyConverter");
    exports.default = lazyConverter;
  }
});

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/index.js
var require_converters = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/converters/index.js"(exports) {
    "use strict";
    init_esm();
    var __assign = exports && exports.__assign || function() {
      __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
        }
        return t;
      };
      return __assign.apply(this, arguments);
    };
    var __rest = exports && exports.__rest || function(s, e) {
      var t = {};
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
      if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
          if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
            t[p[i]] = s[p[i]];
        }
      return t;
    };
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.convertSchema = void 0;
    var string_1 = __importDefault(require_string());
    var number_1 = __importDefault(require_number());
    var boolean_1 = __importDefault(require_boolean());
    var date_1 = __importDefault(require_date());
    var array_1 = __importDefault(require_array());
    var object_1 = __importDefault(require_object());
    var tuple_1 = __importDefault(require_tuple());
    var mixed_1 = __importDefault(require_mixed());
    var lazy_1 = __importDefault(require_lazy());
    function convertSchema(yupSchema, options) {
      var _a = options || {}, converters = _a.converters, resolveOptions = __rest(_a, ["converters"]);
      var allConverters = __assign({ string: string_1.default, number: number_1.default, boolean: boolean_1.default, date: date_1.default, array: array_1.default, object: object_1.default, tuple: tuple_1.default, mixed: mixed_1.default, lazy: lazy_1.default }, converters);
      var description = yupSchema.describe(resolveOptions);
      var converter = allConverters[description.type];
      return converter(description, allConverters);
    }
    __name(convertSchema, "convertSchema");
    exports.convertSchema = convertSchema;
  }
});

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/methods/index.js
var require_methods = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/methods/index.js"(exports) {
    "use strict";
    init_esm();
    var __assign = exports && exports.__assign || function() {
      __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
        }
        return t;
      };
      return __assign.apply(this, arguments);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendSchema = void 0;
    function addMethod(yup, name) {
      yup.addMethod(yup.Schema, name, function(value) {
        var _a;
        var meta = this.describe().meta || {};
        return this.meta(__assign(__assign({}, meta), { jsonSchema: __assign(__assign({}, meta.jsonSchema), (_a = {}, _a[name] = value, _a)) }));
      });
    }
    __name(addMethod, "addMethod");
    function extendSchema(yup) {
      addMethod(yup, "example");
      addMethod(yup, "examples");
      addMethod(yup, "description");
      yup.addMethod(yup.Schema, "jsonSchema", function(callback) {
        var meta = this.describe().meta || {};
        return this.meta(__assign(__assign({}, meta), { jsonSchema: callback(meta.jsonSchema || {}) }));
      });
    }
    __name(extendSchema, "extendSchema");
    exports.extendSchema = extendSchema;
  }
});

// ../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/index.js
var require_dist = __commonJS({
  "../../node_modules/.bun/@sodaru+yup-to-json-schema@2.0.1/node_modules/@sodaru/yup-to-json-schema/dist/index.js"(exports) {
    init_esm();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendSchema = exports.convertSchema = void 0;
    var converters_1 = require_converters();
    Object.defineProperty(exports, "convertSchema", { enumerable: true, get: /* @__PURE__ */ __name(function() {
      return converters_1.convertSchema;
    }, "get") });
    var methods_1 = require_methods();
    Object.defineProperty(exports, "extendSchema", { enumerable: true, get: /* @__PURE__ */ __name(function() {
      return methods_1.extendSchema;
    }, "get") });
  }
});
export default require_dist();
//# sourceMappingURL=dist-NHKOEV3V.mjs.map

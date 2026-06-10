"use strict";
/**
 * format-migration — public barrel.
 *
 * Plan 06-03 (SDK verb handler) imports `runMigration` and types from this
 * module. Internal modules (walk/rewrite/resolve/orphan/report) are NOT
 * re-exported — they are implementation details of the runMigration pipeline.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIGRATION_COMMIT_MARKER = exports.runMigration = void 0;
var run_cjs_1 = require("./run.cjs");
Object.defineProperty(exports, "runMigration", { enumerable: true, get: function () { return run_cjs_1.runMigration; } });
var types_cjs_1 = require("./types.cjs");
Object.defineProperty(exports, "MIGRATION_COMMIT_MARKER", { enumerable: true, get: function () { return types_cjs_1.MIGRATION_COMMIT_MARKER; } });

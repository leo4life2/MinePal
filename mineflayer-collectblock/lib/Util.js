"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.error = void 0;
/**
 * Creates a new error object with the given type and message.
 *
 * @param type - The error type.
 * @param message - The error message.
 *
 * @returns The error object.
 */
function error(type, message) {
    const e = new Error(message);
    e.name = type;
    return e;
}
exports.error = error;

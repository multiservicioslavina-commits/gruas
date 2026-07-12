"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMemorySize = void 0;
const constants_1 = require("./constants");
const validateMemorySize = (memorySizeInMb) => {
    if (typeof memorySizeInMb !== 'number') {
        throw new TypeError(`parameter 'memorySizeInMb' must be a number, got a ${typeof memorySizeInMb}`);
    }
    if (Number.isNaN(memorySizeInMb)) {
        throw new TypeError(`parameter 'memorySizeInMb' must not be NaN, but is`);
    }
    if (!Number.isFinite(memorySizeInMb)) {
        throw new TypeError(`parameter 'memorySizeInMb' must be finite, but is ${memorySizeInMb}`);
    }
    if (memorySizeInMb < constants_1.MIN_MEMORY || memorySizeInMb > constants_1.MAX_MEMORY) {
        throw new TypeError(`parameter 'memorySizeInMb' must be between ${constants_1.MIN_MEMORY} and ${constants_1.MAX_MEMORY}, but got ${memorySizeInMb}`);
    }
    if (memorySizeInMb % 1 !== 0) {
        throw new TypeError(`parameter 'memorySizeInMb' must be an integer but got ${memorySizeInMb}`);
    }
};
exports.validateMemorySize = validateMemorySize;

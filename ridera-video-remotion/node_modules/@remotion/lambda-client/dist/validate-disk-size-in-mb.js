"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDiskSizeInMb = void 0;
const constants_1 = require("./constants");
const validateDiskSizeInMb = (diskSizeInMb) => {
    if (typeof diskSizeInMb !== 'number') {
        throw new TypeError(`parameter 'diskSizeInMb' must be a number, got a ${typeof diskSizeInMb}`);
    }
    if (Number.isNaN(diskSizeInMb)) {
        throw new TypeError(`parameter 'diskSizeInMb' must not be NaN, but is`);
    }
    if (!Number.isFinite(diskSizeInMb)) {
        throw new TypeError(`parameter 'diskSizeInMb' must be finite, but is ${diskSizeInMb}`);
    }
    if (diskSizeInMb < constants_1.MIN_EPHEMERAL_STORAGE_IN_MB ||
        diskSizeInMb > constants_1.MAX_EPHEMERAL_STORAGE_IN_MB) {
        throw new TypeError(`parameter 'diskSizeInMb' must be between ${constants_1.MIN_EPHEMERAL_STORAGE_IN_MB} and ${constants_1.MAX_EPHEMERAL_STORAGE_IN_MB}, but got ${diskSizeInMb}`);
    }
    if (diskSizeInMb % 1 !== 0) {
        throw new TypeError(`parameter 'diskSizeInMb' must be an integer but got ${diskSizeInMb}`);
    }
};
exports.validateDiskSizeInMb = validateDiskSizeInMb;

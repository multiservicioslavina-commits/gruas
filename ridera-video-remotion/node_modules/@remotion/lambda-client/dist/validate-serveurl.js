"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateServeUrl = void 0;
const validateServeUrl = (serveUrl) => {
    if (typeof serveUrl !== 'string') {
        throw new TypeError(`"serveURL" parameter must be a string, but is ${JSON.stringify(serveUrl)}`);
    }
};
exports.validateServeUrl = validateServeUrl;

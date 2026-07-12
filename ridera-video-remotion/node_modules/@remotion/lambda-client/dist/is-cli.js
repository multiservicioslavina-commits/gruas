"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setIsCli = exports.getIsCli = void 0;
let isCli = false;
const getIsCli = () => isCli;
exports.getIsCli = getIsCli;
const setIsCli = (cli) => {
    isCli = cli;
};
exports.setIsCli = setIsCli;

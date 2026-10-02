// Build-process clock for the unmodified mcpb 2.1.2 pack CLI, which uses new Date().
// This preload is never used by the runtime server or signer.
'use strict';
const epoch = process.env.SOURCE_DATE_EPOCH;
if (!epoch || epoch.length > 12) throw new Error('SOURCE_DATE_EPOCH must contain at most 12 digits');
for (const character of epoch) if (character < '0' || character > '9') throw new Error('SOURCE_DATE_EPOCH must contain only digits');
const milliseconds = Number(epoch) * 1000;
const NativeDate = Date;
if (!Number.isSafeInteger(milliseconds) || milliseconds < Date.UTC(1980, 0, 1) || milliseconds >= Date.UTC(2108, 0, 1)) throw new Error('ZIP timestamp out of range');
global.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [milliseconds])); }
  static now() { return milliseconds; }
};

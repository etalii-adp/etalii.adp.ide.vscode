// Refreshes .debug/examples from examples/, so a debug session edits a copy. Files you add to
// .debug/examples yourself are kept; the vendored examples are copied over their copies.
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('.debug/examples', { recursive: true });
cpSync('examples', '.debug/examples', { recursive: true });
console.log('Refreshed .debug/examples');
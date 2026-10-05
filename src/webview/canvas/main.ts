import { describeEmpty } from './empty';

// The canvas's entry point in a diagram's webview. Until a diagram type is registered there is
// nothing to draw, and the canvas says so.
document.body.textContent = describeEmpty();
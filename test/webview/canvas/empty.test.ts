import { describe, expect, it } from 'vitest';
import { describeEmpty } from '../../../src/webview/canvas/empty';

describe('an empty canvas', () => {
  it('says there is nothing to show, in a document', () => {
    document.body.textContent = describeEmpty();
    expect(document.body.textContent).toBe('There is no diagram to show.');
  });
});
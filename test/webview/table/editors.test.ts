import { describe, expect, it } from 'vitest';
import type { TableParam } from '../../../src/core/tool/tableView';
import { controlOf, given } from '../../../src/webview/table/editors';

// What the form of an operation's parameters gives for a checkbox: an optional one with no default
// left unticked gives nothing, so a filter added from a column's menu is not written with
// `checked: false` (a difference the side-by-side check with the standalone host found).

const box = (more: Partial<TableParam> = {}): TableParam => ({ name: 'checked', label: 'Checked', control: 'checkbox', required: false, ...more });

describe('a checkbox of an operation\'s form', () => {
  it('gives nothing when it is optional, has no default and is left unticked', () => {
    const param = box();
    expect(given(param, controlOf(param))).toBeUndefined();
  });

  it('gives true once ticked', () => {
    const param = box();
    const control = controlOf(param) as HTMLInputElement;
    control.checked = true;
    expect(given(param, control)).toBe(true);
  });

  it('gives false when it is required or has a default', () => {
    for (const param of [box({ required: true }), box({ value: true })]) {
      const control = controlOf(param) as HTMLInputElement;
      control.checked = false;
      expect(given(param, control)).toBe(false);
    }
  });
});

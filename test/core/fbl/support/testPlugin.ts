import type { FblElement } from '../../../../src/core/fbl/model';
import type {
  PersistencePlugin, PluginPlanRequest, PluginPlanResult, PluginReadRequest, PluginReadResult, PluginTemplateRequest,
} from '../../../../src/core/fbl/plugins/persistencePlugin';
import { textOf, utf8 } from './repository';

/**
 * A persistence plugin for tests, standing in for a real one, which the library does not have:
 * every line `label <text>` is an element `line<n>` with a writable `label`; it plans label
 * changes and refuses everything else.
 */
export class TestPlugin implements PersistencePlugin {
  plans = 0;

  constructor(readonly id: string) {}

  read(request: PluginReadRequest): PluginReadResult {
    const bytes = request.files[0].bytes;
    const elements: FblElement[] = [];
    let start = 0;
    let number = 0;
    for (let i = 0; i <= bytes.length; i++) {
      if (i < bytes.length && bytes[i] !== 0x0a) continue;
      if (i > start) {
        number++;
        const text = textOf(bytes.subarray(start, i));
        elements.push({ id: `line${number}`, idIsStored: true, type: 'Line', rule: 'line', isRelation: false, attributes: { label: text.slice(6) }, ownSpan: { start, end: i }, line: number });
      }
      start = i + 1;
    }
    return { elements, findings: [], unreadable: false };
  }

  plan(request: PluginPlanRequest): PluginPlanResult {
    this.plans++;
    const change = request.change;
    if (change.kind !== 'set') return { refused: 'The fake plugin removes nothing.' };
    const element = request.last.elements.find((candidate) => candidate.id === change.id)!;
    return { planned: [{ file: '', splice: { operation: 'replace-value', start: element.ownSpan.start + 6, end: element.ownSpan.end, text: change.attributes.label as string } }] };
  }

  template(request: PluginTemplateRequest): Uint8Array {
    return utf8(`template for ${request.name} (${request.placeholders.get('base')})`);
  }

  watch(): readonly string[] {
    return [];
  }
}

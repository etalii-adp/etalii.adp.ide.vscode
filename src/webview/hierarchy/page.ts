import type { FromCanvas, ToCanvas } from '../../core/frame/protocol';
import type { HierarchyNode, HierarchyRequest, HierarchyView } from '../../core/tool/hierarchyView';
import { html } from '../diagram/dom';
import { icon } from '../diagram/icons';

// The page of boxes of a designer of the `hierarchy` kind, for now as an outline: the levels and
// entries of the view it is sent, nested as the view nests them, each with its id and its title,
// and folded as the view says. It draws what it is sent and asks for every change with a request:
// a fold is the operation the view names for the gesture, so what it shows after one is the view
// that follows it.

export class HierarchyPage {
  private readonly title = html('h1', { class: 'adp-hierarchy-name' });
  private readonly notice = html('p', { class: 'adp-hierarchy-notice', role: 'alert', hidden: '' });
  private readonly outline = html('div', { class: 'adp-hierarchy-outline' });
  private readonly status = html('p', { class: 'adp-hierarchy-status', role: 'status' });
  private readonly root = html('div', { class: 'adp-hierarchy' }, this.title, this.notice, html('div', { class: 'adp-hierarchy-scroll' }, this.outline), this.status);

  private view: HierarchyView | undefined;
  /** Every level and entry of the view, by id. */
  private nodes = new Map<string, HierarchyNode>();
  private version = 0;
  private seq = 0;
  private selection: readonly string[] = [];

  constructor(host: HTMLElement, private readonly send: (message: FromCanvas) => void) {
    host.append(this.root);
    this.root.addEventListener('click', (event) => this.click(event.target as Element));
  }

  receive(message: ToCanvas): void {
    if (message.type === 'view' && message.kind === 'designer') {
      const view = message.view as HierarchyView;
      this.view = view;
      this.version = message.version;
      this.nodes = new Map();
      const add = (node: HierarchyNode): void => {
        this.nodes.set(node.id, node);
        for (const child of [...node.entries, ...node.levels]) add(child);
      };
      for (const node of [...view.roots, ...view.stray]) add(node);
      this.render();
      // What the document no longer has is no longer selected.
      const kept = this.selection.filter((id) => this.nodes.has(id));
      if (kept.length !== this.selection.length) this.select(kept, true);
    } else if (message.type === 'outcome' && message.seq === this.seq) {
      this.status.textContent = message.result === 'refused' ? message.sentence ?? '' : '';
    } else if (message.type === 'reveal') {
      if (!this.nodes.has(message.id)) return;
      this.select([message.id]);
      this.itemOf(message.id)?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  // Drawing.

  private render(): void {
    const view = this.view;
    if (!view) return;
    this.title.textContent = view.name;
    this.notice.textContent = view.notice ?? '';
    this.notice.hidden = view.notice === undefined;
    const parts: Node[] = [];
    if (view.roots.length > 0) parts.push(this.list(view.roots, 'tree'));
    if (view.stray.length > 0) parts.push(html('h2', { class: 'adp-hierarchy-heading' }, 'Outside every level'), this.list(view.stray, 'tree'));
    this.outline.replaceChildren(...parts);
  }

  private list(nodes: readonly HierarchyNode[], role: 'tree' | 'group'): HTMLUListElement {
    return html('ul', { class: 'adp-hierarchy-list', role, ...(role === 'tree' ? { 'aria-label': 'Levels and entries' } : {}) }, ...nodes.map((node) => this.item(node)));
  }

  private item(node: HierarchyNode): HTMLLIElement {
    const fold = node.gestures.fold;
    const toggle = fold
      ? html('button', {
        class: 'adp-hierarchy-toggle', type: 'button', 'data-fold': node.id,
        'aria-label': node.collapsed ? `Expand ${node.title}` : `Collapse ${node.title}`,
        ...(fold.enabled ? {} : { disabled: '', title: fold.reason }),
      }, icon(node.collapsed ? 'mdi-chevron-right' : 'mdi-chevron-down'))
      : html('span', { class: 'adp-hierarchy-toggle-space' });
    const row = html('div', { class: 'adp-hierarchy-row' },
      toggle,
      node.shownId === undefined ? undefined : html('span', { class: 'adp-hierarchy-id' }, node.shownId),
      html('span', { class: 'adp-hierarchy-title' }, node.title));
    const children = [...node.entries, ...node.levels];
    const open = !node.collapsed;
    return html('li', {
      class: `adp-hierarchy-node adp-hierarchy-${node.role}`, role: 'treeitem', 'data-id': node.id,
      'aria-selected': String(this.selection.includes(node.id)),
      ...(fold ? { 'aria-expanded': String(open) } : {}),
    },
    row,
    open && node.descriptionText !== '' ? html('p', { class: 'adp-hierarchy-description' }, node.descriptionText) : undefined,
    open && children.length > 0 ? this.list(children, 'group') : undefined);
  }

  private itemOf(id: string): HTMLElement | undefined {
    return [...this.outline.querySelectorAll<HTMLElement>('[data-id]')].find((item) => item.dataset.id === id);
  }

  // Gestures.

  private click(target: Element): void {
    const toggle = target.closest<HTMLButtonElement>('[data-fold]');
    if (toggle) {
      const fold = this.nodes.get(toggle.dataset.fold ?? '')?.gestures.fold;
      if (fold?.enabled) this.request({ kind: 'operation', operation: fold.operation, on: [toggle.dataset.fold!] });
      return;
    }
    const item = target.closest<HTMLElement>('[data-id]');
    if (item?.dataset.id !== undefined) this.select([item.dataset.id], true);
  }

  private select(ids: readonly string[], tell = false): void {
    this.selection = ids;
    for (const item of this.outline.querySelectorAll<HTMLElement>('[data-id]')) item.setAttribute('aria-selected', String(ids.includes(item.dataset.id ?? '')));
    if (tell) this.send({ v: 2, type: 'selection', ids });
  }

  private request(request: HierarchyRequest): void {
    this.seq += 1;
    this.status.textContent = '';
    this.send({ v: 2, type: 'edit', seq: this.seq, request, version: this.version });
  }
}

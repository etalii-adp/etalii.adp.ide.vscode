import type { FromCanvas, ToCanvas } from '../../core/frame/protocol';
import type { HierarchyGestureState, HierarchyNode, HierarchyRequest, HierarchySegment, HierarchyView } from '../../core/tool/hierarchyView';
import type { TableValue } from '../../core/tool/tableView';
import { html } from '../diagram/dom';
import { icon } from '../diagram/icons';
import { dropOf, slotIndex, type DropHint } from './drag';
import { headerEnd, headerWidth, iconsLayoutOf, textWidth } from './iconsLayout';
import { ancestorsOf, indexOf, LEVEL_WIDTH, levelsBelow, levelsThatFit, revealOf, type HierarchyIndex } from './layout';

// The page of boxes of a designer of the `hierarchy` kind (DESL 7.7.1), as the standalone host
// draws it: one page that scrolls, each level a box with its entries and then its levels to its
// right in document order, as tall as what it holds, neighbouring boxes sharing their borders. It
// draws what it is sent, and every change is a request whose operation the view names for the
// gesture; what it shows after one is the view that follows. What is its own: the selection, the
// level it is narrowed to (sent as a view option and never written), the text typed in a field
// until it is kept, and where a box being dragged would go.
//
// The page is drawn again whole for every view, but the element of each level and entry is kept
// by its id and a box is built again only when what it shows changed, so an open field keeps its
// text, its caret and the focus.

const HIDDEN_LEVELS_ICON = 'mdi-chevron-double-right';
const FOCUS_ICON = 'mdi-target';
const DELETE_ICON = 'mdi-delete-outline';
const SEVERAL_NOTES_ICON = 'mdi-comment-multiple-outline';
const ADD_DESCRIPTION_ICON = 'mdi-text-box-plus-outline';
const GRIP_ICON = 'mdi-drag-vertical';
const ADD_ENTRY_ICON = 'mdi-playlist-plus';
const ADD_LEVEL_ICON = 'mdi-folder-plus-outline';
const SEVERITY_ICONS: Readonly<Record<string, string>> = {
  error: 'mdi-alert-circle-outline', warning: 'mdi-alert-outline', information: 'mdi-information-outline', hint: 'mdi-lightbulb-outline',
};
/** How far the pointer moves on a grip before it is a drag rather than a press. */
const DRAG_START = 3;

type TextAttribute = 'title' | 'description';

/** The field open on the page: the node, which of its texts, the gesture that keeps it, and the text as it was. */
interface OpenField {
  readonly nodeId: string;
  readonly attribute: TextAttribute;
  readonly element: HTMLTextAreaElement;
  readonly gesture: HierarchyGestureState;
  /** Whether it was kept or dropped: the blur that follows is no commit. */
  done: boolean;
}

/** The element of a level or an entry, kept by its id from one drawing to the next. */
interface NodeElements {
  readonly role: HierarchyNode['role'];
  readonly wrapper: HTMLElement;
  readonly levelBox?: HTMLElement;
  content?: HTMLElement;
}

/** A box as it was last built: what it showed, and what laying out its controls needs. */
interface BuiltBox {
  readonly signature: string;
  readonly element: HTMLElement;
  readonly header: HTMLElement;
  readonly icons: number;
  readonly deletable: boolean;
  readonly grip: boolean;
  readonly number: string;
  readonly title: string;
}

/** Makes `parent`'s children `children`, moving only what is not in its place. */
function reconcile(parent: Element, children: readonly Node[]): void {
  children.forEach((child, index) => {
    const at = parent.childNodes[index];
    if (at !== child) parent.insertBefore(child, at ?? null);
  });
  while (parent.childNodes.length > children.length) parent.lastChild!.remove();
}

const numberOf = (node: HierarchyNode): string => node.shownId ?? '';
const nameOf = (node: HierarchyNode): string => (node.shownId === undefined ? node.title : `${node.shownId} ${node.title}`);
const isTyping = (target: EventTarget | null): boolean => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

export class HierarchyPage {
  private readonly trail = html('nav', { class: 'hs-trail', 'aria-label': 'Trail' });
  private readonly help = html('div', { class: 'hs-help', role: 'region', 'aria-label': 'Keys', hidden: '' });
  private readonly notice = html('p', { class: 'hs-read-only adp-hierarchy-notice', role: 'alert', hidden: '' });
  private readonly conflictBar = html('div', { class: 'hs-conflict', role: 'alert', hidden: '' });
  private readonly orphan = html('div', { class: 'hs-orphan-field', hidden: '' });
  private readonly findings = html('ul', { class: 'hs-findings', 'aria-label': 'Findings', hidden: '' });
  private readonly page = html('div', { class: 'hs-page', role: 'tree', tabindex: 0 });
  private readonly status = html('p', { class: 'adp-hierarchy-status', role: 'status' });
  private readonly dialog = html('div', { class: 'hs-dialog-backdrop', hidden: '' });
  private readonly root = html('div', { class: 'adp-hierarchy hs-surface' },
    this.trail, this.help, this.notice, this.conflictBar, this.orphan, this.findings, this.page, this.status, this.dialog);

  private view: HierarchyView | undefined;
  private index: HierarchyIndex = { byId: new Map() };
  private version = 0;
  private seq = 0;
  private selected = '';
  /** The page's left edge, and whether it shows what is inside that level rather than the level itself. */
  private focus = { id: '', inside: false };
  private focusRead = false;
  private width = 0;
  private field: OpenField | undefined;
  private conflict = false;
  private question: Extract<ToCanvas, { type: 'confirm' }> | undefined;
  private helpOpen = false;
  /** A reveal of a node the page did not have yet, for the view that brings it. */
  private pendingReveal: Extract<ToCanvas, { type: 'reveal' }> | undefined;
  /** The node to scroll to once its box is drawn. */
  private revealing: string | undefined;
  private press: { readonly id: string; readonly x: number; readonly y: number; dragging: boolean } | undefined;
  private hint: DropHint | undefined;
  private rendering = false;
  private readonly elements = new Map<string, NodeElements>();
  private readonly boxes = new Map<string, BuiltBox>();
  private fonts: { readonly number: string; readonly title: string } | undefined;
  private readonly measured = new Map<string, number>();
  /** What every box shows of the lists, the names of their labels, for its signature. */
  private listNames = '';

  constructor(host: HTMLElement, private readonly send: (message: FromCanvas) => void) {
    host.append(this.root);
    this.root.addEventListener('click', (event) => this.click(event));
    this.root.addEventListener('dblclick', (event) => this.doubleClick(event));
    this.root.addEventListener('keydown', (event) => this.key(event));
    this.root.addEventListener('pointerdown', (event) => this.pointerDown(event));
    // Pressing a button of the bar keeps the focus in the field: leaving it would keep the text, which the bar decides on.
    this.conflictBar.addEventListener('mousedown', (event) => event.preventDefault());
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resized()).observe(this.page);
    window.addEventListener('resize', () => this.resized());
    // A label with a colour of its own takes the one of the kind of theme, which can change while the page is open.
    if (typeof MutationObserver !== 'undefined') new MutationObserver(() => this.render()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  receive(message: ToCanvas): void {
    switch (message.type) {
      case 'view': {
        if (message.kind !== 'designer') return;
        const view = message.view as HierarchyView;
        this.view = view;
        this.version = message.version;
        this.index = indexOf(view);
        // The level a viewer narrowed to is the page's own once it is drawn; a page opened again starts from the one the editor kept.
        if (!this.focusRead) {
          this.focus = { id: view.focus ?? '', inside: false };
          this.focusRead = true;
        }
        if (this.focus.id !== '' && !this.index.byId.has(this.focus.id)) this.focus = { id: '', inside: false };
        // A change from outside while a field is open asks what to do with the text; the page is already the file's.
        if (message.cause === 'outside' && this.field !== undefined) this.conflict = true;
        // What the document no longer has is no longer selected.
        if (this.selected !== '' && !this.index.byId.has(this.selected)) this.select('');
        this.render();
        const pending = this.pendingReveal;
        this.pendingReveal = undefined;
        if (pending && this.index.byId.has(pending.id)) this.receive(pending);
        return;
      }
      case 'outcome':
        if (message.seq === this.seq || message.seq === 0) this.status.textContent = message.result === 'refused' ? message.sentence ?? '' : '';
        return;
      case 'reveal':
        if (!this.index.byId.has(message.id)) {
          this.pendingReveal = message;
          return;
        }
        this.reveal(message.id);
        if (message.editLabel) this.openField(message.id, message.multiline ? 'description' : 'title');
        return;
      case 'confirm':
        this.question = message;
        this.render();
        this.dialog.querySelector<HTMLButtonElement>('[data-action="confirm-no"]')?.focus();
        return;
      default:
        return;
    }
  }

  // ---- where things stand ----

  private get readOnly(): boolean {
    return this.view?.readOnly === true;
  }

  private fit(): number {
    return levelsThatFit(this.width, () => LEVEL_WIDTH);
  }

  private focused(): HierarchyNode | undefined {
    return this.focus.id === '' ? undefined : this.index.byId.get(this.focus.id);
  }

  /** The width the page's columns have: inside its padding, so that what fits does not scroll sideways. */
  private measure(): number {
    const style = getComputedStyle(this.page);
    const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    return Math.max(0, this.page.clientWidth - padding);
  }

  private resized(): void {
    if (this.measure() === this.width) return;
    this.render();
  }

  // ---- drawing ----

  private render(): void {
    const view = this.view;
    if (!view) return;
    this.width = this.measure();
    const field = this.field;
    const typing = field !== undefined && document.activeElement === field.element;
    const caret = typing ? [field.element.selectionStart, field.element.selectionEnd] as const : undefined;
    this.rendering = true;
    try {
      this.drawTrail(view);
      this.drawHelp(view);
      this.notice.textContent = view.notice ?? '';
      this.notice.hidden = !view.readOnly || view.notice === undefined;
      this.drawConflict();
      this.drawFindings(view);
      this.listNames = JSON.stringify(view.lists.map((list) => [list.label, list.name]));
      this.drawPage(view);
      this.drawDialog();
    } finally {
      this.rendering = false;
    }
    if (field && typing && document.activeElement !== field.element) {
      field.element.focus();
      if (caret) field.element.setSelectionRange(caret[0], caret[1]);
    }
    this.layoutIcons();
    if (this.revealing !== undefined) {
      const box = this.boxes.get(this.revealing)?.element;
      if (box?.isConnected) {
        this.revealing = undefined;
        box.scrollIntoView?.({ block: 'nearest' });
      }
    }
  }

  /** The trail above the page: the document's name, then the levels down to the selection, or to the focus while nothing is selected. */
  private drawTrail(view: HierarchyView): void {
    const focused = this.focus.inside ? undefined : this.focus.id;
    const anchor = this.index.byId.get(this.selected) ?? this.focused();
    const path = anchor === undefined ? [] : anchor.role === 'level' ? [...ancestorsOf(this.index, anchor.id), anchor] : ancestorsOf(this.index, anchor.id);
    const step = (text: string, id: string, current: boolean): HTMLElement => {
      const name = id === '' ? ' adp-hierarchy-name' : '';
      return current
        ? html('span', { class: `hs-trail-current${name}`, 'aria-current': 'page' }, text)
        : html('button', { type: 'button', class: `hs-trail-link${name}`, 'data-action': 'trail', 'data-id': id }, text);
    };
    const helpButton = html('button', {
      type: 'button', class: 'hs-help-button', 'data-action': 'help', title: 'Keys', 'aria-label': 'Keys', 'aria-expanded': String(this.helpOpen),
    }, icon('mdi-keyboard-outline'));
    reconcile(this.trail, [
      step(view.name === '' ? 'Document' : view.name, '', focused === ''),
      ...path.map((node) => html('span', { class: 'hs-trail-step' }, icon('mdi-chevron-right'), step(nameOf(node), node.id, node.id === focused))),
      helpButton,
    ]);
  }

  /** The keys of the page, as the standalone host's menus show them beside its actions, in the words of the operations they run. */
  private drawHelp(view: HierarchyView): void {
    this.help.hidden = !this.helpOpen;
    if (!this.helpOpen) return;
    const all = [...this.index.byId.values()];
    const level = all.find((node) => node.role === 'level');
    const entry = all.find((node) => node.role === 'entry');
    const label = (gesture: HierarchyGestureState | undefined): string | undefined => (gesture === undefined ? undefined : view.operations[gesture.operation]?.label ?? gesture.operation);
    const rows: [string, string | undefined][] = view.readOnly ? [] : [
      ['Ctrl+Enter', [label(level?.gestures.addLevelBelow), label(entry?.gestures.addEntryBelow)].filter((text) => text !== undefined).join(' or ') || undefined],
      ['Ctrl+Shift+Enter', level?.gestures.addEntry ? `${label(level.gestures.addEntry)} in the selected ${level.type.toLowerCase()}` : undefined],
      ['Delete', label(level?.gestures.remove ?? entry?.gestures.remove) && `${label(level?.gestures.remove ?? entry?.gestures.remove)}, asking first when anything concerns it`],
      ['F2, or double-click the title', 'Type the title in place'],
      ['Double-click the description', 'Type the description in place'],
      ['Enter', 'Keep the title typed'],
      ['Ctrl+Enter in a description', 'Keep the description typed'],
      ['Escape', 'Drop what was typed'],
      ['Drag a box by its grip', 'Move it with everything in it'],
    ];
    const shown = rows.filter((row): row is [string, string] => row[1] !== undefined);
    reconcile(this.help, [shown.length === 0
      ? html('p', {}, 'Nothing on this page can be changed.')
      : html('dl', { class: 'hs-help-keys' }, ...shown.flatMap(([keys, what]) => [html('dt', {}, html('kbd', {}, keys)), html('dd', {}, what)]))]);
  }

  private drawConflict(): void {
    const shown = this.conflict && this.field !== undefined;
    this.conflictBar.hidden = !shown;
    if (shown && this.conflictBar.childElementCount === 0) {
      this.conflictBar.append(
        html('span', {}, 'This file was changed outside the designer.'),
        html('button', { type: 'button', 'data-action': 'conflict-show' }, 'Show the file'),
        html('button', { type: 'button', 'data-action': 'conflict-keep' }, 'Keep my text'));
    }
  }

  /** What reading the document found, above the page: each at its line, and the level or entry it is about when it names one. */
  private drawFindings(view: HierarchyView): void {
    this.findings.hidden = view.findings.length === 0;
    reconcile(this.findings, view.findings.map((found) => html('li', { class: `hs-finding hs-finding-${found.severity}` },
      html('span', { class: 'hs-finding-icon', role: 'img', 'aria-label': found.severity }, icon(SEVERITY_ICONS[found.severity])),
      found.node === undefined
        ? html('span', {}, found.message)
        : html('button', { type: 'button', class: 'hs-finding-link', 'data-action': 'finding', 'data-id': found.node }, found.message),
      found.line > 0 ? html('span', { class: 'hs-finding-line' }, `line ${found.line}`) : undefined)));
  }

  private drawPage(view: HierarchyView): void {
    const fit = this.fit();
    const used = new Set<string>();
    const focused = this.focused();
    const roots = focused === undefined ? view.roots : this.focus.inside ? focused.levels : [focused];
    this.page.setAttribute('aria-label', view.name);
    const children: Node[] = this.withSlot(roots, '', (node) => this.nodeView(node, 0, fit, used));
    const addLevel = view.pageGestures.addLevel;
    if (focused === undefined && !view.readOnly && addLevel?.enabled) children.push(this.addControl(undefined, [['page', addLevel, ADD_LEVEL_ICON]]));
    if (focused === undefined && view.stray.length > 0) {
      children.push(html('h2', { class: 'adp-hierarchy-heading' }, 'Outside every level'), ...view.stray.map((node) => this.nodeView(node, 0, fit, used)));
    }
    reconcile(this.page, children);
    for (const id of [...this.elements.keys()]) if (!used.has(id)) this.elements.delete(id);
    for (const id of [...this.boxes.keys()]) if (!used.has(id)) this.boxes.delete(id);

    // A field whose node the file no longer has keeps its text above the page; committing it is the file's to refuse.
    const field = this.field;
    const orphaned = field !== undefined && !used.has(field.nodeId);
    this.orphan.hidden = !orphaned;
    reconcile(this.orphan, orphaned ? [field.element] : []);
  }

  /** `nodes` drawn by `draw`, with the place a drop into `levelId` would put the dragged node. */
  private withSlot(nodes: readonly HierarchyNode[], levelId: string, draw: (node: HierarchyNode) => Node): Node[] {
    const drawn = nodes.map(draw);
    const hint = this.hint;
    if (hint === undefined || hint.drop.into !== levelId) return drawn;
    const at = slotIndex(nodes, hint);
    if (at < 0) return drawn;
    const slot = html('div', { class: `hs-drop-slot hs-drop-slot-${hint.dragged.role}`, 'aria-hidden': 'true' },
      html('span', { class: 'hs-number' }, numberOf(hint.dragged)), ' ', html('span', { class: 'hs-drop-slot-title' }, hint.dragged.title));
    return [...drawn.slice(0, at), slot, ...drawn.slice(at)];
  }

  /** A level with its box and what stands to its right, or an entry with its box; `depth` counts from the page's left edge. */
  private nodeView(node: HierarchyNode, depth: number, fit: number, used: Set<string>): HTMLElement {
    used.add(node.id);
    const level = node.role === 'level';
    let elements = this.elements.get(node.id);
    if (!elements || elements.role !== node.role) {
      elements = level
        ? { role: node.role, wrapper: html('div'), levelBox: html('div', { class: 'hs-level-box', style: `flex: 0 0 ${LEVEL_WIDTH}px; width: ${LEVEL_WIDTH}px` }) }
        : { role: node.role, wrapper: html('div') };
      this.elements.set(node.id, elements);
    }
    const { wrapper } = elements;
    const showsLevels = depth + 1 < fit;
    const hidden = level && !node.collapsed && !showsLevels ? levelsBelow(node) : 0;
    const box = this.boxOf(node, hidden);
    wrapper.className = `hs-${node.role}${this.hint?.dragged.id === node.id ? ' hs-dragging' : ''}`;
    wrapper.setAttribute('role', 'treeitem');
    wrapper.setAttribute('aria-label', nameOf(node));
    wrapper.setAttribute('aria-selected', String(this.selected === node.id));
    wrapper.dataset.node = node.id;
    if (node.gestures.fold) wrapper.setAttribute('aria-expanded', String(!node.collapsed));
    else wrapper.removeAttribute('aria-expanded');
    if (!level) {
      reconcile(wrapper, [box]);
      return wrapper;
    }
    const levelBox = elements.levelBox!;
    reconcile(levelBox, [box]);
    const shown = node.collapsed ? [] : [...node.entries, ...(showsLevels ? node.levels : [])];
    const gestures = node.gestures;
    const adds: [string, HierarchyGestureState, string][] = node.collapsed || this.readOnly ? [] : [
      ...(gestures.addEntry?.enabled ? [['addEntry', gestures.addEntry, ADD_ENTRY_ICON] as [string, HierarchyGestureState, string]] : []),
      ...(gestures.addLevel?.enabled ? [['addLevel', gestures.addLevel, ADD_LEVEL_ICON] as [string, HierarchyGestureState, string]] : []),
    ];
    const content = [
      ...this.withSlot(shown, node.id, (child) => this.nodeView(child, child.role === 'level' ? depth + 1 : depth, fit, used)),
      ...(adds.length > 0 ? [this.addControl(node, adds)] : []),
    ];
    if (content.length === 0) {
      reconcile(wrapper, [levelBox]);
      return wrapper;
    }
    elements.content ??= html('div', { class: 'hs-level-content', role: 'group' });
    reconcile(elements.content, content);
    reconcile(wrapper, [levelBox, elements.content]);
    return wrapper;
  }

  /** The place a node is added, at the end of a level's content and of the page: each control its icon alone, its operation's label the tooltip. */
  private addControl(level: HierarchyNode | undefined, adds: readonly [string, HierarchyGestureState, string][]): HTMLElement {
    const within = level === undefined ? '' : numberOf(level) || level.title;
    return html('div', { class: 'hs-add', role: 'group', 'aria-label': within === '' ? 'Add' : `Add to ${within}` },
      ...adds.map(([gesture, state, name]) => {
        const label = this.view?.operations[state.operation]?.label ?? state.operation;
        return html('button', {
          type: 'button', class: 'hs-add-button', 'data-action': 'add', 'data-gesture': gesture, 'data-id': level?.id,
          'aria-label': within === '' ? label : `${label} in ${within}`, title: label,
        }, icon(name));
      }));
  }

  /** The mark of a node's open notes: the kind's icon for one, the icon of several with their count; a collapsed level's counts what it holds. */
  private noteMark(node: HierarchyNode): { readonly icon: string; readonly count: number; readonly label: string } | undefined {
    const count = node.notes.open + (node.role === 'level' && node.collapsed ? node.notes.within : 0);
    if (count === 0) return undefined;
    if (count === 1) {
      const about = new Set<string>([node.id]);
      if (node.collapsed) {
        const add = (inner: HierarchyNode): void => {
          about.add(inner.id);
          [...inner.entries, ...inner.levels].forEach(add);
        };
        [...node.entries, ...node.levels].forEach(add);
      }
      const note = this.view?.notes.find((candidate) => !candidate.resolved && candidate.aboutId !== undefined && about.has(candidate.aboutId));
      return { icon: note?.icon ?? node.notes.icon ?? SEVERAL_NOTES_ICON, count, label: note === undefined ? '1 open note' : `${note.kindLabel}: ${note.textRaw}` };
    }
    return { icon: SEVERAL_NOTES_ICON, count, label: `${count} open notes` };
  }

  /** A node's own box, built again only when what it shows changed. */
  private boxOf(node: HierarchyNode, hidden: number): HTMLElement {
    const field = this.field?.nodeId === node.id ? this.field : undefined;
    const selected = this.selected === node.id;
    const drop = this.hint?.over === node.id ? this.hint.kind : undefined;
    const mark = this.noteMark(node);
    const own = { ...node, entries: undefined, levels: undefined };
    const signature = JSON.stringify([own, hidden, field?.attribute, selected, drop, mark, this.readOnly, this.listNames, this.lightTheme()]);
    const built = this.boxes.get(node.id);
    if (built?.signature === signature) return built.element;

    const gestures = node.gestures;
    const level = node.role === 'level';
    const collapsed = node.collapsed;
    const name = nameOf(node);
    const icons: Node[] = [];
    if (mark) {
      icons.push(html('span', { class: 'hs-note-mark', role: 'img', 'aria-label': mark.label, title: mark.label },
        icon(mark.icon), mark.count > 1 ? html('span', { class: 'hs-note-count' }, String(mark.count)) : undefined));
    }
    if (hidden > 0) {
      const levels = `${hidden} more ${hidden === 1 ? 'level' : 'levels'}`;
      icons.push(html('button', { type: 'button', class: 'hs-hidden-levels', 'data-action': 'hidden', 'data-id': node.id, title: levels, 'aria-label': `${levels}: show the levels of ${name}` }, icon(HIDDEN_LEVELS_ICON)));
    }
    if (level && !collapsed) {
      icons.push(html('button', { type: 'button', class: 'hs-focus', 'data-action': 'focus', 'data-id': node.id, title: `Focus on this ${node.type.toLowerCase()}`, 'aria-label': `Focus on ${name}` }, icon(FOCUS_ICON)));
    }
    // The place of adding a description is kept on every box that could offer it, so selecting one moves nothing.
    const offersDescription = !collapsed && node.descriptionText === '' && gestures.describe?.enabled === true;
    if (offersDescription && selected && field === undefined) {
      icons.push(html('button', { type: 'button', class: 'hs-add-description', 'data-action': 'describe', 'data-id': node.id, title: 'Add a description', 'aria-label': 'Add a description' }, icon(ADD_DESCRIPTION_ICON)));
    }
    const count = (mark ? 1 : 0) + (hidden > 0 ? 1 : 0) + (level && !collapsed ? 1 : 0) + (offersDescription ? 1 : 0);
    const deletable = gestures.remove?.enabled === true;
    const grip = gestures.move?.enabled === true;
    const fold = gestures.fold;

    const header = html('div', { class: `hs-box-header${field?.attribute === 'title' ? ' hs-box-header-typing' : ''}` },
      grip ? html('span', { class: 'hs-grip', 'data-grip': node.id, title: `Drag ${numberOf(node) || node.title}`, 'aria-hidden': 'true' }, icon(GRIP_ICON)) : undefined,
      fold
        ? html('button', {
          type: 'button', class: 'hs-toggle', 'data-action': 'fold', 'data-id': node.id, 'aria-expanded': String(!collapsed),
          'aria-label': `${collapsed ? 'Expand' : 'Collapse'} ${name}`, ...(fold.enabled ? {} : { disabled: '', title: fold.reason }),
        }, icon(collapsed ? 'mdi-chevron-right' : 'mdi-chevron-down'))
        : html('span', { class: 'hs-toggle-space' }),
      node.shownId === undefined ? undefined : html('span', { class: 'hs-number' }, node.shownId),
      field?.attribute === 'title' ? field.element : html('span', { class: 'hs-title', 'data-edit': 'title', 'data-id': node.id }, node.title));
    const labels = node.labels.length === 0 ? undefined : html('div', { class: 'hs-tags' }, ...node.labels.map((value) => {
      const list = this.view?.lists.find((candidate) => candidate.label === value.label);
      const element = html('span', {
        class: `hs-label${value.implied ? ' hs-label-implied' : ''}`, 'data-label': value.label, 'data-colour': value.colourKey ?? 'default',
        title: `${list?.name ?? value.label}: ${value.name}`,
      }, value.name);
      if (value.colour) element.style.setProperty('--hs-label-colour', this.lightTheme() ? value.colour.light : value.colour.dark);
      return element;
    }));
    const description = collapsed
      ? undefined
      : field?.attribute === 'description'
        ? html('div', { class: 'hs-description-field' }, field.element)
        : node.descriptionText === ''
          ? undefined
          : html('p', { class: 'hs-description', 'data-edit': 'description', 'data-id': node.id }, ...node.description.map((part) => this.segment(part)));
    const side = html('span', { class: 'hs-box-side' },
      html('span', { class: 'hs-box-icons' }, ...icons),
      deletable
        ? html('span', { class: 'hs-delete-place' }, selected
          ? html('button', { type: 'button', class: 'hs-delete', 'data-action': 'delete', 'data-id': node.id, title: 'Delete', 'aria-label': `Delete ${name}` }, icon(DELETE_ICON))
          : undefined)
        : undefined);
    const element = html('div', {
      class: `hs-box hs-icons-column${count > 0 || deletable ? '' : ' hs-no-side'}${grip ? ' hs-draggable' : ''}${selected ? ' hs-selected' : ''}${collapsed ? ' hs-collapsed' : ''}${drop === undefined ? '' : ` hs-drop-${drop}`}`,
      'data-id': node.id,
    }, side, html('div', { class: 'hs-box-content' }, header, labels, description));
    this.boxes.set(node.id, { signature, element, header, icons: count, deletable, grip, number: numberOf(node), title: node.title });
    return element;
  }

  /** A part of a description: its text, or a mention as a small box with what it names, marked when it names nothing. */
  private segment(part: HierarchySegment): Node {
    if (!('mention' in part)) return document.createTextNode(part.text);
    const { mention } = part;
    if (mention.broken) {
      const said = `${part.text} names nothing in this document`;
      return html('span', { class: 'hs-reference hs-reference-broken', role: 'img', 'aria-label': said, title: said }, icon('mdi-link-variant-off'), part.text);
    }
    return html('span', { class: 'hs-reference', 'data-reference': mention.id, title: `${mention.id} ${mention.title ?? ''}`.trim() },
      html('span', { class: 'hs-number' }, mention.id), mention.title === undefined ? undefined : ` ${mention.title}`);
  }

  private lightTheme(): boolean {
    const classes = document.body.classList;
    return classes.contains('vscode-light') || classes.contains('vscode-high-contrast-light');
  }

  /**
   * The controls of every box in a row at the end of its first line when the line and every icon fit
   * side by side, else in a column at its right. Every box is measured first, then every one changed.
   */
  private layoutIcons(): void {
    const boxes = [...this.boxes.values()].filter((box) => box.element.isConnected);
    const widths = boxes.map((box) => box.element.clientWidth);
    if (!widths.some((width) => width > 0)) return;
    if (this.fonts === undefined) {
      const number = this.page.querySelector('.hs-number');
      const title = this.page.querySelector('.hs-title');
      if (number === null || title === null) return;
      this.fonts = { number: getComputedStyle(number).font, title: getComputedStyle(title).font };
    }
    const fonts = this.fonts;
    const measure = (text: string, font: string): number | undefined => {
      const key = `${font}\u0000${text}`;
      const known = this.measured.get(key);
      if (known !== undefined) return known;
      const width = textWidth(text, font);
      if (width !== undefined) this.measured.set(key, width);
      return width;
    };
    boxes.forEach((box, at) => {
      const number = measure(box.number, fonts.number);
      const title = measure(box.title, fonts.title);
      const header = number === undefined || title === undefined ? undefined : headerWidth(box, number, title);
      const layout = iconsLayoutOf(widths[at], header, box.icons);
      const side = layout === 'column' ? box.icons > 0 || box.deletable : box.deletable;
      box.element.classList.toggle('hs-icons-row', layout === 'row');
      box.element.classList.toggle('hs-icons-column', layout === 'column');
      box.element.classList.toggle('hs-no-side', !side);
      const end = headerEnd(layout, box.icons, side);
      box.header.style.paddingInlineEnd = end > 0 ? `${end}px` : '';
    });
  }

  private drawDialog(): void {
    const question = this.question;
    this.dialog.hidden = question === undefined;
    if (question === undefined) {
      reconcile(this.dialog, []);
      return;
    }
    if (this.dialog.firstElementChild?.getAttribute('data-seq') === String(question.seq)) return;
    reconcile(this.dialog, [html('div', { class: 'hs-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'hs-dialog-title', 'aria-describedby': 'hs-dialog-message', 'data-seq': question.seq },
      html('h2', { id: 'hs-dialog-title', class: 'hs-dialog-title' }, icon(DELETE_ICON), question.title),
      html('p', { id: 'hs-dialog-message', class: 'hs-dialog-message' }, question.message),
      html('div', { class: 'hs-dialog-buttons' },
        html('button', { type: 'button', class: 'hs-dialog-button', 'data-action': 'confirm-no' }, 'Cancel'),
        html('button', { type: 'button', class: `hs-dialog-button hs-dialog-confirm${question.danger ? ' hs-danger' : ''}`, 'data-action': 'confirm-yes' }, question.confirmLabel)))]);
  }

  // ---- gestures ----

  private click(event: MouseEvent): void {
    const target = event.target as Element;
    const action = target.closest<HTMLElement>('[data-action]');
    if (action) {
      if (action instanceof HTMLButtonElement && action.disabled) return;
      this.act(action.dataset.action ?? '', action.dataset.id ?? '', action);
      return;
    }
    const box = target.closest<HTMLElement>('.hs-box');
    if (box?.dataset.id !== undefined && this.page.contains(box)) this.select(box.dataset.id);
  }

  private act(action: string, id: string, element: HTMLElement): void {
    const node = this.index.byId.get(id);
    switch (action) {
      case 'fold':
        if (node) this.run(node.gestures.fold, id);
        return;
      case 'focus':
        this.setFocus(id, false);
        return;
      case 'hidden':
        this.setFocus(id, this.fit() < 2);
        return;
      case 'describe':
        this.openField(id, 'description');
        return;
      case 'delete':
        if (node) this.run(node.gestures.remove, id);
        return;
      case 'add': {
        const gesture = element.dataset.gesture;
        if (gesture === 'page') this.run(this.view?.pageGestures.addLevel, undefined);
        else if (node && (gesture === 'addEntry' || gesture === 'addLevel')) this.run(node.gestures[gesture], id);
        return;
      }
      case 'trail':
        this.setFocus(id, false);
        return;
      case 'finding':
        this.reveal(id);
        return;
      case 'help':
        this.helpOpen = !this.helpOpen;
        this.render();
        return;
      case 'conflict-show':
        // The text typed is dropped; the page already shows the file as it is.
        if (this.field) this.field.done = true;
        this.closeField();
        return;
      case 'conflict-keep':
        this.conflict = false;
        this.render();
        this.field?.element.focus();
        return;
      case 'confirm-yes':
      case 'confirm-no':
        this.answer(action === 'confirm-yes');
        return;
      default:
        return;
    }
  }

  private doubleClick(event: MouseEvent): void {
    const edit = (event.target as Element).closest<HTMLElement>('[data-edit]');
    if (edit?.dataset.id === undefined) return;
    this.openField(edit.dataset.id, edit.dataset.edit === 'description' ? 'description' : 'title');
  }

  private key(event: KeyboardEvent): void {
    if (this.question !== undefined) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.answer(false);
      }
      return;
    }
    if (event.key === 'Escape' && this.press?.dragging) {
      this.endDrag(undefined);
      return;
    }
    // A field keeps its own keys, Enter and Delete among them.
    if (isTyping(event.target)) return;
    if (event.key === 'Escape' && this.helpOpen) {
      this.helpOpen = false;
      this.render();
      return;
    }
    const node = this.index.byId.get(this.selected);
    if (node === undefined || this.readOnly) return;
    const gestures = node.gestures;
    if (event.key === 'Delete') {
      event.preventDefault();
      this.run(gestures.remove, node.id);
    } else if (event.key === 'F2') {
      event.preventDefault();
      this.openField(node.id, 'title');
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (event.shiftKey) {
        if (node.role === 'level') this.run(gestures.addEntry, node.id);
      } else {
        this.run(node.role === 'level' ? gestures.addLevelBelow : gestures.addEntryBelow, node.id);
      }
    }
  }

  private answer(confirmed: boolean): void {
    const question = this.question;
    if (question === undefined) return;
    this.question = undefined;
    this.send({ v: 2, type: 'confirmed', seq: question.seq, confirmed });
    this.render();
    this.page.focus();
  }

  private select(id: string, tell = true): void {
    if (id === this.selected) return;
    this.selected = id;
    if (tell) this.send({ v: 2, type: 'selection', ids: id === '' ? [] : [id] });
    this.render();
  }

  /** Narrows the page to a level, or to what is inside it, or widens it to the whole page: a view option, never written. */
  private setFocus(id: string, inside: boolean): void {
    this.focus = { id, inside: id !== '' && inside };
    const query = this.view?.applied?.query;
    this.send({ v: 2, type: 'viewOptions', options: { ...(query === undefined ? {} : { query }), ...(id === '' ? {} : { focus: id }) } });
    this.render();
  }

  /**
   * Shows a node: the focus that keeps it in sight, every collapsed level above it expanded by its
   * fold, selected and scrolled to.
   */
  private reveal(id: string): void {
    const plan = revealOf(this.index, id, this.focus.inside ? '' : this.focus.id, this.fit());
    if (plan === undefined) return;
    if (plan.focus !== this.focus.id || this.focus.inside) this.setFocus(plan.focus, false);
    for (const level of plan.expand) this.run(level.gestures.fold, level.id);
    this.revealing = id;
    if (this.selected === id) this.render();
    else this.select(id);
  }

  /** Asks for the operation a gesture runs, on a node or on the document; a gesture that is not enabled says why. */
  private run(gesture: HierarchyGestureState | undefined, on: string | undefined, args: Readonly<Record<string, TableValue>> = {}): void {
    if (gesture === undefined) return;
    if (!gesture.enabled) {
      if (gesture.reason !== undefined) this.status.textContent = gesture.reason;
      return;
    }
    this.request({ kind: 'operation', operation: gesture.operation, ...(on === undefined ? {} : { on: [on] }), ...(Object.keys(args).length > 0 ? { args } : {}) });
  }

  private request(request: HierarchyRequest): void {
    this.seq += 1;
    this.status.textContent = '';
    this.send({ v: 2, type: 'edit', seq: this.seq, request, version: this.version });
  }

  // ---- typing in place ----

  /** Opens a node's title or description for typing, in place of its text. */
  private openField(id: string, attribute: TextAttribute): void {
    const node = this.index.byId.get(id);
    const gesture = attribute === 'title' ? node?.gestures.rename : node?.gestures.describe;
    if (node === undefined || gesture === undefined || !gesture.enabled || this.readOnly) return;
    if (this.field?.nodeId === id && this.field.attribute === attribute) {
      this.field.element.focus();
      return;
    }
    if (this.field) this.commitField();
    const element = html('textarea', {
      class: `hs-field hs-field-inplace ${attribute === 'title' ? 'hs-field-title' : 'hs-field-multiline'}`, rows: 1,
      'aria-label': `${attribute === 'title' ? 'Title' : 'Description'} of ${numberOf(node) || node.title}`,
    });
    element.value = attribute === 'title' ? node.title : node.descriptionText;
    const field: OpenField = { nodeId: id, attribute, element, gesture, done: false };
    element.addEventListener('input', () => {
      // A title is one line however it wraps: a line break typed or pasted into it is taken out.
      if (attribute === 'title' && /[\r\n]/.test(element.value)) {
        const at = element.selectionStart;
        element.value = element.value.replace(/\r?\n|\r/g, ' ');
        element.setSelectionRange(at, at);
      }
      this.fitField(element);
    });
    element.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        field.done = true;
        this.closeField();
      } else if (event.key === 'Enter' && (attribute === 'title' || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.commitField();
      }
    });
    element.addEventListener('blur', (event) => {
      if (this.rendering || field.done || this.field !== field) return;
      const to = event.relatedTarget instanceof Element ? event.relatedTarget : null;
      if (to?.closest('.hs-conflict, .hs-dialog') || to === element) return;
      this.commitField();
    });
    element.addEventListener('click', (event) => event.stopPropagation());
    element.addEventListener('dblclick', (event) => event.stopPropagation());
    element.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.field = field;
    this.conflict = false;
    if (this.selected !== id) this.select(id);
    else this.render();
    element.focus();
    element.select();
    this.fitField(element);
  }

  /** As high as its text wraps to, as the text it replaced was. */
  private fitField(element: HTMLTextAreaElement): void {
    element.style.height = 'auto';
    if (element.scrollHeight > 0) element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
  }

  /** Keeps what was typed: an edit, unless it is the text the node already has. */
  private commitField(): void {
    const field = this.field;
    if (field === undefined) return;
    field.done = true;
    this.closeField();
    const node = this.index.byId.get(field.nodeId);
    const text = field.element.value;
    if (node !== undefined && (field.attribute === 'title' ? node.title : node.descriptionText) === text) return;
    // A node the file no longer has is still asked for: refusing it is the file's to say.
    const gesture = (field.attribute === 'title' ? node?.gestures.rename : node?.gestures.describe) ?? field.gesture;
    const param = Object.values(gesture.params)[0];
    this.run(gesture, field.nodeId, param === undefined ? {} : { [param]: text });
  }

  private closeField(): void {
    const field = this.field;
    if (field === undefined) return;
    const focused = document.activeElement === field.element;
    this.field = undefined;
    this.conflict = false;
    this.render();
    if (focused) this.page.focus();
  }

  // ---- dragging ----

  private pointerDown(event: MouseEvent): void {
    const grip = (event.target as Element).closest<HTMLElement>('[data-grip]');
    if (grip === null || event.button !== 0 || this.readOnly) return;
    event.preventDefault();
    const id = grip.dataset.grip ?? '';
    this.press = { id, x: event.clientX, y: event.clientY, dragging: false };
    const move = (moved: MouseEvent): void => this.pointerMove(moved);
    const up = (released: MouseEvent): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.pointerUp(released);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** What a drop at the pointer would do: the drop shown stays while the pointer is over the place it is drawn at. */
  private dropAt(x: number, y: number): DropHint | undefined | 'slot' {
    const press = this.press;
    const dragged = press === undefined ? undefined : this.index.byId.get(press.id);
    if (dragged === undefined) return undefined;
    const under = document.elementFromPoint?.(x, y) ?? null;
    if (under?.closest('.hs-drop-slot')) return 'slot';
    const box = under?.closest<HTMLElement>('.hs-box[data-id]');
    const over = box?.dataset.id === undefined ? undefined : this.index.byId.get(box.dataset.id);
    if (box === null || box === undefined || over === undefined) return undefined;
    const bounds = box.getBoundingClientRect();
    const drop = dropOf(this.index, dragged, over, y >= bounds.top + bounds.height / 2);
    if (drop === undefined) return undefined;
    return { over: over.id, kind: drop.into === over.id ? 'into' : drop.after === over.id ? 'after' : 'before', dragged, drop };
  }

  private pointerMove(event: MouseEvent): void {
    const press = this.press;
    if (press === undefined) return;
    if (!press.dragging && Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_START) return;
    press.dragging = true;
    const found = this.dropAt(event.clientX, event.clientY);
    if (found === 'slot') return;
    const same = JSON.stringify([found?.over, found?.kind, found?.drop]) === JSON.stringify([this.hint?.over, this.hint?.kind, this.hint?.drop]);
    this.hint = found;
    if (!same) this.render();
  }

  private pointerUp(event: MouseEvent): void {
    const press = this.press;
    if (press === undefined) return;
    if (!press.dragging) {
      this.press = undefined;
      return;
    }
    const found = this.dropAt(event.clientX, event.clientY);
    this.endDrag(found === 'slot' ? this.hint : found);
  }

  /** Ends a drag, and moves the dragged node where it was dropped, with everything in it, as the operation its move gesture runs. */
  private endDrag(hint: DropHint | undefined): void {
    this.press = undefined;
    this.hint = undefined;
    this.render();
    if (hint === undefined) return;
    const gesture = hint.dragged.gestures.move;
    if (gesture === undefined) return;
    const args: Record<string, TableValue> = {};
    if (gesture.params.into !== undefined && hint.drop.into !== '') args[gesture.params.into] = hint.drop.into;
    if (gesture.params.after !== undefined && hint.drop.after !== '') args[gesture.params.after] = hint.drop.after;
    this.run(gesture, hint.dragged.id, args);
  }
}

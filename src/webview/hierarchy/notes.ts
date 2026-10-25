import type { HierarchyGestureState, HierarchyNode, HierarchyNote, HierarchySegment, HierarchyView } from '../../core/tool/hierarchyView';
import type { TableValue } from '../../core/tool/tableView';
import { html } from '../diagram/dom';
import { icon } from '../diagram/icons';
import { placePopup } from './searchList';

// The list of a box's notes, as the standalone host draws it after its #695 and #696 (its
// `NoteList.tsx`): opened from the icon at the box's top right, standing over every pane in the
// window rather than inside the page that would cut it off, each note with its kind's icon, what it
// is about, its text and its detail, resolved ones too; each resolved or reopened, changed, or
// removed by the icons beside it, which say what the definition calls them; and a new one added at
// the bottom, its kind above a text field three lines high and the Add below them at the right.
// Every gesture is the operation the view names for it, sent as it is made; what the file then says
// is the list's next content. Escape, wherever the focus is, or a press outside closes it.

const RESOLVE_ICON = 'mdi-check-circle-outline';
const REOPEN_ICON = 'mdi-restore';
const CHANGE_ICON = 'mdi-pencil-outline';
const REMOVE_ICON = 'mdi-delete-outline';
/** The icon of a kind that has none of its own, and of several notes. */
export const SEVERAL_NOTES_ICON = 'mdi-comment-multiple-outline';
/** The icon at a box's top right while no open note is about it: the way to add the first. */
export const ADD_NOTE_ICON = 'mdi-comment-plus-outline';

type Kinds = HierarchyView['noteKinds'];
type Run = (gesture: HierarchyGestureState | undefined, on: string | undefined, args?: Readonly<Record<string, TableValue>>) => void;

/** The fields a note is changed in. */
interface ChangeFields {
  readonly text: HTMLTextAreaElement;
  readonly detail: HTMLTextAreaElement;
}

interface Draft {
  kind: string;
  text: string;
  detail: string;
}

/** What the list shows: the node of the box, the notes the box stands for, the kinds a note may be of and the words of the operations. */
export interface NoteListContent {
  readonly node: HierarchyNode;
  readonly notes: readonly HierarchyNote[];
  readonly kinds: Kinds;
  readonly readOnly: boolean;
  readonly operations: HierarchyView['operations'];
}

/** The words a gesture is shown with: what the definition calls its operation for what it is made on. */
export const wordOf = (gesture: HierarchyGestureState | undefined, operations: HierarchyView['operations'], fallback: string): string =>
  gesture === undefined ? fallback : gesture.label ?? operations[gesture.operation]?.label ?? fallback;

export class NoteList {
  readonly element = html('div', { class: 'hs-note-list', role: 'dialog' });
  private content: NoteListContent | undefined;
  /** The note being changed: what is typed, and its fields, kept from one drawing to the next. */
  private changing: { readonly noteId: string; draft: Draft; fields?: ChangeFields } | undefined;
  private readonly adding: Draft = { kind: '', text: '', detail: '' };
  private readonly newText = html('textarea', { class: 'hs-field hs-note-text-field', rows: 3 });
  private readonly onPress = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node) || this.element.contains(target)) return;
    // The icon that opened the list toggles it itself.
    if (target instanceof Element && target.closest('.hs-note-mark, .hs-note-add')) return;
    this.close();
  };
  private readonly onEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    this.escape();
  };

  constructor(private readonly run: Run, private readonly close: () => void) {
    // The list keeps its keys: Delete or Enter typed here is not the page's delete or add.
    this.element.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        this.escape();
      }
    });
    for (const name of ['click', 'dblclick', 'pointerdown'] as const) this.element.addEventListener(name, (event) => event.stopPropagation());
    this.newText.addEventListener('input', () => {
      this.newText.value = this.newText.value.replace(/\r?\n/g, ' ');
      this.adding.text = this.newText.value;
      this.drawButtons();
    });
    this.newText.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.add();
      }
    });
    document.addEventListener('pointerdown', this.onPress, true);
    document.addEventListener('keydown', this.onEscape);
  }

  get nodeId(): string | undefined {
    return this.content?.node.id;
  }

  dispose(): void {
    document.removeEventListener('pointerdown', this.onPress, true);
    document.removeEventListener('keydown', this.onEscape);
    this.element.remove();
  }

  /** Escape drops a change being typed, and otherwise closes the list. */
  private escape(): void {
    if (this.changing !== undefined) {
      this.changing = undefined;
      this.draw();
      return;
    }
    this.close();
  }

  /** Shows the list's content, keeping what is being typed. */
  show(content: NoteListContent): void {
    this.content = content;
    if (this.adding.kind === '' || !content.kinds.some((kind) => kind.key === this.adding.kind)) this.adding.kind = content.kinds[0]?.key ?? '';
    if (this.changing && !content.notes.some((note) => note.id === this.changing!.noteId)) this.changing = undefined;
    this.draw();
  }

  /** Under the box's icons, its right edge on theirs, kept in the window. */
  place(anchor: Element): void {
    placePopup(this.element, anchor, true);
  }

  focusNew(): void {
    this.newText.focus();
  }

  private number(): string {
    const node = this.content!.node;
    return node.shownId ?? node.title;
  }

  private addGesture(): HierarchyGestureState | undefined {
    const gesture = this.content?.node.gestures.addNote;
    return gesture?.enabled ? gesture : undefined;
  }

  private draw(): void {
    const content = this.content;
    if (content === undefined) return;
    // A field kept from the drawing before keeps the focus, its caret and its text: taken before
    // it is moved into the rows built below, which takes the focus from it.
    const focused = document.activeElement;
    const typing = focused instanceof HTMLTextAreaElement && this.element.contains(focused)
      ? { field: focused, start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection }
      : undefined;
    const number = this.number();
    const add = this.addGesture();
    this.element.setAttribute('aria-label', `${content.notes.length === 1 ? 'Note' : 'Notes'} of ${number}`);
    const list = html('ul', { class: 'hs-notes' }, ...content.notes.map((note) => this.noteView(note)));
    const parts: Node[] = [list];
    if (!content.readOnly && add !== undefined) {
      const word = wordOf(add, content.operations, 'Add');
      this.newText.setAttribute('aria-label', `${word} about ${number}`);
      this.newText.placeholder = word;
      if (this.newText.value !== this.adding.text) this.newText.value = this.adding.text;
      parts.push(html('div', { class: 'hs-note-new' },
        this.kindChoice(content.kinds, this.adding.kind, `Kind of the new one about ${number}`, (kind) => {
          this.adding.kind = kind;
          this.draw();
        }),
        this.newText,
        html('div', { class: 'hs-note-buttons' }, this.button('Add', 'hs-dialog-confirm hs-note-add-button', () => this.add(), this.adding.text.trim() === ''))));
    }
    this.element.replaceChildren(...parts);
    if (typing?.field.isConnected && document.activeElement !== typing.field) {
      typing.field.focus();
      typing.field.setSelectionRange(typing.start, typing.end, typing.direction ?? undefined);
    }
    // Rows are measured once they stand in the page: a note of several lines takes its controls beside it.
    for (const row of list.querySelectorAll<HTMLElement>('.hs-note')) {
      const body = row.querySelector<HTMLElement>('.hs-note-body');
      if (!body) continue;
      const line = Number.parseFloat(getComputedStyle(body).lineHeight) || 20;
      row.classList.toggle('hs-note-tall', body.getBoundingClientRect().height > line * 1.5);
    }
  }

  private drawButtons(): void {
    const button = this.element.querySelector<HTMLButtonElement>('.hs-note-add-button');
    if (button) button.disabled = this.adding.text.trim() === '';
  }

  private button(text: string, extra: string, act: () => void, disabled = false): HTMLButtonElement {
    const button = html('button', { type: 'button', class: `hs-dialog-button hs-note-button ${extra}` }, text);
    button.disabled = disabled;
    button.addEventListener('click', act);
    return button;
  }

  private kindOf(key: string): Kinds[number] | undefined {
    return this.content?.kinds.find((kind) => kind.key === key);
  }

  private noteView(note: HierarchyNote): HTMLElement {
    const content = this.content!;
    if (this.changing?.noteId === note.id) return this.changeView(note, this.changing.draft);
    const head = html('div', { class: 'hs-note-head' },
      html('span', { class: 'hs-note-kind', role: 'img', 'aria-label': note.kindLabel, title: note.kindLabel }, icon(note.icon ?? SEVERAL_NOTES_ICON)),
      html('span', { class: 'hs-number' }, note.about),
      html('span', { class: 'hs-note-text' }, ...note.text.map(textOf)));
    const body = html('div', { class: 'hs-note-body' }, head, note.detailRaw === '' ? undefined : html('p', { class: 'hs-note-detail' }, ...note.detail.map(textOf)));
    const { resolve, change, remove } = note.gestures;
    const actions = content.readOnly ? [] : [
      resolve?.enabled ? this.action(note.resolved ? REOPEN_ICON : RESOLVE_ICON, wordOf(resolve, content.operations, note.resolved ? 'Reopen' : 'Resolve'), () => this.run(resolve, note.id)) : undefined,
      change?.enabled ? this.action(CHANGE_ICON, wordOf(change, content.operations, 'Change'), () => {
        this.changing = { noteId: note.id, draft: { kind: note.kind, text: note.textRaw, detail: note.detailRaw } };
        this.draw();
        this.element.querySelector<HTMLTextAreaElement>('.hs-note-changing .hs-note-text-field')?.focus();
      }) : undefined,
      remove?.enabled ? this.action(REMOVE_ICON, wordOf(remove, content.operations, 'Remove'), () => this.run(remove, note.id)) : undefined,
    ].filter((action): action is HTMLButtonElement => action !== undefined);
    return html('li', { class: `hs-note${note.resolved ? ' hs-note-resolved' : ''}`, 'data-note': note.id },
      body, actions.length === 0 ? undefined : html('div', { class: 'hs-note-actions' }, ...actions));
  }

  private changeView(note: HierarchyNote, draft: Draft): HTMLElement {
    const content = this.content!;
    const gesture = note.gestures.change;
    const { text, detail } = this.changeFields(draft);
    text.setAttribute('aria-label', `Text about ${note.about}`);
    detail.setAttribute('aria-label', `Detail about ${note.about}`);
    const save = this.button(wordOf(gesture, content.operations, 'Change'), 'hs-dialog-confirm hs-note-save', () => this.save(), draft.text.trim() === '');
    return html('li', { class: 'hs-note hs-note-changing', 'data-note': note.id },
      this.kindChoice(content.kinds, draft.kind, `Kind of ${note.about}`, (kind) => {
        draft.kind = kind;
        this.draw();
      }),
      text, detail,
      html('div', { class: 'hs-note-buttons' }, this.button('Cancel', '', () => {
        this.changing = undefined;
        this.draw();
      }), save));
  }

  /** The fields of the note being changed, made once when its change starts: every drawing after puts the same ones back. */
  private changeFields(draft: Draft): ChangeFields {
    const changing = this.changing!;
    if (changing.fields) return changing.fields;
    const text = html('textarea', { class: 'hs-field hs-note-text-field', rows: 3 });
    text.value = draft.text;
    const detail = html('textarea', { class: 'hs-field hs-field-multiline hs-note-detail-field', rows: 2 });
    detail.value = draft.detail;
    text.addEventListener('input', () => {
      text.value = text.value.replace(/\r?\n/g, ' ');
      draft.text = text.value;
      const save = text.closest('.hs-note-changing')?.querySelector<HTMLButtonElement>('.hs-note-save');
      if (save) save.disabled = draft.text.trim() === '';
    });
    text.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.save();
      }
    });
    detail.addEventListener('input', () => {
      draft.detail = detail.value;
    });
    changing.fields = { text, detail };
    return changing.fields;
  }

  private action(name: string, label: string, act: () => void): HTMLButtonElement {
    const button = html('button', { type: 'button', class: 'hs-note-action', 'aria-label': label, title: label }, icon(name));
    button.addEventListener('click', act);
    return button;
  }

  /** A new note about the node, of the kind chosen, with the text typed: the operation the node's add gesture runs. */
  private add(): void {
    const gesture = this.addGesture();
    const node = this.content?.node;
    if (gesture === undefined || node === undefined || this.adding.text.trim() === '') return;
    const args: Record<string, TableValue> = {};
    if (gesture.params.kind !== undefined) args[gesture.params.kind] = this.adding.kind;
    if (gesture.params.text !== undefined) args[gesture.params.text] = this.adding.text;
    this.run(gesture, node.id, args);
    this.adding.text = '';
    this.newText.value = '';
    this.drawButtons();
  }

  private save(): void {
    const changing = this.changing;
    if (changing === undefined || changing.draft.text.trim() === '') return;
    const note = this.content?.notes.find((candidate) => candidate.id === changing.noteId);
    const gesture = note?.gestures.change;
    if (gesture === undefined) return;
    const args: Record<string, TableValue> = {};
    const { draft } = changing;
    if (gesture.params.kind !== undefined) args[gesture.params.kind] = draft.kind;
    if (gesture.params.text !== undefined) args[gesture.params.text] = draft.text;
    if (gesture.params.detail !== undefined) args[gesture.params.detail] = draft.detail;
    this.changing = undefined;
    this.run(gesture, changing.noteId, args);
    this.draw();
  }

  /** The kind of a note, each with its icon to its left: a button that opens the kinds, chosen by a click or by keys. */
  private kindChoice(kinds: Kinds, value: string, label: string, change: (kind: string) => void): HTMLElement {
    const chosen = this.kindOf(value);
    const button = html('button', {
      type: 'button', role: 'combobox', class: 'hs-field hs-kind-button', 'aria-label': label, 'aria-haspopup': 'listbox', 'aria-expanded': 'false',
    }, icon(chosen?.icon ?? SEVERAL_NOTES_ICON), html('span', { class: 'hs-kind-name' }, chosen?.label ?? value), icon('mdi-chevron-down'));
    const list = html('ul', { class: 'hs-kind-list', role: 'listbox', 'aria-label': label, hidden: '' });
    const wrapper = html('div', { class: 'hs-kind' }, button, list);
    let active = Math.max(0, kinds.findIndex((kind) => kind.key === value));
    const open = (shown: boolean): void => {
      list.hidden = !shown;
      button.setAttribute('aria-expanded', String(shown));
      if (shown) drawList();
    };
    const choose = (key: string | undefined): void => {
      open(false);
      if (key !== undefined && key !== value) change(key);
    };
    const drawList = (): void => {
      list.replaceChildren(...kinds.map((kind, at) => {
        const option = html('li', { role: 'option', 'aria-selected': String(kind.key === value), class: `hs-kind-option${at === active ? ' hs-kind-active' : ''}`, 'data-kind': kind.key },
          icon(kind.icon ?? SEVERAL_NOTES_ICON), html('span', {}, kind.label));
        option.addEventListener('pointerenter', () => {
          active = at;
          drawList();
        });
        option.addEventListener('click', () => choose(kind.key));
        return option;
      }));
    };
    button.addEventListener('click', () => {
      active = Math.max(0, kinds.findIndex((kind) => kind.key === value));
      open(list.hidden);
    });
    wrapper.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (list.hidden) {
          active = Math.max(0, kinds.findIndex((kind) => kind.key === value));
          open(true);
          return;
        }
        active = (active + (event.key === 'ArrowDown' ? 1 : -1) + kinds.length) % kinds.length;
        drawList();
      } else if (!list.hidden && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        choose(kinds[active]?.key);
      } else if (!list.hidden && event.key === 'Escape') {
        // Closes the kinds only, not the list around them.
        event.preventDefault();
        event.stopPropagation();
        open(false);
      }
    });
    return wrapper;
  }
}

const textOf = (part: HierarchySegment): string => part.text;

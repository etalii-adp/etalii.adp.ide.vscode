import type { HierarchyGestureState, HierarchyList, HierarchyMember, HierarchyNode, HierarchyView } from '../../core/tool/hierarchyView';
import type { TableValue } from '../../core/tool/tableView';
import { html } from '../diagram/dom';
import { icon } from '../diagram/icons';
import { placePopup, SearchList } from './searchList';

// A label's values on a box and its list, as the standalone host changes them (its `TagField.tsx`,
// `ClassificationPicker.tsx` and `listEditing.ts`): a label of several values opens its searchable
// list from its values or the control in the box's header, where a member is picked, picked again to
// take it off, or created from text that names none; a label of one value opens its list from its
// value, or on the selected box from the way to give one, where a member is picked or the value
// cleared. From either the list itself is edited: each member renamed, recoloured, put in its place
// and deleted, and a new one added where the view names how. Every change is one gesture, the
// operation the view names for it, sent as it is made; what the file then says is the next view.

type Run = (gesture: HierarchyGestureState | undefined, on: string | undefined, args?: Readonly<Record<string, TableValue>>) => void;

/** How a label's values look, so that labels side by side tell apart (DESL's surface names no look). */
export type LabelLook = 'tag' | 'badge' | 'status';

/**
 * The look of a label: a label of several values is a rounded tag; a label of one value is a square
 * badge where the word of a filter for it is a word, `category:`, and a rounded status with a dot where
 * it is a sign, `@`.
 */
export function lookOf(list: Pick<HierarchyList, 'many' | 'prefix'>): LabelLook {
  if (list.many) return 'tag';
  return /[\p{L}\p{N}]/u.test(list.prefix) ? 'badge' : 'status';
}

/** The sign a tag is written with, as a filter names its values: the label's prefix where it is a sign. */
export const signOf = (list: Pick<HierarchyList, 'prefix'>): string | undefined => (list.prefix !== '' && !/[\p{L}\p{N}]/u.test(list.prefix) ? list.prefix : undefined);

/** Whether the page changes a label's values: a label of several values by adding and removing, one of one value by setting. */
export function editable(list: HierarchyList, readOnly: boolean): boolean {
  if (readOnly) return false;
  return list.many ? list.gestures.add?.enabled === true && list.gestures.remove?.enabled === true : list.gestures.set?.enabled === true;
}

const lower = (text: string): string => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

/** The values of a label a node carries, as written. */
export const valuesOf = (node: HierarchyNode, label: string): string[] => node.labels.filter((value) => value.label === label).map((value) => value.name);

/** The argument a gesture gives its one parameter, or the parameter of a part. */
const argsOf = (gesture: HierarchyGestureState | undefined, part: string | undefined, value: TableValue): Record<string, TableValue> => {
  const param = part === undefined ? Object.values(gesture?.params ?? {})[0] : gesture?.params[part];
  return param === undefined ? {} : { [param]: value };
};

/** Popups that stand over every pane: closed by a press outside them and by Escape. */
abstract class Popup {
  readonly element: HTMLElement;
  private readonly onPress = (event: Event): void => {
    const target = event.target;
    if (target instanceof Node && !this.element.contains(target) && !(target instanceof Element && target.closest(this.opener))) this.close();
  };

  protected constructor(className: string, protected readonly close: () => void, private readonly opener: string) {
    this.element = html('div', { class: className, role: 'dialog' });
    // The popup keeps its keys: Delete or Enter typed here is not the page's delete or add.
    this.element.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
    for (const name of ['click', 'dblclick', 'pointerdown'] as const) this.element.addEventListener(name, (event) => event.stopPropagation());
    document.addEventListener('pointerdown', this.onPress, true);
  }

  dispose(): void {
    document.removeEventListener('pointerdown', this.onPress, true);
    this.element.remove();
  }

  place(anchor: Element): void {
    placePopup(this.element, anchor);
  }
}

/**
 * The list a label's values open on one box: for a label of several values the values it carries,
 * each with its remove, above the list where a member is picked, picked again to take it off, or
 * created; for one of one value the list where a member is picked, and its clear; and for both the
 * way to edit the list.
 */
export class LabelField extends Popup {
  private readonly search: SearchList;
  private readonly chosen = html('div', { class: 'hs-tag-chosen' });
  private readonly clear = html('button', { type: 'button', class: 'hs-pick-clear' });
  private readonly editList = html('button', { type: 'button', class: 'hs-tag-edit-list' });
  private node: HierarchyNode;
  private list: HierarchyList;
  private operations: HierarchyView['operations'];

  constructor(node: HierarchyNode, list: HierarchyList, operations: HierarchyView['operations'], private readonly run: Run, close: () => void, private readonly edit: () => void) {
    super(`hs-label-list ${list.many ? 'hs-tag-list' : 'hs-pick-list'}`, close, '.hs-label-open');
    this.node = node;
    this.list = list;
    this.operations = operations;
    const number = node.shownId ?? node.title;
    this.search = new SearchList({
      label: list.many ? `${this.word(list.gestures.add, `Add ${list.name.toLowerCase()}`)} to ${number}` : `${list.name} of ${number}`,
      placeholder: list.many ? 'Search or create…' : 'Search…',
      pick: (id) => this.pick(id),
      ...(list.many ? { create: (text: string) => this.run(this.list.gestures.add, this.node.id, argsOf(this.list.gestures.add, 'value', text)) } : {}),
      close: () => this.close(),
    });
    this.clear.addEventListener('click', () => {
      this.close();
      this.run(this.list.gestures.clear, this.node.id);
    });
    this.editList.addEventListener('click', () => this.edit());
    this.element.append(...(list.many ? [this.chosen] : []), this.search.element, ...(list.many ? [] : [this.clear]), this.editList);
    this.show(node, list, operations);
  }

  get key(): string {
    return `${this.node.id}\u0000${this.list.label}`;
  }

  get nodeId(): string {
    return this.node.id;
  }

  get label(): string {
    return this.list.label;
  }

  focus(): void {
    this.search.field.focus();
  }

  private word(gesture: HierarchyGestureState | undefined, fallback: string): string {
    return gesture?.label ?? (gesture === undefined ? undefined : this.operations[gesture.operation]?.label) ?? fallback;
  }

  /** Shows the label's list for the node as the view has them now, keeping what is typed. */
  show(node: HierarchyNode, list: HierarchyList, operations: HierarchyView['operations']): void {
    this.node = node;
    this.list = list;
    this.operations = operations;
    const number = node.shownId ?? node.title;
    const values = valuesOf(node, list.label);
    const carries = (member: HierarchyMember): boolean => values.some((value) => lower(value) === lower(member.name));
    this.element.setAttribute('aria-label', `${list.name} of ${number}`);
    this.search.show(list.members.map((member) => ({ id: member.id, label: member.name })), list.members.filter(carries).map((member) => member.id));
    if (list.many) {
      const remove = list.gestures.remove;
      const word = this.word(remove, 'Remove');
      this.chosen.hidden = values.length === 0;
      this.chosen.replaceChildren(...values.map((value) => {
        const button = html('button', { type: 'button', class: 'hs-tag-remove', 'aria-label': `${word} ${value}`, title: word }, icon('mdi-close'));
        button.addEventListener('click', () => this.run(remove, node.id, argsOf(remove, 'value', value)));
        return html('span', { class: 'hs-tag-chosen-value' }, labelElement(list, value, list.members.find((member) => lower(member.name) === lower(value))), button);
      }));
    } else {
      this.clear.hidden = values.length === 0 || list.gestures.clear?.enabled !== true;
      this.clear.replaceChildren(icon('mdi-close'), html('span', {}, this.word(list.gestures.clear, 'Clear')));
    }
    this.editList.replaceChildren(icon('mdi-pencil-outline'), html('span', {}, `Edit ${pluralOf(list.name).toLowerCase()}`));
  }

  private pick(id: string): void {
    const member = this.list.members.find((candidate) => candidate.id === id);
    if (member === undefined) return;
    const values = valuesOf(this.node, this.list.label);
    if (this.list.many) {
      const held = values.find((value) => lower(value) === lower(member.name));
      if (held === undefined) this.run(this.list.gestures.add, this.node.id, argsOf(this.list.gestures.add, 'value', member.name));
      else this.run(this.list.gestures.remove, this.node.id, argsOf(this.list.gestures.remove, 'value', held));
      return;
    }
    this.close();
    if (values.length === 0 || lower(values[0]) !== lower(member.name)) this.run(this.list.gestures.set, this.node.id, argsOf(this.list.gestures.set, 'member', member.id));
  }
}

/**
 * A label's list, edited: each member renamed, recoloured, moved up or down and deleted, and a new
 * one added where the view names how. A name is kept when its field is left or Enter is pressed, not
 * on every key. A delete that concerns anything asks first, in the definition's words.
 */
export class ListEditor extends Popup {
  private list: HierarchyList;
  private readonly lines = html('ul', { class: 'hs-list-lines' });
  private readonly adding = html('input', { type: 'text', class: 'hs-field hs-list-new', placeholder: 'Add…' });
  private readonly addRow: HTMLElement;

  constructor(list: HierarchyList, private readonly run: Run, close: () => void) {
    super('hs-list-editor', close, '.hs-tag-edit-list');
    this.list = list;
    const add = html('button', { type: 'button', class: 'hs-dialog-button hs-dialog-confirm hs-list-add' }, 'Add');
    add.addEventListener('click', () => this.add());
    this.adding.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.add();
      }
    });
    this.adding.addEventListener('input', () => {
      add.disabled = this.adding.value.trim() === '';
    });
    add.disabled = true;
    this.addRow = html('div', { class: 'hs-list-add-row' }, this.adding, add);
    this.element.append(this.lines, this.addRow);
    this.show(list);
  }

  get label(): string {
    return this.list.label;
  }

  focus(): void {
    (this.lines.querySelector<HTMLInputElement>('input') ?? this.adding).focus();
  }

  show(list: HierarchyList): void {
    this.list = list;
    this.element.setAttribute('aria-label', pluralOf(list.name));
    this.lines.setAttribute('aria-label', pluralOf(list.name));
    this.addRow.hidden = list.add?.enabled !== true;
    this.adding.setAttribute('aria-label', `New ${list.name.toLowerCase()}`);
    // A line whose name is being typed is kept, so the typing goes on.
    const typing = document.activeElement instanceof HTMLInputElement && this.lines.contains(document.activeElement) ? document.activeElement : undefined;
    const typingId = typing?.closest<HTMLElement>('[data-member]')?.dataset.member;
    this.redrawing = true;
    try {
      this.lines.replaceChildren(...list.members.map((member, index) => this.line(member, index, typingId === member.id ? typing : undefined)));
    } finally {
      this.redrawing = false;
    }
    if (typing?.isConnected && document.activeElement !== typing) typing.focus();
  }

  /** Whether the lines are being drawn again: a name field that loses the focus meanwhile is not left. */
  private redrawing = false;

  private line(member: HierarchyMember, index: number, typing: HTMLInputElement | undefined): HTMLElement {
    const { rename, recolour, move, remove } = member.gestures;
    const count = this.list.members.length;
    const name = typing ?? html('input', { type: 'text', class: 'hs-field hs-list-name', 'aria-label': `Name of ${member.name}` });
    if (!typing) name.value = member.name;
    name.readOnly = rename?.enabled !== true;
    const commit = (): void => {
      if (this.redrawing) return;
      const next = name.value.trim();
      if (next === '' || next === member.name) {
        name.value = member.name;
        return;
      }
      this.run(rename, member.id, argsOf(rename, undefined, next));
    };
    name.onblur = commit;
    name.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      }
    };
    const colour = html('select', { class: 'hs-list-colour', 'aria-label': `Colour of ${member.name}` },
      ...this.list.colours.map((candidate) => html('option', { value: candidate.key }, candidate.label)));
    colour.value = member.colourKey ?? this.list.colours[0]?.key ?? '';
    colour.disabled = recolour?.enabled !== true;
    colour.addEventListener('change', () => this.run(recolour, member.id, argsOf(recolour, undefined, colour.value)));
    const button = (iconName: string, label: string, enabled: boolean, act: () => void): HTMLButtonElement => {
      const made = html('button', { type: 'button', class: 'hs-list-button', 'aria-label': label, title: label }, icon(iconName));
      made.disabled = !enabled;
      made.addEventListener('click', act);
      return made;
    };
    const moveTo = (to: number): void => {
      // A place in the list is the member it goes after, among those that stay where they are; first, none.
      const others = this.list.members.filter((candidate) => candidate.id !== member.id);
      const after = to === 0 ? undefined : others[to - 1]?.id;
      this.run(move, member.id, after === undefined ? {} : argsOf(move, 'after', after));
    };
    const movable = move?.enabled === true;
    const line = html('li', { class: 'hs-list-line', 'data-member': member.id },
      html('span', { class: 'hs-list-look' }, labelElement(this.list, member.name, member)),
      name, colour,
      button('mdi-chevron-up', `Move ${member.name} up`, movable && index > 0, () => moveTo(index - 1)),
      button('mdi-chevron-down', `Move ${member.name} down`, movable && index < count - 1, () => moveTo(index + 1)),
      button('mdi-trash-can-outline', `${remove?.label ?? 'Delete'} ${member.name}`, remove?.enabled === true, () => this.run(remove, member.id)));
    // Alt+Up and Alt+Down move the member wherever in its line the focus is, as its buttons do.
    line.addEventListener('keydown', (event) => {
      const by = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey ? (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0) : 0;
      if (by === 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (movable && index + by >= 0 && index + by < count) moveTo(index + by);
    });
    return line;
  }

  private add(): void {
    const name = this.adding.value.trim();
    const add = this.list.add;
    if (name === '' || add === undefined) return;
    this.run(add, undefined, argsOf(add, 'name', name));
    this.adding.value = '';
    this.addRow.querySelector<HTMLButtonElement>('button')!.disabled = true;
  }
}

/** One value of a label in the label's look, in its member's colour. */
export function labelElement(list: HierarchyList, value: string, member: Pick<HierarchyMember, 'colourKey' | 'colour' | 'implied'> | undefined, light = true): HTMLElement {
  const sign = lookOf(list) === 'tag' ? signOf(list) : undefined;
  const element = html('span', {
    class: `hs-label hs-look-${lookOf(list)}${member?.implied ? ' hs-label-implied' : ''}`, 'data-label': list.label, 'data-colour': member?.colourKey ?? 'default', title: `${list.name}: ${value}`,
    // The sign is drawn before the value, and is not part of its text.
    'data-sign': sign,
  }, value);
  if (member?.colour) element.style.setProperty('--hs-label-colour', light ? member.colour.light : member.colour.dark);
  return element;
}

/** What a list of members of a type is called: the type's name made plural as English makes most. */
export const pluralOf = (name: string): string => (/(s|x|ch|sh)$/i.test(name) ? `${name}es` : /[^aeiou]y$/i.test(name) ? `${name.slice(0, -1)}ies` : `${name}s`);

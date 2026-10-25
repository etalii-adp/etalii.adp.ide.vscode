import * as vscode from 'vscode';
import type { EditRequest, ViewOptions } from '../core/frame/toolType';
import { viewTypeOf } from '../core/frame/toolType';
import { keepAsText } from './opening';
import { PropertiesView } from './propertiesView';
import { entriesOf, ToolboxView } from './toolboxView';
import type { OpenTool, Tools } from './toolEditor';
import type { Scene } from '../core/scene/scene';
import type { HierarchyRequest } from '../core/tool/hierarchyView';
import type { TableRequest } from '../core/tool/tableView';
import type { AnyToolType } from './toolTypes';

/** The commands the plug-in adds, all in the category "ADP". */
export function registerCommands(context: vscode.ExtensionContext, tools: Tools, types: readonly AnyToolType[]): void {
  const register = (command: string, run: (...args: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(command, run));
  };

  // Carries out a request on the active diagram and shows a refusal where the user is working.
  const perform = async (active: OpenTool, request: EditRequest): Promise<void> => {
    const performed = await tools.perform(active, request);
    if (performed.result === 'refused') active.post({ v: 2, type: 'outcome', seq: 0, ...performed });
  };

  // A command runs the action the diagram type offers for the selection; which one is found by
  // what the type says about it, so a command means the same in every diagram type.
  const runAction = (command: string, pick: { shortcut?: string; label?: RegExp }, onDiagram = false, onPage?: string): void => {
    register(command, async () => {
      const active = tools.active;
      // On a page of boxes the page moves its selected box, as its own keys do, by the move a drag makes.
      if (onPage !== undefined && active?.type.kind === 'designer' && active.type.page === 'hierarchy') {
        active.post({ v: 2, type: 'command', command: onPage });
        return;
      }
      // These commands are the canvas's: a designer's operations are run from its table.
      if (!active || active.type.kind !== 'diagram' || active.readOnly || active.lastView?.readOnly) return;
      const selection = onDiagram ? [] : active.selection;
      const action = active.type.actions(active.source, selection, active.options)
        .find((candidate) => (pick.shortcut !== undefined && candidate.shortcut === pick.shortcut) || (pick.label !== undefined && pick.label.test(candidate.label)));
      if (!action) return;
      if (!action.enabled) {
        if (action.disabledReason) active.post({ v: 2, type: 'outcome', seq: 0, result: 'refused', sentence: action.disabledReason });
        return;
      }
      await perform(active, { kind: 'action', action: action.id, ...(selection[0] !== undefined ? { id: selection[0] } : {}) });
    });
  };

  runAction('etalii.adp.rename', { shortcut: 'F2' });
  runAction('etalii.adp.remove', { shortcut: 'Delete' });
  runAction('etalii.adp.evenPhases', { label: /^Even phases$/ });
  runAction('etalii.adp.moveEarlier', { shortcut: 'Alt+Up' }, false, 'moveEarlier');
  runAction('etalii.adp.moveLater', { shortcut: 'Alt+Down' }, false, 'moveLater');
  runAction('etalii.adp.arrangeDiagram', { label: /^Arrange diagram$/ }, true);

  // Undo and Redo of a change that touched the registration alone, such as a row dragged or a
  // diagram arranged. Their shortcuts are bound to these only while such a step is next in line;
  // run when none is, they are the platform's own Undo and Redo.
  register('etalii.adp.undoLayout', async () => {
    if (!(await tools.stepLayout('undo'))) await vscode.commands.executeCommand('undo');
  });
  register('etalii.adp.redoLayout', async () => {
    if (!(await tools.stepLayout('redo'))) await vscode.commands.executeCommand('redo');
  });

  register('etalii.adp.toggleCompact', () => tools.active?.post({ v: 2, type: 'command', command: 'toggleCompact' }));
  register('etalii.adp.focusProperties', () => vscode.commands.executeCommand(`${PropertiesView.viewId}.focus`));
  register('etalii.adp.focusToolbox', () => vscode.commands.executeCommand(`${ToolboxView.viewId}.focus`));

  register('etalii.adp.openAsText', async (uri?: unknown) => {
    const target = uri instanceof vscode.Uri ? uri : tools.active?.document.uri;
    if (!target) return;
    // The choice holds for the session: the file is not reopened in a tool that claims it.
    keepAsText(target);
    await vscode.commands.executeCommand('vscode.openWith', target, 'default', vscode.ViewColumn.Beside);
  });

  // A "New ..." command for a tool type: a new file of that type, with what the definition gives a
  // new document, opened in its tool. And an "Open as ..." command for a type whose extension is
  // shared, since such a file may be one only by choice. Which of the two a type has is the
  // manifest's to say, which `scripts/sync-definitions.mjs` writes from the definitions: exactly the
  // commands it contributes are registered, so the two cannot disagree.
  const manifest = context.extension.packageJSON as { contributes?: { commands?: { command: string }[] } };
  const contributed = new Set((manifest.contributes?.commands ?? []).map((entry) => entry.command));
  for (const type of types) {
    const name = type.origin.replace('/', '.');
    if (contributed.has(`etalii.adp.openAs.${name}`)) {
      register(`etalii.adp.openAs.${name}`, async (uri?: unknown) => {
        const target = uri instanceof vscode.Uri ? uri : vscode.window.activeTextEditor?.document.uri;
        if (target) await vscode.commands.executeCommand('vscode.openWith', target, viewTypeOf(type));
      });
    }
    if (!contributed.has(`etalii.adp.new.${name}`)) continue;
    const extensions = type.claims.flatMap((claim) => claim.extensions);
    register(`etalii.adp.new.${name}`, async () => {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
      const target = await vscode.window.showSaveDialog({
        title: `New ${type.displayName}`,
        filters: { [type.displayName]: extensions },
        ...(folder ? { defaultUri: vscode.Uri.joinPath(folder, `untitled.${extensions[0]}`) } : {}),
      });
      if (!target) return;
      const fileName = target.path.slice(target.path.lastIndexOf('/') + 1);
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(type.newDocument(fileName)));
      await vscode.commands.executeCommand('vscode.openWith', target, viewTypeOf(type));
    });
  }

  // Under test, the canvas's two ends are reachable without a pointer: what it was last sent, and
  // an edit request made as it would make one (etalii.adp spec 006, contracts/frame.md). What a
  // diagram was sent is its `scene`, and `view` says the same of it in the words the tests of spec
  // 006 read: each node as an element with its top-left, its type in lower case and the text an
  // edit in place opens with, and each edge as a relation.
  if (process.env.ADP_TEST) {
    const elementsOf = (scene: Scene): unknown => ({
      elements: scene.nodes.map((node) => ({
        id: node.id, type: node.type.toLowerCase(), ...node.box,
        label: (node.labels.find((label) => label.editable !== false) ?? node.labels[0])?.editText ?? '',
      })),
      relations: scene.edges.map((edge) => ({ id: edge.id, type: edge.type.toLowerCase(), from: edge.source, to: edge.target })),
      readOnly: scene.readOnly === true, ...(scene.notice === undefined ? {} : { notice: scene.notice }),
    });
    register('etalii.adp.test.state', () => {
      const active = tools.active;
      if (!active) return undefined;
      const sent = active.lastView;
      return {
        ...(sent === undefined ? {} : 'nodes' in sent ? { scene: sent, view: elementsOf(sent) } : 'roots' in sent ? { hierarchy: sent } : { table: sent }),
        kind: active.type.kind, cause: active.lastCause, options: active.options, fields: active.fields(), selection: active.selection, version: active.document.version, origin: active.type.origin,
        actions: active.type.actions(active.source, active.selection, active.options),
      };
    });
    // With a `seq`, a question the edit asks is asked in the page, as for a request the page made.
    register('etalii.adp.test.edit', async (request: unknown, seq: unknown) => {
      const active = tools.active;
      return active ? tools.perform(active, request as EditRequest | TableRequest | HierarchyRequest, undefined, typeof seq === 'number' ? seq : undefined) : undefined;
    });
    register('etalii.adp.test.toolbox', () => entriesOf(tools.active));
    // The options a canvas or a page sends, as it sends them: a filter typed, a level narrowed to.
    register('etalii.adp.test.viewOptions', (options: unknown) => {
      const active = tools.active;
      if (active) tools.setOptions(active, options as ViewOptions);
    });
    register('etalii.adp.test.layoutSteps', () => ({ undo: tools.layoutStepNext('undo'), redo: tools.layoutStepNext('redo') }));
    register('etalii.adp.test.select', (ids: unknown) => {
      const active = tools.active;
      if (!active) return;
      active.selection = ids as string[];
      tools.refresh(active);
    });
  }
}

import * as vscode from 'vscode';
import type { DiagramType, EditRequest } from '../core/frame/diagramType';
import { viewTypeOf } from '../core/frame/diagramType';
import type { Diagrams, OpenDiagram } from './diagramEditor';
import { PropertiesView } from './propertiesView';

/** The commands the plug-in adds, all in the category "ADP". */
export function registerCommands(context: vscode.ExtensionContext, diagrams: Diagrams, types: readonly DiagramType[]): void {
  const register = (command: string, run: (...args: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(command, run));
  };

  // Carries out a request on the active diagram and shows a refusal where the user is working.
  const perform = async (active: OpenDiagram, request: EditRequest): Promise<void> => {
    const performed = await diagrams.perform(active, request);
    if (performed.result === 'refused') active.post({ v: 1, type: 'outcome', seq: 0, ...performed });
  };

  // A command runs the action the diagram type offers for the selection; which one is found by
  // what the type says about it, so a command means the same in every diagram type.
  const runAction = (command: string, pick: { shortcut?: string; label?: RegExp }, onDiagram = false): void => {
    register(command, async () => {
      const active = diagrams.active;
      if (!active || active.readOnly) return;
      const selection = onDiagram ? [] : active.selection;
      const action = active.type.actions(active.source, selection)
        .find((candidate) => (pick.shortcut !== undefined && candidate.shortcut === pick.shortcut) || (pick.label !== undefined && pick.label.test(candidate.label)));
      if (!action) return;
      if (!action.enabled) {
        if (action.disabledReason) active.post({ v: 1, type: 'outcome', seq: 0, result: 'refused', sentence: action.disabledReason });
        return;
      }
      await perform(active, { kind: 'action', action: action.id, ...(selection[0] !== undefined ? { id: selection[0] } : {}) });
    });
  };

  runAction('etalii.adp.rename', { shortcut: 'F2' });
  runAction('etalii.adp.remove', { shortcut: 'Delete' });
  runAction('etalii.adp.evenPhases', { label: /^Even phases$/ });
  runAction('etalii.adp.moveEarlier', { shortcut: 'Alt+Up' });
  runAction('etalii.adp.moveLater', { shortcut: 'Alt+Down' });
  runAction('etalii.adp.arrangeDiagram', { label: /^Arrange diagram$/ }, true);

  register('etalii.adp.toggleCompact', () => diagrams.active?.post({ v: 1, type: 'command', command: 'toggleCompact' }));
  register('etalii.adp.focusProperties', () => vscode.commands.executeCommand(`${PropertiesView.viewId}.focus`));

  register('etalii.adp.openAsText', async (uri?: unknown) => {
    const target = uri instanceof vscode.Uri ? uri : diagrams.active?.document.uri;
    if (target) await vscode.commands.executeCommand('vscode.openWith', target, 'default', vscode.ViewColumn.Beside);
  });

  // One "New ..." command per diagram type that owns its extension: a new file of that type,
  // with what the definition gives a new document, opened in its diagram.
  for (const type of types) {
    if (type.shared) continue;
    register(`etalii.adp.new.${type.origin.replace('/', '.')}`, async () => {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
      const target = await vscode.window.showSaveDialog({
        title: `New ${type.displayName}`,
        filters: { [type.displayName]: [...type.extensions] },
        ...(folder ? { defaultUri: vscode.Uri.joinPath(folder, `untitled.${type.extensions[0]}`) } : {}),
      });
      if (!target) return;
      const name = target.path.slice(target.path.lastIndexOf('/') + 1);
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(type.newDocument(name)));
      await vscode.commands.executeCommand('vscode.openWith', target, viewTypeOf(type));
    });
  }

  // Under test, the canvas's two ends are reachable without a pointer: what it was last sent, and
  // an edit request made as it would make one (etalii.adp spec 006, contracts/frame.md).
  if (process.env.ADP_TEST) {
    register('etalii.adp.test.state', () => {
      const active = diagrams.active;
      return active ? { view: active.lastView, fields: active.fields(), selection: active.selection, version: active.document.version, origin: active.type.origin } : undefined;
    });
    register('etalii.adp.test.edit', async (request: unknown) => {
      const active = diagrams.active;
      return active ? diagrams.perform(active, request as EditRequest) : undefined;
    });
    register('etalii.adp.test.select', (ids: unknown) => {
      const active = diagrams.active;
      if (!active) return;
      active.selection = ids as string[];
      diagrams.refresh(active);
    });
  }
}

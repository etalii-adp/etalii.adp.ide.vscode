import * as vscode from 'vscode';
import type { DiagramType, EditRequest } from '../core/frame/diagramType';
import { viewTypeOf } from '../core/frame/diagramType';
import type { Diagrams } from './diagramEditor';

/** The commands the plug-in adds, all in the category "ADP". */
export function registerCommands(context: vscode.ExtensionContext, diagrams: Diagrams, types: readonly DiagramType[]): void {
  const register = (command: string, run: (...args: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(command, run));
  };

  register('etalii.adp.openAsText', async (uri?: unknown) => {
    const target = uri instanceof vscode.Uri ? uri : diagrams.active?.document.uri;
    if (target) await vscode.commands.executeCommand('vscode.openWith', target, 'default', vscode.ViewColumn.Beside);
  });

  // One "New ..." command per diagram type that owns its extension: an untitled document of that
  // type, opened in its diagram, which Visual Studio Code asks to be saved like any other.
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
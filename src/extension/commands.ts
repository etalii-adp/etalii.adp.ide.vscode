import * as vscode from 'vscode';
import type { EditRequest, ViewOptions } from '../core/frame/toolType';
import { viewTypeOf } from '../core/frame/toolType';
import { exportCommand, exportContext, exportingOf, lastExport, writeExport } from './exports';
import { registerLlmInstructions } from './llmInstructions';
import { keepAsText } from './opening';
import { PropertiesView } from './propertiesView';
import { entriesOf, ToolboxView } from './toolboxView';
import { registrationUriOf, type OpenTool, type Tools } from './toolEditor';
import type { Scene } from '../core/scene/scene';
import type { HierarchyRequest } from '../core/tool/hierarchyView';
import type { SectionsRequest } from '../core/tool/sectionsView';
import type { TableRequest } from '../core/tool/tableView';
import type { AnyToolType } from './toolTypes';
import { folderOfResource, newToolChoices, type NewToolChoice } from './newTool';
import { untitledName } from './untitledName';

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

  // Adds an element with no point to place it at: the toolbox's entry, as an action on the selection, which the
  // definition places, asking what its form asks (etalii.adp spec 088, FR-014). Of several entries the user picks one.
  register('etalii.adp.addNode', async () => {
    const active = tools.active;
    if (!active || active.type.kind !== 'diagram' || active.readOnly || active.lastView?.readOnly) return;
    const entries = active.type.toolbox(active.source);
    const entry = entries.length <= 1 ? entries[0] : (await vscode.window.showQuickPick(entries.map((candidate) => ({ label: candidate.label, detail: candidate.description, entry: candidate })), { title: 'Add node' }))?.entry;
    if (!entry) return;
    const selected = active.selection[0];
    await perform(active, { kind: 'action', action: entry.id, ...(selected !== undefined ? { id: selected } : {}) });
  });

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
    // Given a file, as a test gives one, it makes that file without asking where.
    register(`etalii.adp.new.${name}`, async (uri?: unknown) => {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
      const offered = folder && !(uri instanceof vscode.Uri) ? await untitledName(extensions[0], (name) => exists(vscode.Uri.joinPath(folder, name))) : undefined;
      const target = uri instanceof vscode.Uri ? uri : await vscode.window.showSaveDialog({
        title: `New ${type.displayName}`,
        filters: { [type.displayName]: extensions },
        ...(folder && offered ? { defaultUri: vscode.Uri.joinPath(folder, offered) } : {}),
      });
      if (!target) return;
      const fileName = target.path.slice(target.path.lastIndexOf('/') + 1);
      const text = type.newDocument(fileName);
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(text));
      // A tool type that keeps its view data only in a registration it does not create, or that claims a file only when
      // it is registered, gets one with the new document, so that its first change is kept and it opens in its tool again.
      // One already there is the user's and is left as it is.
      const registration = type.newRegistration(text, fileName);
      const registrationUri = registrationUriOf(target);
      if (registration !== undefined && !(await exists(registrationUri))) await vscode.workspace.fs.writeFile(registrationUri, new TextEncoder().encode(registration));
      await vscode.commands.executeCommand('vscode.openWith', target, viewTypeOf(type));
      // A new document begins from the ADP Toolbox and ADP Properties, so their side bar is shown beside it, and the focus
      // goes back to the tool, where its keys work.
      await vscode.commands.executeCommand(`${ToolboxView.viewId}.focus`);
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    });
  }

  // "New ADP Tool…" in the Explorer's context menu: which tool, then its name, and the document is made in the folder
  // that was right-clicked by that tool's own "New ..." command, given the file so it asks nothing more.
  const choices = newToolChoices(types.flatMap((type) => {
    const command = `etalii.adp.new.${type.origin.replace('/', '.')}`;
    const extension = type.claims.flatMap((claim) => claim.extensions)[0];
    return contributed.has(command) && extension !== undefined ? [{ displayName: type.displayName, command, extension }] : [];
  }));
  register('etalii.adp.newTool', async (uri?: unknown) => {
    const resource = uri instanceof vscode.Uri ? uri : vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!resource) return;
    const isFolder = uri instanceof vscode.Uri ? ((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.Directory) !== 0 : true;
    const folder = resource.with({ path: folderOfResource(resource.path, isFolder) });
    const choice = await vscode.window.showQuickPick<vscode.QuickPickItem & { choice: NewToolChoice }>(
      choices.map((entry) => ({ label: entry.label, description: `.${entry.extension}`, choice: entry })), { title: 'New ADP Tool', placeHolder: 'Which tool?' });
    if (!choice) return;
    const offered = await untitledName(choice.choice.extension, (name) => exists(vscode.Uri.joinPath(folder, name)));
    const name = await vscode.window.showInputBox({
      title: `New ${choice.label}`, prompt: 'File name', value: offered, valueSelection: [0, offered.length - choice.choice.extension.length - 1],
      validateInput: async (value) => (value.trim() === '' ? 'Give the file a name.' : (await exists(vscode.Uri.joinPath(folder, value.trim()))) ? `${value.trim()} is already there.` : undefined),
    });
    if (!name) return;
    await vscode.commands.executeCommand(choice.choice.command, vscode.Uri.joinPath(folder, name.trim()));
  });

  registerLlmInstructions(context, contributed);

  // An export of a tool type (etalii.adp spec 082, research R5): one command for each export the tool types carry,
  // reached from the Command Palette, the Explorer, an editor's tab and the ADP menu of its title bar alike. The
  // manifest contributes it and the menus offer it for the extensions in its context key, which says which files'
  // tool types offer it. It exports the file it is invoked on, else the active editor's: as the editor of a tool
  // open on it holds it, unsaved edits and the positions it shows included; else the file's text as open or saved.
  const exportIds = [...new Set(types.flatMap((type) => (type.exports ?? []).map((offer) => offer.id)))];
  for (const id of exportIds) {
    const extensions = types.filter((type) => (type.exports ?? []).some((offer) => offer.id === id)).flatMap((type) => type.claims.filter((claim) => !claim.registrationOnly).flatMap((claim) => claim.extensions.map((extension) => `.${extension}`)));
    void vscode.commands.executeCommand('setContext', exportContext(id), extensions);
    if (!contributed.has(exportCommand(id))) continue;
    register(exportCommand(id), async (uri?: unknown) => {
      const target = uri instanceof vscode.Uri ? uri : tools.active?.document.uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) return;
      const open = tools.editorOn(target);
      const exporting = open ? { type: open.type, uri: target, source: open.source, options: open.options } : await exportingOf(target, types);
      if (!exporting || !(exporting.type.exports ?? []).some((offer) => offer.id === id)) return;
      await writeExport(exporting, id);
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
        uri: active.document.uri.toString(), kind: active.type.kind, cause: active.lastCause, options: active.options, fields: active.fields(), selection: active.selection, version: active.document.version, origin: active.type.origin,
        actions: active.type.actions(active.source, active.selection, active.options),
      };
    });
    // With a `seq`, a question the edit asks is asked in the page, as for a request the page made.
    register('etalii.adp.test.edit', async (request: unknown, seq: unknown) => {
      const active = tools.active;
      return active ? tools.perform(active, request as EditRequest | TableRequest | HierarchyRequest | SectionsRequest, undefined, typeof seq === 'number' ? seq : undefined) : undefined;
    });
    register('etalii.adp.test.toolbox', () => entriesOf(tools.active));
    register('etalii.adp.test.lastExport', () => ({ uri: lastExport.uri?.toString(), opened: lastExport.opened }));
    // The options a canvas or a page sends, as it sends them: a filter typed, a level narrowed to.
    register('etalii.adp.test.viewOptions', (options: unknown) => {
      const active = tools.active;
      if (active) tools.setOptions(active, options as ViewOptions);
    });
    // An operation's input boxes, answered in order from a script: each says what it asked, and what its
    // validation said of every value the script tries before the answer it gives (undefined cancels).
    const asked: { title?: string; prompt?: string; value?: string; tried: Record<string, string | undefined> }[] = [];
    register('etalii.adp.test.inputBoxes', (script: unknown) => {
      const answers = [...(script as { try?: string[]; answer?: string }[])];
      asked.length = 0;
      tools.inputBox = async (options) => {
        const next = answers.shift();
        const tried: Record<string, string | undefined> = {};
        for (const value of next?.try ?? []) {
          const said = await options.validateInput?.(value);
          tried[value] = typeof said === 'string' ? said : undefined;
        }
        asked.push({ title: options.title, prompt: options.prompt, value: options.value, tried });
        return next?.answer;
      };
      return asked;
    });
    register('etalii.adp.test.inputBoxesAsked', () => asked);
    // The lookup and the backlinks: each quick pick answered by the label of the item to pick (undefined cancels), and what it offered kept.
    const offered: { title?: string; items: { label: string; description?: string; detail?: string }[] }[] = [];
    register('etalii.adp.test.quickPicks', (script: unknown) => {
      const answers = [...(script as (string | undefined)[])];
      offered.length = 0;
      tools.quickPick = async (items, options) => {
        offered.push({ title: options.title, items: items.map((item) => ({ label: item.label, description: item.description, detail: item.detail })) });
        const answer = answers.shift();
        return items.find((item) => item.label === answer);
      };
      return offered;
    });
    register('etalii.adp.test.quickPicksOffered', () => offered);
    register('etalii.adp.test.layoutSteps', () => ({ undo: tools.layoutStepNext('undo'), redo: tools.layoutStepNext('redo') }));
    register('etalii.adp.test.select', (ids: unknown) => {
      const active = tools.active;
      if (!active) return;
      active.selection = ids as string[];
      tools.refresh(active);
    });
  }
}

/** Whether a file or folder is at `uri`. */
async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

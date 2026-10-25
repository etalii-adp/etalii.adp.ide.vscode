import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';

/** A file of the copy of the examples and fixtures the tests run on. */
export function example(...parts: string[]): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'the tests run with the copied examples as their workspace folder');
  return vscode.Uri.file(path.join(folder.uri.fsPath, ...parts));
}

/** Waits until a condition holds, or fails saying what it waited for. */
export async function until<T>(what: string, check: () => T | undefined | Promise<T | undefined>, timeout = 20000): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value !== undefined && value !== false) return value;
    if (Date.now() > deadline) assert.fail(`Timed out waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** A level or an entry of a hierarchy view. */
export interface HierarchyNode {
  id: string;
  title: string;
  collapsed: boolean;
  entries: HierarchyNode[];
  levels: HierarchyNode[];
}

export interface State {
  view?: { elements: { id: string; type: string; x: number; y: number; width: number; label: string }[]; relations: { id: string }[]; readOnly: boolean; notice?: string };
  /** What a tool type read from its definition was last sent: a scene, as `src/core/scene/scene.ts` has it. */
  scene?: { nodes: { id: string; fold?: 'folded' | 'unfolded'; labels: { text: string }[] }[]; edges: { id: string }[]; readOnly?: boolean; notice?: string };
  /** What a designer was last sent: a table view, as `src/core/tool/tableView.ts` has it. */
  table?: { name: string; readOnly: boolean; properties: { id: string; name: string }[]; rows: { id: string; title: string }[]; views: { id: string; name: string; active: boolean }[] };
  /** What a designer of the `hierarchy` kind was last sent: a hierarchy view, as `src/core/tool/hierarchyView.ts` has it. */
  hierarchy?: {
    name: string; readOnly: boolean; notice?: string; roots: HierarchyNode[]; stray: HierarchyNode[];
    notes: { id: string; aboutId?: string; textRaw: string; resolved: boolean }[];
    lists: { label: string; gestures: Partial<Record<'add' | 'remove' | 'set' | 'clear', { operation: string; params: Record<string, string> }>> }[];
    applied?: { query: string; shown: number; total: number };
    widths: { id: string; level: string; width: number }[];
  };
  /** What the tool type offers for the selection. */
  actions?: { id: string; label: string; enabled: boolean; disabledReason?: string }[];
  kind: 'diagram' | 'designer';
  /** What change of the document the last view sent followed: an edit of the editor's own, or one made outside it. */
  cause?: 'edit' | 'outside';
  /** The view options the editor holds: what the canvas sent, and the folds of this viewer. */
  options: { collapsed?: Record<string, boolean> };
  fields: { id: string; label: string; value: string }[];
  selection: string[];
  version: number;
  origin: string;
}

/** What the active diagram's canvas was last sent. */
export async function state(): Promise<State | undefined> {
  return vscode.commands.executeCommand<State | undefined>('etalii.adp.test.state');
}

/** The active diagram once its canvas has been sent a view of this version or later. */
export async function drawn(sinceVersion = 0): Promise<State> {
  return until('the diagram to be drawn', async () => {
    const current = await state();
    return (current?.view ?? current?.scene ?? current?.table ?? current?.hierarchy) && current.version >= sinceVersion ? current : undefined;
  });
}

export async function closeAll(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
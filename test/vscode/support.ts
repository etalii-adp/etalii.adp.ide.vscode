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

export interface State {
  view?: { elements: { id: string; type: string; x: number; y: number; width: number; label: string }[]; relations: { id: string }[]; readOnly: boolean; notice?: string };
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
    return current?.view && current.version >= sinceVersion ? current : undefined;
  });
}

export async function closeAll(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
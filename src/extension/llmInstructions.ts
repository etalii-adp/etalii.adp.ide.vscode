import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

/** The file a definition folder holds its tool type's LLM instructions in, as `scripts/sync-definitions.mjs` copies it. */
const instructionsFile = 'llm-instructions.md';

/** A tool type's instructions for an LLM that writes its documents: the folder they are in and the bytes. */
interface Instructions {
  readonly folder: string;
  readonly origin: string;
  readonly label: string;
  readonly bytes: Uint8Array;
}

/** The LLM instructions of every folder of `definitions/` in the plug-in's install folder that has them. */
function instructionsAt(extensionPath: string): readonly Instructions[] {
  const root = path.join(extensionPath, 'definitions');
  if (!fs.existsSync(root)) return [];
  const found: Instructions[] = [];
  for (const folder of fs.readdirSync(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const at = path.join(root, folder.name);
    const specification = fs.readdirSync(at).find((file) => /\.(dis|des)$/.test(file));
    if (specification === undefined || !fs.existsSync(path.join(at, instructionsFile))) continue;
    const { language } = JSON.parse(fs.readFileSync(path.join(at, specification), 'utf8')) as { language: { origin: string; label: string } };
    found.push({ folder: folder.name, origin: language.origin, label: language.label, bytes: fs.readFileSync(path.join(at, instructionsFile)) });
  }
  return found;
}

/**
 * An "Include ... LLM instructions" command for each tool type whose definition has them: it saves a copy of the
 * instructions where the user chooses and opens it. Exactly the commands the manifest contributes are registered.
 */
export function registerLlmInstructions(context: vscode.ExtensionContext, contributed: ReadonlySet<string>): void {
  for (const instructions of instructionsAt(context.extensionPath)) {
    const command = `etalii.adp.llmInstructions.${instructions.origin.replace('/', '.')}`;
    if (!contributed.has(command)) continue;
    // Given a file, as a test gives one, it writes that file without asking where.
    context.subscriptions.push(vscode.commands.registerCommand(command, async (uri?: unknown) => {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
      const target = uri instanceof vscode.Uri ? uri : await vscode.window.showSaveDialog({
        title: `Include ${instructions.label} LLM instructions`,
        saveLabel: 'Save instructions',
        filters: { Markdown: ['md'] },
        ...(folder ? { defaultUri: vscode.Uri.joinPath(folder, `${instructions.folder}.llm.md`) } : {}),
      });
      if (!target) return;
      await vscode.workspace.fs.writeFile(target, instructions.bytes);
      await vscode.window.showTextDocument(target);
    }));
  }
}

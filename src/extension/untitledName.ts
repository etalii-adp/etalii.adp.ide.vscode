/**
 * The name a new document is first offered under: `untitled.<extension>`, or the first of `untitled-2`, `untitled-3`
 * and so on that is not taken, so that a second new document never offers to overwrite the first (vscode #131).
 */
export async function untitledName(extension: string, taken: (name: string) => Promise<boolean>): Promise<string> {
  for (let number = 1; ; number += 1) {
    const name = `untitled${number === 1 ? '' : `-${number}`}.${extension}`;
    if (!(await taken(name))) return name;
  }
}

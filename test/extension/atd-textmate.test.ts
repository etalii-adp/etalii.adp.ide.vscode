// The TextMate grammar Visual Studio Code colours `.atd` files with, against the ADP tool language's lexer (etalii.adp
// spec 035, T110, FR-052): every example the walk ships is tokenized with syntaxes/atd.tmLanguage.json as Visual Studio
// Code tokenizes it (vscode-textmate over vscode-oniguruma), and each token the server's lexer reads, which its
// semantic tokens report by class, starts with a scope of that class. Comments, strings, numbers, operators,
// origins and capability ranges have one scope each; a name may also be a keyword's, since every keyword is usable as
// a name, or a setting's key where it stands before `:`.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as oniguruma from 'vscode-oniguruma';
import * as textmate from 'vscode-textmate';

const root = join(__dirname, '..', '..');
const walk = join(root, 'vendor', 'atd-walk');

interface WasmServer {
  handle(message: string): string;
}

const glue = createRequire(__filename)(join(root, 'vendor', 'atd-lsp', 'adp_atd_lsp.js')) as {
  WasmServer: { withFiles(read: (path: string) => string | null, list: (folder: string) => string[]): WasmServer };
};

/** The scopes a token of each semantic class may start with. */
const NAME = ['variable.', 'support.type.property-name.', 'keyword.other.', 'keyword.control.', 'entity.name.namespace.'];
const CLASSES: Record<string, string[]> = {
  comment: ['comment.'],
  string: ['string.'],
  number: ['constant.numeric.'],
  // A `.` inside a dotted setting key (`color.surface:`) is part of the key.
  operator: ['keyword.operator.', 'punctuation.', 'support.type.property-name.'],
  namespace: ['entity.name.namespace.'],
  keyword: ['keyword.control.', 'keyword.other.', 'constant.language.', 'support.type.property-name.'],
  macro: ['constant.other.capability-range.', ...NAME],
  type: NAME,
  property: [...NAME, 'variable.other.attribute-reference.'],
  function: NAME,
  variable: [...NAME, 'constant.language.', 'variable.other.token-reference.', 'variable.other.word.'],
  parameter: [...NAME, 'variable.parameter.'],
  enumMember: NAME,
};

async function grammar(): Promise<textmate.IGrammar> {
  const wasm = readFileSync(join(root, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm'));
  await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
      createOnigString: (text: string) => new oniguruma.OnigString(text),
    }),
    loadGrammar: async () =>
      textmate.parseRawGrammar(readFileSync(join(root, 'syntaxes', 'atd.tmLanguage.json'), 'utf8'), 'atd.tmLanguage.json'),
  });
  const loaded = await registry.loadGrammar('source.atd');
  if (!loaded) throw new Error('the grammar does not load');
  return loaded;
}

/** The innermost scope at each character of each line. */
function scopes(grammar: textmate.IGrammar, text: string): string[][] {
  let state = textmate.INITIAL;
  return text.split('\n').map((line) => {
    const result = grammar.tokenizeLine(line, state);
    state = result.ruleStack;
    const out: string[] = new Array(line.length).fill('');
    for (const token of result.tokens) {
      for (let i = token.startIndex; i < Math.min(token.endIndex, line.length); i++) out[i] = token.scopes[token.scopes.length - 1];
    }
    return out;
  });
}

/** The server's semantic tokens of a file, decoded: line, character, length and class. */
function tokens(file: string, text: string): { line: number; start: number; length: number; kind: string }[] {
  const server = glue.WasmServer.withFiles(
    (path) => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    },
    (folder) => readdirSync(folder).filter((n) => n.endsWith('.atd')).map((n) => join(folder, n)),
  );
  const send = (message: object): { result?: unknown }[] => JSON.parse(server.handle(JSON.stringify({ jsonrpc: '2.0', ...message })));
  const legend = (send({ id: 1, method: 'initialize', params: { capabilities: {} } })[0].result as {
    capabilities: { semanticTokensProvider: { legend: { tokenTypes: string[] } } };
  }).capabilities.semanticTokensProvider.legend.tokenTypes;
  const uri = `file://${file}`;
  send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'atd', version: 1, text } } });
  const data = (send({ id: 2, method: 'textDocument/semanticTokens/full', params: { textDocument: { uri } } })[0].result as { data: number[] }).data;
  const out = [];
  let line = 0;
  let start = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    if (data[i] > 0) {
      line += data[i];
      start = data[i + 1];
    } else {
      start += data[i + 1];
    }
    out.push({ line, start, length: data[i + 2], kind: legend[data[i + 3]] });
  }
  return out;
}

describe('the TextMate grammar of .atd', () => {
  const examples = readdirSync(walk).filter((name) => name.endsWith('.atd')).sort();

  it('ships with the walk', () => {
    expect(examples.length).toBeGreaterThanOrEqual(8);
  });

  for (const example of examples) {
    it(`gives each token of ${example} the scope of its class`, async () => {
      const file = join(walk, example);
      const text = readFileSync(file, 'utf8');
      const lines = scopes(await grammar(), text);
      const failures: string[] = [];
      const found = tokens(file, text);
      expect(found.length).toBeGreaterThan(50);
      for (const token of found) {
        const scope = lines[token.line]?.[token.start] ?? '';
        const allowed = CLASSES[token.kind] ?? [];
        if (!allowed.some((prefix) => scope.startsWith(prefix))) {
          const word = text.split('\n')[token.line].slice(token.start, token.start + token.length);
          failures.push(`${token.line + 1}:${token.start + 1} ${token.kind} ${JSON.stringify(word)} has ${scope || 'no scope'}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }
});

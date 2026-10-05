/** How a finding is rated; the definitions' own four severities. */
export type Severity = 'error' | 'warning' | 'information' | 'hint';

/** The result of evaluating a rule or of reading a document, located by its line (zero-based). */
export interface Finding {
  readonly rule: string;
  readonly severity: Severity;
  readonly message: string;
  readonly line: number;
}

/**
 * One diagram type as the frame sees it. A type is listed once in the extension's list of diagram
 * types and supplies nothing else to it; what it draws is its notation in the webview.
 */
export interface DiagramType {
  /** The tool type's origin, `<vendor>/<type>`, the same in every ADP host. */
  readonly origin: string;
  /** The one display name of the tool type. */
  readonly displayName: string;
  /** File extensions without the dot. */
  readonly extensions: readonly string[];
  /** True when the extension belongs to other tools too, so a file is this type only by choice. */
  readonly shared: boolean;
}

/** The identifier a diagram type registers under: `etalii.adp.<vendor>.<type>`. */
export function viewTypeOf(type: Pick<DiagramType, 'origin'>): string {
  return `etalii.adp.${type.origin.replace('/', '.')}`;
}
import { bodyOf, type FblBinding } from '../documents/types';
import type { FblFiles } from '../files/fblFiles';
import type { Finding } from '../finding';
import { FblModel, type FblOptions } from '../model';
import { readBody } from '../rules/bodyReading';
import { folderFiles, type FolderFile } from './folderSubject';

// Reading a folder subject (FBL 10.2, 10.3): file by file, in the ordinal order of the files'
// relative paths, each file a body of its own read in its file rule's family by the rules that name
// that file rule. A file that cannot be read is reported where it is and the rest is read, since a
// folder subject has no primary file. Writing a folder (FBL 10.4) is not built: it is read-only.

/** The model of a folder subject: every selected file's elements and findings, each finding at its file. */
export function readFolder(binding: FblBinding, folder: string, files: FblFiles, options: FblOptions = {}): FblModel {
  const elements: FblModel['elements'][number][] = [];
  const findings: Finding[] = [];
  for (const file of folderFiles(binding, folder, files)) {
    const bytes = files.read(file.fullPath);
    if (bytes === undefined) continue;
    const model = readBody(bytes, fileBinding(binding, file), { ...options, fileName: file.relativePath }).toModel();
    elements.push(...model.elements);
    findings.push(...model.findings.map((finding) => ({ ...finding, location: { ...finding.location, file: file.relativePath } })));
  }
  return new FblModel(elements, findings, false);
}

/** The binding one file of a folder is read with: a file body of its rule's family, and the rules that name that file rule. */
function fileBinding(binding: FblBinding, file: FolderFile): FblBinding {
  const reads = (rule: FblBinding['elements'][number]): boolean => rule.files.length === 0 || (file.rule.name !== undefined && rule.files.includes(file.rule.name));
  return {
    ...binding,
    body: bodyOf({ family: file.rule.family }),
    readOnly: binding.readOnly ?? '',
    elements: binding.elements.filter(reads),
    relations: binding.relations.filter(reads),
  };
}

<!--
Sync Impact Report
- Version: template → 1.0.0 (first ratification)
- Principles: I. Native Visual Studio Code Citizenship; II. The Text File Is the Source of Truth; III. One Frame, Many Tools; IV. Test-First, Against Real Files; V. Simplicity.
- Modelled on etalii.adp.ide.intellij's constitution 2.2.0, as etalii.adp spec 006-vscode-plugin (task T003, FR-060) asks.
- Templates: plan, spec and tasks templates unchanged; no follow-ups.
-->
# etalii.adp.ide.vscode Constitution

## Terminology

ADP's words are defined once, in the ADP glossary, `docs/terminology.md` in etalii.adp (https://github.com/etalii-adp/etalii.adp/blob/develop/docs/terminology.md). ADP offers **tools**, each of one kind: a **diagram**, a **designer** or an **editor**. Platform API names such as custom editors and webview views keep their names: an ADP tool is shown *in* a platform editor.

## Core Principles

### I. Native Visual Studio Code Citizenship (NON-NEGOTIABLE)

Every tool MUST open in a real editor of Visual Studio Code and MUST use the platform's own mechanism wherever the platform provides one, never a parallel one:

- Registration MUST go through the platform's custom editor registration for the files the tool handles, so that choosing an editor, the default editor and "Open With" behave exactly as for built-in editors.
- Every user-visible change MUST be an edit of the file's text document, so Edit > Undo and Redo, their shortcuts, the modified state, save, auto save, revert and restoring unsaved changes work unchanged.
- Findings MUST be diagnostics in the Problems panel; commands MUST be in the Command Palette under the category "ADP" with rebindable shortcuts; confirmations MUST be the platform's dialogs; colours MUST follow the colour theme, high contrast included.
- What the platform does not provide (a canvas, a toolbox, a property grid) is built once, for every tool.

Rationale: users adopt a tool only if it feels like part of their editor. Every re-implemented platform mechanism is a place where it behaves differently, and a maintenance burden.

### II. The Text File Is the Source of Truth

The tools edit text-based files; the file's text remains the single authoritative model.

- Opening and saving a file without edits MUST leave it byte-identical.
- An edit MUST change only the lines it concerns. Content, comments, ordering and formatting the tool does not understand MUST be preserved.
- The platform's text editor MUST stay available on the same document, sharing one undo history with the tool.
- A file the tool cannot fully interpret MUST still open, with a clear explanation, and never be silently rewritten or refused.

Rationale: these files live in version control and are shared with other tools, and often with an agent that reads them as instructions. A tool that reformats or drops content produces diffs nobody asked for and destroys trust.

### III. One Frame, Many Tools

Tool infrastructure (editor lifecycle, text and visual synchronisation, the canvas, the ADP Toolbox, ADP Properties, findings, commands) MUST be shared. Each tool type MUST be a self-contained part that supplies only what is specific to it.

- A tool type's behaviour MUST be what its definition in etalii.adp states; a difference is recorded in `docs/parity.md` or raised as a change to the definition there, never settled here.
- Adding a tool type MUST NOT require changing the frame or another tool type.
- The code that knows files, models, rules and edits (`src/core`) MUST NOT depend on Visual Studio Code or on a browser.

Rationale: the goal is many tools; the second one must cost a fraction of the first, and four hosts that each define a tool are four tools.

### IV. Test-First, Against Real Files

- Tests MUST be written before the behaviour they cover, and MUST be seen failing first.
- Every format MUST have round-trip tests (principle II) against the example documents and fixtures the ADP hosts share, vendored unchanged with their source recorded beside them.
- Editor registration, undo and redo, save and findings (principle I) MUST be covered by automated tests running the packaged plug-in in a real Visual Studio Code.
- A test that cannot run MUST be reported as skipped with its reason, never as passed.

Rationale: the failures that matter most here (lost content, broken undo, the wrong editor) are invisible in a quick manual try and obvious to users within a day.

### V. Simplicity

Start with the smallest tool that is genuinely useful, and grow it by specification. Features, abstractions and dependencies MUST be justified by a current requirement, not an anticipated one. When the platform already offers a capability, use it rather than adding a library.

Rationale: a small tool that honours principles I and II beats a large one that does not.

## Platform and Technology Constraints

- The deliverable is one installable Visual Studio Code extension, `etalii-adp-<version>.vsix`, targeting the Visual Studio Code release current at planning time, declared in `engines.vscode`.
- The plug-in MUST work with nothing else installed or running, and MUST perform no network access at runtime.
- The build MUST run headlessly from the command line (`npm`) and produce the same result as in the editor, including running all tests.
- ADP is licensed under Apache-2.0. Third-party dependencies MUST be Apache-2.0-compatible.
- Every webview MUST carry a content security policy that allows only the plug-in's own scripts and styles.

## Development Workflow

- Work follows GitHub Spec Kit: constitution, specify, (clarify), plan, tasks, implement. Specifications state *what* and *why* and stay free of implementation choices; plans state *how*. A feature that spans repositories may be specified in etalii.adp, as spec 006 is.
- Each feature is developed on its own branch, `features/<number>-<name>`, in its own worktree. The one exception is `claude/<name>`, which Claude's cloud sessions are handed by their harness.
- A feature reaches `develop`, the integration branch, only through a pull request merged with a merge commit. A feature branch is never merged locally into `develop`, and nothing is pushed to `develop` directly. When the pull request is merged or closed, the branch is deleted locally and on `origin`, and the worktree removed.
- Every plan MUST include a Constitution Check against these principles; any deviation MUST be recorded with its justification in the plan's complexity-tracking section.
- A change is mergeable only when the Build workflow's checks and the full test suite pass.

## Governance

This constitution supersedes other practices in this repository. Amendments are made through `/speckit-constitution`, recorded in version control, and versioned semantically: MAJOR for removing or redefining a principle, MINOR for adding a principle or materially expanding guidance, PATCH for clarifications. Reviews of plans and changes MUST verify compliance with the principles above; runtime guidance for agents lives in `CLAUDE.md`.

**Version**: 1.0.0 | **Ratified**: 2026-10-05 | **Last Amended**: 2026-10-05
# etalii.adp.ide.vscode

ADP designers for Visual Studio Code.

## How work is done here: spec-driven development (GitHub Spec Kit)

Every change starts as a specification. Use the Spec Kit skills in `.claude/skills/` in order:

1. `/speckit-constitution` — project principles, in `.specify/memory/constitution.md`. Read it before any other step; plans are checked against it.
2. `/speckit-specify` — a feature spec under `specs/NNN-feature-name/`, on its own `features/NNN-feature-name` branch (the `git` extension creates it).
3. `/speckit-clarify` — optional, resolves `[NEEDS CLARIFICATION]` markers before planning.
4. `/speckit-plan` — technical plan, research, data model and contracts.
5. `/speckit-tasks` — ordered, testable tasks.
6. `/speckit-analyze` — optional cross-artifact consistency check.
7. `/speckit-implement` — execute the tasks.

The SpecKit Companion extension (`.specify/extensions/companion/`) records each run in the spec's `.spec-context.json`. `/speckit-companion-status` says where a spec stands and `/speckit-companion-resume specs/NNN-feature-name` continues it from its last completed step.

Specs say *what* and *why*; plans say *how*. Do not put implementation choices in a spec.

## Branches and delivery

- `develop` is the integration branch.
- Feature work happens on its own branch named `features/<name>`, in its own worktree; Spec Kit names them `features/<number>-<name>` (its `branch_prefix` is set to `features`). The one exception is `claude/<name>`, which Claude's cloud sessions are handed by their harness.
- A feature branch is never merged locally into `develop`. When its work is done, push the branch from the worktree it was built in to `origin` and open a pull request into `develop`; nothing reaches `develop` except through a pull request.
- When the pull request is merged or closed, delete the branch locally and on `origin`, and remove the worktree.

## Conventions

- End commit messages written by an agent with a `Co-Authored-By:` trailer naming the model.
- Shell scripts for Spec Kit are the PowerShell variants (`.specify/scripts/powershell/`).
- When writing markdown files do not split lines to ensure a maximum line length is honored.

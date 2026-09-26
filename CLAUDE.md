# etalii.adp.ide.vscode

ADP designers for Visual Studio Code. The repository is new; this file holds the conventions shared by every repository in the etalii-adp organization until the project's own tooling is in place.

## Branches and delivery

- `develop` is the integration branch.
- Feature work happens on its own branch named `features/<name>`, in its own worktree. The one exception is `claude/<name>`, which Claude's cloud sessions are handed by their harness.
- A feature branch is never merged locally into `develop`. When its work is done, push the branch from the worktree it was built in to `origin` and open a pull request into `develop`; nothing reaches `develop` except through a pull request.
- When the pull request is merged or closed, delete the branch locally and on `origin`, and remove the worktree.

# AGENTS.md

## Decision log

- For every architectural or technical design decision, prompt the user for a quick description of the decision to add to [docs/decisions.md](docs/decisions.md).
- Add only the user's explicit words to the log. Don't write entries on the user's behalf.

## Dependencies and versions

- Don't take version numbers from memory. Before adding or bumping a GitHub Action, npm package or tool, look up its latest release (for example `gh api repos/<owner>/<repo>/releases/latest --jq .tag_name` or `pnpm view <pkg> version`) and use it, unless there's a reason not to.
- When bumping a major version, read the release notes for breaking changes.

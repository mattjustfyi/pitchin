# Decision log

- The decision log records the project owner's decisions, not Claude's.
- Only add or edit entries when explicitly asked, and only with what the owner said. Don't add your own decisions, recommendations or reasoning unless asked to.
- Don't edit existing entries unless asked.

## 2026-11-24: pnpm over npm

Went with pnpm due to security benefits, better workspace support, and that it's sufficiently popular that there shouldn't be much friction from not picking npm.

## 2026-11-24: ESLint over Oxlint

Oxlint is still lacking in some linting rules and for simplicity I don't want to run both, nor spend much time on researching and resolving issues

## 2026-11-26: Prettier with single quotes and no semis

Use single quotes and no semis. This seems most common still in the industry. Single quotes is helpful for JSX,etc when writing double quotes in a string (escaping). Tooling can suggest cases where automatic semicolon insertion doesn't work - omiting it is visually cleaner

---
name: clawos-versioning
description: >
  Monorepo version bump procedure for ClawOS. Use this skill when bumping
  package versions, updating changelogs, or during step 5 of the ship-changes
  workflow. Also trigger when the user asks "how do I bump versions", "update
  the changelog", or "what version should this be". This skill is called by
  the ship-changes workflow before opening a PR.
---

# Bump Package Versions

This procedure runs inside the feature branch before the PR is opened.

## 1. Identify affected packages

Find every workspace package whose files changed relative to `main`:

```bash
git diff main...HEAD --name-only
```

A package is affected if any changed file lives under its directory
(`apps/<name>/` or `packages/<name>/`).

## 2. Determine bump type per package

For each affected package, inspect the full conventional commit messages
(subject + body) on this branch:

```bash
git log main...HEAD --pretty=format:"%B" -- <package-dir>/
```

Using `%B` (full body) instead of `%s` (subject only) ensures that breaking
changes declared only in the commit footer (`BREAKING CHANGE:`) are not missed.

Apply semver rules (use the highest applicable across all commits for that
package):

| Condition                                                    | Bump           |
| ------------------------------------------------------------ | -------------- |
| Subject matches `^[a-z]+(\(.+\))?!:` (bang notation)         | **major**      |
| Body/footer contains a line starting with `BREAKING CHANGE:` | **major**      |
| Subject starts with `feat`                                   | **minor**      |
| Subject starts with `fix`, `perf`, or `refactor`             | **patch**      |
| Only `chore`, `docs`, `test`, `ci`, `style` commits          | no bump — skip |

If no bump-worthy commits touch a package, leave it unchanged.

## 3. Bump `package.json`

Update the `version` field directly (do not use `npm version` — it creates
extra git tags). Apply semver arithmetic to the current version.

## 4. Update `CHANGELOG.md`

Prepend a new entry (create the file if it doesn't exist) following
Keep-a-Changelog / release-please format:

```markdown
## [<new-version>] (YYYY-MM-DD)

### Features

- **<scope>:** <description> ([<short-sha>](https://github.com/orestes-garcia-martinez/clawos/commit/<full-sha>))

### Bug Fixes

- **<scope>:** <description> ([<short-sha>](https://github.com/orestes-garcia-martinez/clawos/commit/<full-sha>))
```

Do **not** add a compare link to the version heading — per-package tags no
longer exist (release-please is root-only), so compare URLs would be dead links.
Include only sections that have entries. Use actual commit messages and SHAs.

## 5. Stage the changes

```bash
git add <package-dir>/package.json <package-dir>/CHANGELOG.md
```

Include these in the same commit as the feature changes — do not create a
separate commit for version bumps.

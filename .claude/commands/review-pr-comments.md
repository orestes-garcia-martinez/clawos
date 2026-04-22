---
name: review-pr-comments
description: >
  Review open PR review comments on the current branch, determine whether each
  is addressed in HEAD, and either produce a blocker report or finalize the PR
  (comment, resolve threads, merge). Use for "review PR comments", "check PR
  feedback", "address review comments", "what feedback is still open", or "are
  all PR comments resolved".
---

# Review PR Comments

Your goal is to review all open PR review comments on the current branch's pull
request, determine whether each has been addressed in the code, and either
produce a blocker report or finalize the PR end-to-end.

## When to use

Use this skill to **audit and finalize** an existing PR's review feedback.

## When NOT to use

- Do **not** use to author new review comments on someone else's PR.
- Do **not** use to open, rebase, or rewrite a PR's commit history.
- Do **not** use on draft PRs — ask the user to mark the PR ready first.

## Prerequisites

Before running any `gh` commands, verify authentication:

```bash
gh auth status
```

If not authenticated, report that and stop.

---

## Step 1 — Get current branch

```bash
git branch --show-current
```

## Step 2 — Fetch PR details

```bash
gh pr view --json number,title,url,state,reviewDecision,isDraft
```

- If no PR exists for the current branch, report that and stop.
- If `isDraft` is `true`, stop and ask the user to mark the PR ready.
- If `state` is `CLOSED` or `MERGED`, note it. Skip Step 9 (nothing to
  finalize) but continue through Steps 3–8 for historical review.
- Save `number` as `<PR_NUMBER>` for later steps.

## Step 3 — Fetch all comment types

Run these three commands. `{owner}` and `{repo}` in the first command are
**literal placeholders** that `gh api` expands from the current git remote —
do **not** substitute them. Only `<PR_NUMBER>` is substituted.

```bash
# 1. Inline code-review comments (line-specific, the primary signal)
gh api "repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments" --paginate

# 2. Formal review submissions (APPROVED / CHANGES_REQUESTED + top-level body)
gh pr view --json reviews

# 3. Issue-level comments (general conversation, not line-specific)
gh pr view --json comments
```

**Understanding the three types:**

| Source                          | JSON key                                                      | Contains                                                                    |
| ------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `gh api .../pulls/<n>/comments` | `path`, `line`, `body`, `diff_hunk`, `user`, `in_reply_to_id` | Inline line-specific review comments — **primary focus**                    |
| `gh pr view --json reviews`     | `reviews[].body`, `reviews[].state`, `reviews[].author`       | Formal review submissions; `body` may contain actionable top-level feedback |
| `gh pr view --json comments`    | `comments[].body`, `comments[].author`                        | General PR conversation (no file/line context)                              |

Treat non-empty `reviews[].body` text as an additional actionable item to
analyze in Step 5, alongside inline comments.

**Filtering rules before analysis:**

- Include comments from **all authors** regardless of `user.type` — bot
  reviewers (Codex, CodeRabbit, etc.) carry the same weight as humans.
- Group inline comments by `in_reply_to_id`: a reply thread shares one root
  concern. Read the whole thread, treat it as one item.

## Step 4 — Fetch the PR diff

```bash
gh pr diff
```

Use the diff to check whether a later commit already addressed a comment
without an explicit reply.

## Step 5 — Analyze each comment

For every inline code-review comment (Step 3, source 1) **and** every
actionable concern in formal review bodies (source 2) — regardless of author
type:

1. **Locate the code** — use `path` and `line` to read the file at **current
   HEAD** (not the PR state). This shows whether the fix was already applied.
2. **Parse the request** — read `body` (and `diff_hunk` for context) to
   understand the reviewer's intent: bug fix, rename, missing test, security,
   refactor, etc.
3. **Check the diff** — use Step 4's diff to see if a later commit addressed
   the feedback.
4. **Assign a verdict:**

   | Verdict        | Meaning                                                                           |
   | -------------- | --------------------------------------------------------------------------------- |
   | ✅ Addressed   | The code now reflects exactly what the reviewer requested.                        |
   | ⚠️ Suggestion  | Action taken, or the comment is non-blocking (style, nitpick, optional refactor). |
   | ❌ Unaddressed | No change was made, or the change does not satisfy the request.                   |

5. For ❌ and ⚠️ items, record: what was requested, what the code does now,
   and a concrete fix.

## Step 6 — Validate against project conventions

If a `clawos-conventions` skill is available, load it and verify unaddressed
or partially addressed items against its standards. Otherwise, probe for
conventions via `CLAUDE.md`, `CONTRIBUTING.md`, or the repo root and apply
them.

For ClawOS specifically, check:

- TypeScript strict — no `any`, no implicit returns.
- Zod validation — external input validated via `@clawos/security` schemas.
- Tests — new logic has a colocated `*.test.ts`.
- Security non-negotiables — no secrets in code, RLS on new tables,
  rate-limit middleware on new routes, `safeCompare()` for secret comparisons.
- Formatting — `npm run format:check` passes.

If `format:check` fails, treat it as a ❌ issue regardless of whether a
reviewer flagged it.

## Step 7 — Produce the summary

Output a structured report:

---

**PR:** {title} (#{number})
**State:** {state} | **Review decision:** {reviewDecision}

| #   | File                 | Comment summary                   | Status       |
| --- | -------------------- | --------------------------------- | ------------ |
| 1   | `path/to/file.ts:42` | Brief summary of reviewer request | ✅ / ⚠️ / ❌ |

### ✅ Addressed

One sentence per resolved item describing what changed.

### ⚠️ Suggestions

Per item: file + line, what the reviewer said, why it is non-blocking, an
optional improvement.

### ❌ Unaddressed — must fix before merging

Per blocker:

- **File:** `path/to/file.ts:42`
- **Reviewer asked:** (exact request)
- **Current code:** (what it does now)
- **Fix:** (concrete recommendation)

---

## Step 8 — Merge-readiness verdict

Close the report with **exactly one** of these literal verdicts (the next
step branches on the exact string):

- `READY_TO_MERGE` — all ❌ items resolved; no blockers.
- `NOT_READY` — one or more ❌ items remain; list them by number.
- `READY_WITH_SUGGESTIONS` — no ❌ blockers; Y ⚠️ suggestions remain.

## Step 9 — Finalize the review

Translate Step 8's verdict into concrete GitHub operations. Do **not** create
intermediate commits or force-push without explicit user confirmation. Skip
this entire step if Step 2 found the PR `CLOSED` or `MERGED`.

### 9.1 — Decide the action path

| Step 8 verdict           | Action path                                    |
| ------------------------ | ---------------------------------------------- |
| `NOT_READY`              | Go to **9.2** (report blockers, do not merge). |
| `READY_WITH_SUGGESTIONS` | Go to **9.3** (confirm), then **9.4**.         |
| `READY_TO_MERGE`         | Go to **9.4**.                                 |

### 9.2 — Blockers remain

1. Surface the ❌ list from Step 7.
2. Ask whether to (a) stop so the user fixes manually, or (b) draft fixes for
   each blocker in a follow-up turn.
3. **Do not merge. Do not resolve conversations.** Stop the skill here.

#### 9.2.1 — After blockers are fixed (path b)

Once all ❌ fixes are committed and pushed, immediately perform these two
actions **without waiting for the user to re-invoke the skill**:

**Post a summary comment** (use a temp file to avoid quoting issues):

```bash
SUMMARY_FILE=$(mktemp)
cat > "$SUMMARY_FILE" <<'EOF'
## Review response — <short description> (<commit SHA>)

### ✅ <Comment #N title>
One sentence describing what changed and why it satisfies the reviewer.

### ✅ <Comment #M title>
...
EOF
gh pr comment <PR_NUMBER> --body-file "$SUMMARY_FILE"
rm "$SUMMARY_FILE"
```

**Resolve threads** for every item that is now ✅ using the GraphQL mutation
from Step 9.6. Fetch thread IDs from the `reviewThreads` query, then resolve
each unresolved thread whose `(path, line)` matches a fixed item:

```bash
gh api graphql -f query='
  mutation($id:ID!){
    resolveReviewThread(input:{threadId:$id}){ thread{ isResolved } }
  }' -f id=<THREAD_ID>
```

**Do not merge** — the PR verdict is still `NOT_READY` until CI re-runs and
the user confirms. Stop here after comment + resolve.

### 9.3 — Confirm non-blocking suggestions

Ask:

> "There are {Y} non-blocking suggestions. Merge anyway, or address them first?"

Proceed only on explicit confirmation.

### 9.4 — Final confirmation gate

Before any write action, show the user:

- The PR number and title.
- The count of threads that will be resolved.
- The merge strategy that will be used (see 9.6).

Ask: _"Proceed with comment, resolve, and merge? (y/n)"_ — stop on anything
other than explicit yes.

### 9.5 — Post the review summary comment

Write the Step 7 summary to a temp file first to avoid shell-quoting issues,
then post it:

```bash
SUMMARY_FILE=$(mktemp)
cat > "$SUMMARY_FILE" <<'EOF'
<Step 7 summary markdown>
EOF
gh pr comment <PR_NUMBER> --body-file "$SUMMARY_FILE"
rm "$SUMMARY_FILE"
```

### 9.6 — Resolve addressed inline threads

Fetch all review threads (paginate if the PR has more than 100), then resolve
**only** those that:

1. Match a Step 7 ✅ item by `(path, line)` of the thread's root comment, and
2. Have `isResolved == false`.

```bash
# 1. List threads (paginate via endCursor if needed)
gh api graphql -f query='
  query($owner:String!,$repo:String!,$pr:Int!,$after:String){
    repository(owner:$owner,name:$repo){
      pullRequest(number:$pr){
        reviewThreads(first:100, after:$after){
          pageInfo{ hasNextPage endCursor }
          nodes{
            id isResolved
            comments(first:1){ nodes{ path line body author{ login } } }
          }
        }
      }
    }
  }' -F owner=<OWNER> -F repo=<REPO> -F pr=<PR_NUMBER>

# 2. For each matched unresolved thread
gh api graphql -f query='
  mutation($id:ID!){
    resolveReviewThread(input:{threadId:$id}){ thread{ isResolved } }
  }' -f id=<THREAD_ID>
```

Do **not** resolve threads for ⚠️ or ❌ items — that is the
author/reviewer's decision.

### 9.7 — Merge the PR

Detect the allowed merge strategy first:

```bash
gh api "repos/{owner}/{repo}" \
  --jq '{squash:.allow_squash_merge,merge:.allow_merge_commit,rebase:.allow_rebase_merge}'
```

Then merge with the preferred enabled strategy (priority: squash → rebase →
merge, unless the repo specifies otherwise):

```bash
gh pr merge <PR_NUMBER> --squash --delete-branch
```

### 9.8 — Confirm completion

Report back:

- Merge commit SHA (`gh pr view --json mergeCommit`).
- Number of threads resolved.
- Any threads intentionally left unresolved and why.

### 9.9 — Failure handling

- If `gh pr merge` fails due to required checks, branch protection, or merge
  conflicts: report the exact error and stop. **Do not** retry with `--admin`.
- If thread resolution fails for a subset of threads, continue with the rest
  and list the failures in 9.8.
- If the skill is re-run after a partial completion: Step 2 will catch a
  merged PR, and 9.6's `isResolved == false` filter makes resolution
  idempotent.

---

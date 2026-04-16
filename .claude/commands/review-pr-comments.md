---
name: review-pr-comments
description: >
  Use this skill to review and address PR review comments from GitHub. Fetches
  the current branch's open pull request comments using the GitHub CLI, reads
  the referenced source files at their current HEAD state, determines whether
  each comment has been addressed, and produces an actionable summary with a
  merge-readiness verdict. Trigger when the user says "review PR comments",
  "check PR feedback", "address review comments", "what did the reviewer say",
  "what feedback is still open", "what comments are left to fix",
  "respond to PR review", or "are all PR comments resolved".
---

# Review PR Comments

Your goal is to review all open PR review comments on the current branch's pull
request, determine whether each has been addressed in the code, and produce a
clear summary with a final merge-readiness verdict.

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
gh pr view --json number,title,url,state,reviewDecision
```

- If no PR exists for the current branch, report that and stop.
- If the PR `state` is `CLOSED` or `MERGED`, note it but continue — reviewing
  historical feedback is still valid.
- Save the `number` field; you will need it in Step 3.

## Step 3 — Fetch all comment types

Run these three commands. Each returns a different comment category:

```bash
# 1. Inline code-review comments (line-specific, the primary signal)
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments --paginate

# 2. Formal review submissions (APPROVED / CHANGES_REQUESTED + top-level body)
gh pr view --json reviews

# 3. Issue-level comments (general conversation, not line-specific)
gh pr view --json comments
```

Replace `<PR_NUMBER>` with the `number` value from Step 2.

**Understanding the three types:**

| Source                          | JSON key                                                      | Contains                                                 |
| ------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| `gh api .../pulls/<n>/comments` | `path`, `line`, `body`, `diff_hunk`, `user`, `in_reply_to_id` | Inline line-specific review comments — **primary focus** |
| `gh pr view --json reviews`     | `reviews[].body`, `reviews[].state`, `reviews[].author`       | Formal review submissions (APPROVED / CHANGES_REQUESTED) |
| `gh pr view --json comments`    | `comments[].body`, `comments[].author`                        | General PR conversation (no file/line context)           |

**Filtering rules before analysis:**

- Include comments from all authors regardless of `user.type` — bot reviewers
  (Codex, CodeRabbit, etc.) are primary reviewers and their comments carry the
  same weight as human comments.
- Group inline comments by `in_reply_to_id`: a reply thread shares the same
  root concern — treat the thread as one item and read the full thread for
  context before deciding its status.

## Step 4 — Fetch the PR diff

```bash
gh pr diff
```

Use the diff to check whether a subsequent commit already addressed a comment
without an explicit reply.

## Step 5 — Analyze each comment

For every human-authored inline code-review comment (from Step 3, source 1),
and every actionable concern raised in formal review bodies (source 2):

1. **Locate the code** — use the `path` and `line` fields to read the file at
   its **current HEAD state** (not the PR state). This shows whether the fix
   was already applied.
2. **Parse the request** — read `body` (and `diff_hunk` for context) to
   understand what the reviewer asked for: bug fix, naming change, missing test,
   security concern, refactor, etc.
3. **Check the diff** — look at the Step 4 diff to see if a subsequent commit
   addressed the feedback.
4. **Assign a verdict:**

   | Verdict        | Meaning                                                                            |
   | -------------- | ---------------------------------------------------------------------------------- |
   | ✅ Addressed   | The code now reflects exactly what the reviewer requested.                         |
   | ⚠️ Suggestion  | Some action was taken, or the comment is non-blocking (style preference, nitpick). |
   | ❌ Unaddressed | No change was made, or the change does not satisfy the reviewer's request.         |

5. **For ❌ and ⚠️ items**, record:
   - What the reviewer requested.
   - What the current code does instead.
   - A concrete suggestion for how to resolve it.

## Step 6 — Validate against ClawOS conventions

Load the `clawos-conventions` skill and verify unaddressed or partially
addressed comments against those standards. Pay particular attention to:

- TypeScript strict — no `any`, no implicit returns.
- Zod validation — external input validated with `@clawos/security` schemas.
- Tests — new logic must have colocated `*.test.ts` files.
- Security non-negotiables — no secrets in code, RLS on new tables,
  rate-limit middleware on new routes, `safeCompare()` for secret comparisons.
- Formatting — run `npm run format:check` to confirm Prettier compliance.

If `format:check` fails, treat it as a ❌ issue regardless of whether a
reviewer explicitly flagged it.

## Step 7 — Produce the summary

Output a structured report in this format:

---

**PR:** {title} (#{number})  
**State:** {state} | **Review decision:** {reviewDecision}

| #   | File                 | Comment summary                   | Status       |
| --- | -------------------- | --------------------------------- | ------------ |
| 1   | `path/to/file.ts:42` | Brief summary of reviewer request | ✅ / ⚠️ / ❌ |

### ✅ Addressed

List each resolved comment with one sentence confirming what changed.

### ⚠️ Suggestions

List each non-blocking item. For each: file + line, what the reviewer said,
why it is non-blocking, and an optional improvement to consider.

### ❌ Unaddressed — must fix before merging

For each blocking item:

- **File:** `path/to/file.ts:42`
- **Reviewer asked:** (exact request)
- **Current code:** (what it does now)
- **Fix:** (concrete recommendation)

---

## Step 8 — Merge-readiness verdict

Close the report with one of these three verdicts:

- **Ready to merge** — all ❌ items are resolved; no outstanding blockers.
- **Not ready — N blocker(s) remain** — list the ❌ items by number.
- **Ready with suggestions** — no ❌ blockers; Y ⚠️ suggestions remain for
  the author to consider but are not blocking merge.

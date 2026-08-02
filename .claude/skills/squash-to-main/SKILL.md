---
name: squash-to-main
description: Squash-merge the current branch onto latest main as one conventional commit, push main, then recreate the branch from main. Use when the user asks to squash/land/ship the current branch to main.
---

# Squash branch to main

Land the current branch on main as a single well-written commit, then reset the branch to the new main tip.

## Preconditions (abort and tell the user if violated)

- Working tree is clean (`git status --short` is empty).
- Not already on main; note the current branch name as `<branch>`.

## Steps

1. Review what's actually on the branch — the commit message is written from the diff, never from the branch's own commit messages (they're often `wip`):
   - `git fetch origin main`
   - `git log --oneline origin/main..HEAD`
   - `git diff origin/main...HEAD` (full diff, not just `--stat`)
2. `git checkout main && git pull --ff-only origin main`
3. `git merge --squash <branch>`
4. Commit with a Conventional Commits message:
   - `type(scope): summary` — scope by area (`poster`, `studio`, `geo`, `data`); pick the dominant type if mixed (feat > fix > chore).
   - Body: short bullet per logical change, describing behavior, not files.
   - No trailers — no `Co-Authored-By`, no generated-with lines.
5. `git push origin main`
6. `git checkout -B <branch> main` — recreate the branch from the new main tip.
7. Leave any remote copy of `<branch>` alone unless asked.

Report the new commit hash and confirm the branch was recreated clean.

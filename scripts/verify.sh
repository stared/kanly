#!/bin/sh
# A commit is what git has of it, so this builds exactly that: the tree is checked out into an empty directory and built
# there by the steps CI runs. A build in the working directory proves nothing about a commit: that directory also holds
# what git does not (an untracked file, built data, .env.local). The deploy once stood still for ten days over one such
# file, pnpm-workspace.yaml, present here and never committed.
#   scripts/verify.sh         what is staged: the commit about to be made (the pre-commit hook runs this)
#   scripts/verify.sh <rev>   a commit
set -eu
root=$(git rev-parse --show-toplevel)
if [ $# -gt 0 ]; then tree=$(git rev-parse --verify "$1^{tree}"); else tree=$(git write-tree); fi
# a hook has git's own variables set (the index of the commit being made); from here on git is told where to work
unset $(git rev-parse --local-env-vars)
log=$(git -C "$root" rev-parse --absolute-git-dir)/verify.log
dir=$(mktemp -d "${TMPDIR:-/tmp}/kanly-verify.XXXXXX")
# a worktree, so that git, which made the directory, is also what takes it away
git -C "$root" worktree add --quiet --detach --no-checkout "$dir"
trap 'cd "$root"; git worktree remove --force "$dir"' EXIT
trap 'exit 130' INT TERM
git -C "$dir" read-tree -u --reset "$tree"
# the downloaded sources are a cache, here as in CI
if [ -d "$root/data/raw" ]; then cp -R "$root/data/raw" "$dir/data/raw"; fi
cd "$dir"
if (pnpm install --frozen-lockfile && pnpm run check) > "$log" 2>&1; then
  echo "verify: builds from a clean checkout ($tree)"
else
  tail -n 30 "$log"
  echo "verify: DOES NOT BUILD from a clean checkout ($tree). The whole log: $log"
  exit 1
fi

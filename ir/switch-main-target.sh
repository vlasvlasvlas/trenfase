#!/usr/bin/env bash
set -euo pipefail

# Switch what origin/main points to, using v1 or v2 as source.
# This controls what GitHub Pages serves if Pages is configured from main.
#
# Usage:
#   ./ir/switch-main-target.sh v1
#   ./ir/switch-main-target.sh v2
#   ./ir/switch-main-target.sh v1 --yes
#
# Notes:
# - Uses --force-with-lease to avoid overwriting unexpected remote updates.
# - Prefers local branch if available, otherwise falls back to origin/<branch>.

REMOTE="origin"
TARGET="${1:-}"
AUTO_YES="${2:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <v1|v2> [--yes]"
  exit 1
fi

case "$TARGET" in
  v1)
    CANDIDATES=("v1" "v1-original-tokyoonly")
    ;;
  v2)
    CANDIDATES=("v2" "v2-pixel-simcity" "feature/v2-pixel-simcity")
    ;;
  *)
    echo "Unsupported target: $TARGET"
    echo "Allowed values: v1, v2"
    exit 1
    ;;
esac

git fetch "$REMOTE" --prune >/dev/null

SOURCE_REF=""
for c in "${CANDIDATES[@]}"; do
  if git show-ref --verify --quiet "refs/heads/$c"; then
    SOURCE_REF="refs/heads/$c"
    break
  fi
  if git show-ref --verify --quiet "refs/remotes/$REMOTE/$c"; then
    SOURCE_REF="refs/remotes/$REMOTE/$c"
    break
  fi
done

if [[ -z "$SOURCE_REF" ]]; then
  echo "Could not find a source branch for '$TARGET'."
  echo "Checked candidates: ${CANDIDATES[*]}"
  exit 1
fi

SRC_SHA="$(git rev-parse --short "$SOURCE_REF")"
CUR_MAIN_SHA="$(git ls-remote --heads "$REMOTE" main | awk '{print substr($1,1,7)}')"

echo "Target profile: $TARGET"
echo "Source ref: $SOURCE_REF ($SRC_SHA)"
echo "Remote main current: ${CUR_MAIN_SHA:-<none>}"
echo "Will push: $SOURCE_REF -> refs/heads/main"

if [[ "$AUTO_YES" != "--yes" ]]; then
  read -r -p "Continue? [y/N] " ans
  if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

git push "$REMOTE" "$SOURCE_REF:refs/heads/main" --force-with-lease=refs/heads/main

echo "Done: origin/main now points to $TARGET ($SRC_SHA)."

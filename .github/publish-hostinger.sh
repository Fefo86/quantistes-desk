#!/usr/bin/env bash
# Publish the unpacked, gated PHP release as a fast-forward commit, keeping its own history.
set -euo pipefail

archive=$(realpath "${1:?Indicare il pacchetto Quantistes-Hostinger.zip}")
source_commit=$(git rev-parse HEAD)
origin=$(git remote get-url origin)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
stage="$scratch/desk"
git init --quiet --initial-branch=hostinger "$stage"
git -C "$stage" remote add origin "$origin"

existing=$(git ls-remote --heads origin refs/heads/hostinger)
if [[ -n "$existing" ]]; then
  git -C "$stage" fetch --quiet --no-tags --depth=1 origin refs/heads/hostinger
  # Load the previous commit and index into an empty directory. Files absent from
  # the new archive naturally disappear from the staged tree.
  git -C "$stage" reset --quiet --mixed FETCH_HEAD
fi

unzip -q "$archive" -d "$stage"
for required in index.php .htaccess private/.htaccess private/config.php private/assets.php; do
  test -s "$stage/$required" || { echo "File di pubblicazione mancante: $required" >&2; exit 1; }
done
test -d "$stage/private/files"
git -C "$stage" -c core.autocrlf=false add --all -- .
if git -C "$stage" diff --cached --quiet; then
  echo "La build è già presente sul ramo hostinger."
  exit 0
fi
git -C "$stage" -c user.name='Quantistes Deploy' -c user.email='quantistes-deploy@users.noreply.github.com' \
  commit --quiet -m "Pubblica desk da $source_commit"

# A rerun of an old build must not roll production back after a newer update.
current_main=$(git ls-remote --exit-code --heads origin refs/heads/main)
if [[ "${current_main%%[[:space:]]*}" != "$source_commit" ]]; then
  echo "main è stato aggiornato durante la build; la sua esecuzione pubblicherà la nuova versione."
  exit 0
fi
git -C "$stage" push origin HEAD:refs/heads/hostinger

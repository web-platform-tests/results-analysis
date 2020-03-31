#!/bin/bash
set -x
set -o errexit
set -o nounset
set -o pipefail

rm -rf out/
mkdir -p out/data/

# Copy the static content
cp -r static/* out/

# Try to do an incremental update, if possible.
echo "Checking out existing CSV files from gh-pages/"
git fetch origin || true
git checkout origin/gh-pages -- data/experimental-browser-specific-failures.csv || true
git checkout origin/gh-pages -- data/stable-browser-specific-failures.csv || true
git reset HEAD data/experimental-browser-specific-failures.csv || true
git reset HEAD data/stable-browser-specific-failures.csv || true
mv data/* out/data/ || true
echo

echo "Updating wpt-results.git/"
cd wpt-results.git/
git fetch --all --tags
cd ../

TO_DATE=$(date -d "yesterday 13:00" '+%Y-%m-%d')

update_csv() {
  local FROM_DATE="2018-06-01"
  if [[ -f "${1}" ]]; then
    FROM_DATE=$(tail "${1}" -n 1 | cut -f 2 -d ',')
  fi

  local EXPERIMENTAL_FLAG=""
  if [[ $1 == *"experimental"* ]]; then
    EXPERIMENTAL_FLAG="--experimental"
  fi

  node --max-old-space-size=8192 browser-specific-failures.js \
    ${EXPERIMENTAL_FLAG} --from=${FROM_DATE} --to=${TO_DATE} \
    --output=tmp.csv

  local SKIP_LINES="+1"
  if [[ -f "${1}" ]]; then
    SKIP_LINES="+3"
  fi
  tail -n ${SKIP_LINES} tmp.csv >> "${1}"
  rm tmp.csv
}

update_csv out/data/stable-browser-specific-failures.csv
update_csv out/data/experimental-browser-specific-failures.csv

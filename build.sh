#!/bin/bash
set -x
set -o errexit
set -o nounset
set -o pipefail

rm -rf out/
mkdir -p out/data/

# Copy the static content
cp -r static/* out/

fetch_from_gh_pages() {
  git checkout origin/gh-pages -- "${1}" || true
  git reset HEAD "${1}" || true
}

# Try to do an incremental update for the BSFs, if possible, as they're slow to
# re-create.
echo "Checking out existing CSV files from gh-pages/"
git fetch origin || true
fetch_from_gh_pages data/experimental-browser-specific-failures.csv
fetch_from_gh_pages data/stable-browser-specific-failures.csv
mv data/* out/data/ || true
echo

echo "Updating wpt-results.git/"
cd wpt-results.git/
git fetch --all --tags
cd ../

TO_DATE=$(date -d "yesterday 13:00" '+%Y-%m-%d')

update_bsf_csv() {
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

update_bsf_csv out/data/stable-browser-specific-failures.csv
update_bsf_csv out/data/experimental-browser-specific-failures.csv

update_compat_2021() {
  local FEATURE="${1}"
  local LABEL="${2}"

  local OUT_CSV="out/data/compat2021/${FEATURE}-${LABEL}.csv"

  local FROM_DATE="2020-12-15"
  if [[ -f "${OUT_CSV}" ]]; then
    FROM_DATE=$(tail "${OUT_CSV}" -n 1 | cut -f 2 -d ',')
  fi

  local EXPERIMENTAL_FLAG=""
  if [[ "${2}" == "experimental" ]]; then
    EXPERIMENTAL_FLAG="--experimental"
  fi

  node compat-2021/main.js ${EXPERIMENTAL_FLAG} --from=${FROM_DATE} \
      --to=${TO_DATE} --category=${FEATURE}

  local SKIP_LINES="+1"
  if [[ -f "${OUT_CSV}" ]]; then
    SKIP_LINES="+3"
  fi
  tail -n ${SKIP_LINES} "${FEATURE}-${LABEL}.csv" >> "${OUT_CSV}"
  
  # Mpve full results over.
  mv "${FEATURE}-${LABEL}-full-results.csv" out/data/compat2021/

  # Cleanup the temporary output file.
  rm "${FEATURE}-${LABEL}.csv"
}

mkdir -p out/data/compat2021/

update_compat_2021 aspect-ratio experimental
update_compat_2021 css-flexbox experimental
update_compat_2021 css-grid experimental
update_compat_2021 css-transforms experimental
update_compat_2021 position-sticky experimental

update_compat_2021 aspect-ratio stable
update_compat_2021 css-flexbox stable
update_compat_2021 css-grid stable
update_compat_2021 css-transforms stable
update_compat_2021 position-sticky stable

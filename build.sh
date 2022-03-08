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
  local OUTPUT="${1}"

  local FROM_DATE="2018-06-01"
  local EXPERIMENTAL_FLAG=""
  if [[ $1 == *"experimental"* ]]; then
    EXPERIMENTAL_FLAG="--experimental"
  fi

  node --max-old-space-size=8192 browser-specific-failures.js \
    ${EXPERIMENTAL_FLAG} --from=${FROM_DATE} --to=${TO_DATE} \
    --output=${OUTPUT}
}

update_bsf_csv out/data/stable-browser-specific-failures.csv
update_bsf_csv out/data/experimental-browser-specific-failures.csv

update_compat_2021() {
  local PRODUCTS="${1}"
  local LABEL="${2}"
  local OUTDIR="${3}"

  local FROM_DATE="2020-12-15"
  local EXPERIMENTAL_FLAG=""
  if [[ "${LABEL}" == "experimental" ]]; then
    EXPERIMENTAL_FLAG="--experimental"
  fi

  node compat-2021/main.js --products=${PRODUCTS} ${EXPERIMENTAL_FLAG} \
      --from=${FROM_DATE} --to=${TO_DATE}

  for FEATURE in aspect-ratio css-flexbox css-grid css-transforms position-sticky; do
    local OUT_CSV="${OUTDIR}/${FEATURE}-${LABEL}.csv"

    local SKIP_LINES="+1"
    if [[ -f "${OUT_CSV}" ]]; then
      SKIP_LINES="+3"
    fi
    tail -n ${SKIP_LINES} "${FEATURE}-${LABEL}.csv" >> "${OUT_CSV}"

    # Move full results over.
    mv "${FEATURE}-${LABEL}-full-results.csv" ${OUTDIR}

    # Cleanup the temporary output file.
    rm "${FEATURE}-${LABEL}.csv"
  done

  mv "unified-scores-${LABEL}.csv" ${OUTDIR}
  mv "summary-${LABEL}.csv" ${OUTDIR}
}

# Main page
mkdir -p out/data/compat2021/
update_compat_2021 chrome,firefox,safari experimental out/data/compat2021
update_compat_2021 chrome,firefox,safari stable out/data/compat2021

# WebKitGTK 'stand-in' page
mkdir -p out/data/compat2021/webkitgtk
update_compat_2021 chrome,firefox,webkitgtk experimental out/data/compat2021/webkitgtk
update_compat_2021 chrome,firefox,webkitgtk stable out/data/compat2021/webkitgtk

update_interop_2022() {
  local OUTDIR="${1}"

  node interop-2022/main.js --to=${TO_DATE}
  node interop-2022/main.js --to=${TO_DATE} --experimental

  mv interop-2022-*.csv "${OUTDIR}"
}

mkdir -p out/data/interop-2022/
update_interop_2022 out/data/interop-2022/

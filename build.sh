#!/bin/bash
set -x
set -o errexit
set -o nounset
set -o pipefail

rm -rf out/
mkdir -p out/data/

echo "Updating results-analysis-cache.git/"
cd results-analysis-cache.git/
git fetch --all --tags
cd ../

# Scoring scripts may require more memory than the default.
export NODE_OPTIONS="--max-old-space-size=8192"

TO_DATE=$(date -d "tomorrow 13:00" '+%Y-%m-%d')

node git-write.js --max-time=300 --max-age-days=5

update_bsf_csv() {
  local OUTPUT="${1}"

  local FROM_DATE="2018-06-01"
  local EXPERIMENTAL_FLAG=""
  if [[ $1 == *"experimental"* ]]; then
    EXPERIMENTAL_FLAG="--experimental"
  fi

  node browser-specific-failures.js \
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

update_interop_year() {
  local YEAR="${1}"
  local END_DATE="${2}"

  mkdir -p out/data/interop-${YEAR}/
  node interop-scoring/main.js --year=${YEAR} --to=${END_DATE}
  node interop-scoring/main.js --year=${YEAR} --to=${END_DATE} --experimental

  mv interop-${YEAR}-*.csv out/data/interop-${YEAR}/
}

# End date should be end of the interop year,
# or the current date if it is the current interop year.
update_interop_year 2021 "2022-01-01"
update_interop_year 2022 "2023-01-01"
update_interop_year 2023 $TO_DATE

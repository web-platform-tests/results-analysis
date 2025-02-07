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

update_interop_year() {
  local YEAR="${1}"
  local PRODUCTS="${2}"

  mkdir -p out/data/interop-${YEAR}/
  node interop-scoring/main.js --year=${YEAR} --to=${TO_DATE} --products=${PRODUCTS}
  node interop-scoring/main.js --year=${YEAR} --to=${TO_DATE} --products=${PRODUCTS} --experimental

  mv interop-${YEAR}-*.csv out/data/interop-${YEAR}/
}

update_interop_year 2025 chrome,edge,firefox,safari

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
  local INCLUDE_THIRD_PARTY_FLAG=""
  if [[ $1 == *"with-third-party"* ]]; then
    INCLUDE_THIRD_PARTY_FLAG="--include-third-party"
  fi

  node browser-specific-failures.js \
    ${EXPERIMENTAL_FLAG} ${INCLUDE_THIRD_PARTY_FLAG} \
    --from=${FROM_DATE} --to=${TO_DATE} \
    --output=${OUTPUT}
}

update_bsf_csv out/data/stable-browser-specific-failures.csv
update_bsf_csv out/data/experimental-browser-specific-failures.csv
update_bsf_csv out/data/stable-browser-specific-failures-with-third-party.csv
update_bsf_csv out/data/experimental-browser-specific-failures-with-third-party.csv

update_feature_level_interop_csv() {
  # The web features catalogue first settled on this date.
  # Measuring before this date would measure cataloguing progress as much as browser progress.
  local FROM_DATE="2026-01-28"

  node feature-level-interop.js \
    --experimental \
    --from=${FROM_DATE} --to=${TO_DATE}

  node feature-level-interop.js \
    --from=${FROM_DATE} --to=${TO_DATE}
}
update_feature_level_interop_csv

update_interop_year() {
  local YEAR="${1}"
  local PRODUCTS="${2}"

  mkdir -p out/data/interop-${YEAR}/
  node interop-scoring/main.js --year=${YEAR} --to=${TO_DATE} --products=${PRODUCTS}
  node interop-scoring/main.js --year=${YEAR} --to=${TO_DATE} --products=${PRODUCTS} --experimental

  mv interop-${YEAR}-*.csv out/data/interop-${YEAR}/
}

update_interop_year 2026 chrome,edge,firefox,safari

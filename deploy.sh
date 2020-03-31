#!/bin/bash
set -x
set -o errexit
set -o nounset
set -o pipefail

COMMIT="$(git rev-parse HEAD)"

rm -rf gh-pages
git clone --branch gh-pages git@github.com:stephenmcgruer/wpt-results-analysis gh-pages

rm -rf gh-pages/*
cp -r out/* gh-pages/

cd gh-pages/

git add -A
git commit -m "Updating graphs" -m "Using commit $COMMIT"
git push

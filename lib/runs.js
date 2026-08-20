'use strict';

const fetch = require('node-fetch');
const fs = require('fs');
const moment = require('moment');
const path = require('path');
const zlib = require('zlib');
const {advanceDateToSkipBadDataIfNecessary} = require('../bad-ranges');

const RUNS_API = 'https://wpt.fyi/api/runs';

// The web features manifest is published as a release asset on every
// web-platform-tests/wpt release. Assets are named with the revision they were
// built from, so we match on the label, which does not change; wpt.fyi does the
// same in shared/web_features_manifest_github_download.go.
const WPT_RELEASE_API =
    'https://api.github.com/repos/web-platform-tests/wpt/releases/latest';
const WEB_FEATURES_MANIFEST_LABEL = 'WEB_FEATURES_MANIFEST.json.gz';

function apiURL(options = {}) {
  const url = new URL(RUNS_API);
  for (let [name, value] of Object.entries(options)) {
    if (Array.isArray(value)) {
      value = value.join(',');
    }
    url.searchParams.set(name, value);
  }
  return url;
}

async function get(options) {
  const url = apiURL(options);
  // console.log(`Fetching ${url}`);
  return fetch(url).then(r => r.json());
}

async function getAll(options) {
  const runs = [];
  for await (const run of getIterator(options)) {
    runs.push(run);
  }

  // Sort runs by start time, most recent first. This is the order that the API
  // uses as well, but due to pagination it will not be strictly sorted.
  runs.sort((a, b) => {
    return Date.parse(b.time_start) - Date.parse(a.time_start);
  });

  return runs;
}

async function* getIterator(options) {
  options = Object.assign({'max-count': 500}, options);

  let url = apiURL(options);
  let previousUrl = null;
  while (true) {
    const r = await fetch(url);
    // wpt.fyi API returns 404 with an empty result set
    if (!r.ok && r.status !== 404) {
      let msg = `non-OK, non-404 fetch status ${r.status} when fetching ${url}`;
      if (previousUrl) {
        msg += ` (previous url was ${previousUrl})`;
      }
      throw new Error(msg);
    }

    const runs = await r.json();
    for (const run of runs) {
      yield run;
    }
    const token = r.headers.get('wpt-next-page');
    if (!token) {
      break;
    }
    previousUrl = url;
    url = new URL(RUNS_API);
    url.searchParams.set('page', token);
  }
}


// Fetches aligned runs from the wpt.fyi server, between the |from| and |to|
// dates. If |experimental| is true fetch experimental runs, else stable runs.
// Returns a map of date to list of runs for that date (one per product)
//
// TODO: Known problem: there are periods of time, mostly mid-late 2018, where
// we ran both Safari 11.1 and 12.1, and the results are massively different.
// We should fetch multiple runs for each browser and have upgrade logic.
async function fetchAlignedRunsFromServer(products, from, to, experimental) {
  const label = experimental ? 'experimental' : 'stable';
  let params = `label=master&label=${label}`;
  for (const product of products) {
    params += `&product=${product}`;
  }
  const runsUri = `${RUNS_API}?aligned=true&max-count=1&${params}`;

  console.log(`Fetching aligned runs from ${from.format('YYYY-MM-DD')} ` +
      `to ${to.format('YYYY-MM-DD')}`);

  let cachedCount = 0;
  const before = moment();
  const noCacheAfter = moment().subtract('3', 'days');
  const alignedRuns = new Map();

  while (from < to) {
    const yesterday = moment(from).subtract(1, 'days');
    const today = moment(from);
    from.add(1, 'days');
    const tomorrow = moment(from);

    const formattedFrom = yesterday.format('YYYY-MM-DD');
    const formattedTo = tomorrow.format('YYYY-MM-DD');

    // We advance the date (if necessary) before doing anything more, so that
    // code later in the loop body can just 'continue' without checking.
    from = advanceDateToSkipBadDataIfNecessary(from, experimental);

    // Attempt to read the runs from the cache.
    // TODO: Consider https://github.com/tidoust/fetch-filecache-for-crawling
    let runs;
    const cacheFilename =
      [label, ...products, 'runs', formattedFrom, formattedTo].join('-') +
      '.json';
    const cacheFile = path.join(__dirname, '..', 'cache', cacheFilename);
    try {
      runs = JSON.parse(await fs.promises.readFile(cacheFile));
      if (runs.length) {
        cachedCount++;
      }
    } catch (e) {
      // No cache hit; load from the server instead.
      const url = `${runsUri}&from=${formattedFrom}&to=${formattedTo}`;
      const response = await fetch(url);
      runs = await response.json();

      if (from.isSameOrBefore(noCacheAfter)) {
        // Avoid caching for the last few days, as new runs may still appear
        // here; otherwise, cache unconditionally, even if we do not have an
        // aligned set of runs.
        await fs.promises.writeFile(cacheFile, JSON.stringify(runs));
      }
    }

    if (!runs.length) {
      continue;
    }

    if (runs.length !== products.length) {
      throw new Error(
          `Fetched ${runs.length} runs, expected ${products.length}`);
    }

    if (
      !runs.some(run =>
        moment(run.time_start, moment.ISO_8601).isSame(today, 'day'),
      )
    ) {
      continue;
    }

    alignedRuns.set(today.format('YYYY-MM-DD'), runs);
  }
  const after = moment();
  console.log(`Fetched ${alignedRuns.size} sets of runs in ` +
      `${after - before} ms (${cachedCount} cached)`);

  return alignedRuns;
}

// Returns the web features manifest asset of a wpt release, as returned by the
// GitHub releases API. Matches on the asset label rather than its name, which
// carries the revision the manifest was built from.
function findWebFeaturesManifestAsset(release) {
  const asset = release['assets'].find(
      a => a['label'] === WEB_FEATURES_MANIFEST_LABEL);
  if (!asset) {
    throw new Error(
        `No ${WEB_FEATURES_MANIFEST_LABEL} asset on ${release['tag_name']}`);
  }
  return asset;
}

// Parses the gzipped web features manifest in |buffer|, returning a map from
// feature to the set of tests that make up that feature. The manifest holds
// {version, data}, where data maps each feature to a list of test paths.
function parseWebFeaturesManifest(buffer) {
  const manifest = JSON.parse(zlib.gunzipSync(buffer));
  if (manifest['version'] !== 1) {
    throw new Error(
        `Unknown web features manifest version ${manifest['version']}`);
  }

  // Map from features to tests, as with the labeled tests in
  // interop-scoring/main.js.
  const featureTests = new Map();
  for (const [feature, tests] of Object.entries(manifest['data'])) {
    featureTests.set(feature, new Set(tests));
  }
  return featureTests;
}

// Fetches the web features manifest from the latest wpt release and returns a
// map from feature to the set of tests that make up that feature.
async function fetchWebFeaturesManifest() {
  const releaseResponse = await fetch(WPT_RELEASE_API);
  if (!releaseResponse.ok) {
    throw new Error(`non-OK fetch status ${releaseResponse.status} when ` +
        `fetching ${WPT_RELEASE_API}`);
  }
  const asset = findWebFeaturesManifestAsset(await releaseResponse.json());

  const assetResponse = await fetch(asset['browser_download_url']);
  if (!assetResponse.ok) {
    throw new Error(`non-OK fetch status ${assetResponse.status} when ` +
        `fetching ${asset['browser_download_url']}`);
  }
  return parseWebFeaturesManifest(await assetResponse.buffer());
}

module.exports = {
  get,
  getAll,
  getIterator,
  fetchAlignedRunsFromServer,
  fetchWebFeaturesManifest,
  findWebFeaturesManifestAsset,
  parseWebFeaturesManifest,
};

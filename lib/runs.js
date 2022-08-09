'use strict';

const fetch = require('node-fetch');
const fs = require('fs');
const moment = require('moment');
const path = require('path');
const {advanceDateToSkipBadDataIfNecessary} = require('../bad-ranges');

const RUNS_API = 'https://wpt.fyi/api/runs';

function apiURL(options = {}) {
  const queryParts = Object.entries(options).map(([name, value]) => {
    if (Array.isArray(value)) {
      value = value.join(',');
    }
    return `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  });
  const query = queryParts.join('&');
  return `${RUNS_API}?${query}`;
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
    if (!r.ok) {
      let msg = `non-OK fetch status ${r.status} when fetching ${url}`;
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
    url = `${RUNS_API}?page=${token}`;
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
  const alignedRuns = new Map();
  while (from < to) {
    const formattedFrom = from.format('YYYY-MM-DD');
    from.add(1, 'days');
    const formattedTo = from.format('YYYY-MM-DD');

    // We advance the date (if necessary) before doing anything more, so that
    // code later in the loop body can just 'continue' without checking.
    from = advanceDateToSkipBadDataIfNecessary(from, experimental);

    // Attempt to read the runs from the cache.
    // TODO: Consider https://github.com/tidoust/fetch-filecache-for-crawling
    let runs;
    const cacheFile = path.join(path.join(__dirname, '..'),
        `cache/${label}-${products.join('-')}-runs-${formattedFrom}.json`);
    try {
      runs = JSON.parse(await fs.promises.readFile(cacheFile));
      if (runs.length) {
        cachedCount++;
      }
    } catch (e) {
      // No cache hit; load from the server instead.
      const url = `${runsUri}&from=${formattedFrom}&to=${formattedTo}`;
      const response = await fetch(url);
      // Many days do not have an aligned set of runs, but we always write to
      // the cache to speed up future executions of this code.
      runs = await response.json();
      await fs.promises.writeFile(cacheFile, JSON.stringify(runs));
    }

    if (!runs.length) {
      continue;
    }

    if (runs.length !== products.length) {
      throw new Error(
          `Fetched ${runs.length} runs, expected ${products.length}`);
    }

    alignedRuns.set(formattedFrom, runs);
  }
  const after = moment();
  console.log(`Fetched ${alignedRuns.size} sets of runs in ` +
      `${after - before} ms (${cachedCount} cached)`);

  return alignedRuns;
}

module.exports = {get, getAll, getIterator, fetchAlignedRunsFromServer};

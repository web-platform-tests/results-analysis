'use strict';

const fetch = require('node-fetch');

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
  //console.log(`Fetching ${url}`);
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
  options = Object.assign({ 'max-count': 500 }, options);

  let url = apiURL(options)
  while (true) {
    const r = await fetch(url);
    if (!r.ok) {
      throw new Error(`non-OK fetch status ${r.status}`);
    }
    let runs = await r.json();
    for (const run of runs) {
      yield run;
    }
    const token = r.headers.get('wpt-next-page');
    if (!token) {
      break;
    }
    url = `${RUNS_API}?page=${token}`;
  }
}

module.exports = { get, getAll, getIterator };

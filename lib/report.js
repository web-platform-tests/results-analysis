'use strict';

const fetch = require ('node-fetch');
const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

// fetch report and cache
async function fetchReport(run, options = {}) {
  let cacheFile;
  let data;

  if (options.cacheDir) {
    cacheFile = `${cacheDir}/${run.id}.json`;
    try {
      data = await readFile(cacheFile);
      //console.info(`cache hit: ${cacheFile}`);
    } catch(e) {
      //console.info(`cache miss: ${cacheFile}`);
    }
  }

  if (!data) {
    const url = run.raw_results_url;
    data = await (await fetch(url)).text();
    if (cacheFile) {
      await writeFile(cacheFile, data);
    }
  }

  const report = JSON.parse(data);

  // modify in place and overwrite to not double memory usage
  report.results.sort((a, b) => a.test.localeCompare(b.test));

  if (options.convertToMap) {
    report.results = convertToMap(report.results);
  }

  return report;
}

// given a wpt report's `results` array-of-arrays representation of test
// and subtests, produce a map-of-maps instead.
function convertToMap(results) {
  const tests = new Map;
  for (const entry of results) {
    const name = entry.test;
    if (tests.has(name)) {
      throw new Error(`Duplicate test name: ${name}`);
    }

    const status = entry.status;

    const subtests = new Map;
    for (const subentry of entry.subtests) {
      const subname = subentry.name;
      if (subtests.has(subname)) {
        //console.warn(`Duplicate subtest name in ${name}: ${subname}`);
        // only keep the first clashing subtest
        continue;
      }
      // this could be just a string, but an object allows other code to treat
      // tests and tests similarly, using result.status;
      subtests.set(subname, { status: subentry.status });
    }

    tests.set(name, { status, subtests });
  }
  return tests;
}

module.exports = { fetch: fetchReport };

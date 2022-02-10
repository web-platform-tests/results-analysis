'use strict';

/**
 * Implements a view of how many browser specific failures each engine has over
 * time.
 */

const fetch = require('node-fetch');
const fs = require('fs');
const flags = require('flags');
const Git = require('nodegit');
const lib = require('./lib');
const moment = require('moment');

const {advanceDateToSkipBadDataIfNecessary} = require('./bad-ranges');

flags.defineString('from', '2018-07-01', 'Starting date (inclusive)');
flags.defineString('to', moment().format('YYYY-MM-DD'),
    'Ending date (exclusive)');
flags.defineString('baseline', null, 'A YYYY-MM-DD date to \'pin\' WPT to. ' +
    'Any test name not in existence on the baseline date will be ignored.');
flags.defineStringList('products', ['chrome', 'firefox', 'safari'],
    'Browsers to compare. Must match the products used on wpt.fyi');
flags.defineString('output', null,
    'Output CSV file to write to. Defaults to ' +
    '{stable, experimental}-browser-specific-failures.csv');
flags.defineBoolean('experimental', false,
    'Calculate metrics for experimental runs.');
flags.parse();

// YYYY-MM-DD
const BASELINE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const RUNS_URI = 'https://wpt.fyi/api/runs?aligned=true&max-count=1';

// Fetches aligned runs from the wpt.fyi server, between the |from| and |to|
// dates. If |experimental| is true fetch experimental runs, else stable runs.
// Returns a map of date to list of runs for that date (one per product)
//
// TODO: Known problem: there are periods of time, mostly mid-late 2018, where
// we ran both Safari 11.1 and 12.1, and the results are massively different.
// We should fetch multiple runs for each browser and have upgrade logic.
async function fetchAlignedRunsFromServer(products, from, to, experimental) {
  const label = experimental ? 'experimental' : 'stable';
  let params = `&label=master&label=${label}`;
  for (const product of products) {
    params += `&product=${product}`;
  }
  const runsUri = `${RUNS_URI}${params}`;

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
    const cacheFile =
        `cache/${label}-${products.join('-')}-runs-${formattedFrom}.json`;
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

async function main() {
  const baseline = flags.get('baseline');
  if (baseline != null && !BASELINE_REGEX.test(baseline)) {
    throw new Error('--baseline must be in the form YYYY-MM-DD');
  }

  // Sort the products so that output files are consistent.
  const products = flags.get('products');
  if (products.length < 2) {
    throw new Error('At least 2 products must be specified for this analysis');
  }
  products.sort();

  const repo = await Git.Repository.open('wpt-results.git');

  // First, grab aligned runs from the server for the dates that we are
  // interested in.
  const from = moment(flags.get('from'));
  const to = moment(flags.get('to'));
  const experimental = flags.get('experimental');
  const alignedRuns = await fetchAlignedRunsFromServer(
      products, from, to, experimental);

  // Verify that we have data for the fetched runs in the wpt-results repo.
  console.log('Getting local set of run ids from repo');
  let before = Date.now();
  const localRunIds = await lib.results.getLocalRunIds(repo);
  let after = Date.now();
  console.log(`Found ${localRunIds.size} ids (took ${after - before} ms)`);

  let hadErrors = false;
  for (const [date, runs] of alignedRuns.entries()) {
    for (const run of runs) {
      if (!localRunIds.has(run.id)) {
        // If you see this, you probably need to run git-write.js or just update
        // your wpt-results.git repo; see the README.md.
        console.error(`Run ${run.id} missing from local git repo (${date})`);
        hadErrors = true;
      }
    }
  }
  if (hadErrors) {
    throw new Error('Missing data for some runs (see errors logged above). ' +
        'Try running "git fetch --all --tags" in wpt-results/');
  }

  // Load the test result trees into memory; creates a list of recursive tree
  // structures: tree = { trees: [...], tests: [...] }. Each 'tree' represents a
  // directory, each 'test' is the results from a given test file.
  console.log('Iterating over all runs, loading test results');
  before = Date.now();
  for (const runs of alignedRuns.values()) {
    for (const run of runs) {
      // Just in case someone ever adds a 'tree' field to the JSON.
      if (run.tree) {
        throw new Error('Run JSON contains "tree" field; code needs changed.');
      }
      run.tree = await lib.results.getGitTree(repo, run);
    }
  }
  after = Date.now();
  console.log(`Loading ${alignedRuns.size} sets of runs took ` +
      `${after - before} ms`);

  const options = {};

  if (baseline) {
    // Gather the union of all test names known to the 'base' run.
    console.log(`Determining the set of base 'known' tests.`);
    // TODO(smcgruer): Use nearest next date instead.
    if (!alignedRuns.has(baseline)) {
      throw new Error(`Baseline date ${baseline} not present in test data.`);
    }

    const testNames = new Set();
    for (const run of alignedRuns.get(baseline)) {
      lib.results.walkTests(run.tree, (path, test, _) => {
        testNames.add(path + '/' + test);
      });
    }
    console.log(`Found ${testNames.size} tests for the base set.`);
    options.testFilter = testPath => testNames.has(testPath);
  }

  // We're ready to score the runs now!
  console.log('Calculating browser-specific failures for the runs');
  before = Date.now();
  const dateToScores = new Map();
  for (const [date, runs] of alignedRuns.entries()) {
    // The SHA should be the same for all runs, so just grab the first.
    const sha = runs[0].full_revision_hash;
    const versions = runs.map(run => run.browser_version);
    try {
      const scores = lib.browserSpecific.scoreBrowserSpecificFailures(
          runs, new Set(products), options);
      dateToScores.set(date, {sha, versions, scores});
    } catch (e) {
      e.message += `\n\tRuns: ${runs.map(r => r.id)}`;
      throw e;
    }
  }
  after = Date.now();
  console.log(`Done scoring (took ${after - before} ms)`);

  // Finally, time to dump stuff.
  let outputFilename = flags.get('output');
  if (!outputFilename) {
    outputFilename = experimental ?
        'experimental-browser-specific-failures.csv' :
        'stable-browser-specific-failures.csv';
  }

  console.log(`Writing data to ${outputFilename}`);

  let data = 'sha,date';
  for (const product of products) {
    data += `,${product}-version,${product}`;
  }
  data += '\n';

  // ES6 maps iterate in insertion order, and we initially inserted in date
  // order, so we can just iterate |dateToScores|.
  for (const [date, shaAndScores] of dateToScores) {
    const sha = shaAndScores.sha;
    const scores = shaAndScores.scores;
    const versions = shaAndScores.versions;
    if (!scores) {
      console.log(`ERROR: ${date} had no scores`);
      continue;
    }
    const csvRecord = [
      sha,
      date.substr(0, 10),
    ];
    for (let i = 0; i < products.length; i++) {
      csvRecord.push(versions[i]);
      csvRecord.push(scores.get(products[i]));
    }
    data += csvRecord.join(',') + '\n';
  }
  await fs.promises.writeFile(outputFilename, data, 'utf-8');
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});

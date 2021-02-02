'use strict'

// TODO: There's a lot of reused code from browser-specific-failures.js here,
// that could be put into lib/

const fetch = require('node-fetch');
const flags = require('flags');
const fs = require('fs');
const Git = require('nodegit');
const lib = require('../lib');
const moment = require('moment');

flags.defineString('category', 'css-flexbox',
    'Compat 2021 category to calculate data for');
flags.defineString('from', '2018-07-01', 'Starting date (inclusive)');
flags.defineString('to', moment().format('YYYY-MM-DD'),
    'Ending date (exclusive)');
flags.defineBoolean('experimental', false,
    'Calculate metrics for experimental runs.');
flags.parse();

// See documentation of advanceDateToSkipBadDataIfNecessary. These ranges are
// inclusive, exclusive.
const STABLE_BAD_RANGES = [
  // This was some form of Safari outage, undiagnosed but a clear erroneous
  // spike in failure rates.
  [moment('2019-02-06'), moment('2019-03-04')],
  // This was a safaridriver outage, resolved by
  // https://github.com/web-platform-tests/wpt/pull/18585
  [moment('2019-06-27'), moment('2019-08-23')],
  // This was a general outage due to the Taskcluster Checks migration.
  [moment('2020-07-08'), moment('2020-07-16')],
  // This was a Firefox outage which produced only partial test results.
  [moment('2020-07-21'), moment('2020-08-15')],
];
const EXPERIMENTAL_BAD_RANGES = [
  // This was a safaridriver outage, resolved by
  // https://github.com/web-platform-tests/wpt/pull/18585
  [moment('2019-06-27'), moment('2019-08-23')],
  // This was a general outage due to the Taskcluster Checks migration.
  [moment('2020-07-08'), moment('2020-07-16')],
];

// There have been periods where results cannot be considered valid and
// contribute noise to the metrics. Given a date, this function advances it as
// necessary to avoid bad data.
//
// TODO(smcgruer): Take into account --products being used.
function advanceDateToSkipBadDataIfNecessary(date, experimental) {
  const ranges = experimental ? EXPERIMENTAL_BAD_RANGES : STABLE_BAD_RANGES;
  for (const range of ranges) {
    if (date >= range[0] && date < range[1]) {
      console.log(`Skipping from ${date.format('YYYY-MM-DD')} to ` +
          `${range[1].format('YYYY-MM-DD')} due to bad data`);
      return range[1];
    }
  }
  return date;
}

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
        `../cache/${label}-${products.join('-')}-runs-${formattedFrom}.json`;
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

async function loadTestFilter(category) {
  const filename = category + '-tests.txt'
  const contents = await fs.promises.readFile(filename, 'utf-8');
  return new Set(contents.split('\n'));
}

async function main() {
  const products = ['chrome', 'firefox', 'safari'];
  const repo = await Git.Repository.open('../wpt-results.git');

  const category = flags.get('category')
  const testFilter = await loadTestFilter(category);

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

  before = Date.now();
  const dateToScores = new Map();
  for (const [date, runs] of alignedRuns.entries()) {
    // The SHA should be the same for all runs, so just grab the first.
    const sha = runs[0].full_revision_hash;
    const versions = runs.map(run => run.browser_version);
    let scores = [];
    // Map of testname --> [(x, y), ...], where x is the number of passes and y
    // the total number of tests for the given testname.
    let testResults = new Map();
    try {
      for (const run of runs) {
        let failingTests = 0;

        lib.results.walkTests(run.tree, (path, test, results) => {
          const testname = path + '/' + test;
          if (!testFilter.has(testname))
            return;

          if (!testResults.has(testname))
            testResults.set(testname, []);

          // TODO: Validate the data, check that all statuses are known.

          // TODO: Do we want to treat subtest failingTests as % of a fail?
          let passes = 0;
          let total = 1;
          if ('subtests' in results) {
            total = results['subtests'].length;
            for (const subtest of results['subtests']) {
              if (subtest['status'] == 'PASS') {
                passes += 1;
              }
            }
          } else if (results['status'] == 'PASS') {
            passes += 1;
          }
          if (passes < total) {
            failingTests += 1;
          }

          testResults.get(testname).push([passes, total]);
        });
        scores.push(failingTests);
      }
      dateToScores.set(date, {sha, versions, scores, testResults});
    } catch (e) {
      e.message += `\n\tRuns: ${runs.map(r => r.id)}`;
      throw e;
    }
  }
  after = Date.now();
  console.log(`Done scoring (took ${after - before} ms)`);

  let data = 'sha,date';
  for (const product of products) {
    data += `,${product}-version,${product}`;
  }
  data += '\n';

  // ES6 maps iterate in insertion order, and we initially inserted in date
  // order, so we can just iterate |dateToScores|.
  let testResults;
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
      csvRecord.push(scores[i]);
    }
    data += csvRecord.join(',') + '\n';

    // We only want to write out results for the latest dateToScores, so we
    // just keep overriding it until the loop is over.
    testResults = shaAndScores.testResults;
  }

  const csvFilename = experimental ?
      `${category}-experimental.csv` :
      `${category}-stable.csv`;
  await fs.promises.writeFile(csvFilename, data, 'utf-8');
  console.log(`Wrote results to ${csvFilename}`);

  // Write out the full results for the latest run.
  data = 'testname';
  for (const product of products) {
    data += `,${product}`;
  }
  data += '\n';

  for (const [testname, results] of testResults) {
    const csvRecord = [testname];
    for (const result of results) {
      csvRecord.push(result.join('/'));
    }
    data += csvRecord.join(',') + '\n';
  }

  const resultsCsvFilename = experimental ?
      `${category}-experimental-full-results.csv` :
    `${category}-stable-full-results.csv`;
  await fs.promises.writeFile(resultsCsvFilename, data, 'utf-8');
  console.log(`Wrote latest run results to ${resultsCsvFilename}`);
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
}); 

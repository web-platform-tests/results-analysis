'use strict';

/**
 * Implements test results scoring for Interop 2022 as described in the RFC:
 * https://github.com/web-platform-tests/rfcs/blob/master/rfcs/interop_2022.md#metrics
 *
 * Note that the scaling to 90% happens in the https://wpt.fyi/interop-2022 frontend.
 */

const fetch = require('node-fetch');
const flags = require('flags');
const fs = require('fs');
const Git = require('nodegit');
const lib = require('../lib');
const moment = require('moment');
const path = require('path');

const {advanceDateToSkipBadDataIfNecessary} = require('../bad-ranges');

flags.defineStringList('products', ['chrome', 'firefox', 'safari'],
    'Products to include (comma-separated)');
flags.defineString('from', '2022-01-01', 'Starting date (inclusive)');
flags.defineString('to', moment().format('YYYY-MM-DD'),
    'Ending date (exclusive)');
flags.defineBoolean('experimental', false,
    'Calculate metrics for experimental runs.');
flags.parse();

const ROOT_DIR = path.join(__dirname, '..');

const CATEGORIES = [
  'interop-2021-aspect-ratio',
  'interop-2021-flexbox',
  'interop-2021-grid',
  'interop-2021-position-sticky',
  'interop-2021-transforms',
  'interop-2022-cascade',
  'interop-2022-color',
  'interop-2022-contain',
  'interop-2022-dialog',
  'interop-2022-forms',
  'interop-2022-scrolling',
  'interop-2022-subgrid',
  'interop-2022-text',
  'interop-2022-viewport',
  'interop-2022-webcompat',
];

const RUNS_URI = 'https://wpt.fyi/api/runs?aligned=true&max-count=1';

// All non-OK harness statuses. Any non-OK harness status should be investigated
// before being added to this list, so that we don't score tests in the wrong
// way because of a test or infrastructure issue.
const KNOWN_TEST_STATUSES = new Set([
  // TIMEOUT in Safari due to https://webkit.org/b/212201
  '/css/css-grid/grid-definition/grid-limits-001.html',
  // TIMEOUT in Firefox and Safari, all subtests present
  '/css/css-scroll-snap/input/keyboard.html',
  // ERROR in Firefox, TIMEOUT in Safari, all subtests failing in Chrome
  '/css/css-scroll-snap/input/snap-area-overflow-boundary.html',
  // TIMEOUT in Chrome with TIMEOUT subtests
  '/dom/events/Event-dispatch-click.html',
  // ERROR in Safari but linked bug is fixed
  '/html/browsers/browsing-the-web/navigating-across-documents/replace-before-load/form-requestsubmit-during-load.html',
  '/html/browsers/browsing-the-web/navigating-across-documents/replace-before-load/form-requestsubmit-during-pageshow.html',
  // TIMEOUT in Safari, but just a single subtest
  '/html/semantics/forms/form-submission-0/form-double-submit-multiple-targets.html',
  // TIMEOUT in Firefox and Safari, but just a single subtest
  '/html/semantics/forms/form-submission-0/form-double-submit-to-different-origin-frame.html',
  // TIMEOUT in Safari but all passing subtests due to https://bugs.webkit.org/show_bug.cgi?id=235407
  '/html/semantics/forms/form-submission-target/rel-base-target.html',
  '/html/semantics/forms/form-submission-target/rel-button-target.html',
  '/html/semantics/forms/form-submission-target/rel-form-target.html',
  '/html/semantics/forms/form-submission-target/rel-input-target.html',
  // ERROR in Firefox 95 and Safari 15.2, since fixed
  '/html/semantics/interactive-elements/the-dialog-element/dialog-showModal.html',
  // ERROR in Chrome 96, since fixed
  '/html/semantics/interactive-elements/the-dialog-element/modal-dialog-ancestor-is-inert.html',
  // TIMEOUT in Safari, but all subtests present
  '/html/semantics/forms/textfieldselection/select-event.html',
  '/html/semantics/forms/textfieldselection/selection-start-end.html',
  '/html/semantics/forms/textfieldselection/textfieldselection-setRangeText.html',
  '/html/semantics/forms/textfieldselection/textfieldselection-setSelectionRange.html',
  // TIMEOUT in Firefox 98, since fixed
  '/html/semantics/forms/the-input-element/image-click-form-data.html',
  // TIMEOUT in Safari, but all subtests present
  '/html/semantics/forms/the-input-element/range-restore-oninput-onchange-event.html',
  // TIMEOUT in STP 137, since fixed
  '/html/semantics/interactive-elements/the-dialog-element/backdrop-receives-element-events.html',
]);

// Fetches aligned runs from the wpt.fyi server, between the |from| and |to|
// dates. If |experimental| is true fetch experimental runs, else stable runs.
// Returns a map of date to list of runs for that date (one per product)
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
    const cacheFile = path.join(ROOT_DIR,
        `cache/${label}-${products.join('-')}-runs-${formattedFrom}.json`);
    try {
      runs = JSON.parse(await fs.promises.readFile(cacheFile));
      if (runs.length) {
        cachedCount++;
      }
    } catch (e) {
      let url = `${runsUri}&from=${formattedFrom}&to=${formattedTo}`;
      // HACK: Handle WebKitGTK runs being delayed vs other runs by extending
      // the search radius if WebKitGTK is being requested.
      if (products.includes('webkitgtk')) {
        url = `${runsUri}&from=${formattedFrom}T00:00:00Z&to=${formattedTo}T23:59:59Z`;
      }
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

// Score a set of runs (independently) on a set of tests. The runs are presumed
// to be aligned in some way (i.e. they were all run at the same WPT SHA).
//
// Returns an array of [scores, testResults], where:
//
//   * scores is an array of top-level score  (integer 0-1000) for each
//     corresponding input run.
//   * testResults is a map from a specific test (represented by its full path)
//     to an array of (passing subtest count, total subtest count) for each
//     corresponding input run.
//
// To get the top-level score for a run, each test in that run that is present
// in |allTestsSet| is examined. Each test is scored 0-1000 based on the
// fraction of its subtests that pass, with rounding down so that 1000 means
// all subtests pass. Reftests score either 0 or 1000. These test scores are
// then summed and divided by the size of |allTestsSet|, again rounding down.
//
// This methodology has several consequences:
//
//   1. Individual tests do have a heavier weight than subtests. This could be
//   gamed, by splitting passing tests into multiple files rather than using
//   subtests (or conversely by combining failing tests into subtests in a
//   single file).
//
//   2. If |allTestsSet| is constant across runs *through time*, older runs may
//   not have entries for tests were only added recently and will be penalized
//   for that. This is deliberate - see the comment block later in this
//   function for why.
//
//   3. We could show (on wpt.fyi) scores at both the test and category level as
//   a percentage with one decimal point, and what a user would see would be the
//   same numbers that go into the total score, with no hidden rounding error.
//
//   4. Because we round down twice, the score for a category can end up lower
//   than if we used rational numbers.
function scoreRuns(runs, allTestsSet) {
  const scores = [];
  const testResults = new Map();
  try {
    for (const run of runs) {
      // Sum of the integer 0-1000 scores for each test.
      let score = 0;

      lib.results.walkTests(run.tree, (path, test, results) => {
        const testname = path + '/' + test;
        if (!allTestsSet.has(testname)) {
          return;
        }

        if (!testResults.has(testname)) {
          testResults.set(testname, []);
        }

        // TODO: Validate the data by checking that all statuses are recognized.

        let subtestPasses = 0;
        let subtestTotal = 1;
        if ('subtests' in results) {
          if (results['status'] != 'OK' && !KNOWN_TEST_STATUSES.has(testname)) {
            throw new Error(`Unexpected non-OK status for test: ${testname}`);
          }
          subtestTotal = results['subtests'].length;
          for (const subtest of results['subtests']) {
            if (subtest['status'] == 'PASS') {
              subtestPasses += 1;
            }
          }
        } else if (results['status'] == 'PASS') {
          subtestPasses = 1;
        }

        // A single test is scored 0-1000 based on how many of its subtests
        // pass, rounding down so that 1000 always means fully passing.
        score += Math.floor(1000 * subtestPasses / subtestTotal);

        // TODO: I suspect this doesn't handle missing test results properly,
        // as we assume every run has every test so that the testResults arrays
        // align with |runs|?
        testResults.get(testname).push([subtestPasses, subtestTotal]);
      });

      // We always normalize against the number of tests we are looking for,
      // rather than the total number of tests we found. The trade-off is all
      // about new tests being added to the set.
      //
      // If a large chunk of tests are introduced at date X, and they fail in
      // some browser, then runs after date X look worse if you're only
      // counting total tests found - even though the tests would have failed
      // before date X as well.
      //
      // Conversely, if a large chunk of tests are introduced at date X, and
      // they pass in some browser, then runs after date X would get an
      // artificial boost in pass-rate due to this - even if the tests would
      // have passed before date X as well.
      //
      // We consider the former case worse than the latter, so optimize for it
      // by always comparing against the full test list. This does mean that
      // when tests are added to the set, previously generated data is no
      // longer valid and this script should be re-run for all dates.
      scores.push(Math.floor(score / allTestsSet.size));
    }
  } catch (e) {
    e.message += `\n\tRuns: ${runs.map(r => r.id)}`;
    throw e;
  }

  return [scores, testResults];
}

async function scoreCategory(category, experimental, products, alignedRuns,
    testsSet) {
  // Score the test runs.
  const before = Date.now();
  const dateToScores = new Map();
  for (const [date, runs] of alignedRuns.entries()) {
    // The SHA should be the same for all runs, so just grab the first.
    const sha = runs[0].full_revision_hash;
    const versions = runs.map(run => run.browser_version);
    const [scores, testResults] = scoreRuns(runs, testsSet);
    dateToScores.set(date, {sha, versions, scores, testResults});
  }
  const after = Date.now();
  console.log(`Done scoring (took ${after - before} ms)`);

  // Return dateToScores, so that our caller can calculate the summary across
  // multiple categories.
  return dateToScores;
}

async function main() {
  const products = flags.get('products');
  const repo = await Git.Repository.open(
      path.join(ROOT_DIR, 'wpt-results.git'));

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

  const dateToScoresMaps = new Map();

  // Map from labels to tests (includes)
  const labeledTests = new Map();
  const url = 'https://wpt.fyi/api/metadata?includeTestLevel=true&product=chrome';
  const response = await fetch(url);
  const metadata = await response.json();
  for (const [test, metadataList] of Object.entries(metadata)) {
    for (const {label} of metadataList) {
      if (label) {
        if (!labeledTests.has(label)) {
          labeledTests.set(label, new Set());
        }
        labeledTests.get(label).add(test);
      }
    }
  }

  for (const category of CATEGORIES) {
    console.log(`Scoring runs for ${category}`);
    const testsSet = labeledTests.get(category);
    if (!testsSet || !testsSet.size) {
      throw new Error(`No tests labeled for ${category}`);
    }
    const dateToScores = await scoreCategory(category, experimental, products,
        alignedRuns, testsSet);

    // Store the entire dateToScores for producing the unified CSV later.
    dateToScoresMaps.set(category, dateToScores);
  }

  // TODO: Once the other score CSVs are no longer used, we can push
  // some of this logic into scoreCategory and simplify things.
  let unifiedCsv = 'date';
  for (const product of products) {
    const categoryLabels = CATEGORIES.map(c => `${product}-${c}`);
    unifiedCsv += `,${product}-version,${categoryLabels.join()}`;
  }
  unifiedCsv += '\n';

  // We know that all dateToScoresMaps have the same dates (as they come from
  // the same runs), so we can just iterate the keys from the first.
  for (const date of dateToScoresMaps.get(CATEGORIES[0]).keys()) {
    let csvLine = [date.substr(0, 10)];
    // This is essentially an inversion loop; we have the data mapped by
    // individual categories, but we need it mapped by product.
    for (let browserIdx = 0; browserIdx < products.length; browserIdx++) {
      let version;
      const productScores = [];
      for (const category of CATEGORIES) {
        const {versions, scores} = dateToScoresMaps.get(category).get(date);
        const score = scores[browserIdx];
        productScores.push(score);
        // The versions should all be the same, so we just grab the latest one.
        version = versions[browserIdx];
      }
      csvLine.push(version);
      csvLine = csvLine.concat(productScores);
    }
    unifiedCsv += `${csvLine.join()}\n`;
  }

  const csvFilename = experimental ?
      `interop-2022-experimental.csv` : `interop-2022-stable.csv`;
  await fs.promises.writeFile(csvFilename, unifiedCsv, 'utf-8');
  console.log(`Wrote scores to ${csvFilename}`);
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});

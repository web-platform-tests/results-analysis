/* eslint-disable max-len */

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
const interopData = require('./category-data.json');

flags.defineStringList('products', ['chrome', 'firefox', 'safari'],
    'Products to include (comma-separated)');
flags.defineString('year', '2022', 'Interop year to calculate');
flags.defineString('from', '2022-01-01', 'Starting date (inclusive)');
flags.defineString('to', moment().format('YYYY-MM-DD'),
    'Ending date (exclusive)');
flags.defineBoolean('experimental', false,
    'Calculate metrics for experimental runs.');
flags.parse();

const ROOT_DIR = path.join(__dirname, '..');

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


  /**
   * The tests below have non-OK statuses that have not been investigated as of today.
   */
  // interop-2023-contain
  '/css/css-contain/container-queries/nested-query-containers.html',
  '/css/css-contain/content-visibility/content-visibility-input-image.html',
  '/css/css-contain/content-visibility/content-visibility-031.html',
  '/css/css-contain/content-visibility/content-visibility-auto-state-changed.html',
  '/css/selectors/invalidation/fullscreen-pseudo-class-in-has.html',
  '/css/selectors/invalidation/modal-pseudo-class-in-has.html',
  '/css/selectors/invalidation/user-action-pseudo-classes-in-has.html',
  // interop-2023-modules
  '/html/semantics/scripting-1/the-script-element/import-assertions/empty-assertion-clause.html',
  '/html/semantics/scripting-1/the-script-element/import-assertions/unsupported-assertion.html',
  '/workers/modules/dedicated-worker-import-blob-url.any.html',
  '/workers/modules/dedicated-worker-import-blob-url.any.worker.html',
  '/workers/modules/dedicated-worker-import-data-url-cross-origin.html',
  '/workers/modules/dedicated-worker-import-data-url.any.html',
  '/workers/modules/dedicated-worker-import-data-url.any.worker.html',
  '/workers/modules/dedicated-worker-import-meta.html',
  '/workers/modules/dedicated-worker-import.any.html',
  '/workers/modules/dedicated-worker-import.any.worker.html',
  '/workers/modules/dedicated-worker-options-credentials.html',
  '/workers/modules/dedicated-worker-parse-error-failure.html',
  '/workers/modules/shared-worker-import-data-url-cross-origin.html',
  '/workers/modules/shared-worker-import-data-url.window.html',
  '/workers/modules/shared-worker-options-credentials.html',
  '/workers/modules/shared-worker-parse-error-failure.html',
  '/import-maps/acquiring/modulepreload-link-header.html',
  '/import-maps/acquiring/modulepreload.html',
  '/workers/modules/shared-worker-import-failure.html',
  '/import-maps/acquiring/dynamic-import.html',
  '/import-maps/acquiring/script-tag-inline.html',
  '/import-maps/acquiring/script-tag.html',
  '/import-maps/bare-specifiers.sub.html',
  // interop-2023-offscreencanvas
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.repeat.outside.html',
  '/html/canvas/offscreen/manual/filter/offscreencanvas.filter.w.html',
  '/html/canvas/offscreen/manual/convert-to-blob/offscreencanvas.convert.to.blob.w.html',
  '/html/canvas/offscreen/manual/draw-generic-family/2d.text.draw.generic.family.w.html',
  '/html/canvas/offscreen/manual/filter/offscreencanvas.filter.w.html',
  '/html/canvas/offscreen/manual/the-offscreen-canvas/offscreencanvas.commit.w.html',
  '/html/canvas/offscreen/manual/the-offscreen-canvas/offscreencanvas.transfer.to.imagebitmap.w.html',
  '/html/canvas/offscreen/manual/the-offscreen-canvas/offscreencanvas.transferrable.w.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.repeat.basic.html',
  '/html/canvas/offscreen/drawing-images-to-the-canvas/2d.drawImage.animated.poster.html',
  '/html/canvas/offscreen/compositing/2d.composite.globalAlpha.imagepattern.html',
  '/html/canvas/offscreen/compositing/2d.composite.uncovered.pattern.copy.html',
  '/html/canvas/offscreen/compositing/2d.composite.uncovered.pattern.destination-atop.html',
  '/html/canvas/offscreen/compositing/2d.composite.uncovered.pattern.destination-in.html',
  '/html/canvas/offscreen/compositing/2d.composite.uncovered.pattern.source-in.html',
  '/html/canvas/offscreen/compositing/2d.composite.uncovered.pattern.source-out.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.basic.image.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.crosscanvas.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.norepeat.basic.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.norepeat.coord1.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.norepeat.coord2.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.norepeat.coord3.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.norepeat.outside.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.repeat.coord3.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.repeatx.coord1.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.repeatx.outside.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.repeaty.basic.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.repeaty.coord1.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.repeaty.outside.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.repeat.empty.html',
  '/html/canvas/offscreen/shadows/2d.shadow.pattern.basic.html',
  '/html/canvas/offscreen/shadows/2d.shadow.pattern.transparent.2.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.repeat.coord2.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.repeatx.basic.html',
  '/html/canvas/offscreen/shadows/2d.shadow.pattern.alpha.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.orientation.image.html',
  '/html/canvas/offscreen/fill-and-stroke-styles/2d.pattern.paint.repeat.coord1.html',
  '/html/canvas/offscreen/shadows/2d.shadow.pattern.transparent.1.html',
  // interop-2023-events
  '/uievents/mouse/cancel-mousedown-in-subframe.html',
  '/pointerevents/pointerevent_attributes_hoverable_pointers.html?mouse',
  '/pointerevents/pointerevent_attributes_nohover_pointers.html',
  '/pointerevents/pointerevent_disabled_form_control.html?mouse',
  '/html/user-activation/activation-trigger-pointerevent.html?mouse',
  '/pointerevents/pointerevent_movementxy.html?mouse',
  '/pointerevents/pointerevent_pointercapture_in_frame.html?mouse',
  '/uievents/mouse/attributes.html',
  // interop-2023-webcodecs
  '/webcodecs/videoDecoder-codec-specific.https.any.html?av1',
  '/webcodecs/videoDecoder-codec-specific.https.any.html?h264_annexb',
  '/webcodecs/videoDecoder-codec-specific.https.any.html?h264_avc',
  '/webcodecs/videoDecoder-codec-specific.https.any.html?vp8',
  '/webcodecs/videoDecoder-codec-specific.https.any.html?vp9',
  '/webcodecs/videoDecoder-codec-specific.https.any.worker.html?av1',
  '/webcodecs/videoDecoder-codec-specific.https.any.worker.html?h264_annexb',
  '/webcodecs/videoDecoder-codec-specific.https.any.worker.html?h264_avc',
  '/webcodecs/videoDecoder-codec-specific.https.any.worker.html?vp8',
  '/webcodecs/videoDecoder-codec-specific.https.any.worker.html?vp9',
  '/webcodecs/videoDecoder-codec-specific.https.any.worker.html?av1',
  '/webcodecs/videoFrame-construction.any.html',
  '/webcodecs/videoFrame-construction.crossOriginSource.sub.html',
  '/webcodecs/videoFrame-construction.window.html',
  '/webcodecs/videoFrame-serialization.crossAgentCluster.https.html',
  '/webcodecs/videoFrame-serialization.crossAgentCluster.https.html',
  '/webcodecs/temporal-svc-encoding.https.any.html?h264',
  '/webcodecs/temporal-svc-encoding.https.any.html?vp8',
  '/webcodecs/temporal-svc-encoding.https.any.html?vp9',
  '/webcodecs/temporal-svc-encoding.https.any.worker.html?h264',
  '/webcodecs/temporal-svc-encoding.https.any.worker.html?vp8',
  '/webcodecs/temporal-svc-encoding.https.any.worker.html?vp9',
  '/webcodecs/videoFrame-serialization.crossAgentCluster.https.html',
  '/webcodecs/videoFrame-serialization.crossAgentCluster.https.html',
  '/webcodecs/videoFrame-serialization.crossAgentCluster.https.html',
  '/webcodecs/full-cycle-test.https.any.html?av1',
  '/webcodecs/full-cycle-test.https.any.html?h264_annexb',
  '/webcodecs/full-cycle-test.https.any.html?h264_avc',
  '/webcodecs/full-cycle-test.https.any.html?vp9_p0',
  '/webcodecs/full-cycle-test.https.any.html?vp9_p2',
  '/webcodecs/full-cycle-test.https.any.worker.html?av1',
  '/webcodecs/full-cycle-test.https.any.worker.html?h264_annexb',
  '/webcodecs/full-cycle-test.https.any.worker.html?h264_avc',
  '/webcodecs/full-cycle-test.https.any.worker.html?vp9_p0',
  '/webcodecs/full-cycle-test.https.any.worker.html?vp9_p2',
  '/webcodecs/full-cycle-test.https.any.html?vp8',
  '/webcodecs/full-cycle-test.https.any.worker.html?vp8',
  // interop-2023-webcomponents
  '/shadow-dom/focus/focus-shadowhost-display-none.html',
  '/custom-elements/form-associated/ElementInternals-labels.html',
  '/custom-elements/form-associated/ElementInternals-setFormValue.html',
  '/custom-elements/form-associated/ElementInternals-validation.html',
  '/custom-elements/form-associated/form-disabled-callback.html',
]);


function aggregateInteropTestScores(interopScores, numRuns) {
  if (interopScores.length === 0) return 0;
  let aggregateScore = 0;
  for (const [, results] of interopScores) {
    let subtestsAllPassing = 0;
    for (const [, subtestResults] of results) {
      // A subtest passes if it is marked as passing for every array.
      // The length is checked to make sure there was no missing value for a browser.
      if (subtestResults.length === numRuns && subtestResults.every(isPassed => isPassed)) {
        subtestsAllPassing += 1;
      }
    }
    aggregateScore += Math.floor(1000 * subtestsAllPassing / results.size);
  }
  return Math.floor(aggregateScore / interopScores.size) || 0;
}

// Score a set of runs (independently) on a set of tests. The runs are presumed
// to be aligned in some way (i.e. they were all run at the same WPT SHA).
//
// Returns an array of scores, which is the top-level score (integer 0-1000) for
// each corresponding input run.
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
  const interopScores = new Map();
  try {
    for (const run of runs) {
      // Sum of the integer 0-1000 scores for each test.
      let score = 0;
      lib.results.walkTests(run.tree, (path, test, results) => {
        const testname = path + '/' + test;
        if (!allTestsSet.has(testname)) {
          return;
        }

        // TODO: Validate the data by checking that all statuses are recognized.

        let subtestPasses = 0;
        let subtestTotal = 1;

        // Keep subtest data for every test in order to calculate interop scores.
        // A test entry is created for each test in the first run.
        if (!interopScores.has(testname)) {
          interopScores.set(testname, new Map());
        }
        if ('subtests' in results) {
          if (results['status'] != 'OK' && !KNOWN_TEST_STATUSES.has(testname)) {
            throw new Error(`Unexpected non-OK status for test: ${testname}`);
          }
          subtestTotal = results['subtests'].length;
          for (const subtest of results['subtests']) {
            // Keep a boolean array that represents whether each browser passed the subtest.
            if (!interopScores.get(testname).has(subtest.name)) {
              interopScores.get(testname).set(subtest.name, []);
            }
            if (subtest['status'] == 'PASS') {
              subtestPasses += 1;
            }

            // Push the pass/fail result to the subtest array.
            interopScores.get(testname).get(subtest.name).push(subtest['status'] == 'PASS');
          }
        } else {
          // If there are no subtests, just keep a single "overall" prop
          // in the subtests object to determine interop score for the test.
          if (!(interopScores.get(testname).has('overall'))) {
            interopScores.get(testname).set('overall', []);
          }
          interopScores.get(testname).get('overall').push(results['status'] == 'PASS');
          if (results['status'] == 'PASS') {
            subtestPasses = 1;
          }
        }
        // A single test is scored 0-1000 based on how many of its subtests
        // pass, rounding down so that 1000 always means fully passing.
        score += Math.floor(1000 * subtestPasses / subtestTotal);
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
  // Calculate the interop scores that have been saved and add
  // The interop score to the end of the browsers' scores array.
  scores.push(aggregateInteropTestScores(interopScores, runs.length));
  return scores;
}

async function scoreCategory(category, experimental, products, alignedRuns,
    testsSet) {
  // Score the test runs.
  const before = Date.now();
  const dateToScores = new Map();
  for (const [date, runs] of alignedRuns.entries()) {
    const versions = runs.map(run => run.browser_version);
    const scores = scoreRuns(runs, testsSet);
    dateToScores.set(date, {versions, scores});
  }
  const after = Date.now();
  console.log(`Done scoring (took ${after - before} ms)`);

  // Return dateToScores, so that our caller can calculate the summary across
  // multiple categories.
  return dateToScores;
}

async function main() {
  const year = (flags.isSet('year')) ? flags.get('year') : '2022';
  if (!year in interopData) {
    throw new Error(`Categories not defined for year ${year}`);
  }
  const categories = interopData[year].categories;

  const products = flags.get('products');
  const repo = await Git.Repository.open(
      path.join(ROOT_DIR, 'results-analysis-cache.git'));

  // First, grab aligned runs from the server for the dates that we are
  // interested in.
  const from = (flags.isSet('from')) ? moment(flags.get('from')) : moment(`${year}-01-01`);
  const to = (flags.isSet('to')) ? moment(flags.get('to')) : moment();

  const experimental = flags.get('experimental');
  const alignedRuns = await lib.runs.fetchAlignedRunsFromServer(
      products, from, to, experimental);

  // Verify that we have data for the fetched runs in the results-analysis-cache
  // repo.
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
        // your results-analysis-cache.git repo; see the README.md.
        console.error(`Run ${run.id} missing from local git repo (${date})`);
        hadErrors = true;
      }
    }
  }
  if (hadErrors) {
    throw new Error('Missing data for some runs (see errors logged above). ' +
        'Try running "git fetch --all --tags" in results-analysis-cache/');
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
  // category is an object with "name" and "labels" props.
  for (const category of categories) {
    console.log(`Scoring runs for ${category.name}`);
    const testsSet = new Set();
    // We aggregate all the tests with the labels defined in the category.
    for (const label of category.labels) {
      const labeledTestsSet = labeledTests.get(label);
      if (!labeledTestsSet || !labeledTestsSet.size) {
        throw new Error(`No tests labeled for ${label}`);
      }
      labeledTestsSet.forEach(test => testsSet.add(test));
    }
    const dateToScores = await scoreCategory(category, experimental, products,
        alignedRuns, testsSet);
    // Store the entire dateToScores for producing the unified CSV later.
    dateToScoresMaps.set(category.name, dateToScores);
  }

  // TODO: Once the other score CSVs are no longer used, we can push
  // some of this logic into scoreCategory and simplify things.
  let unifiedCsv = 'date';
  for (const product of products) {
    const categoryLabels = categories.map(c => `${product}-${c.name}`);
    unifiedCsv += `,${product}-version,${categoryLabels.join()}`;
  }
  // Add the interop category headers.
  unifiedCsv += `,interop-version,${categories.map(c => `interop-${c.name}`)}`;
  unifiedCsv += '\n';

  // We know that all dateToScoresMaps have the same dates (as they come from
  // the same runs), so we can just iterate the keys from the first.
  for (const date of dateToScoresMaps.get(categories[0].name).keys()) {
    let csvLine = [date.substr(0, 10)];
    // This is essentially an inversion loop; we have the data mapped by
    // individual categories, but we need it mapped by product.
    for (let browserIdx = 0; browserIdx < products.length; browserIdx++) {
      let version;
      const productScores = [];
      for (const category of categories) {
        const {versions, scores} = dateToScoresMaps.get(category.name).get(date);
        const score = scores[browserIdx];
        productScores.push(score);
        // The versions should all be the same, so we just grab the latest one.
        version = versions[browserIdx];
      }
      csvLine.push(version);
      csvLine = csvLine.concat(productScores);
    }
    // Add the interop scores for each category.
    csvLine.push('-');
    for (const category of categories) {
      const scoreInfo = dateToScoresMaps.get(category.name).get(date);
      const categoryInteropScore = scoreInfo.scores[products.length];
      csvLine.push(categoryInteropScore);
    }
    unifiedCsv += `${csvLine.join()}\n`;
  }

  const csvFilename = experimental ?
      `interop-${year}-experimental.csv` : `interop-${year}-stable.csv`;
  await fs.promises.writeFile(csvFilename, unifiedCsv, 'utf-8');
  console.log(`Wrote scores to ${csvFilename}`);
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});

'use strict';

/**
 * Implements functionality to report on how many WPT tests fail only on one
 * browser (aka browser-specific failures).
 */

const TEST_PASS_STATUSES = ['PASS'];
const TEST_FAIL_STATUSES = ['FAIL', 'ERROR', 'TIMEOUT', 'CRASH'];
// An empty string has been seen for some tests; see
// https://github.com/web-platform-tests/wpt/issues/22306
const TEST_NEUTRAL_STATUSES = ['PRECONDITION_FAILED', 'SKIP', ''];
const KNOWN_TEST_STATUSES = TEST_PASS_STATUSES.concat(
    TEST_FAIL_STATUSES, TEST_NEUTRAL_STATUSES);

const SUBTEST_PASS_STATUSES = ['PASS'];
const SUBTEST_FAIL_STATUSES = ['FAIL', 'ERROR', 'TIMEOUT', 'NOTRUN'];
const SUBTEST_NEUTRAL_STATUSES = ['PRECONDITION_FAILED', 'SKIP'];
const KNOWN_SUBTEST_STATUSES = SUBTEST_PASS_STATUSES.concat(
    SUBTEST_FAIL_STATUSES, SUBTEST_NEUTRAL_STATUSES);

// Across runs of WPT, there is a lot of duplication of results. Since we store
// the results in a Git repository, lib/results.js is able to automatically
// de-duplicate identical sub-trees (directories) and blobs (test files), and
// assign them unique identitifers. We can then use those unique identifiers to
// cache score results for sets of sub-trees and tests that we see when scoring
// many browser runs.
//
// These caches map from collections of input sub-trees or input tests, to the
// score array created for them. Note that order is important; if we see the
// sub-trees '1-2-3' and cache a score array [a, b, c] for them, we *cannot*
// re-use [a, b, c] if we later see '3-2-1' (the array would be [c, b, a]
// then!). In theory one could do some clever work to re-order the score array
// in that case, but it's overkill; the naive caches here reduce the processing
// time from ~minutes per year of runs to ~3s a year on my desktop.
const treesScoreCache = new Map;
const testsScoreCache = new Map;

// A helper class providing an iterator-like interface to either an Object with
// enumerable properties, or an Array. Iterates in a sorted order determined by
// |comparatorFunc|.
//
// Note that this class mutates the input |arrOrObject|.
class IteratorHelper {
  constructor(arrOrObject, comparatorFunc) {
    this.currentIndex = 0;
    this.values = arrOrObject;
    this.comparator = comparatorFunc;

    if (Array.isArray(this.values)) {
      this.keys = null;
      this.maxIndex = this.values.length - 1;
      this.values.sort(comparatorFunc);
    } else {
      this.keys = Object.keys(this.values);
      this.maxIndex = this.keys.length - 1;
      this.keys.sort(comparatorFunc);
    }
  }

  hasCurrent() {
    return this.currentIndex <= this.maxIndex;
  }

  // Advances the iterator to the next element of the collection. Returns true
  // if the iterator was successfully advanced, false if it has passed the end
  // of the collection.
  moveNext() {
    if (this.currentIndex > this.maxIndex) {
      return false;
    }
    this.currentIndex++;
    return true;
  }

  key() {
    if (this.keys === null) {
      throw new Error('Cannot get key of an Array iteration');
    }
    return this.keys[this.currentIndex];
  }

  value() {
    if (this.keys === null) {
      return this.values[this.currentIndex];
    }
    return this.values[this.key()];
  }
}

function findSmallestNameAndIndex(browserSubtests) {
  const comparator = browserSubtests[0].comparator;
  let smallest = null;
  let smallestIdx = null;
  for (let i = 0; i < browserSubtests.length; i++) {
    if (!browserSubtests[i].hasCurrent()) {
      continue;
    }
    if (smallest == null ||
        comparator(browserSubtests[i].value(), smallest) < 0) {
      smallest = browserSubtests[i].value();
      smallestIdx = i;
    }
  }

  return [smallest.name, smallestIdx];
}

// Scores a WPT test that contains subtests, returning an array of scores for
// each browser in the same order as |browserTests|.
//
// For each browser, each subtest is scored either 0 or 1 based on whether it is
// a browser-specific failure. We then normalize the subtest scores such that
// the worst possible score for a given test would be '1', to avoid tests with
// thousands of subtests from overwhelming the results.
function scoreSubtests(browserSubtests) {
  // To avoid errors from summing small floats, we do a full count of
  // browser-specific subtest failures first, then divide by the number of
  // subtests later to get the score (see the note on normalization above).
  let denominator = 0;
  let prevName = null;
  const counts = new Array(browserSubtests.length).fill(0);

  while (browserSubtests.every(subtests => subtests.hasCurrent())) {
    // Ensure that the iterators are aligned on the same subtest, by skipping
    // the smallest (in alphabetical order) until all have the same name.
    const [name] = findSmallestNameAndIndex(browserSubtests);
    const onSameSubtest = browserSubtests.filter(s => s.value().name == name);
    if (onSameSubtest.length < browserSubtests.length) {
      if (name !== prevName) {
        // At this point at least one browser is missing a test that at least one
        // other browser has. This could be a browser-specific failure, if exactly
        // N-1 browsers have a passing state for that test (as we are treating
        // missing as a failure state).
        denominator += 1;
        if (onSameSubtest.length == browserSubtests.length - 1) {
          if (onSameSubtest.every(s => TEST_PASS_STATUSES.includes(
            s.value().status))) {
            for (let i = 0; i < browserSubtests.length; i++) {
              if (browserSubtests[i].value().name != name) {
                counts[i] += 1;
                break;
              }
            }
          }
        }
      }

      prevName = name;
      onSameSubtest.forEach(subtest => subtest.moveNext());
      continue;
    }

    if (name !== prevName) {
      // The iterators are all aligned at the same subtest, so score it!
      //
      // NOTE: There actually (rarely) exist distinct subtests with the same name
      // in the data, usually because of unprintable characters. This can
      // influence the result as we may mismatch results (i.e. if some browser has
      // results for one duplicate-named subtest but not another).
      //
      // Overall the impact is minor; it at most affects a fraction of a single
      // test, so less than 1 point of the final score per affected test.
      denominator += 1;

      let failed = [];
      for (let i = 0; i < browserSubtests.length; i++) {
        const status = browserSubtests[i].value().status;
        if (!KNOWN_SUBTEST_STATUSES.includes(status)) {
          throw new Error(`Unknown subtest status for ` +
                          `'${browserSubtests[i].name}': '${status}'`);
        }

        // A 'neutral' subtest status means that a browser has a result which is
        // not a failure, but which is also not a proper pass (one such example
        // is SKIP). If any browser has such a status, no browser can be a
        // browser-specific failure (since we don't know what the 'real' result
        // for the neutral-status browser would be).
        if (SUBTEST_NEUTRAL_STATUSES.includes(status)) {
          failed = [];
          break;
        }

        if (SUBTEST_FAIL_STATUSES.includes(status)) {
          failed.push(i);
        }
      }
      if (failed.length == 1) {
        counts[failed[0]] += 1;
      }
    }

    prevName = name;
    browserSubtests.forEach(s => s.moveNext());
  }

  // At this point, at least one browser is out of subtests. The remaining
  // subtests in other browsers do constitute valid tests, so we need to
  // increment the denominator. If exactly one browser is out of subtests, there
  // could also be remaining browser specific failures.
  while (browserSubtests.some(subtest => subtest.hasCurrent())) {
    const [name] = findSmallestNameAndIndex(browserSubtests);
    const onSameSubtest = browserSubtests.filter(
        s => s.hasCurrent() && s.value().name == name);
    if (onSameSubtest.length >= browserSubtests.length) {
      // This should not happen; the code above should only finish once some
      // browser is out of subtests.
      throw new Error('Internal error: Previous loop terminated too early');
    }

    if (name !== prevName) {
      // If N-1 browser have this subtest with a pass status, then the one where
      // it is missing is a browser-specific failure.
      denominator += 1;
      if (onSameSubtest.length == browserSubtests.length - 1) {
        if (onSameSubtest.every(s => TEST_PASS_STATUSES.includes(
          s.value().status))) {
          for (let i = 0; i < browserSubtests.length; i++) {
            if (!browserSubtests[i].hasCurrent()) {
              counts[i] += 1;
              break;
            }
          }
        }
      }
    }

    // Move all with the smallest name on.
    prevName = name;
    onSameSubtest.forEach(subtest => subtest.moveNext());
  }

  if (denominator == 0) {
    return new Array(browserSubtests.length).fill(0);
  }
  return counts.map(count => count / denominator);
}

function scoreTopLevelTest(browserTests) {
  let failed = [];
  for (let i = 0; i < browserTests.length; i++) {
    const status = browserTests[i].status;
    if (!KNOWN_TEST_STATUSES.includes(status)) {
      throw new Error(`Unknown test status: '${status}'`);
    }

    // A 'neutral' test status means that a browser has a result which is not a
    // failure, but which is also not a proper pass (one such example is SKIP).
    // If any browser has such a status, no browser can be a browser-specific
    // failure (since we don't know what the 'real' result for the neutral
    // status browser would be).
    if (TEST_NEUTRAL_STATUSES.includes(status)) {
      failed = [];
      break;
    }

    if (TEST_FAIL_STATUSES.includes(status)) {
      failed.push(i);
    }
  }

  const scores = new Array(browserTests.length).fill(0);
  if (failed.length == 1) {
    scores[failed[0]] += 1;
  }
  return scores;
}

// Scores a particular WPT test for a set of browsers, returning an array of
// scores for each browser in the same order as |browserTests|.
function scoreTest(browserTests, testPath, testFilter) {
  if (testFilter && !testFilter(testPath)) {
    return new Array(browserTests.length).fill(0);
  }

  const cacheKey = browserTests.map(test => test.id).join('-');
  if (testsScoreCache.has(cacheKey)) {
    return testsScoreCache.get(cacheKey);
  }

  let scores = new Array(browserTests.length).fill(0);

  // Some WPT tests contain multiple 'subtests' (e.g. most testharness.js
  // tests), whilst others are just a single conceptual test (e.g. reftests).
  //
  // Tests without subtests are scored as a simple 0-or-1 for each failing
  // browser (0 if any other browser also fails, 1 if no other browser fails).
  // When there are subtests, we do a similar calculation per-subtest, but
  // normalize the results by the number of subtests in the test. This stops
  // tests with thousands of subtests from dominating the results.
  if (browserTests.every(t => !t.subtests || t.subtests.length == 0)) {
    scores = scoreTopLevelTest(browserTests);
  } else if (browserTests.every(t => t.subtests && t.subtests.length > 0)) {
    const comparator = (s1, s2) => (s1.name > s2.name) - (s1.name < s2.name);
    scores = scoreSubtests(browserTests.map(
        tests => new IteratorHelper(tests.subtests, comparator)));
  }

  testsScoreCache.set(cacheKey, scores);
  return scores;
}

// Walks a set of trees, one per browser, scoring them for browser-specific
// failures of tests in the trees.
function walkTrees(browserTrees, path, testFilter) {
  const cacheKey = browserTrees.map(tree => tree.id).join('-');
  if (treesScoreCache.has(cacheKey)) {
    return treesScoreCache.get(cacheKey);
  }

  let scores = new Array(browserTrees.length).fill(0);

  // Sorting comparator to sort Object keys alphabetically.
  const keyComparator = (k1, k2) => (k1 > k2) - (k1 < k2);

  // First deal with any tests that are at this level of the tree.
  const browserTests = browserTrees.map(
      tree => new IteratorHelper(tree.tests, keyComparator));
  // As we are dealing with the intersection of tests between browsers, we are
  // done once we have exhausted all tests from some browser (leftover tests in
  // other browsers don't matter).
  while (browserTests.every(tests => tests.hasCurrent())) {
    // If we are looking at the same test across all browsers, but they aren't
    // the exact same objects, they need to be scored!
    if (browserTests.every(t => t.key() === browserTests[0].key()) &&
        !browserTests.every(t => t.value() === browserTests[0].value())) {
      const testPath = path + '/' + browserTests[0].key();
      try {
        const testScores = scoreTest(
            browserTests.map(t => t.value()), testPath, testFilter);
        scores = scores.map((v, i) => v + testScores[i]);
        browserTests.forEach(t => t.moveNext());
        continue;
      } catch (e) {
        e.message += `\n\tTest: ${browserTests[0].key()}`;
        throw e;
      }
    }

    // Our iterators are not pointing at the same test; find the earliest
    // iterator and move it forward.
    let smallestKey = browserTests[0].key();
    let smallestIdx = 0;
    for (let i = 1; i < browserTests.length; i++) {
      if (keyComparator(browserTests[i].key(), smallestKey) < 0) {
        smallestKey = browserTests[i].key();
        smallestIdx = i;
      }
    }
    browserTests[smallestIdx].moveNext();
  }

  // Now recurse into subtrees.
  const browserSubtrees = browserTrees.map(
      tree => new IteratorHelper(tree.trees, keyComparator));
  while (browserSubtrees.every(subtree => subtree.hasCurrent())) {
    // If the subtrees are all the same object (which happens due to the caching
    // in lib/results.js), we can just skip them; it is impossible for there to
    // be browser-specific failures in the subtree.
    if (browserSubtrees.every(s => s.value() === browserSubtrees[0].value())) {
      browserSubtrees.forEach(s => s.moveNext());
      continue;
    }

    // If all the iterators are pointing at the same directory (subtree), then
    // we should recurse into those subtrees to score them.
    if (browserSubtrees.every(s => s.key() == browserSubtrees[0].key())) {
      const newPath = path + '/' + browserSubtrees[0].key();
      const subtreeScores = walkTrees(
          browserSubtrees.map(s => s.value()), newPath, testFilter);
      scores = scores.map((v, i) => v + subtreeScores[i]);
      browserSubtrees.forEach(s => s.moveNext());
      continue;
    }

    // Our iterators are not pointing at the same subtree; find the earliest
    // iterator and move it forward.
    let smallestKey = browserSubtrees[0].key();
    let smallestIdx = 0;
    for (let i = 1; i < browserSubtrees.length; i++) {
      if (keyComparator(browserSubtrees[i].key(), smallestKey) < 0) {
        smallestKey = browserSubtrees[i].key();
        smallestIdx = i;
      }
    }
    browserSubtrees[smallestIdx].moveNext();
  }

  treesScoreCache.set(cacheKey, scores);

  return scores;
}

// Produces a 'score' of browser-specific failures for a given set of runs from
// different products on the same WPT codebase. The word 'score' is used instead
// of count as we normalize the counts of subtests.
//
// runs: an array of run objects, where each run has the form:
//       {browser_name: "foo", tree: <an in-memory git tree>}
//
// expectedBrowsers: the set of browsers that should be (exactly) represented in
//                   runs. If a browser is missing, an exception will be thrown.
//
// testFilter: if non-null, a function used to filter which tests are
//             considered. Called with the test path; return true to include
//             the test, false to exclude it.
//
// Returns a map from product name to score.
function scoreBrowserSpecificFailures(runs, expectedBrowsers, {testFilter = null} = {}) {
  // First, verify that the expected browsers are seen in |runs|.
  const seenBrowsers = new Set();
  for (const run of runs) {
    const browserName = run.browser_name;
    if (!expectedBrowsers.has(browserName)) {
      throw new Error(`Unexpected browser found in runs: ${browserName}`);
    }
    if (seenBrowsers.has(browserName)) {
      throw new Error(`${browserName} has multiple entries in runs`);
    }
    seenBrowsers.add(browserName);
  }
  // Browsers can only be added to seenBrowsers if they were already in
  // expectedBrowsers (see above), so the only remaining possible error is a
  // missing browser in the runs.
  if (seenBrowsers.size != expectedBrowsers.size) {
    const difference = [...expectedBrowsers].filter(x => !seenBrowsers.has(x));
    throw new Error(`Missing runs for browsers: ${difference.join(',')}`);
  }


  // Now do the actual walk to score the runs.
  const scores = walkTrees(runs.map(run => run.tree), '', testFilter);
  return new Map(scores.map((score, i) => [runs[i].browser_name, score]));
}

module.exports = {scoreBrowserSpecificFailures};

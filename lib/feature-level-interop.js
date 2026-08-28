'use strict';

/**
 * Implements per-web-feature interoperability scoring (aka feature level
 * interop).
 */

const resultTrees = require('./result-trees');

// Scores one feature for each browser in |expectedBrowsers|, or undefined if no
// run has any of its |tests|.
function scoreFeature(runs, expectedBrowsers, tests) {
  const totals = new Map(expectedBrowsers.map(product => [product, 0]));
  let interop = 0;
  let found = 0;

  for (const test of tests) {
    const scores = new Map();
    for (const run of runs) {
      const results = resultTrees.findTestResults(run.tree, test);
      if (results !== undefined) {
        scores.set(run.browser_name, resultTrees.scoreTestResults(results));
      }
    }
    // A test no run has did not exist at this revision, so it counts against
    // nobody.
    if (scores.size === 0) {
      continue;
    }
    found += 1;

    // A product whose run lacks the test scores 0 for it, and interop takes the
    // lowest score per test rather than per feature.
    let lowest = 1;
    for (const product of expectedBrowsers) {
      const score = scores.has(product) ? scores.get(product) : 0;
      totals.set(product, totals.get(product) + score);
      lowest = Math.min(lowest, score);
    }
    interop += lowest;
  }

  if (found === 0) {
    return undefined;
  }

  return {
    scores: new Map(expectedBrowsers.map(
        product => [product, totals.get(product) / found])),
    interop: interop / found,
    tests: found,
  };
}

// Scores every web feature in |featureTestMap| against |runs|.
function scoreFeatureLevelInterop(runs, expectedBrowsers, featureTestMap) {
  const featureScores = new Map();

  for (const [feature, tests] of featureTestMap) {
    const scored = scoreFeature(runs, expectedBrowsers, tests);
    if (scored !== undefined) {
      featureScores.set(feature, scored);
    }
  }

  return featureScores;
}

module.exports = {
  scoreFeature,
  scoreFeatureLevelInterop,
};

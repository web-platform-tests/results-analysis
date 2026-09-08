'use strict';

/**
 * Implements per-web-feature interoperability scoring (aka feature level
 * interop).
 */

const resultTrees = require('./result-trees');

// Scores one feature for each browser in |expectedBrowsers|, or undefined if no
// run has any of its |tests|.
function scoreFeature(runs, expectedBrowsers, tests) {
  const browserTestFractionTotals = new Map(
      expectedBrowsers.map(product => [product, 0]));
  let interopTestFractionTotal = 0;
  let testCount = 0;

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
    testCount += 1;

    // A product whose run lacks the test scores 0 for it, and interop takes the
    // lowest score per test rather than per feature.
    let lowest = 1;
    for (const product of expectedBrowsers) {
      const score = scores.has(product) ? scores.get(product) : 0;
      browserTestFractionTotals.set(
          product, browserTestFractionTotals.get(product) + score);
      lowest = Math.min(lowest, score);
    }
    interopTestFractionTotal += lowest;
  }

  if (testCount === 0) {
    return undefined;
  }

  return {
    scores: new Map(expectedBrowsers.map(product =>
      [product, browserTestFractionTotals.get(product) / testCount])),
    interop: interopTestFractionTotal / testCount,
    tests: testCount,
  };
}

// Averages the per-feature scores in |featureScores|, weighting every feature
// equally however many tests it has, or undefined if no feature was scored. A
// date with nothing to score is a date to skip, as it is for scoreFeature.
function averageFeatureScores(featureScores, expectedBrowsers) {
  if (featureScores.size === 0) {
    return undefined;
  }

  const totals = new Map(expectedBrowsers.map(product => [product, 0]));
  let interop = 0;

  for (const scored of featureScores.values()) {
    for (const product of expectedBrowsers) {
      // Averaging a product the feature was not scored for would reach the CSV
      // as a literal NaN rather than failing the run.
      if (!scored.scores.has(product)) {
        throw new Error(`A feature was not scored for '${product}'`);
      }
      totals.set(product, totals.get(product) + scored.scores.get(product));
    }
    interop += scored.interop;
  }

  return {
    scores: new Map(expectedBrowsers.map(
        product => [product, totals.get(product) / featureScores.size])),
    interop: interop / featureScores.size,
    features: featureScores.size,
  };
}

// Scores every web feature in |featureTestMap| against |runs|.
function scoreRuns(runs, expectedBrowsers, featureTestMap) {
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
  averageFeatureScores,
  scoreFeature,
  scoreRuns,
};

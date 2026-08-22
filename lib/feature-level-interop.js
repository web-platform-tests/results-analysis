'use strict';

/**
 * Implements per-web-feature interoperability scoring (aka feature level
 * interop).
 */

// Scores one feature for each browser in |expectedBrowsers|, or undefined if no
// run has any of its |tests|.
function scoreFeature(runs, expectedBrowsers, tests) {
  throw new Error('scoreFeature is not implemented');
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
  scoreFeature,
  scoreRuns,
};

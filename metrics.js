'use strict';

const TEST_STATUSES = new Set(['CRASH', 'ERROR', 'FAIL', 'OK', 'PASS', 'SKIP', 'TIMEOUT']);
const SUBTEST_STATUSES = new Set(['ERROR', 'FAIL', 'NOTRUN', 'PASS', 'TIMEOUT']);

function scoreReport(report, options = {}) {
  const results = report.results;
  let score = 0;
  let total = 0;
  for (const test of results) {
    if (options.testFilter && !options.testFilter(test)) {
      //console.log(`Skipping ${test.test}`);
      continue;
    }
    const [testScore, testTotal] = scoreTest(test, options);
    if (options.normalizePerTest) {
      const normalizedScore = testScore / testTotal;
      if (!(normalizedScore >= 0 && normalizedScore <= 1)) {
        throw new Error(`${normalizedScore} not in range [0,1]`);
      }
      score += normalizedScore;
      total += 1;
    } else {
      score += testScore;
      total += testTotal;
    }
  }
  return [score, total];
}

function scoreTest(test, options) {
  if (!TEST_STATUSES.has(test.status)) {
    throw new Error(`Invalid test status: ${test.status}`);
  }

  // Tests with subtests (testharness, wdspec)
  const subtests = test.subtests || [];
  if (subtests.length) {
    let score = 0;
    for (const subtest of subtests) {
      score += scoreSubtest(subtest);
    }
    //console.log(`${test.test}: harness ${test.status}, ${score}/${subtests.length} PASS`);
    if (test.status === 'OK') {
      return [score, subtests.length];
    }
    // In case of harness error/timeout/etc, it's debatable whether the passing
    // subtests should count, and what the total should be. (Matters less when
    // `options.normalizePerTest` is true.)
    return [options.requireHarnessOK ? 0 : score, subtests.length];
  }

  // Tests with no subtests (reftests)
  //console.log(`${test.test}: ${test.status}`);
  return [test.status === 'PASS' ? 1 : 0, 1];
}

function scoreSubtest(subtest) {
  if (!SUBTEST_STATUSES.has(subtest.status)) {
    throw new Error(`Invalid subtest status: ${subtest.status}`);
  }
  return subtest.status === 'PASS' ? 1 : 0;
}

module.exports = { scoreReport };

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
  // This happens from some runs labeled msedge
  if (test.status === null) {
    test.status = 'ERROR';
  }

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

function scoreInterop(reports, options = {}) {
  // Create merged results by taking the union of all tests. For subtests, also
  // use the union, even though this means tests with correctly varying number
  // of subtests can never be scored at 100%.

  // Phase one, produce a map from all test names to an array of the test
  // objects, which are just the members of a `report.results`. This will
  // store the names redundantly, but the objects already exist and creating
  // new smaller objects will just use more memory. The array will contain null
  // where there were no results in a report.
  const testMap = new Map;
  for (const [i, report] of reports.entries()) {
    const results = report.results;
    for (const test of results) {
      if (options.testFilter && !options.testFilter(test)) {
        //console.log(`Skipping ${test.test}`);
        continue;
      }

      let testList = testMap.get(test.test);
      if (!testList) {
        testList = new Array(reports.length).fill(null);
        testMap.set(test.test, testList);
      }

      testList[i] = test;
    }
  }

  function hasSubtests(test) {
    return test && test.subtests && test.subtests.length;
  }

  // Phase two, find [0/N, 1/N, ... N/N] scores per test and accumlate those
  // into `scores`, and update `total` to be the denominator.
  const scores = new Array(reports.length + 1).fill(0);
  let total = 0;
  for (const [testName, testList] of testMap.entries()) {
    // If there aren't any subtests, then just count passes.
    if (!testList.some(hasSubtests)) {
      let passes = 0;
      for (const test of testList) {
        if (test && test.status === 'PASS') {
          passes++;
        }
      }
      scores[passes] += 1;
      total += 1;
      continue;
    }

    // With subtests, create a map from subtest name to number of reports that
    // pass that subtest.
    const subtestMap = new Map;
    for (const test of testList) {
      // It's still possible that some (but not all) `test` has no subtests.
      if (!hasSubtests(test)) {
        continue;
      }

      // For `requireHarnessOK`, ignore results with harness errors, including
      // any subtests that did run and pass.
      if (options.requireHarnessOK && test.status !== 'OK') {
        continue;
      }

      for (const subtest of test.subtests) {
        let count = subtestMap.get(subtest.name) || 0;
        if (subtest.status === 'PASS') {
          count++;
        }
        subtestMap.set(subtest.name, count);
      }
    }

    // If `subtestMap` is still empty, it's because `requireHarnessOK` is set
    // and there were harness errors across the board.
    if (subtestMap.size === 0) {
      scores[0] += 1;
      total += 1;
      continue;
    }

    // Finally, increment the `scores` and `total` using `subtestMap`.
    for (let [subtestName, passes] of subtestMap.entries()) {
      // The same subtest name may appear multiple times in a report, and we
      // can end up counting it more times than `reports.length` (or fewer). We
      // would have to detect this earlier, so now just clamp.
      if (passes > reports.length) {
        console.warn(`${testName}: clamping subtest ${JSON.stringify(subtestName)} pass count ${passes} to ${reports.length} in a way that is not pedantically correct.`);
        // TODO: Be pedantically correct.
        passes = reports.length;
      }

      if (options.normalizePerTest) {
        // Adding `1 / subtestMap.size` to a possibly already large count over
        // and over would lead to a precision problem with sufficiently many
        // subtests. However, up to about ~10M the accumulated error is <1%.
        scores[passes] += 1 / subtestMap.size;
      } else {
        scores[passes] += 1;
      }
    }

    // The total has to be updated outside the loop because it should be
    // incremented by exactly 1 for `normalizePerTest`.
    if (options.normalizePerTest) {
      total += 1;
    } else {
      total += subtestMap.size;
    }
  }

  return [...scores, total];
}

module.exports = { scoreReport, scoreInterop };

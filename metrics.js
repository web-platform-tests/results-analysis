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

function scoreInterop(reports, options = {}) {
  // Create merged results by taking the union of all tests. For subtests, also
  // use the union, even though this means tests with correctly varying number
  // of subtests can never be scored at 100%.

  // Phase one, produce a map from all test names to an array of the statuses.
  const mergedResults = new Map;
  reports.forEach((report, i) => {
    const results = report.results;
    for (const test of results) {
      if (options.testFilter && !options.testFilter(test)) {
        //console.log(`Skipping ${test.test}`);
        continue;
      }

      let resultList = mergedResults.get(test.test);
      if (!resultList) {
        resultList = new Array(reports.length);
        mergedResults.set(test.test, resultList);
      }

      resultList[i] = { status: test.status, subtests: test.subtests };
    }
  });

  // Phase two, score each test as [0, 1] for 0/N, 1/N, ... N/N.
  const counts = new Array(reports.length + 1).fill(0);
  mergedResults.forEach((resultList, test) => {
    // If there are no subtests, then just count passes and increment the
    // corresponding count.
    console.log(resultList);
    if (!resultList.some(r => r && r.subtests && r.subtests.length)) {
      const passes = resultList.reduce((acc, r) => r && r.status === 'PASS' ? acc + 1 : acc, 0);
      counts[passes] += 1;
      return;
    }

    // With subtests, take the union of subtest names where the harness status
    // was OK, then allow results with harness error to contribute as well.
    // TODO
  });

  return [...counts, mergedResults.size];
}

module.exports = { scoreReport, scoreInterop };

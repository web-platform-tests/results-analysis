const fetch = require ('node-fetch');

const TEST_STATUSES = new Set(['CRASH', 'ERROR', 'FAIL', 'OK', 'PASS', 'SKIP', 'TIMEOUT']);
const SUBTEST_STATUSES = new Set(['ERROR', 'FAIL', 'NOTRUN', 'PASS', 'TIMEOUT']);

const NORMALIZE_PER_TEST = true;
const REQUIRE_HARNESS_OK = true;

function scoreReport(report, testFilter) {
  const results = report.results;
  let score = 0;
  let total = 0;
  for (const test of results) {
    if (testFilter && !testFilter(test)) {
      //console.log(`Skipping ${test.test}`);
      continue;
    }
    const [testScore, testTotal] = scoreTest(test);
    if (NORMALIZE_PER_TEST) {
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

function scoreTest(test) {
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
    // `NORMALIZE_PER_TEST` is true.)
    return [REQUIRE_HARNESS_OK ? 0 : score, subtests.length];
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

async function main() {
  const productSpec = process.argv[2];
  let testPrefix = process.argv[3];
  let testFilter;
  if (testPrefix) {
    if (!testPrefix.startsWith('/')) {
      testPrefix = `/${testPrefix}`;
    }
    testFilter = test => test.test.startsWith(testPrefix);
  }

  const runsUrl = `https://wpt.fyi/api/runs?product=${productSpec}`
  const runsInfo = await (await fetch(runsUrl)).json();
  if (runsInfo.length === 0) {
    console.error(`no run found for ${productSpec}`);
    process.exit(1);
  }
  const info = runsInfo[0];
  const resultsUrl = info.raw_results_url;

  const report = await (await fetch(resultsUrl)).json();
  // sort to make output nicer, doesn't affect scoring
  report.results.sort((a, b) => {
    return a.test.localeCompare(b.test);
  });

  let [score, total] = scoreReport(report, testFilter);
  const pct = (100 * score / total).toFixed(2);
  if (NORMALIZE_PER_TEST) {
    score = score.toFixed(2);
  }
  console.log(`${score} / ${total} => ${pct}%`);
}

main();

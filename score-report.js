const fetch = require ('node-fetch');
const metrics = require('./metrics.js');

async function main() {
  const options = {
    normalizePerTest: true,
    requireHarnessOK: true,
  }

  const productSpec = process.argv[2];
  let testPrefix = process.argv[3];
  if (testPrefix) {
    if (!testPrefix.startsWith('/')) {
      testPrefix = `/${testPrefix}`;
    }
    options.testFilter = test => test.test.startsWith(testPrefix);
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

  let [score, total] = metrics.scoreReport(report, options);
  const pct = (100 * score / total).toFixed(2);
  if (options.normalizePerTest) {
    score = score.toFixed(2);
  }
  console.log(`${score} / ${total} => ${pct}%`);
}

main();

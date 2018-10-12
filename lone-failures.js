const fetch = require ('node-fetch');
const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const PRODUCTS = ['chrome', 'edge', 'firefox', 'safari'];

// fetch report and cache
async function fetchReport(info) {
  const filename = `cache/${info.id}.json`;
  const url = info.raw_results_url;
  let data;
  try {
    data = await readFile(filename);
    //console.info(`cache hit: ${filename}`);
  } catch(e) {
    //console.info(`cache miss: ${url}`);
    data = await (await fetch(url)).text();
    await writeFile(filename, data);
  }
  return JSON.parse(data);
}

// given a wpt report's `results` array-of-arrays representation of test
// and subtests, produce a map-of-maps instead.
function dictifyResults(results) {
  const tests = new Map;
  for (const entry of results) {
    const name = entry.test;
    if (tests.has(name)) {
      throw new Error(`Duplicate test name: ${name}`);
    }

    const status = entry.status;

    const subtests = new Map;
    for (const subentry of entry.subtests) {
      const subname = subentry.name;
      if (subtests.has(subname)) {
        //console.warn(`Duplicate subtest name in ${name}: ${subname}`);
        // only keep the first clashing subtest
        continue;
      }
      // this could be just a string, but an object allows other code to treat
      // tests and tests similarly, using result.status;
      subtests.set(subname, { status: subentry.status });
    }

    tests.set(name, { status, subtests });
  }
  return tests;
}

function isPass(result) {
  return result && (result.status === 'OK' || result.status === 'PASS');
}

function isFailure(result) {
  return result && (result.status === 'ERROR' || result.status === 'FAIL');
}

function isLoneFailure(result, otherResults) {
  // The "best" definition isn't a given. This one is conservative:
  return isFailure(result) && otherResults.every(isPass);
  // This one would include more stuff:
  //return isFailure(result) && !otherResults.some(isFailure);
}

function checkProduct(p) {
  if (!PRODUCTS.includes(p)) {
    throw new Error(`Unknown product: ${p}`);
  }
  return p;
}

async function main() {
  const targetProduct = checkProduct(process.argv[2]);

  const excludeProducts = process.argv.slice(3).map(arg => {
    if (!arg.startsWith('-')) {
      throw new Error('exclude products by prefixing with -, e.g. -chrome');
    }
    return checkProduct(arg.substr(1));
  });

  const products = PRODUCTS.filter(product => {
    return !excludeProducts.includes(product);
  }).map(product => {
    // get experimental of the lone (target) product and stable of everything
    // else to make results the most useful for that product team.
    const label = product === targetProduct ? 'experimental' : 'stable';
    return `${product}%5B${label}%5D`;
  });

  const query = `products=${products.join(',')}`;
  const runsUrl = `https://wpt.fyi/api/runs?${query}&aligned`
  //console.info(`Fetching ${runsUrl}`);
  //console.info(`Equivalent to: https://wpt.fyi/results/?${query}`);
  const runsInfo = await (await fetch(runsUrl)).json();

  // needs a lot of memory: use --max-old-space-size=2048
  const reports = await Promise.all(runsInfo.map(async info => {
    const report = await fetchReport(info);
    // modify in place and overwrite to not double memory usage
    report.results.sort((a, b) => a.test.localeCompare(b.test));
    report.results = dictifyResults(report.results);
    return report;
  }));

  let alignedSha;
  console.log('Using these runs:')
  for (const report of reports) {
    const product = report.run_info.product;
    const sha = report.run_info.revision.substr(0,10);
    if (alignedSha === undefined) {
      alignedSha = sha;
    } else if (alignedSha !== sha) {
      throw new Error(`Expected aligned runs but got ${alignedSha} != ${sha}`);
    }
    const results = report.results;
    console.log(`* ${product} @${sha}: ${results.size} tests`);
  }
  console.log();

  console.log(`${targetProduct}-only failures:`);
  const single = reports.find(r => r.run_info.product == targetProduct);
  const others = reports.filter(r => r != single);
  for (const [test, result] of single.results.entries()) {
    const otherResults = others.map(report => {
      return report.results.get(test) || null;
    });

    let hasLoneFailure = false;

    // test-level lone failures
    if (isLoneFailure(result, otherResults)) {
      hasLoneFailure = true;
    }

    // subtest-level lone failures
    for (const [subtest, subresult] of result.subtests.entries()) {
      otherSubresults = otherResults.map(result => {
        return result && result.subtests.get(subtest) || null;
      });

      if (isLoneFailure(subresult, otherSubresults)) {
        hasLoneFailure = true;
        break;
      }
    }

    if (hasLoneFailure) {
      console.log(`* [${test}](https://wpt.fyi/results${test.replace('?', '%3F')}?${query}&sha=${alignedSha})`);
    }
  }
}

main();

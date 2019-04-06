'use strict';

const lib = require('./lib');

const PRODUCTS = ['chrome', 'firefox', 'safari'];

const USE_EXPERIMENTAL_TARGET = true;

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
  if (process.argv.length < 3) {
    console.log(`Usage: node --max-old-space-size=2048 lone-failures.js [product]`);
    return;
  }
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
    let label = 'stable';

    if (USE_EXPERIMENTAL_TARGET && product === targetProduct) {
      // get experimental of the lone (target) product and stable of everything
      // else to make results the most useful for that product team.
      label = 'experimental';
    }

    return `${product}[${label}]`;
  });

  const runs = await lib.runs.get({
    products,
    label: 'master',
    aligned: true,
  });

  // needs a lot of memory: use --max-old-space-size=2048
  const reports = await Promise.all(runs.map(run => {
    return lib.report.fetch(run, { convertToMap: true });
  }));

  let alignedSha;
  console.log('Using these runs:')
  for (const [i, report] of reports.entries()) {
    const product = report.run_info.product;
    const version = report.run_info.browser_version;
    const sha = report.run_info.revision.substr(0,10);
    if (alignedSha === undefined) {
      alignedSha = sha;
    } else if (alignedSha !== sha) {
      throw new Error(`Expected aligned runs but got ${alignedSha} != ${sha}`);
    }
    const results = report.results;
    console.log(`* [${product} ${version} @${sha}](https://wpt.fyi/results/?run_id=${runs[i].id}): ${results.size} tests`);
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
      const otherSubresults = otherResults.map(result => {
        return result && result.subtests.get(subtest) || null;
      });

      if (isLoneFailure(subresult, otherSubresults)) {
        hasLoneFailure = true;
        break;
      }
    }

    if (hasLoneFailure) {
      console.log(`* [${test}](https://wpt.fyi/results${test.replace('?', '%3F')}?${runs.map(run => `run_id=${run.id}`).join('&')})`);
    }
  }
}

main();

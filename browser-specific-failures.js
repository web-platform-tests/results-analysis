'use strict';

/**
 * Implements a view of how many browser specific failures each engine has over
 * time.
 */

const fs = require('fs');
const flags = require('flags');
const Git = require('nodegit');
const lib = require('./lib');
const moment = require('moment');

flags.defineString('from', '2018-07-01', 'Starting date (inclusive)');
flags.defineString('to', moment().format('YYYY-MM-DD'),
    'Ending date (exclusive)');
flags.defineStringList('products', ['chrome', 'firefox', 'safari'],
    'Browsers to compare. Must match the products used on wpt.fyi');
flags.defineString('output', null,
    'Output CSV file to write to. Defaults to ' +
    '{stable, experimental}-browser-specific-failures.csv');
flags.defineBoolean('experimental', false,
    'Calculate metrics for experimental runs.');
flags.defineBoolean('include-third-party', false,
    'Include /third_party tests in BSF scoring.');
flags.parse();


async function main() {
  // Sort the products so that output files are consistent.
  const products = flags.get('products');
  if (products.length < 2) {
    throw new Error('At least 2 products must be specified for this analysis');
  }
  products.sort();

  const repo = await Git.Repository.open('results-analysis-cache.git');

  // First, grab aligned runs from the server for the dates that we are
  // interested in.
  const from = moment(flags.get('from'));
  const to = moment(flags.get('to'));
  const experimental = flags.get('experimental');
  const includeThirdParty = flags.get('include-third-party');
  const alignedRuns = await lib.runs.fetchAlignedRunsFromServer(
      products, from, to, experimental);

  await lib.results.loadRunTrees(repo, alignedRuns);

  if (!includeThirdParty) {
    for (const runs of alignedRuns.values()) {
      for (const run of runs) {
        run.tree = lib.browserSpecific.pruneExcludedPaths(
            run.tree, ['/third_party']);
      }
    }
  }

  // We're ready to score the runs now!
  console.log('Calculating browser-specific failures for the runs');
  const before = Date.now();
  const dateToScores = new Map();
  for (const [date, runs] of alignedRuns.entries()) {
    // The SHA should be the same for all runs, so just grab the first.
    const sha = runs[0].full_revision_hash;
    const versions = runs.map(run => run.browser_version);
    try {
      const scores = lib.browserSpecific.scoreBrowserSpecificFailures(
          runs, new Set(products));
      dateToScores.set(date, {sha, versions, scores});
    } catch (e) {
      e.message += `\n\tRuns: ${runs.map(r => r.id)}`;
      throw e;
    }
  }
  const after = Date.now();
  console.log(`Done scoring (took ${after - before} ms)`);

  // Finally, time to dump stuff.
  let outputFilename = flags.get('output');
  if (!outputFilename) {
    outputFilename = experimental ?
        'experimental-browser-specific-failures.csv' :
        'stable-browser-specific-failures.csv';
  }

  console.log(`Writing data to ${outputFilename}`);

  let data = 'sha,date';
  for (const product of products) {
    data += `,${product}-version,${product}`;
  }
  data += '\n';

  // ES6 maps iterate in insertion order, and we initially inserted in date
  // order, so we can just iterate |dateToScores|.
  for (const [date, shaAndScores] of dateToScores) {
    const sha = shaAndScores.sha;
    const scores = shaAndScores.scores;
    const versions = shaAndScores.versions;
    if (!scores) {
      console.log(`ERROR: ${date} had no scores`);
      continue;
    }
    const csvRecord = [
      sha,
      date.substr(0, 10),
    ];
    for (let i = 0; i < products.length; i++) {
      csvRecord.push(versions[i]);
      csvRecord.push(scores.get(products[i]));
    }
    data += csvRecord.join(',') + '\n';
  }
  await fs.promises.writeFile(outputFilename, data, 'utf-8');
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});

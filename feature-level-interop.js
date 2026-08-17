'use strict';

/**
 * Implements a view of how interoperable each web feature is over time.
 */

const flags = require('flags');
const moment = require('moment');

flags.defineString('from', '2018-07-01', 'Starting date (inclusive)');
flags.defineString('to', moment().format('YYYY-MM-DD'),
    'Ending date (exclusive)');
flags.defineStringList('products', ['chrome', 'firefox', 'safari'],
    'Browsers to compare. Must match the products used on wpt.fyi');
flags.defineString('output', null,
    'Output CSV file to write to. Defaults to ' +
    '{stable, experimental}-feature-level-interop.csv');
flags.defineBoolean('experimental', false,
    'Calculate metrics for experimental runs.');
flags.parse();


// TODO: Score feature-level interoperability, following the same shape as
// browser-specific-failures.js: open the results-analysis-cache repo, fetch
// aligned runs, load each run's tree, score per date, and write one CSV row
// per date. For now only the flags are parsed.
async function main() {
  // Sort the products so that output files are consistent.
  const products = flags.get('products');
  if (products.length < 2) {
    throw new Error('At least 2 products must be specified for this analysis');
  }
  products.sort();

  // First, grab aligned runs from the server for the dates that we are
  // interested in.
  const from = moment(flags.get('from'));
  const to = moment(flags.get('to'));
  const experimental = flags.get('experimental');

  console.log(`Scoring ${products.join(', ')} from ` +
      `${from.format('YYYY-MM-DD')} to ${to.format('YYYY-MM-DD')}`);

  // Finally, time to dump stuff.
  let outputFilename = flags.get('output');
  if (!outputFilename) {
    outputFilename = experimental ?
        'experimental-feature-level-interop.csv' :
        'stable-feature-level-interop.csv';
  }

  console.log(`Writing data to ${outputFilename}`);
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});

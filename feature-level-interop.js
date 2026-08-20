'use strict';

/**
 * Implements a view of web interoperability per web feature over time.
 *
 * This is currently just the framework: the aligned runs, their result trees
 * and the feature to test mapping are all loaded, but the runs are not scored
 * yet.
 */

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
    '{stable, experimental}-feature-level-interop.csv');
flags.defineBoolean('experimental', false,
    'Calculate metrics for experimental runs.');
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
  const alignedRuns = await lib.runs.fetchAlignedRunsFromServer(
      products, from, to, experimental);

  // Work out which tests make up each web feature. This is done before the
  // trees are loaded, so that a failure here does not throw away that work.
  console.log('Fetching the web features manifest');
  const before = Date.now();
  const featureTests = await lib.runs.fetchWebFeaturesManifest();
  const after = Date.now();
  console.log(`Found ${featureTests.size} features ` +
      `(took ${after - before} ms)`);

  await lib.results.loadRunTrees(repo, alignedRuns);

  // TODO: Score the runs. Each test in a run will be scored against the
  // features it belongs to, and the per-feature scores aggregated per product,
  // to be implemented after further discussion with the interop team.

  // TODO: Write the scores to the file named by --output, defaulting to
  // {stable, experimental}-feature-level-interop.csv, once the runs are scored.
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});

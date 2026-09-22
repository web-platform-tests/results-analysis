'use strict';

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
flags.defineString('scoring', 'binary',
    'Method for scoring a test. Possible values are ' +
    'binary, interop, and interop-strict. Read the source for definition.');
flags.defineString('output', 'wpt-trends.csv',
    'Output CSV file to write to.');
flags.defineBoolean('experimental', false,
    'Calculate metrics for experimental runs.');
flags.parse();

function getScoreFunc(method) {
  switch (method) {
    case 'binary':
      return binaryScore;
    case 'interop':
      return interopScore;
    case 'interop-strict':
      return interopStrictScore;
  }
  throw new Error(`Unknown scoring method: ${method}`);
}

// Score as 0 or 1, requiring an OK harness status and all subtests passing.
function binaryScore(status, subtests) {
  if (status !== 'OK') {
    return 0;
  }
  for (const subtest of subtests) {
    if (subtest.status !== 'PASS') {
      return 0;
    }
  }
  return 1;
}

// Score like in Interop 2023.
function interopScore(status, subtests) {
  // Note: status is ignored.
  let passingSubtests = 0;
  for (const subtest of subtests) {
    if (subtest.status === 'PASS') {
      passingSubtests++;
    }
  }
  return passingSubtests / subtests.length;
}

// Score like in Interop 2023, but require OK harness status.
function interopStrictScore(status, subtests) {
  if (status !== 'OK') {
    return 0;
  }
  return interopScore(status, subtests);
}

function scoreTree(tree, scoreFunc) {
  let score = 0;
  let total = 0;

  lib.results.walkTests(tree, (path, test, results) => {
    if (Array.isArray(results.subtests)) {
      // There are different ways of scoring subtests.
      score += scoreFunc(results.status, results.subtests);
    } else if (results.status === 'PASS') {
      score++;
    }
    total++;
  });

  return [score, total];
}

async function main() {
  // Get the scoring function to use.
  const scoreFunc = getScoreFunc(flags.get('scoring'));

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

  // Verify that we have data for the fetched runs in the results-analysis-cache
  // repo.
  console.log('Getting local set of run ids from repo');
  let before = Date.now();
  const localRunIds = await lib.results.getLocalRunIds(repo);
  let after = Date.now();
  console.log(`Found ${localRunIds.size} ids (took ${after - before} ms)`);

  let hadErrors = false;
  for (const [date, runs] of alignedRuns.entries()) {
    for (const run of runs) {
      if (!localRunIds.has(run.id)) {
        // If you see this, you probably need to run git-write.js or just update
        // your results-analysis-cache.git repo; see the README.md.
        console.error(`Run ${run.id} missing from local git repo (${date})`);
        hadErrors = true;
      }
    }
  }
  if (hadErrors) {
    throw new Error('Missing data for some runs (see errors logged above). ' +
        'Try running "git fetch --all --tags" in results-analysis-cache/');
  }

  // Load the test result trees into memory; creates a list of recursive tree
  // structures: tree = { trees: [...], tests: [...] }. Each 'tree' represents a
  // directory, each 'test' is the results from a given test file.
  console.log('Iterating over all runs, loading test results');
  before = Date.now();
  for (const runs of alignedRuns.values()) {
    for (const run of runs) {
      // Just in case someone ever adds a 'tree' field to the JSON.
      if (run.tree) {
        throw new Error('Run JSON contains "tree" field; code needs changed.');
      }
      run.tree = await lib.results.getGitTree(repo, run);
    }
  }
  after = Date.now();
  console.log(`Loading ${alignedRuns.size} sets of runs took ` +
      `${after - before} ms`);

  // We're ready to score the runs now!
  console.log('Calculating scores for the runs');
  before = Date.now();
  const dateToScores = new Map();
  for (const [date, runs] of alignedRuns.entries()) {
    // The SHA should be the same for all runs, so just grab the first.
    const sha = runs[0].full_revision_hash;
    const versions = runs.map(run => run.browser_version);
    const scoresAndTotals = runs.map(run => scoreTree(run.tree, scoreFunc));
    const scores = scoresAndTotals.map(st => st[0]);
    // TODO: getting this information from the manifest would be better, as it
    // wouldn't depend on the results at all.
    const tests = Math.max(...scoresAndTotals.map(st => st[1]));
    dateToScores.set(date, {sha, versions, scores, tests});
  }
  after = Date.now();
  console.log(`Done scoring (took ${after - before} ms)`);

  // Finally, time to dump stuff.
  const outputFilename = flags.get('output');

  console.log(`Writing data to ${outputFilename}`);

  const headers = ['date', 'sha', 'tests', ...products];
  let data = headers.join(',') + '\n';

  // ES6 maps iterate in insertion order, and we initially inserted in date
  // order, so we can just iterate |dateToScores|.
  for (const [date, {sha, scores, tests}] of dateToScores) {
    const csvRecord = [
      date.substr(0, 10),
      sha.substr(0, 10),
      tests,
      ...scores,
    ];
    data += csvRecord.join(',') + '\n';
  }
  await fs.promises.writeFile(outputFilename, data, 'utf-8');
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});

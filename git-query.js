'use strict';

const flags = require('flags');
const Git = require('nodegit');
const lib = require('./lib');

flags.defineInteger('max-runs', 0, 'Query at most this many runs');
flags.parse();

function queryTree(tree) {
  let counter = 0;
  lib.results.walkTests(tree, (path, test, results) => {
    // count non-OK/PASS statuses
    if (results.status !== 'OK' && results.status !== 'PASS') {
      counter++;
    }
    if (results.subtests) {
      for (const subtest of results.subtests) {
        if (subtest.status !== 'PASS') {
          counter++;
        }
      }
    }
    /*
    // look for non-unique subtests names
    if (results.subtests.length) {
      const names = new Set;
      for (const subtest of results.subtests) {
        names.add(subtest.name);
      }
      if (names.size !== results.subtests.length) {
        //console.log(`${path}/${test}`);
        counter++;
      }
    }
    */
  });
  return counter;
}

async function main() {
  const maxRuns = flags.get('max-runs');

  // bare clone of https://github.com/foolip/wpt-results
  const repo = await Git.Repository.open('wpt-results.git');

  console.log('Getting master set of runs from server');
  let t0 = Date.now();
  let masterRuns = await lib.runs.getAll({label: 'master'});
  const serverLoadTime = Date.now() - t0;
  console.log(`Found ${masterRuns.length} master runs (took ${serverLoadTime} ms)`);

  // Filter out runs which we don't have locally.
  console.log('Getting local set of runs from repo');
  t0 = Date.now();
  const localRunsIds = await lib.results.getLocalRunIds(repo);
  let runs = masterRuns.filter(run => localRunsIds.has(run.id));
  const localRunsTime = Date.now() - t0;
  console.log(`Found ${runs.length} local runs (took ${localRunsTime} ms)`);

  if (maxRuns) {
    console.log(`Filtering to ${maxRuns} runs`);
    runs = runs.slice(0, maxRuns);
  }

  // Fully parallel loading is slower than loading one run after the other
  // probably because it's I/O bound. Also uses more memory. But loading a few
  // in parallel might be faster than this:
  console.log('Iterating over all runs, loading test results');
  t0 = Date.now();
  const trees = new Array(runs.length);
  for (const i in runs) {
    const run = runs[i];
    //console.log(`Loading run ${run.id} (${run.browser_name} ${run.browser_version} @ ${run.revision})`);
    trees[i] = await lib.results.getGitTree(repo, run);
  }
  const loadTime = Date.now() - t0;
  console.log(`Loading ${runs.length} runs took ${loadTime} ms`);

  t0 = Date.now();
  const results = [];
  for (const tree of trees) {
    results.push(queryTree(tree));
  }
  const queryTime = Date.now() - t0;
  // Log results after loop so that console doesn't dominate the time.
  console.log(results);
  console.log(`Querying ${runs.length} runs took ${queryTime} ms`);

  const treeCount = Object.keys(lib.results.treeCache).length;
  const testCount = Object.keys(lib.results.testCache).length;
  console.log(`${treeCount} trees in memory`);
  console.log(`${testCount} tests in memory`);

  if (global.gc) {
    global.gc();
  }
  const memory = process.memoryUsage();
  console.log(memory);

  // For copying into spreadsheet
  console.log(`${runs.length}\t${loadTime}\t${queryTime}\t${treeCount}\t${testCount}\t${memory.rss}\t${memory.heapTotal}\t${memory.heapUsed}\t${memory.external}`);
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});

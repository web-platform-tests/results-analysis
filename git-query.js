'use strict';

const flags = require('flags');
const Git = require('nodegit');
const lib = require('./lib');

flags.defineInteger('max-runs', 0, 'Query at most this many runs');
flags.parse();

/*
// Oids are 160 bit (20 byte) SHA-1 hashes. The hex strings would take
// >=80 bytes of memory. Convert them to strings of length 10 with 16
// bits used per code points, which can be used as Object/Map keys.
function shaToKey(sha) {
  return sha.replace(/.{4}/g, chars => {
    return String.fromCharCode(parseInt(chars, 16));
  });
}

function oidToKey(oid) {
  return shaToKey(oid.tostrS());
}
*/

function oidToKey(oid) {
  return oid.tostrS();
}

// Map from oid to { "trees": { ... }, "tests": { ... } } objects.
const treeCache = {};
// Map from oid to { "status": "OK", ... } objects.
const testCache = {};

// Read a Git.Tree fully into memory.
async function readTree(treeOrEntry) {
  let tree, entry, oid;
  if (treeOrEntry instanceof Git.Tree) {
    tree = treeOrEntry;
    oid = tree.id();
  } else {
    if (!(treeOrEntry instanceof Git.TreeEntry) || !treeOrEntry.isTree()) {
      throw new TypeError('y no Tree or TreeEntry?');
    }
    entry = treeOrEntry;
    oid = entry.id();
  }

  const key = oidToKey(oid);

  const cachedTree = treeCache[key];
  if (cachedTree) {
    return cachedTree;
  }

  const newTree = {
    trees: {},
    tests: {},
  };

  if (!tree) {
    tree = await entry.getTree();
  }

  for (const entry of tree.entries()) {
    if (entry.isTree()) {
      newTree.trees[entry.name()] = await readTree(entry);
    } else if (entry.isBlob()) {
      let name = entry.name();
      if (!name.endsWith('.json')) {
        throw new Error('y not .json?');
      }
      name = decodeURIComponent(name.substr(0, name.length - 5));
      newTree.tests[name] = await readResults(entry);
    } else {
      throw new TypeError('y not tree or blob?')
    }
  }

  treeCache[key] = newTree;
  return newTree;
}

async function readResults(entry) {
  if (!entry.isBlob()) {
    throw new TypeError('y no Blob?');
  }

  const key = oidToKey(entry.id());

  const cachedTest = testCache[key];
  if (cachedTest) {
    return cachedTest;
  }

  const blob = await entry.getBlob();
  const buffer = blob.content();
  const results = JSON.parse(buffer);

  testCache[key] = results;
  return results;
}

function queryTree(tree) {
  function walk(tree, visitor, path = '') {
    const subtrees = tree.trees;
    for (const name in subtrees) {
      const subtree = subtrees[name];
      walk(subtree, visitor, `${path}/${name}`);
    }

    const tests = tree.tests;
    for (const name in tests) {
      const results = tests[name];
      visitor(path, name, results);
    }
  }

  let counter = 0;
  walk(tree, (path, test, results) => {
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

async function getLocalRuns(repo) {
  const refs = await repo.getReferences();
  const tags = refs.filter(ref => ref.isTag());
  tags.sort();

  return tags.map(tag => {
    // format is refs/tags/run/6286849043595264/results
    const parts = tag.toString().split('/');
    const id = Number(parts[3]);
    // run info beyond id isn't available
    return { id };
  });
}

async function getGitTree(repo, run) {
  const commit = await repo.getReferenceCommit(`refs/tags/run/${run.id}/results`);
  const tree = await commit.getTree();
  return tree;
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
  const localRuns = await getLocalRuns(repo);
  const localRunsIds = new Set(localRuns.map(run => run.id));
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
    const gitTree = await getGitTree(repo, run);
    trees[i] = await readTree(gitTree);
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

  const treeCount = Object.keys(treeCache).length;
  const testCount = Object.keys(testCache).length;
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

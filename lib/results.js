'use strict';

/**
 * Utility functions for interacting with WPT run results encoded in a git
 * repository (wpt-pr-results).
 *
 * The wpt-pr-results repository stores results from WPT runs as individual
 * orphan commits, each pointed to by a tag. A given commit (aka run) stores the
 * results in expanded directory form, where each WPT test has a results JSON
 * file stored at /root/path/to/test/test_name.json.
 *
 * Storing runs this way allows us to use git's built-in object deduplication to
 * compress results whilst still having easy access to them. We can keep that
 * compression even when loading results into memory, by having a cache of
 * trees/results keyed off of the git unique object ids.
 *
 * When a run is loaded into memory, we store it as a tree, where each node
 * represents a directory. A node has a (possibly empty) map of directory name
 * to child node and a (possibly empty) map of test name (for tests in the
 * node's directory) to results JSON.
 *
 * The results JSON for a particular test looks something like:
 *
 *   {status: OK, subtests: [{ name: "Foo", status: "PASS" }, ...]}
 *
 * The 'subtests' array may be missing, if the test is a reftest or single page
 * test[0]. In that case, the top level status will be a PASS/FAIL/TIMEOUT/etc
 * rather than a harness status.
 *
 * [0]: https://web-platform-tests.org/writing-tests/testharness-api.html#single-page-tests
 */

const Git = require('nodegit');

// Map from object id to { "trees": { ... }, "tests": { ... } } objects.
const treeCache = {};

// Map from object id to { "status": "OK", ... } objects.
const testCache = {};

// Convert a git object id to a key in the above maps.
function oidToKey(oid) {
  return oid.tostrS();
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

// Read the tree for a given run fully into memory, converting it into our
// internal representation (see module documentation).
async function getGitTree(repo, run) {
  const commit = await repo.getReferenceCommit(`refs/tags/run/${run.id}/results`);
  const tree = await commit.getTree();

  return readTree(tree);
}

// Return a set of run ids, determined from the tags of the git repo.
async function getLocalRunIds(repo) {
  const refs = await repo.getReferences();
  const tags = refs.filter(ref => ref.isTag());
  tags.sort();

  return new Set(tags.map(tag => {
    // format is refs/tags/run/6286849043595264/results
    const parts = tag.toString().split('/');
    return Number(parts[3]);
  }));
}

// Walks an input tree in depth-first order, calling the visitor function on
// each test in the tree. The visitor function should be of the form:
//   visitor(path, test_name, test_results)
//
// Where test_results is an object as described in the module documentation.
function walkTests(tree, visitor, path='') {
  const subtrees = tree.trees;
  for (const dir in subtrees) {
    const subtree = subtrees[dir];
    walkTests(subtree, visitor, `${path}/${dir}`);
  }

  const tests = tree.tests;
  for (const name in tests) {
    const results = tests[name];
    visitor(path, name, results);
  }
}

// treeCache, testCache exposed only for git-query.js to report memory stats.
module.exports = { getGitTree, getLocalRunIds, walkTests, treeCache, testCache };

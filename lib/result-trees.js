'use strict';

const TEST_PASS_STATUSES = ['PASS'];
const TEST_FAIL_STATUSES = ['FAIL', 'ERROR', 'TIMEOUT', 'CRASH'];
// An empty string has been seen for some tests; see
// https://github.com/web-platform-tests/wpt/issues/22306
const TEST_NEUTRAL_STATUSES = ['PRECONDITION_FAILED', 'SKIP', ''];

const SUBTEST_PASS_STATUSES = ['PASS'];
const SUBTEST_FAIL_STATUSES = ['FAIL', 'ERROR', 'TIMEOUT', 'NOTRUN'];
const SUBTEST_NEUTRAL_STATUSES = ['PRECONDITION_FAILED', 'SKIP'];

function splitTestPath(path) {
  // Complexity to handle /foo/bar/test.html?a/b, which can occur especially
  // with variants. decodeURIComponent needs to be used when reading.
  const queryStart = path.indexOf('?');
  const lastSlash = path.lastIndexOf(
      '/', queryStart >= 0 ? queryStart : path.length);
  const dirName = path.substr(0, lastSlash);
  const rawFileName = path.substr(lastSlash + 1);

  const dirs = dirName.split('/').filter(d => d);

  return {
    dirs,
    rawFileName,
  };
}

function splitTestPathEncodedName(testPath) {
  const {dirs, rawFileName} = splitTestPath(testPath);
  return {dirs, filename: encodeURIComponent(rawFileName)};
}

// Returns the results of |testPath| in |tree|, or undefined if the run has no
// such test.
function findTestResults(tree, testPath) {
  const {dirs, rawFileName} = splitTestPath(testPath);

  let node = tree;
  for (const dir of dirs) {
    node = node.trees[dir];
    if (node === undefined) {
      return undefined;
    }
  }

  return node.tests[rawFileName];
}

// Walks an input tree in depth-first order, calling the visitor function on
// each test in the tree. The visitor function should be of the form:
//   visitor(path, test_name, test_results)
//
// Where test_results is an object as described in the module documentation.
function walkTests(tree, visitor, path='') {
  for (const [dir, subtree] of Object.entries(tree.trees)) {
    walkTests(subtree, visitor, `${path}/${dir}`);
  }

  for (const [name, results] of Object.entries(tree.tests)) {
    visitor(path, name, results);
  }
}

module.exports = {
  SUBTEST_FAIL_STATUSES,
  SUBTEST_NEUTRAL_STATUSES,
  SUBTEST_PASS_STATUSES,
  TEST_FAIL_STATUSES,
  TEST_NEUTRAL_STATUSES,
  TEST_PASS_STATUSES,
  findTestResults,
  splitTestPath,
  splitTestPathEncodedName,
  walkTests,
};

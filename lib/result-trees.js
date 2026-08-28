'use strict';

const TEST_PASS_STATUSES = ['PASS'];
const TEST_FAIL_STATUSES = ['FAIL', 'ERROR', 'TIMEOUT', 'CRASH'];
// An empty string has been seen for some tests; see
// https://github.com/web-platform-tests/wpt/issues/22306
const TEST_NEUTRAL_STATUSES = ['PRECONDITION_FAILED', 'SKIP', ''];

const SUBTEST_PASS_STATUSES = ['PASS'];
const SUBTEST_FAIL_STATUSES = ['FAIL', 'ERROR', 'TIMEOUT', 'NOTRUN'];
const SUBTEST_NEUTRAL_STATUSES = ['PRECONDITION_FAILED', 'SKIP'];

const KNOWN_TEST_STATUSES = new Set([
  'OK', // A test with subtests.
  ...TEST_PASS_STATUSES,
  ...TEST_FAIL_STATUSES,
  ...TEST_NEUTRAL_STATUSES,
]);

const KNOWN_SUBTEST_STATUSES = new Set([
  ...SUBTEST_PASS_STATUSES,
  ...SUBTEST_FAIL_STATUSES,
  ...SUBTEST_NEUTRAL_STATUSES,
]);

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

// Scores one test as the fraction of it that passed, in [0, 1].
function scoreTestResults(results) {
  const status = results['status'];
  if (!KNOWN_TEST_STATUSES.has(status)) {
    throw new Error(`Unknown test status: '${status}'`);
  }

  if (!('subtests' in results)) {
    return status === 'PASS' ? 1 : 0;
  }

  const subtests = results['subtests'];
  if (subtests.length === 0) {
    return 0;
  }

  let passes = 0;
  for (const subtest of subtests) {
    const subtestStatus = subtest['status'];
    if (!KNOWN_SUBTEST_STATUSES.has(subtestStatus)) {
      throw new Error(`Unknown subtest status for '${subtest['name']}': ` +
          `'${subtestStatus}'`);
    }
    if (subtestStatus === 'PASS') {
      passes += 1;
    }
  }
  return passes / subtests.length;
}

module.exports = {
  SUBTEST_FAIL_STATUSES,
  SUBTEST_NEUTRAL_STATUSES,
  SUBTEST_PASS_STATUSES,
  TEST_FAIL_STATUSES,
  TEST_NEUTRAL_STATUSES,
  TEST_PASS_STATUSES,
  findTestResults,
  scoreTestResults,
  splitTestPath,
  splitTestPathEncodedName,
  walkTests,
};

'use strict';

const TEST_PASS_STATUSES = ['PASS'];
const TEST_FAIL_STATUSES = ['FAIL', 'ERROR', 'TIMEOUT', 'CRASH'];
// An empty string has been seen for some tests; see
// https://github.com/web-platform-tests/wpt/issues/22306
const TEST_NEUTRAL_STATUSES = ['PRECONDITION_FAILED', 'SKIP', ''];

const SUBTEST_PASS_STATUSES = ['PASS'];
const SUBTEST_FAIL_STATUSES = ['FAIL', 'ERROR', 'TIMEOUT', 'NOTRUN'];
const SUBTEST_NEUTRAL_STATUSES = ['PRECONDITION_FAILED', 'SKIP'];

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
  walkTests,
};

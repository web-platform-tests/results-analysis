'use strict';

const assert = require('chai').assert,
      browserSpecific = require('../lib/browser-specific');

function createEmptyTree() {
  return {
    trees: {},
    tests: {},
  };
}

let uniqueId = 0;

class TreeBuilder {
  constructor() {
    this.root = createEmptyTree();
  }

  build() {
    // Time to add all the unique ids.
    function addUniqueIds(node) {
      node.id = ++uniqueId;

      for (let name in node.tests) {
        node.tests[name].id = ++uniqueId;
      }
      for (let dir in node.trees) {
        addUniqueIds(node.trees[dir]);
      }
    }

    addUniqueIds(this.root);
    return this.root;
  }

  // Add a test with a given status to the tree. The path parameter is
  // interpreted as a directory path and subtrees are created as necessary.
  addTest(path, status) {
    let currentNode = this.root;
    let testParts = path.split('/');
    for (let i = 0; i < testParts.length - 1; i++) {
      const directoryName = testParts[i];
      if (!(directoryName in currentNode.trees))
        currentNode.trees[directoryName] = createEmptyTree();
      currentNode = currentNode.trees[directoryName];
    }

    const testName = testParts[testParts.length - 1];
    assert.doesNotHaveAnyKeys(
        currentNode.tests, testName, `tree already has a test at ${path}`);
    currentNode.tests[testName] = { status };

    return this;
  }

  // Add a subtest with a given status to the tree. The test object must already
  // have been created; a subtest array will be created if necessary.
  addSubtest(testPath, subtest, status) {
    let currentNode = this.root;
    let testParts = testPath.split('/');
    for (let i = 0; i < testParts.length - 1; i++) {
      currentNode = currentNode.trees[testParts[i]];
    }

    const testName = testParts[testParts.length - 1];
    let test = currentNode.tests[testName];
    if (test.subtests === undefined)
      test.subtests = [];
    test.subtests.push({ name: subtest, status });

    return this;
  }
}

describe('browser-specific.js', () => {
  describe('Browser Validation', () => {
    it('should not throw if the browser list is correct', () => {
      let runs = [
          { browser_name: 'chrome', tree: new TreeBuilder().build() },
          { browser_name: 'firefox', tree: new TreeBuilder().build() },
      ];
      let expectedBrowsers = new Set(['chrome', 'firefox']);
      assert.doesNotThrow(() => {
        browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      });
    });

    it('should throw if an expected browser is missing', () => {
      let runs = [];
      let expectedBrowsers = new Set(['chrome', 'firefox']);
      assert.throws(() => {
        browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      });

      runs = [
          { browser_name: 'chrome', tree: new TreeBuilder().build() },
          { browser_name: 'firefox', tree: new TreeBuilder().build() },
      ];
      expectedBrowsers = new Set(['chrome', 'firefox', 'safari']);
      assert.throws(() => {
        browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      });
    });

    it('should throw if an unexpected browser is present', () => {
      let runs = [
          { browser_name: 'chrome', tree: new TreeBuilder().build() },
          { browser_name: 'firefox', tree: new TreeBuilder().build() },
      ];
      let expectedBrowsers = new Set;
      assert.throws(() => {
        browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      });

      runs = [
          { browser_name: 'chrome', tree: new TreeBuilder().build() },
          { browser_name: 'firefox', tree: new TreeBuilder().build() },
          { browser_name: 'safari', tree: new TreeBuilder().build() },
      ];
      expectedBrowsers = new Set(['chrome', 'firefox']);
      assert.throws(() => {
        browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      });
    });

    it('should throw if there are duplicate browsers', () => {
      let runs = [
          { browser_name: 'chrome', tree: new TreeBuilder().build() },
          { browser_name: 'firefox', tree: new TreeBuilder().build() },
          { browser_name: 'chrome', tree: new TreeBuilder().build() },
      ];
      let expectedBrowsers = new Set(['chrome', 'firefox']);
      assert.throws(() => {
        browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      });
    });
  });

  describe('Scoring Runs', () => {
    it('should score top-level tests correctly', () => {
      const expectedBrowsers = new Set(['chrome', 'firefox']);

      // A basic case; test passes in Chrome but fails in Firefox.
      let chromeTree = new TreeBuilder().addTest('TestA', 'PASS').build();
      let firefoxTree = new TreeBuilder().addTest('TestA', 'FAIL').build();
      let runs = [
          { browser_name: 'chrome', tree: chromeTree },
          { browser_name: 'firefox', tree: firefoxTree },
      ];

      let scores = browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      assert.deepEqual(scores, new Map([['chrome', 0], ['firefox', 1]]));

      // The following are all treated as failure: FAIL, ERROR, TIMEOUT, CRASH.
      chromeTree = new TreeBuilder()
          .addTest('TestA', 'ERROR')
          .addTest('TestB', 'TIMEOUT')
          .addTest('TestC', 'CRASH')
          .build();
      firefoxTree = new TreeBuilder()
          .addTest('TestA', 'PASS')
          .addTest('TestB', 'PASS')
          .addTest('TestC', 'PASS')
          .build();
      runs = [
          { browser_name: 'chrome', tree: chromeTree },
          { browser_name: 'firefox', tree: firefoxTree },
      ];

      scores = browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      assert.deepEqual(scores, new Map([['chrome', 3], ['firefox', 0]]));

      // There are also 'neutral' statuses (PRECONDITION_FAILED, SKIP), which
      // mean a test can never be a browser-specific fail. Make sure to test
      // that a neutral status is not treated as either a PASS or FAIL.
      chromeTree = new TreeBuilder()
          .addTest('TestA', 'PASS')
          .addTest('TestB', 'FAIL')
          .addTest('TestC', 'PASS')
          .addTest('TestD', 'FAIL')
          .build();
      firefoxTree = new TreeBuilder()
          .addTest('TestA', 'PRECONDITION_FAILED')
          .addTest('TestB', 'PRECONDITION_FAILED')
          .addTest('TestC', 'SKIP')
          .addTest('TestD', 'SKIP')
          .build();
      runs = [
          { browser_name: 'chrome', tree: chromeTree },
          { browser_name: 'firefox', tree: firefoxTree },
      ];

      scores = browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      assert.deepEqual(scores, new Map([['chrome', 0], ['firefox', 0]]));
    });

    it('should throw for an unknown top-level test status', () => {
      const expectedBrowsers = new Set(['chrome', 'firefox']);

      let chromeTree = new TreeBuilder().addTest('TestA', 'FOO').build();
      let firefoxTree = new TreeBuilder().addTest('TestA', 'PASS').build();
      let runs = [
          { browser_name: 'chrome', tree: chromeTree },
          { browser_name: 'firefox', tree: firefoxTree },
      ];

      assert.throws(() => {
        browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      });
    });

    it('should traverse subtrees correctly', () => {
      const expectedBrowsers = new Set(['chrome', 'firefox']);

      let chromeTree = new TreeBuilder().addTest('a/b/TestA', 'FAIL').build();
      let firefoxTree = new TreeBuilder().addTest('a/b/TestA', 'PASS').build();
      let runs = [
          { browser_name: 'chrome', tree: chromeTree },
          { browser_name: 'firefox', tree: firefoxTree },
      ];

      let scores = browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      assert.deepEqual(scores, new Map([['chrome', 1], ['firefox', 0]]));
    });

    it('should normalize subtests correctly', () => {
      const expectedBrowsers = new Set(['chrome', 'firefox']);

      let chromeTree = new TreeBuilder()
          .addTest('TestA', 'OK')
          .addSubtest('TestA', 'test 1', 'PASS')
          .addSubtest('TestA', 'test 2', 'PASS')
          .addSubtest('TestA', 'test 3', 'FAIL')
          .addSubtest('TestA', 'test 4', 'PASS')
          .build();
      let firefoxTree = new TreeBuilder()
          .addTest('TestA', 'OK')
          .addSubtest('TestA', 'test 1', 'FAIL')
          .addSubtest('TestA', 'test 2', 'FAIL')
          .addSubtest('TestA', 'test 3', 'PASS')
          .addSubtest('TestA', 'test 4', 'PASS')
          .build();
      let runs = [
          { browser_name: 'chrome', tree: chromeTree },
          { browser_name: 'firefox', tree: firefoxTree },
      ];

      // 1/4 subtests are Chrome-only failures, and 2/4 subtests are
      // Firefox-only failures.
      let scores = browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      assert.deepEqual(scores, new Map([['chrome', 0.25], ['firefox', 0.5]]));

      // TIMEOUT and ERROR are also considered failure modes.
      chromeTree = new TreeBuilder()
          .addTest('TestA', 'OK')
          .addSubtest('TestA', 'test 1', 'TIMEOUT')
          .addSubtest('TestA', 'test 2', 'ERROR')
          .build();
      firefoxTree = new TreeBuilder()
          .addTest('TestA', 'OK')
          .addSubtest('TestA', 'test 1', 'PASS')
          .addSubtest('TestA', 'test 2', 'PASS')
          .build();
      runs = [
          { browser_name: 'chrome', tree: chromeTree },
          { browser_name: 'firefox', tree: firefoxTree },
      ];
      scores = browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      assert.deepEqual(scores, new Map([['chrome', 1], ['firefox', 0]]));

      // There are also 'neutral' statuses (PRECONDITION_FAILED, SKIP), which
      // mean a subtest can never be a browser-specific fail. Make sure to test
      // that a neutral status is not treated as either a PASS or FAIL.
      chromeTree = new TreeBuilder()
          .addTest('TestA', 'OK')
          .addSubtest('TestA', 'test 1', 'PRECONDITION_FAILED')
          .addSubtest('TestA', 'test 2', 'PRECONDITION_FAILED')
          .addSubtest('TestA', 'test 3', 'SKIP')
          .addSubtest('TestA', 'test 4', 'SKIP')
          .build();
      firefoxTree = new TreeBuilder()
          .addTest('TestA', 'OK')
          .addSubtest('TestA', 'test 1', 'PASS')
          .addSubtest('TestA', 'test 2', 'PASS')
          .addSubtest('TestA', 'test 3', 'PASS')
          .addSubtest('TestA', 'test 4', 'PASS')
          .build();
      runs = [
          { browser_name: 'chrome', tree: chromeTree },
          { browser_name: 'firefox', tree: firefoxTree },
      ];
      scores = browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      assert.deepEqual(scores, new Map([['chrome', 0], ['firefox', 0]]));
    });

    it('should ignore tests that arent in all browsers', () => {
      const expectedBrowsers = new Set(['chrome', 'firefox']);

      // If a test doesn't exist in all browsers, it never counts for
      // browser-specific failures.
      let chromeTree = new TreeBuilder()
          .addTest('TestA', 'FAIL')
          .addTest('TestB', 'PASS')
          .build();
      let firefoxTree = new TreeBuilder()
          .addTest('TestB', 'PASS')
          .addTest('TestC', 'PASS')
          .build();
      let runs = [
          { browser_name: 'chrome', tree: chromeTree },
          { browser_name: 'firefox', tree: firefoxTree },
      ];

      let scores = browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      assert.deepEqual(scores, new Map([['chrome', 0], ['firefox', 0]]));
    });

    it('should ignore subtrees that arent in all browsers', () => {
      const expectedBrowsers = new Set(['chrome', 'firefox']);

      // If a subtree doesn't exist in all browsers, it is just ignored.
      let chromeTree = new TreeBuilder()
          .addTest('a/b/c/TestA', 'FAIL')
          .addTest('d/e/f/TestB', 'PASS')
          .build();
      let firefoxTree = new TreeBuilder()
          .addTest('d/e/f/TestB', 'PASS')
          .addTest('g/h/i/TestA', 'PASS')
          .build();
      let runs = [
          { browser_name: 'chrome', tree: chromeTree },
          { browser_name: 'firefox', tree: firefoxTree },
      ];

      let scores = browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      assert.deepEqual(scores, new Map([['chrome', 0], ['firefox', 0]]));
    });

    it('should handle subtests that arent in all browsers', () => {
      const expectedBrowsers = new Set(['chrome', 'firefox']);

      // We take the union of results when looking at subtests. This means that
      // a missing subtest can be a browser-specific failure, if all other
      // browsers have a passing result for it. Even if they don't, it still
      // counts for the denominator.
      let chromeTree = new TreeBuilder()
          .addTest('TestA', 'OK')
          .addSubtest('TestA', 'test 1', 'PASS')
          .addSubtest('TestA', 'test 2', 'FAIL')
          .addSubtest('TestA', 'test 3', 'PASS')
          .build();
      let firefoxTree = new TreeBuilder()
          .addTest('TestA', 'OK')
          .addSubtest('TestA', 'test 2', 'PASS')
          .addSubtest('TestA', 'test 3', 'PASS')
          .addSubtest('TestA', 'test 4', 'PASS')
          .addSubtest('TestA', 'test 5', 'PASS')
          .build();
      let runs = [
          { browser_name: 'chrome', tree: chromeTree },
          { browser_name: 'firefox', tree: firefoxTree },
      ];

      let scores = browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      assert.deepEqual(scores, new Map([['chrome', 0.6], ['firefox', 0.2]]));
    });

    it('should handle the case where one browser has no subtests for a test', () => {
      const expectedBrowsers = new Set(['chrome', 'firefox']);

      // In this case, Chrome ran the test and had a harness error, so has no
      // subtests. Firefox did find subtests. When one or more browsers have
      // subtests for a given test, but some browsers don't, we ignore the test
      // entirely.
      let chromeTree = new TreeBuilder().addTest('TestA', 'ERROR').build();
      let firefoxTree = new TreeBuilder()
          .addTest('TestA', 'OK')
          .addSubtest('TestA', 'test 1', 'PASS')
          .addSubtest('TestA', 'test 2', 'FAIL')
          .addSubtest('TestA', 'test 3', 'PASS')
          .build();
      let runs = [
          { browser_name: 'chrome', tree: chromeTree },
          { browser_name: 'firefox', tree: firefoxTree },
      ];

      let scores = browserSpecific.scoreBrowserSpecificFailures(runs, expectedBrowsers);
      assert.deepEqual(scores, new Map([['chrome', 0], ['firefox', 0]]));
    });
  });
});

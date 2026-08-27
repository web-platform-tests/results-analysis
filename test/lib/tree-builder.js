'use strict';

const assert = require('chai').assert;

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

      for (const test of Object.values(node.tests)) {
        test.id = ++uniqueId;
      }
      for (const tree of Object.values(node.trees)) {
        addUniqueIds(tree);
      }
    }

    addUniqueIds(this.root);
    return this.root;
  }

  // Add a test with a given status to the tree. The path parameter is
  // interpreted as a directory path and subtrees are created as necessary.
  addTest(path, status) {
    let currentNode = this.root;
    const testParts = path.split('/');
    for (let i = 0; i < testParts.length - 1; i++) {
      const directoryName = testParts[i];
      if (!(directoryName in currentNode.trees)) {
        currentNode.trees[directoryName] = createEmptyTree();
      }
      currentNode = currentNode.trees[directoryName];
    }

    const testName = testParts[testParts.length - 1];
    assert.doesNotHaveAnyKeys(
        currentNode.tests, testName, `tree already has a test at ${path}`);
    currentNode.tests[testName] = {status};

    return this;
  }

  // Add a subtest with a given status to the tree. The test object must already
  // have been created; a subtest array will be created if necessary.
  addSubtest(testPath, subtest, status) {
    let currentNode = this.root;
    const testParts = testPath.split('/');
    for (let i = 0; i < testParts.length - 1; i++) {
      currentNode = currentNode.trees[testParts[i]];
    }

    const testName = testParts[testParts.length - 1];
    const test = currentNode.tests[testName];
    if (test.subtests === undefined) {
      test.subtests = [];
    }
    test.subtests.push({name: subtest, status});

    return this;
  }
}

// Mints the next id, for a test that hand-builds a tree rather than using
// TreeBuilder. There must be one counter, or ids collide across fixtures.
function nextUniqueId() {
  return ++uniqueId;
}

module.exports = {TreeBuilder, nextUniqueId};

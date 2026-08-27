'use strict';

const assert = require('chai').assert;

const resultTrees = require('../lib/result-trees');
const {TreeBuilder} = require('./lib/tree-builder');

describe('result-trees.js', () => {
  describe('splitTestPath', () => {
    it('splits a nested path into its directories and name', () => {
      assert.deepEqual(
          resultTrees.splitTestPath('/css/css-grid/grid-001.html'),
          {dirs: ['css', 'css-grid'], rawFileName: 'grid-001.html'});
    });

    it('gives no directories for a test at the root', () => {
      assert.deepEqual(resultTrees.splitTestPath('/a.html'),
          {dirs: [], rawFileName: 'a.html'});
    });

    it('keeps a query string in the name', () => {
      assert.deepEqual(
          resultTrees.splitTestPath('/webcodecs/full-cycle.any.html?vp8'),
          {dirs: ['webcodecs'], rawFileName: 'full-cycle.any.html?vp8'});
    });

    it('keeps a slash inside a query string out of the directories', () => {
      assert.deepEqual(resultTrees.splitTestPath('/foo/bar/test.html?a/b'),
          {dirs: ['foo', 'bar'], rawFileName: 'test.html?a/b'});
    });

    it('keeps uppercase letters verbatim', () => {
      assert.deepEqual(resultTrees.splitTestPath('/css/A.html?Q=1'),
          {dirs: ['css'], rawFileName: 'A.html?Q=1'});
    });
  });

  describe('splitTestPathEncodedName', () => {
    it('percent-encodes the name', () => {
      assert.deepEqual(
          resultTrees.splitTestPathEncodedName('/webcodecs/x.any.html?vp8'),
          {dirs: ['webcodecs'], filename: 'x.any.html%3Fvp8'});
    });

    it('encodes a slash inside a query string', () => {
      assert.deepEqual(
          resultTrees.splitTestPathEncodedName('/foo/bar/test.html?a/b'),
          {dirs: ['foo', 'bar'], filename: 'test.html%3Fa%2Fb'});
    });

    it('leaves a name needing no encoding alone', () => {
      assert.deepEqual(
          resultTrees.splitTestPathEncodedName('/css/grid-001.html'),
          {dirs: ['css'], filename: 'grid-001.html'});
    });

    it('decodes back to the name splitTestPath returns', () => {
      const testPath = '/foo/bar/test.html?a/b';
      const {filename} = resultTrees.splitTestPathEncodedName(testPath);

      assert.equal(decodeURIComponent(filename),
          resultTrees.splitTestPath(testPath).rawFileName);
    });
  });

  describe('findTestResults', () => {
    const tree = new TreeBuilder()
        .addTest('css/a.html', 'PASS')
        .addTest('root.html', 'OK')
        .build();

    it('finds a test in a directory', () => {
      assert.equal(resultTrees.findTestResults(tree, '/css/a.html').status,
          'PASS');
    });

    it('finds a test at the root of the tree', () => {
      assert.equal(resultTrees.findTestResults(tree, '/root.html').status,
          'OK');
    });

    it('returns undefined for a test the run does not have', () => {
      assert.isUndefined(resultTrees.findTestResults(tree, '/css/gone.html'));
    });

    it('returns undefined for a directory the run does not have', () => {
      assert.isUndefined(resultTrees.findTestResults(tree, '/dom/a.html'));
    });

    it('does not match a path differing only in case', () => {
      assert.isUndefined(resultTrees.findTestResults(tree, '/css/A.html'));
    });
  });
});

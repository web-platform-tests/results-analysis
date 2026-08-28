'use strict';

const assert = require('chai').assert;

const featureLevelInterop = require('../lib/feature-level-interop');
const {TreeBuilder} = require('./lib/tree-builder');

// Builds the map that lib.runs.fetchWebFeaturesManifest returns.
function createFeatureTests(featureToTests) {
  return new Map(Object.entries(featureToTests).map(
      ([feature, tests]) => [feature, new Set(tests)]));
}

// Builds a list of runs from a map of browser name to built tree.
function createRuns(browserToTree) {
  return Object.entries(browserToTree).map(
      ([browserName, tree]) => ({browser_name: browserName, tree}));
}

describe('feature-level-interop.js', () => {
  describe('scoreFeature', () => {
    const expectedBrowsers = ['chrome', 'firefox'];

    it('scores each product as its fraction of the feature passed', () => {
      const runs = createRuns({
        chrome: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('css/b.html', 'PASS')
            .build(),
        firefox: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('css/b.html', 'FAIL')
            .build(),
      });

      const scored = featureLevelInterop.scoreFeature(
          runs, expectedBrowsers, new Set(['/css/a.html', '/css/b.html']));

      assert.deepEqual(scored.scores,
          new Map([['chrome', 1], ['firefox', 0.5]]));
      assert.equal(scored.interop, 0.5);
      assert.equal(scored.tests, 2);
    });

    it('scores each product passing only what the other fails as zero interop',
        () => {
          const runs = createRuns({
            chrome: new TreeBuilder()
                .addTest('css/a.html', 'PASS')
                .addTest('css/b.html', 'FAIL')
                .build(),
            firefox: new TreeBuilder()
                .addTest('css/a.html', 'FAIL')
                .addTest('css/b.html', 'PASS')
                .build(),
          });

          const scored = featureLevelInterop.scoreFeature(
              runs, expectedBrowsers, new Set(['/css/a.html', '/css/b.html']));

          // The lowest per-browser mean would be 0.5; the mean of the per-test
          // minima is 0, because neither test passes everywhere.
          assert.equal(scored.interop, 0);
        });

    it('divides by the tests found rather than the tests listed', () => {
      const runs = createRuns({
        chrome: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        firefox: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
      });

      const scored = featureLevelInterop.scoreFeature(
          runs, expectedBrowsers, new Set(['/css/a.html', '/css/future.html']));

      assert.equal(scored.tests, 1);
      assert.deepEqual(scored.scores,
          new Map([['chrome', 1], ['firefox', 1]]));
    });

    it('scores a product zero for a test only another product has', () => {
      const runs = createRuns({
        chrome: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('css/b.html', 'PASS')
            .build(),
        firefox: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
      });

      const scored = featureLevelInterop.scoreFeature(
          runs, expectedBrowsers, new Set(['/css/a.html', '/css/b.html']));

      assert.equal(scored.tests, 2);
      assert.deepEqual(scored.scores,
          new Map([['chrome', 1], ['firefox', 0.5]]));
      assert.equal(scored.interop, 0.5);
    });

    it('returns undefined when no run has any of the tests', () => {
      const runs = createRuns({
        chrome: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        firefox: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
      });

      assert.isUndefined(featureLevelInterop.scoreFeature(
          runs, expectedBrowsers, new Set(['/dom/gone.html'])));
    });

    it('takes the lowest subtest fraction for a test', () => {
      const runs = createRuns({
        chrome: new TreeBuilder()
            .addTest('css/a.html', 'OK')
            .addSubtest('css/a.html', 'one', 'PASS')
            .addSubtest('css/a.html', 'two', 'PASS')
            .build(),
        firefox: new TreeBuilder()
            .addTest('css/a.html', 'OK')
            .addSubtest('css/a.html', 'one', 'PASS')
            .addSubtest('css/a.html', 'two', 'FAIL')
            .build(),
      });

      const scored = featureLevelInterop.scoreFeature(
          runs, expectedBrowsers, new Set(['/css/a.html']));

      assert.equal(scored.interop, 0.5);
    });
  });

  describe('scoreFeatureLevelInterop', () => {
    const expectedBrowsers = ['chrome', 'firefox'];

    it('scores every feature the manifest lists', () => {
      const runs = createRuns({
        chrome: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('x.html', 'FAIL')
            .build(),
        firefox: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('x.html', 'FAIL')
            .build(),
      });

      const scored = featureLevelInterop.scoreFeatureLevelInterop(
          runs, expectedBrowsers,
          createFeatureTests({grid: ['/css/a.html'], audio: ['/x.html']}));

      assert.deepEqual([...scored.keys()].sort(), ['audio', 'grid']);
      assert.equal(scored.get('grid').interop, 1);
      assert.equal(scored.get('audio').interop, 0);
    });

    it('leaves out a feature no run has any test for', () => {
      const runs = createRuns({
        chrome: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        firefox: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
      });

      const scored = featureLevelInterop.scoreFeatureLevelInterop(
          runs, expectedBrowsers,
          createFeatureTests({grid: ['/css/a.html'], audio: ['/x.html']}));

      assert.deepEqual([...scored.keys()], ['grid']);
    });

    it('scores a test that two features list under both', () => {
      const runs = createRuns({
        chrome: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        firefox: new TreeBuilder().addTest('css/a.html', 'FAIL').build(),
      });

      const scored = featureLevelInterop.scoreFeatureLevelInterop(
          runs, expectedBrowsers, createFeatureTests({
            grid: ['/css/a.html'],
            subgrid: ['/css/a.html'],
          }));

      assert.deepEqual([...scored.keys()].sort(), ['grid', 'subgrid']);
      assert.equal(scored.get('subgrid').interop, 0);
    });
  });
});

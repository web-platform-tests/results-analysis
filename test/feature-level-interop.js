'use strict';

const assert = require('chai').assert;

const featureLevelInterop = require('../lib/feature-level-interop');
const {TreeBuilder} = require('./lib/tree-builder');

// The products feature-level-interop.js scores by default. Two browsers cannot
// tell a minimum taken across every product from one taken over a pair, so the
// fixtures use all three.
const expectedBrowsers = ['chrome', 'firefox', 'safari'];

// Builds the map that lib.runs.parseWebFeaturesManifest returns.
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
        safari: new TreeBuilder()
            .addTest('css/a.html', 'FAIL')
            .addTest('css/b.html', 'FAIL')
            .build(),
      });

      const scored = featureLevelInterop.scoreFeature(
          runs, expectedBrowsers, new Set(['/css/a.html', '/css/b.html']));

      assert.deepEqual(scored.scores,
          new Map([['chrome', 1], ['firefox', 0.5], ['safari', 0]]));
      assert.equal(scored.tests, 2);
    });

    it('takes the lowest score among every product, not just two', () => {
      // Safari is the lowest on c and d but not on e, which firefox fails, so
      // dropping either of them from the minimum changes the interop score.
      const runs = createRuns({
        chrome: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('css/b.html', 'PASS')
            .addTest('css/c.html', 'PASS')
            .addTest('css/d.html', 'PASS')
            .addTest('css/e.html', 'PASS')
            .build(),
        firefox: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('css/b.html', 'PASS')
            .addTest('css/c.html', 'PASS')
            .addTest('css/d.html', 'PASS')
            .addTest('css/e.html', 'FAIL')
            .build(),
        safari: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('css/b.html', 'PASS')
            .addTest('css/c.html', 'FAIL')
            .addTest('css/d.html', 'FAIL')
            .addTest('css/e.html', 'PASS')
            .build(),
      });

      const scored = featureLevelInterop.scoreFeature(runs, expectedBrowsers,
          new Set(['/css/a.html', '/css/b.html', '/css/c.html',
            '/css/d.html', '/css/e.html']));

      assert.deepEqual(scored.scores,
          new Map([['chrome', 1], ['firefox', 0.8], ['safari', 0.6]]));
      // Only a and b pass everywhere. Ignoring safari would give 0.8, and the
      // lowest per-product mean would be 0.6.
      assert.equal(scored.interop, 0.4);
    });

    it('scores zero interop when no test passes in every product', () => {
      const runs = createRuns({
        chrome: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('css/b.html', 'FAIL')
            .addTest('css/c.html', 'FAIL')
            .build(),
        firefox: new TreeBuilder()
            .addTest('css/a.html', 'FAIL')
            .addTest('css/b.html', 'PASS')
            .addTest('css/c.html', 'FAIL')
            .build(),
        safari: new TreeBuilder()
            .addTest('css/a.html', 'FAIL')
            .addTest('css/b.html', 'FAIL')
            .addTest('css/c.html', 'PASS')
            .build(),
      });

      const scored = featureLevelInterop.scoreFeature(runs, expectedBrowsers,
          new Set(['/css/a.html', '/css/b.html', '/css/c.html']));

      // The lowest per-product mean would be 1/3; the mean of the per-test
      // minima is 0, because no test passes everywhere.
      assert.equal(scored.interop, 0);
    });

    it('divides by the tests found rather than the tests listed', () => {
      const runs = createRuns({
        chrome: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        firefox: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        safari: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
      });

      const scored = featureLevelInterop.scoreFeature(
          runs, expectedBrowsers, new Set(['/css/a.html', '/css/future.html']));

      assert.equal(scored.tests, 1);
      assert.deepEqual(scored.scores,
          new Map([['chrome', 1], ['firefox', 1], ['safari', 1]]));
    });

    it('scores a product zero for a test only another product has', () => {
      const runs = createRuns({
        chrome: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('css/b.html', 'PASS')
            .build(),
        firefox: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        safari: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
      });

      const scored = featureLevelInterop.scoreFeature(
          runs, expectedBrowsers, new Set(['/css/a.html', '/css/b.html']));

      assert.equal(scored.tests, 2);
      assert.deepEqual(scored.scores,
          new Map([['chrome', 1], ['firefox', 0.5], ['safari', 0.5]]));
      assert.equal(scored.interop, 0.5);
    });

    it('returns undefined when no run has any of the tests', () => {
      const runs = createRuns({
        chrome: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        firefox: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        safari: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
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
            .addSubtest('css/a.html', 'three', 'PASS')
            .addSubtest('css/a.html', 'four', 'PASS')
            .build(),
        firefox: new TreeBuilder()
            .addTest('css/a.html', 'OK')
            .addSubtest('css/a.html', 'one', 'PASS')
            .addSubtest('css/a.html', 'two', 'PASS')
            .addSubtest('css/a.html', 'three', 'PASS')
            .addSubtest('css/a.html', 'four', 'FAIL')
            .build(),
        safari: new TreeBuilder()
            .addTest('css/a.html', 'OK')
            .addSubtest('css/a.html', 'one', 'PASS')
            .addSubtest('css/a.html', 'two', 'PASS')
            .addSubtest('css/a.html', 'three', 'FAIL')
            .addSubtest('css/a.html', 'four', 'FAIL')
            .build(),
      });

      const scored = featureLevelInterop.scoreFeature(
          runs, expectedBrowsers, new Set(['/css/a.html']));

      // The fractions are 1, 0.75 and 0.5, so ignoring safari would give 0.75.
      assert.equal(scored.interop, 0.5);
    });
  });

  describe('averageFeatureScores', () => {
    it('weights a two test feature the same as a one test feature', () => {
      const runs = createRuns({
        chrome: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('css/b.html', 'PASS')
            .addTest('dom/c.html', 'PASS')
            .build(),
        firefox: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('css/b.html', 'FAIL')
            .addTest('dom/c.html', 'PASS')
            .build(),
        safari: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('css/b.html', 'FAIL')
            .addTest('dom/c.html', 'FAIL')
            .build(),
      });

      const featureScores = featureLevelInterop.scoreRuns(
          runs, expectedBrowsers, createFeatureTests({
            grid: ['/css/a.html', '/css/b.html'],
            audio: ['/dom/c.html'],
          }));
      const averaged = featureLevelInterop.averageFeatureScores(
          featureScores, expectedBrowsers);

      // grid scores 1, 0.5 and 0.5; audio scores 1, 1 and 0. Weighting the
      // features by their test counts would give firefox 2/3 and safari 1/3.
      assert.deepEqual(averaged.scores,
          new Map([['chrome', 1], ['firefox', 0.75], ['safari', 0.25]]));
      assert.equal(averaged.features, 2);
    });

    it('averages each feature interop rather than taking the lowest browser',
        () => {
          const runs = createRuns({
            chrome: new TreeBuilder()
                .addTest('css/a.html', 'PASS')
                .addTest('css/b.html', 'FAIL')
                .addTest('dom/c.html', 'PASS')
                .build(),
            firefox: new TreeBuilder()
                .addTest('css/a.html', 'FAIL')
                .addTest('css/b.html', 'PASS')
                .addTest('dom/c.html', 'PASS')
                .build(),
            safari: new TreeBuilder()
                .addTest('css/a.html', 'PASS')
                .addTest('css/b.html', 'PASS')
                .addTest('dom/c.html', 'PASS')
                .build(),
          });

          const featureScores = featureLevelInterop.scoreRuns(
              runs, expectedBrowsers, createFeatureTests({
                grid: ['/css/a.html', '/css/b.html'],
                audio: ['/dom/c.html'],
              }));
          const averaged = featureLevelInterop.averageFeatureScores(
              featureScores, expectedBrowsers);

          // grid has no test that passes everywhere, so it scores zero interop
          // while chrome and firefox average 0.5 on it; audio scores one. The
          // lowest per-product mean would be 0.75 rather than 0.5.
          assert.deepEqual(averaged.scores, new Map(
              [['chrome', 0.75], ['firefox', 0.75], ['safari', 1]]));
          assert.equal(averaged.interop, 0.5);
        });

    it('counts the features scored rather than the features listed', () => {
      const runs = createRuns({
        chrome: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        firefox: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        safari: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
      });

      const featureScores = featureLevelInterop.scoreRuns(
          runs, expectedBrowsers, createFeatureTests({
            grid: ['/css/a.html'],
            audio: ['/dom/gone.html'],
          }));
      const averaged = featureLevelInterop.averageFeatureScores(
          featureScores, expectedBrowsers);

      // Averaging over the listed features instead would halve every score.
      assert.equal(averaged.features, 1);
      assert.deepEqual(averaged.scores,
          new Map([['chrome', 1], ['firefox', 1], ['safari', 1]]));
      assert.equal(averaged.interop, 1);
    });

    it('returns undefined when no feature was scored', () => {
      const runs = createRuns({
        chrome: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        firefox: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        safari: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
      });

      const featureScores = featureLevelInterop.scoreRuns(runs,
          expectedBrowsers, createFeatureTests({audio: ['/dom/gone.html']}));
      assert.equal(featureScores.size, 0);

      assert.isUndefined(featureLevelInterop.averageFeatureScores(
          featureScores, expectedBrowsers));
    });

    it('throws for a product a feature was not scored for', () => {
      // Averaging the missing product would reach the CSV as a literal NaN.
      const featureScores = new Map([['grid', {
        scores: new Map([['chrome', 1]]),
        interop: 1,
        tests: 1,
      }]]);

      assert.throws(() => {
        featureLevelInterop.averageFeatureScores(
            featureScores, expectedBrowsers);
      }, /A feature was not scored for 'firefox'/);
    });
  });

  describe('scoreRuns', () => {
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
        safari: new TreeBuilder()
            .addTest('css/a.html', 'PASS')
            .addTest('x.html', 'FAIL')
            .build(),
      });

      const scored = featureLevelInterop.scoreRuns(runs, expectedBrowsers,
          createFeatureTests({grid: ['/css/a.html'], audio: ['/x.html']}));

      assert.deepEqual([...scored.keys()].sort(), ['audio', 'grid']);
      assert.equal(scored.get('grid').interop, 1);
      assert.equal(scored.get('audio').interop, 0);
    });

    it('leaves out a feature no run has any test for', () => {
      const runs = createRuns({
        chrome: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        firefox: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        safari: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
      });

      const scored = featureLevelInterop.scoreRuns(runs, expectedBrowsers,
          createFeatureTests({grid: ['/css/a.html'], audio: ['/x.html']}));

      assert.deepEqual([...scored.keys()], ['grid']);
    });

    it('scores a test that two features list under both', () => {
      const runs = createRuns({
        chrome: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
        firefox: new TreeBuilder().addTest('css/a.html', 'FAIL').build(),
        safari: new TreeBuilder().addTest('css/a.html', 'PASS').build(),
      });

      const scored = featureLevelInterop.scoreRuns(
          runs, expectedBrowsers, createFeatureTests({
            grid: ['/css/a.html'],
            subgrid: ['/css/a.html'],
          }));

      assert.deepEqual([...scored.keys()].sort(), ['grid', 'subgrid']);
      assert.equal(scored.get('subgrid').interop, 0);
    });
  });
});

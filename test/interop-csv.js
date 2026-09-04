'use strict';

const assert = require('chai').assert;

const interopCsv = require('../lib/interop-csv');

// The products feature-level-interop.js scores by default, so that a column
// order or a score lookup cannot be right for a pair and wrong for three.
const PRODUCTS = ['chrome', 'firefox', 'safari'];

// Builds the per-date entry formatAggregateCsv takes, with a score per product
// in |scores| given in the order of |products|.
function createScored(products, scores, interop, versions) {
  return {
    sha: 'abcdef',
    manifest: 'merge_pr_12345',
    versions,
    scores: new Map(products.map((product, i) => [product, scores[i]])),
    interop,
  };
}

// Builds the per-feature entry formatDetailCsv takes.
function createFeatureScored(scores, interop, tests) {
  return {
    scores: new Map(PRODUCTS.map((product, i) => [product, scores[i]])),
    interop,
    tests,
  };
}

// The dates of the rows in |csv|, in the order they appear.
function datesIn(csv) {
  return csv.split('\n').filter(line => line !== '').slice(1)
      .map(line => line.split(',')[1]);
}

describe('interop-csv.js', () => {
  describe('formatAggregateCsv', () => {
    it('should name a version and a score column per product', () => {
      const csv = interopCsv.formatAggregateCsv(PRODUCTS, new Map());

      assert.equal(csv,
          'sha,date,manifest,chrome-version,chrome,firefox-version,firefox,' +
          'safari-version,safari,interop\n');
    });

    it('should write a row for the date scored', () => {
      const rows = new Map([
        ['2026-02-15', createScored(PRODUCTS, [1, 0.5, 0.25], 0.25,
            ['140.0', '141.0', '26.3'])],
      ]);

      assert.equal(interopCsv.formatAggregateCsv(PRODUCTS, rows),
          'sha,date,manifest,chrome-version,chrome,firefox-version,firefox,' +
          'safari-version,safari,interop\n' +
          'abcdef,2026-02-15,merge_pr_12345,140.0,100.0,141.0,50.0,' +
          '26.3,25.0,25.0\n');
    });

    it('should keep the order the dates were scored in', () => {
      // The caller inserts in date order, so the rows come out in it too.
      const rows = new Map([
        ['2026-02-15', createScored(['chrome'], [1], 1, ['140.0'])],
        ['2026-02-16', createScored(['chrome'], [1], 1, ['140.0'])],
        ['2026-02-17', createScored(['chrome'], [1], 1, ['140.0'])],
      ]);

      assert.deepEqual(datesIn(interopCsv.formatAggregateCsv(['chrome'], rows)),
          ['2026-02-15', '2026-02-16', '2026-02-17']);
    });

    it('should quote a browser version holding a comma', () => {
      // An unquoted comma would add a column and file every later score one
      // place to the right.
      const rows = new Map([
        ['2026-02-15', createScored(PRODUCTS, [1, 1, 1], 1,
            ['140.0, build 2', '141.0', '26.3'])],
      ]);

      const csv = interopCsv.formatAggregateCsv(PRODUCTS, rows);

      assert.include(csv.split('\n')[1], '"140.0, build 2"');
    });
  });

  describe('formatDetailCsv', () => {
    it('should write a row per feature with its test count', () => {
      const featureScores = new Map([
        ['grid', createFeatureScored([1, 0.5, 0.25], 0.25, 4)],
      ]);

      assert.equal(interopCsv.formatDetailCsv(PRODUCTS, featureScores),
          'feature,chrome,firefox,safari,interop,tests\n' +
          'grid,100.0,50.0,25.0,25.0,4\n');
    });

    it('should sort by interop descending', () => {
      const featureScores = new Map([
        ['grid', createFeatureScored([0.5, 0.5, 0.5], 0.5, 1)],
        ['flexbox', createFeatureScored([1, 1, 1], 1, 1)],
      ]);

      const features = interopCsv.formatDetailCsv(PRODUCTS, featureScores)
          .split('\n').slice(1).filter(l => l).map(l => l.split(',')[0]);

      assert.deepEqual(features, ['flexbox', 'grid']);
    });

    it('should break an interop tie by feature name ascending', () => {
      // Insertion order here is the reverse of the wanted order, so a stable
      // sort that ignored the name would reproduce it.
      const featureScores = new Map([
        ['grid', createFeatureScored([1, 1, 1], 1, 1)],
        ['flexbox', createFeatureScored([1, 1, 1], 1, 1)],
        ['anchor-positioning', createFeatureScored([1, 1, 1], 1, 1)],
      ]);

      const features = interopCsv.formatDetailCsv(PRODUCTS, featureScores)
          .split('\n').slice(1).filter(l => l).map(l => l.split(',')[0]);

      assert.deepEqual(features, ['anchor-positioning', 'flexbox', 'grid']);
    });

    it('should reproduce the same bytes for the same scores', () => {
      // Every build scores every date again, so a date has to keep producing
      // the breakdown that is already published for it.
      const build = () => new Map([
        ['grid', createFeatureScored([1, 0.5, 0.25], 0.25, 4)],
        ['flexbox', createFeatureScored([0.25, 1, 0.5], 0.25, 8)],
      ]);

      assert.equal(interopCsv.formatDetailCsv(PRODUCTS, build()),
          interopCsv.formatDetailCsv(PRODUCTS, build()));
    });

    it('should return only a header when no feature was scored', () => {
      assert.equal(interopCsv.formatDetailCsv(PRODUCTS, new Map()),
          'feature,chrome,firefox,safari,interop,tests\n');
    });
  });
});

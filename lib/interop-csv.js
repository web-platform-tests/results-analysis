'use strict';

/**
 * Formats the CSVs that feature-level-interop.js publishes: a trendline row per
 * date, appended to the scores already published on gh-pages, and a
 * for one date.
 */

// Formats a score in [0, 1] as the percentage with one decimal that the
// dashboard reads.
function formatScore(score) {
  return (score * 100).toFixed(1);
}

// Quotes |value| if it holds anything that would otherwise add a column or a
// row. Browser versions are the field that can, as wpt.fyi reports them
// verbatim from the run.
function csvField(value) {
  const field = String(value);
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// Returns the aggregate CSV for |dateToScores|, keyed by date, which holds one
// row per date scored.
function formatAggregateCsv(products, dateToScores) {
  let data = 'sha,date,manifest';
  for (const product of products) {
    data += `,${product}-version,${product}`;
  }
  data += ',interop\n';

  // ES6 maps iterate in insertion order, and we initially inserted in date
  // order, so we can just iterate |dateToScores|.
  for (const [date, scored] of dateToScores) {
    const csvRecord = [
      csvField(scored.sha),
      csvField(date),
      csvField(scored.manifest),
    ];
    for (let i = 0; i < products.length; i++) {
      csvRecord.push(csvField(scored.versions[i]));
      csvRecord.push(formatScore(scored.scores.get(products[i])));
    }
    csvRecord.push(formatScore(scored.interop));
    data += csvRecord.join(',') + '\n';
  }
  return data;
}

// Returns the per-feature breakdown of one date's |featureScores|, sorted by
// interop descending then feature ascending, so that rescoring a date
// reproduces it byte for byte.
function formatDetailCsv(products, featureScores) {
  let data = 'feature';
  for (const product of products) {
    data += `,${product}`;
  }
  data += ',interop,tests\n';

  const features = Array.from(featureScores.keys());
  features.sort((a, b) => {
    const byInterop =
        featureScores.get(b).interop - featureScores.get(a).interop;
    return byInterop || (a < b ? -1 : 1);
  });

  for (const feature of features) {
    const scored = featureScores.get(feature);
    const csvRecord = [csvField(feature)];
    for (const product of products) {
      csvRecord.push(formatScore(scored.scores.get(product)));
    }
    csvRecord.push(formatScore(scored.interop));
    csvRecord.push(scored.tests);
    data += csvRecord.join(',') + '\n';
  }
  return data;
}

module.exports = {
  formatAggregateCsv,
  formatDetailCsv,
};

'use strict';

/**
 * Implements a view of web interoperability per web feature over time.
 *
 * Each date is scored against the web features manifest built from that date's
 * own wpt revision, so a score is never a run measured against a catalogue it
 * did not run from. Every date in range is scored on every run, as
 * browser-specific-failures.js does.
 */

const flags = require('flags');
const fs = require('fs');
const Git = require('nodegit');
const lib = require('./lib');
const moment = require('moment');

flags.defineString('from', '2026-01-28', 'Starting date (inclusive)');
flags.defineString('to', moment().format('YYYY-MM-DD'),
    'Ending date (exclusive)');
flags.defineStringList('products', ['chrome', 'firefox', 'safari'],
    'Browsers to compare. Must match the products used on wpt.fyi');
flags.defineBoolean('experimental', false,
    'Calculate metrics for experimental runs.');
flags.parse();

// The earliest date whose wpt release carries a web features manifest. Dates
// before it cannot be scored at all, so we refuse them rather than skip them.
const EARLIEST_MANIFEST_DATE = '2024-01-20';


// Every CSV lands here, which is the directory build.sh deploys to gh-pages.
const OUTPUT_DIR = 'out/data';

// The name wpt.fyi fetches from gh-pages/data, so it is the one thing the two
// repositories have to agree on.
const CSV_NAME = 'browser-feature-interop';

// Names the aggregate CSV for |channel|, which holds one row per date, each
// averaged over every feature scored that day.
function aggregateFilename(channel) {
  return `${OUTPUT_DIR}/${channel}-${CSV_NAME}.csv`;
}

// Names the detail file for one |date| of |channel|, which holds one row per
// feature.
function detailFilename(channel, date) {
  return `${OUTPUT_DIR}/${channel}-${CSV_NAME}-${date}.csv`;
}

async function main() {
  // Sort the products so that output files are consistent.
  const products = flags.get('products');
  if (products.length < 2) {
    throw new Error('At least 2 products must be specified for this analysis');
  }
  products.sort();

  const repo = await Git.Repository.open('results-analysis-cache.git');

  // First, grab aligned runs from the server for the dates that we are
  // interested in.
  const from = moment(flags.get('from'));
  const to = moment(flags.get('to'));
  if (from.isBefore(EARLIEST_MANIFEST_DATE)) {
    throw new Error(`--from must not be before ${EARLIEST_MANIFEST_DATE}, ` +
        'as no earlier wpt release has a web features manifest');
  }
  const experimental = flags.get('experimental');

  const channel = experimental ? 'experimental' : 'stable';
  const aggregateFile = aggregateFilename(channel);
  await fs.promises.mkdir(OUTPUT_DIR, {recursive: true});

  const alignedRuns = await lib.runs.fetchAlignedRunsFromServer(
      products, from, to, experimental);

  // Map every wpt revision to its release, which is how each date's own
  // manifest is found. This is done before the trees are loaded, so that a
  // failure here does not throw away that work.
  console.log('Fetching the wpt release tags');
  const tagMap = await lib.runs.fetchWptTagMap();
  console.log(`Found ${tagMap.size} releases`);

  await lib.results.loadRunTrees(repo, alignedRuns);

  // We're ready to score the runs now!
  console.log('Calculating feature level interop for the runs');
  const before = Date.now();
  const dateToScores = new Map();
  for (const [date, runs] of alignedRuns.entries()) {
    // The SHA should be the same for all runs, so just grab the first.
    const sha = runs[0].full_revision_hash;
    const versions = runs.map(run => run.browser_version);
    try {
      const featureTests =
          await lib.runs.fetchWebFeaturesManifestForRevision(sha, tagMap);
      if (featureTests === undefined) {
        console.log(`Skipping ${date}, no wpt release is tagged at ${sha}`);
        continue;
      }

      const featureScores =
          lib.featureLevelInterop.scoreRuns(runs, products, featureTests);
      const averaged = lib.featureLevelInterop.averageFeatureScores(
          featureScores, products);
      if (averaged === undefined) {
        console.log(`Skipping ${date}, no run has any test of any feature`);
        continue;
      }

      await fs.promises.writeFile(detailFilename(channel, date),
          lib.interopCsv.formatDetailCsv(products, featureScores), 'utf-8');

      dateToScores.set(date, {
        sha,
        manifest: tagMap.get(sha),
        versions,
        scores: averaged.scores,
        interop: averaged.interop,
      });
    } catch (e) {
      e.message += `\n\tRuns: ${runs.map(r => r.id)}`;
      throw e;
    }
  }
  const after = Date.now();
  console.log(`Done scoring (took ${after - before} ms)`);

  // Finally, time to dump stuff.
  console.log(`Writing data to ${aggregateFile}`);
  await fs.promises.writeFile(aggregateFile,
      lib.interopCsv.formatAggregateCsv(products, dateToScores),
      'utf-8');
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});

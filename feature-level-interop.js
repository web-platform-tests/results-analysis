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
const path = require('path');

// The earliest date whose wpt release carries a web features manifest. Dates
// before it cannot be scored at all, so we refuse them rather than skip them.
const EARLIEST_MANIFEST_DATE = '2024-01-20';

// Every CSV lands here by default, which is the directory build.sh deploys to
// gh-pages.
const OUTPUT_DIR = 'out/data';

// The name wpt.fyi fetches from gh-pages/data, so it is the one thing the two
// repositories have to agree on. Named apart from the scores main publishes so
// that the two denominators can be compared date for date; it becomes
// browser-feature-interop if this scoring lands as the published one.
const CSV_NAME = 'browser-feature-interop-exclusions';

// The default is the date the web features catalogue settled; build.sh
// passes the same date explicitly, and says why there.
flags.defineString('from', '2026-01-28', 'Starting date (inclusive)');
flags.defineString('to', moment().format('YYYY-MM-DD'),
    'Ending date (exclusive)');
flags.defineStringList('products', ['chrome', 'firefox', 'safari'],
    'Browsers to compare. Must match the products used on wpt.fyi');
flags.defineString('output', null,
    'Aggregate output CSV file to write to. Each date scored also gets a ' +
    'detail CSV beside it, named with that date before the extension. ' +
    `Defaults to ${OUTPUT_DIR}/{stable, experimental}-${CSV_NAME}.csv`);
flags.defineBoolean('experimental', false,
    'Calculate metrics for experimental runs.');
flags.parse();

// Names the aggregate CSV for |channel|, which holds one row per date, each
// averaged over every feature scored that day.
function aggregateFilename(channel) {
  return `${OUTPUT_DIR}/${channel}-${CSV_NAME}.csv`;
}

// Names the detail file beside the aggregate CSV at |aggregateFile|, holding
// one row per feature for |date|. Derived from the aggregate path rather than
// named independently, so that --output moves the whole set of files together.
function detailFilename(aggregateFile, date) {
  const extension = path.extname(aggregateFile);
  const base = aggregateFile.slice(0, aggregateFile.length - extension.length);
  return `${base}-${date}${extension}`;
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
  const aggregateFile = flags.get('output') || aggregateFilename(channel);
  await fs.promises.mkdir(path.dirname(aggregateFile), {recursive: true});

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
    const versions = new Map(
        runs.map(run => [run.browser_name, run.browser_version]));
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

      await fs.promises.writeFile(detailFilename(aggregateFile, date),
          lib.interopCsv.formatDetailCsv(products, featureScores), 'utf-8');

      dateToScores.set(date, {
        sha,
        manifest: tagMap.get(sha),
        versions,
        scores: averaged.scores,
        interop: averaged.interop,
        features: averaged.features,
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

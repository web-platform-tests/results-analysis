'use strict';

const fetch = require ('node-fetch');
const fs = require('fs');

const metrics = require('./lib/metrics.js');

const PRODUCTS = ['chrome', 'edge', 'firefox', 'safari'];

const RESULTS_URL_PREFIX = 'https://storage.googleapis.com/wptd-results/'
const LOCAL_RESULTS_PATH = '../wptd-results/'

const SCORING_OPTIONS = {
    normalizePerTest: true,
    requireHarnessOK: true,
}

async function getStableRuns(sha) {
    const cacheFile = `cache/stable-runs-${sha}.json`;
    try {
        return JSON.parse(fs.readFileSync(cacheFile, 'UTF-8'));
    } catch (e) {}

    const url = `https://wpt.fyi/api/runs?labels=stable&sha=${sha}&max-count=500`;
    let runs = await (await fetch(url)).json();
    fs.writeFileSync(cacheFile, JSON.stringify(runs), 'UTF-8');
    return runs;
}

function pickBestRun(product, runs) {
    let candidates = runs.filter(r => r.browser_name === product);

    if (candidates.length === 0) {
        return null;
    }

    // Dedup to just keep one run with the same `raw_results_url`.
    // See https://github.com/web-platform-tests/wpt.fyi/issues/738.
    const resultsUrls = new Set;
    candidates = candidates.filter(run => {
        const url = run.raw_results_url;
        if (resultsUrls.has(url)) {
            return false;
        }
        resultsUrls.add(url);
        return true;
    });

    if (candidates.length === 1) {
        return candidates[0];
    }

    // Sort and pick the first.
    candidates.sort((a, b) => {
        // Prefer newer version (mostly for Safari 11/12)
        // No, this won't work for a "9.0" to "10.0" comparison.
        if (a.browser_version !== b.browser_version) {
            return -a.browser_version.localeCompare(b.browser_version);
        }

        // Prefer Buildbot (for continuity)
        if (a.labels.includes('buildbot') && !b.labels.includes('buildbot')) {
            return -1;
        }
        if (b.labels.includes('buildbot') && !a.labels.includes('buildbot')) {
            return 1;
        }

        // Fall back to sorting by `time_start` (earliest first).
        return Date.parse(a.time_start) - Date.parse(b.time_start);
    });

    return candidates[0];
}

async function main() {
    const csvHeader = ['date', 'sha', ...PRODUCTS, 'total'];
    console.log(csvHeader.join(','));

    const maybeAlignedRuns = fs.readFileSync('aligned-shas.txt', 'UTF-8')
        .split('\n').filter(l => l).map(l => l.split(' '));

    let skipCounter = 0;

    for (const [date, sha] of maybeAlignedRuns) {
        const runs = await getStableRuns(sha);

        const bestRuns = PRODUCTS.map(p => pickBestRun(p, runs));
        if (bestRuns.some(run => !run)) {
            //console.warn(date, sha, 'MISSING SOME RUNS');
            continue;
        }

        if (skipCounter++ % 10 !== 0) {
            //continue;
        }

        //console.log(date, sha, 'OK');
        const reports = bestRuns.map(run => {
            const resultsUrl = run.raw_results_url;
            if (!resultsUrl.startsWith(RESULTS_URL_PREFIX)) {
                throw new Error(`Unexpected results URL: ${resultsUrl}`);
            }

            const resultsPath = LOCAL_RESULTS_PATH + resultsUrl.substr(RESULTS_URL_PREFIX.length);
            if (!fs.existsSync(resultsPath)) {
                throw new Error(`Local copy of results not found: ${resultsPath}`);
            }

            return JSON.parse(fs.readFileSync(resultsPath, 'UTF-8'));
        });
        const reportScores = reports.map(report => {
            const [score, total] = metrics.scoreReport(report, SCORING_OPTIONS);
            return { score, total };
        });

        const productScores = reportScores.map(s => Math.floor(s.score));
        const productTotals = reportScores.map(s => s.total);
        const maxTotal = productTotals.reduce((x, y) => Math.max(x, y));
        const csvRecord = [date.substr(0, 10), sha.substr(0, 10), ...productScores, maxTotal];
        console.log(csvRecord.join(','));
    }
}

main();

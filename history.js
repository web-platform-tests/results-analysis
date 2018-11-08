'use strict';

const fetch = require ('node-fetch');
const fs = require('fs');
const metrics = require('./metrics.js');

const PRODUCTS = ['chrome', 'edge', 'firefox', 'safari'];

const RESULTS_URL_PREFIX = 'https://storage.googleapis.com/wptd-results/'
const LOCAL_RESULTS_PATH = '../wptd-results/'

const SCORING_OPTIONS = {
    normalizePerTest: true,
    requireHarnessOK: true,
}

async function getStableRuns(sha) {
    const url = `https://wpt.fyi/api/runs?labels=stable&sha=${sha}&max-count=500`;
    let runs = await (await fetch(url)).json();
    return runs;
}

function pickBestRun(product, runs) {
    const candidates = runs.filter(r => r.browser_name === product);
    /*
    if (candidates.length !== 1) {
        console.log(`${product} has ${runs.length} candidate runs:`);
        for (const run of candidates) {
            console.log(`  ${run.raw_results_url}`);
        }
    }
    */
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
        const scores = {};
        for (const run of bestRuns) {
            const product = run.browser_name;
            //if (product !== 'chrome') continue;
            //console.log(date, sha, product);

            const resultsUrl = run.raw_results_url;
            if (!resultsUrl.startsWith(RESULTS_URL_PREFIX)) {
                throw new Error(`Unexpected results URL: ${resultsUrl}`);
            }

            const resultsPath = LOCAL_RESULTS_PATH + resultsUrl.substr(RESULTS_URL_PREFIX.length);
            if (!fs.existsSync(resultsPath)) {
                throw new Error(`Local copy of results not found: ${resultsPath}`);
            }

            const report = JSON.parse(fs.readFileSync(resultsPath, 'UTF-8'));
            const [score, total] = metrics.scoreReport(report, SCORING_OPTIONS);
            scores[product] = { score, total };
        }

        const productScores = PRODUCTS.map(p => Math.floor(scores[p].score));
        const productTotals = PRODUCTS.map(p => scores[p].total);
        const maxTotal = productTotals.reduce((x, y) => Math.max(x, y));
        const csvRecord = [date.substr(0, 10), sha.substr(0, 10), ...productScores, maxTotal];
        console.log(csvRecord.join(','));
    }
}

main();

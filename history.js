const fetch = require ('node-fetch');

const PRODUCTS = ['chrome', 'edge', 'firefox', 'safari'];

// doens't work because of https://github.com/web-platform-tests/wpt.fyi/issues/733
/*
async function findProductRuns(product) {
    const allRuns = [];
    // paginate using the `to` parameter, starting with the current time and
    // using the date of the last run from each response until all are found.
    let toDate = new Date().toISOString();
    while (true) {
        const url = `https://wpt.fyi/api/runs?product=${product}&label=stable&to=${toDate}&max-count=500`;
        let runs = await (await fetch(url)).json();
        if (runs.length === 0) {
            // no more runs
            break;
        }
        allRuns.push(...runs);
        toDate = runs[runs.length - 1].time_start;
    }
    return allRuns;
}
*/

async function getAllRuns() {
    const allRuns = [];
    // Paginate using the `to` parameter, starting with the current time and
    // using the date of the last run from each response until all are found.
    // The use of `fromDate` is to avoid
    // https://github.com/web-platform-tests/wpt.fyi/issues/733 and is OK
    // because that's when Edge and Safari runs began.
    const fromDate = '2017-08-01T00:00:00Z';
    let toDate = new Date().toISOString();
    while (true) {
        const url = `https://wpt.fyi/api/runs?labels=stable&from=${fromDate}&to=${toDate}&max-count=500`;
        let runs = await (await fetch(url)).json();
        if (runs.length === 0) {
            // no more runs
            break;
        }
        allRuns.push(...runs);
        toDate = runs[runs.length - 1].time_start;
    }
    return allRuns;
}

async function findAlignedRuns() {
    const productRuns = await Promise.all(PRODUCTS.map(async product => {
        return product;
    }));
    let toDate = new Date().toISOString();
    const runsUrl = `https://wpt.fyi/api/runs?labels=stable&products=${PRODUCTS.join(',')}&aligned&max-count=50`;
    const runs = await (await fetch(runsUrl)).json();
    return runs;
}

async function main() {
    const runs = await getAllRuns();
    for (const product of PRODUCTS) {
        for (const run of runs) {
            if (run.browser_name !== product) {
                continue;
            }
            console.log(run.browser_name, run.browser_version, run.time_start);
        }
    }
}

main();

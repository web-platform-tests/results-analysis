'use strict';

const lib = {
  report: require('./lib/report.js'),
  runs: require('./lib/runs.js'),
};

async function main() {
  const runs = await lib.runs.getAll();

  for (const run of runs) {
    const labels = new Set(run.labels);
    if (!labels.has('master') && !labels.has('pr_base') && !labels.has('pr_head')) {
      console.log(JSON.stringify(run));
    }
  }
}

main();

'use strict';

const lib = require('./lib');

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

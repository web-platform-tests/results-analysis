// For https://github.com/web-platform-tests/wpt.fyi/issues/1175

'use strict';

const lib = require('./lib');

async function main() {
  for await (const run of lib.runs.getIterator()) {
    const labels = new Set(run.labels);
    if (!labels.has('master') && !labels.has('pr_base') && !labels.has('pr_head')) {
      console.log(JSON.stringify(run));
    }
  }
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});

'use strict';

const crypto = require('crypto');
const fs = require('fs');

function hashReport(reportFile) {
  const report = JSON.parse(fs.readFileSync(reportFile, 'UTF-8'));

  for (const test of report.results) {
    // The keys that can appear for this object or on subtest object are:
    // ["duration", "expected", "message", "name", "status", "subtests", "test"]
    // Filter out:
    //  - "duration" which is different for every run
    //  - "expected" which will always be "PASS" or "OK" for wpt.fyi runs
    //  - "test" which is the test name, and would be represented elsewhere
    const json = JSON.stringify(test, ["message", "name", "status", "subtests"]);

    // https://medium.com/@chris_72272/what-is-the-fastest-node-js-hashing-algorithm-c15c1a0e164e
    const hash = crypto.createHash('sha1').update(json).digest('base64');
    console.log(`${test.test}\t${json.length}\t${hash}`);
  }
}

hashReport(process.argv[2]);

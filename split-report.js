'use strict';

const fs = require('fs');
const path = require('path');
const shell = require('shelljs');

function splitReport(reportFile, outDir) {
  const report = JSON.parse(fs.readFileSync(reportFile, 'UTF-8'));

  const createdDirs = new Set;

  for (const test of report.results) {
    // The keys that can appear for this object or on subtest object are:
    // ["duration", "expected", "message", "name", "status", "subtests", "test"]
    // Filter out:
    //  - "duration" which is different for every run
    //  - "expected" which will always be "PASS" or "OK" for wpt.fyi runs
    //  - "test" which is the test name, and would be represented elsewhere
    const json = JSON.stringify(test, ["message", "name", "status", "subtests"]);

    const resultsFile = `${outDir}/${test.test}/results.json`;
    const resultsDir = path.dirname(resultsFile);

    console.log(`Writing ${resultsFile}`);
    shell.mkdir('-p', resultsDir);
    fs.writeFileSync(resultsFile, json, 'UTF-8');
  }
}

function main() {
  const reportFile = process.argv[2];
  const outDir = process.argv[3];
  splitReport(reportFile, outDir);
}

main();
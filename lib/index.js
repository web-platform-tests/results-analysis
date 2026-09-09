'use strict';

const browserSpecific = require('./browser-specific');
const featureLevelInterop = require('./feature-level-interop');
const interopCsv = require('./interop-csv');
const resultTrees = require('./result-trees');
const results = require('./results');
const runs = require('./runs');

module.exports = {
  browserSpecific, featureLevelInterop, interopCsv, resultTrees, results, runs,
};

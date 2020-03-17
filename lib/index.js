'use strict';

const browserSpecific = require('./browser-specific');
const metrics = require('./metrics');
const report = require('./report');
const results = require('./results');
const runs = require('./runs');

module.exports = { browserSpecific, metrics, report, results, runs };

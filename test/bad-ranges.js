'use strict';

const assert = require('chai').assert;
const moment = require('moment');

const {advanceDateToSkipBadDataIfNecessary} = require('../bad-ranges');

describe('bad-ranges.js', () => {
  it('should advance date at beginning of bad range', () => {
    const date = moment('2019-06-27');
    const adjusted = advanceDateToSkipBadDataIfNecessary(date);
    assert.equal(adjusted.format('YYYY-MM-DD'), '2019-08-22');
  });

  it('should advance date in middle of bad range', () => {
    const date = moment('2019-07-15');
    const adjusted = advanceDateToSkipBadDataIfNecessary(date);
    assert.equal(adjusted.format('YYYY-MM-DD'), '2019-08-22');
  });

  it('should NOT advance date at end of bad range', () => {
    const date = moment('2019-08-22');
    const adjusted = advanceDateToSkipBadDataIfNecessary(date);
    assert.equal(date, adjusted);
  });

  it('should NOT advance date outside of a bad range', () => {
    const date = moment('2022-01-01');
    const adjusted = advanceDateToSkipBadDataIfNecessary(date);
    assert.equal(date, adjusted);
  });
});

'use strict';

/**
 * A helper script to generate a set of SHAs for aligned runs over time.
 *
 * The goal is to generate a comparable, representative set of SHAs that can be
 * used to compare results from browsers over time.
 */

const fetch = require('node-fetch');
const flags = require('flags');
const fs = require('fs');
const moment = require('moment');

flags.defineString('from', '2017-08-19', 'Starting date for SHAs');
flags.defineString('to', moment().format('YYYY-MM-DD'), 'Ending date for SHAs');
flags.defineString('output', null, 'Output file to write SHAs to. Defaults to {stable, experimental}-shas.txt');
flags.defineStringList('products', ['chrome', 'safari', 'firefox'], 'Products that must align in the returned SHAs');
flags.defineBoolean('experimental', false, 'Fetch SHAs for experimental runs rather than stable');
flags.parse();

const SHAS_API = 'https://wpt.fyi/api/shas?aligned=true';

async function readShasFromFile(output) {
  let shas = new Map();

  // Check whether the file exists; on failure just return the empty map.
  try {
    await fs.promises.access(output);
  } catch (error) {
    return shas;
  }

  // Otherwise, read the file and then attempt to parse it as a list of
  // [date,sha] pairs, newline separated.
  let data = await fs.promises.readFile(output, 'utf-8');
  let lines = data.split('\n');
  for (const line of lines) {
    if (!line)
      continue;
    const parts = line.split(',');
    shas.set(parts[0], parts[1]);
  }

  console.log(`Reusing ${shas.size} SHAs from ${output}`);
  return shas;
}

async function main() {
  const experimental = flags.get('experimental');

  let output = flags.get('output');
  if (!output)
    output = experimental ? 'experimental-shas.txt' : 'stable-shas.txt';

  let shas = await readShasFromFile(output);

  let labels = '&labels=master,';
  labels += experimental ? 'experimental' : 'stable';

  let products = '';
  for (const product of flags.get('products')) {
    products += `&product=${product}`;
  }
  const shasUrl = `${SHAS_API}${labels}${products}`;
  console.log(`Base URL: ${shasUrl}`);

  let from = moment(flags.get('from'));
  let to = moment(flags.get('to'));
  console.log(`Fetching SHAs from ${from.format('YYYY-MM-DD')} to ${to.format('YYYY-MM-DD')}`);

  // TODO(smcgruer): This loop is surprisingly slow even when all the SHAs are
  // cached. I suspect both formatting and incrementing dates may be quite slow.
  let cachedCount = 0;
  let before = moment();
  while (from < to) {
    const formatted_from = from.format('YYYY-MM-DDT[00:00:00Z]');
    const formatted_to = from.format('YYYY-MM-DDT[23:59:59Z]');

    // Walk the date forward here so later code can bail without having to check
    // whether they have updated it.
    from.add(1, 'days');

    // Check whether our cache already has this date.
    if (shas.has(formatted_from)) {
      cachedCount++;
      continue;
    }

    // Fetch the list of SHAs from the server.
    const url = `${shasUrl}&from=${formatted_from}&to=${formatted_to}`;
    let response = await fetch(url);
    let json = await response.json();

    // Many days do not have an aligned run.
    if (json.length == 0) {
      continue;
    }

    // Otherwise, pick a random SHA for the day.
    shas.set(formatted_from, json[Math.floor(Math.random() * json.length)]);
  }
  let after = moment();
  console.log(`Fetched ${shas.size} SHAs in ${after - before} ms (${cachedCount} cached)`);

  // Sort the SHAs for writing to the file, otherwise the cached entries will be
  // before earlier (in date) entries.
  shas = new Map([...shas].sort((a, b) => {
    // Keys should never be equal.
    return a[0] < b[0] ? '-1' : '1';
  }));

  console.log(`Writing SHAs to ${output}`);
  let data = '';
  shas.forEach((value, key) => {
    data += key + ',' + value + '\n';
  });
  await fs.promises.writeFile(output, data, 'utf-8');
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});

'use strict';

async function calculateSummaryScores(stable) {
  const label = stable ? 'stable' : 'experimental';
  const url = `data/compat2021/summary-${label}.csv`;
  const csvResp = await fetch(url);
  if (!csvResp.ok) {
    throw new Error(`Fetching chart csv data failed: ${csvResp.status}`);
  }
  const csvText = await csvResp.text();
  const csvLines = csvText.split('\n');
  csvLines.shift();  // We don't need the CSV header.
  csvLines.pop();  // Trailing empty line.

  if (csvLines.length != 5) {
    throw new Error(`${url} did not contain 5 results`);
  }

  let summaryScores = [0, 0, 0];
  for (const line of csvLines) {
    let parts = line.split(',');
    if (parts.length != 4) {
      throw new Error(`${url} had an invalid line`);
    }

    parts.shift();
    for (let i = 0; i < parts.length; i++) {
      let contribution = Math.round(parseFloat(parts[i]) * 20);
      summaryScores[i] += contribution;
    }
  }

  return summaryScores;
}

async function renderChart(feature, stable) {
  const div = document.getElementById("failures-chart");
  const label = stable ? 'stable' : 'experimental';
  const url = `data/compat2021/${feature}-${label}.csv`;

  const csvResp = await fetch(url);
  if (!csvResp.ok) {
    throw new Error(`Fetching chart csv data failed: ${csvResp.status}`);
  }
  const csvText = await csvResp.text();
  const csvLines = csvText.split('\n');
  csvLines.shift();  // We don't need the header line.
  csvLines.pop();  // Trailing empty line

  // Now convert the CSV into a datatable for use by Google Charts.
  const dataTable = new google.visualization.DataTable();
  dataTable.addColumn('date', 'Date')
  dataTable.addColumn('number', 'Chrome/Edge')
  dataTable.addColumn('number', 'Firefox')
  dataTable.addColumn('number', 'Safari')

  csvLines.forEach(line => {
    // We control the CSV data source, so are quite lazy with parsing it.

    // The cells are:
    //   sha, date, [product-version, product-score,]+
    //
    // We only need the date and product scores to produce the graph, so drop
    // the other cells.
    let cells = line.split(',');

    // Drop the sha.
    cells = cells.slice(1);

    // Drop the version cells.
    cells = cells.filter((c, i) => (i % 2) == 0);

    // The first cell is a date. Javascript Date objects use 0-indexed months,
    // whilst the CSV is 1-indexed, so adjust for that.
    const dateParts = cells[0].split('-').map(x => parseInt(x));
    cells[0] = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);

    // The rest of the cells are floats.
    for (let i = 1; i < cells.length; i++) {
      cells[i] = parseFloat(cells[i]);
    }
    dataTable.addRow(cells);
  });

  const options = {
    width: 800,
    height: 350,
    chartArea: {
      height: '80%',
    },
    hAxis: {
      title: "Date",
      format: "MMM-YYYY",
    },
    vAxis: {
      title: "Percentage of passing tests",
      format: "percent",
      viewWindow: {
        max: 1,
      }
    },
    explorer: {
      actions: ['dragToZoom', 'rightClickToReset'],
      axis: 'horizontal',
      keepInBounds: true,
      maxZoomIn: 4.0,
    },
    colors: ['#4285f4', '#ea4335', '#fbbc04'],
  };

  const chart = new google.visualization.LineChart(div);
  chart.draw(dataTable, options);
}

async function loadTestList(feature, stable) {
  const label = stable ? 'stable' : 'experimental';

  // TODO: Lazy-load the metadata, update the table in-place once it loads, and
  // cache it after load for each category.
  const productToMetadata = new Map();
  for (const product of ['chrome', 'firefox', 'safari']) {
    const resp = await fetch(`https://wpt.fyi/api/metadata?product=${product}`);
    if (!resp.ok) {
      // TODO: Should be a non-fatal error.
      throw new Error(`Fetching metadata failed: ${resp.status}`);
    }
    const metadata = await resp.json();
    productToMetadata.set(product, metadata);
  }

  const testResultsListResp = await fetch(`data/compat2021/${feature}-${label}-full-results.csv`);
  if (!testResultsListResp.ok) {
    throw new Error(`Fetching full test results failed: ${testResultsListResp.status}`);
  }
  const testResultsListText = await testResultsListResp.text();
  const testResultsList = testResultsListText.split('\n');
  testResultsList.shift();  // Header row
  testResultsList.pop();  // Trailing empty line

  const newBody = document.createElement('tbody');
  for (const testAndResults of testResultsList) {
    const parts = testAndResults.split(',');
    const test = parts[0];

    const row = newBody.insertRow();
    const testnameCell = row.insertCell();
    const link = document.createElement('a');
    link.href = `https://wpt.fyi/results/${test}`;
    link.innerText = test;
    testnameCell.appendChild(link);

    makeResultsCell(row, test, parts[1], productToMetadata.get('chrome'));
    makeResultsCell(row, test, parts[2], productToMetadata.get('firefox'));
    makeResultsCell(row, test, parts[3], productToMetadata.get('safari'));
  }

  const table = document.getElementById('testsTable');
  const oldBody = table.querySelector('tbody');
  table.replaceChild(newBody, oldBody);
}

function makeResultsCell(row, test, results, metadata) {
  const cell = row.insertCell();
  // TODO: It would be nice to color-code the cell based on the pass rate (e.g.
  // similar to wpt.fyi).
  cell.innerText = results;

  if (test in metadata) {
    // TODO: Display a nice bug icon rather than a "T".
    // TODO: Actually link to the url found in metadata[test].
    cell.innerText += " (T)";
  }
  return cell;
}

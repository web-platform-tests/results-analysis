'use strict';

async function renderFailuresChart(stable) {
  const label = stable ? 'stable' : 'experimental';
  drawBSFChart(document.getElementById("failures-chart"),
               `data/compat2021/css-flexbox-${label}.csv`);
}

async function loadTestList(stable) {
  const label = stable ? 'stable' : 'experimental';

  // TODO: Lazy-load the metadata, update the table in-place once it loads, and
  // cache it after load for each category.
  const productToMetadata = new Map();
  for (const product of ['chrome', 'firefox', 'safari']) {
    const resp = await fetch(`https://wpt.fyi/api/metadata?product=${product}`);
    const metadata = await resp.json();
    productToMetadata.set(product, metadata);
  }

  const testResultsListData = await fetch(`data/compat2021/css-flexbox-${label}-full-results.csv`);
  const testResultsListText = await testResultsListData.text();
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


async function drawBSFChart(div, url) {
  const csvData = await fetch(url);
  const csvText = await csvData.text();
  const csvLines = csvText.split('\n');
  csvLines.pop();  // Trailing empty line

  const data = csvLines.map((line, rowIdx) => {
    // We know the data is good, so being lazy with the parsing.

    // The columns are:
    //   sha, date, [product-version, product-score,]+
    //
    // We only need the date and product scores to produce the graph, so drop
    // the other columns.
    let columns = line.split(',');

    // Drop the sha.
    columns = columns.slice(1);

    // Drop the version columns.
    columns = columns.filter((c, i) => (i % 2) == 0);

    if (rowIdx == 0)
      return columns;

    const dateParts = columns[0].split('-').map(x => parseInt(x));
    // Javascript Date objects take 0-indexed months, whilst the CSV is 1-indexed.
    columns[0] = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    for (let i = 1; i < columns.length; i++) {
      columns[i] = parseFloat(columns[i]);
    }
    return columns;
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
  chart.draw(google.visualization.arrayToDataTable(data), options);
}

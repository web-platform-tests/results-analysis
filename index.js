'use strict';

async function renderStableChart() {
  drawBSFChart(document.getElementById("bsf-stable"),
      "data/stable-browser-specific-failures.csv");
}

async function renderExperimentalChart() {
  drawBSFChart(document.getElementById("bsf-experimental"),
      "data/experimental-browser-specific-failures.csv");
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
      title: "Tests that fail in exactly 1 browser",
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

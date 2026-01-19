const { getFiles, readFile, writeTextFile, makeDirectory } = require('./files.js');
const { rasterize } = require('./graphic.js');
const colors = require('./colors.json');

async function renderChart(languages, colors, categoryTextColor = '#555', valueTextColor = '#333', tag = 'light') {
  const imagesDir = './dist/images/';
  await makeDirectory(imagesDir);

  const list = [];
  let count = 0;

  for (const language in languages) {
    list.push([language, languages[language], colors[language].color || '#888888']);
    count++;
  }

  list.sort(function (a, b) {
    return b[1] - a[1];
  });

  const max = list[0][1];
  let expSum = 0;

  for (let i = count - 1; i >= 0; i--) {
    const ratio = list[i][1] / max;
    const exp = Math.exp(ratio);
    expSum += exp;
    list.splice(i, 1, [list[i][0], exp, list[i][2]]);
  }

  for (let i = count - 1; i >= 0; i--) {
    list.splice(i, 1, [list[i][0], list[i][1] / expSum, list[i][2]]);
  }

  // Dimensions & Configuration
  const width = 512;
  // Dynamic height based on number of items prevents squishing if list is long
  const rowHeight = 20;
  const margin = { top: 20, right: 50, bottom: 20, left: 100 }; // Increased left margin for labels
  const height = rowHeight * count + margin.top + margin.bottom;

  const chartWidth = width - margin.left - margin.right;
  const barGap = 8;
  // In horizontal, the thickness of the bar is the 'height' of the rect
  const barThickness = rowHeight - barGap;

  let svgContent = '';

  // Max probability for scaling (so top item fills the width)
  const maxProb = list[0][1];

  list.forEach((item, index) => {
    const [name, probability, color] = item;

    // Scale width relative to the chart area
    // The "distance" run by the bar
    const barLength = (probability / maxProb) * chartWidth;

    // Y Position: Moves down the page for each item (The "Lane")
    const y = margin.top + index * rowHeight;

    // X Position: Always starts from the left margin (The "Starting Line")
    const x = margin.left;

    // Create Rectangle (The Race Car/Bar)
    svgContent += `<rect x="${x}" y="${y}" width="${barLength}" height="${barThickness}" fill="${color}" rx="${barThickness / 2}" />`;

    // Add Label Text (The Driver Name) - Aligned to the LEFT of the bar
    // text-anchor="end" makes the text end at the x coordinate
    svgContent += `<text x="${x - 10}" y="${y + barThickness / 2 + 5}" text-anchor="end" fill="${categoryTextColor}" font-size="12" font-family="sans-serif" font-weight="bold">${name}</text>`;

    // Add Percentage Text (The Score) - Aligned to the RIGHT of the bar
    const percent = (probability * 100).toFixed(1) + '%';
    // Position it slightly after the end of the bar
    svgContent += `<text x="${x + barLength + 8}" y="${y + barThickness / 2 + 5}" text-anchor="start" fill="${valueTextColor}" font-size="12" font-family="sans-serif">${percent}</text>`;
  });

  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${svgContent}</svg>`;

  for (const scale of [3, 6, 12, 15]) {
    const fileName = `language_statistics:${tag}@${scale}x`;
    const outputFilePath = `${imagesDir}${fileName}.png`;
    await rasterize(svgText, outputFilePath, width * scale, height * scale, 2);
  }
}

async function main() {
  const files = await getFiles('./language_statistics', 'json');
  const languages = {};
  for (const file of files) {
    const fileContent = await readFile(file.path.full);
    const json = JSON.parse(fileContent);
    for (const language in json.languages) {
      if (!languages.hasOwnProperty(language)) {
        languages[language] = 0;
      }
      languages[language] += json.languages[language];
    }
  }
  await writeTextFile('./dist/language_statistics.json', JSON.stringify(languages, null, 2));

  await renderChart(languages, colors, '#555555', '#333333', 'light');
  await renderChart(languages, colors, '#c8c8c8', '#ffffff', 'dark');
  process.exit(0);
}

main();

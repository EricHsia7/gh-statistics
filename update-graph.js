const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const { makeDirectory } = require('./files.js');
const { segmentsToPath, simplifyPath, rasterize, processStrokeSamples } = require('./graphic.js');

const GITHUB_USERNAME = process.env.GITHUB_ACTOR;
// const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function getContributionData() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto(`https://github.com/users/${GITHUB_USERNAME}/contributions`);

  // Evaluate scripts on the document
  const result = await page.evaluate(() => {
    var list = [];
    const elements = document.querySelectorAll('td.ContributionCalendar-day');

    for (const element of elements) {
      const id = element.id;
      const date = new Date(String(element.getAttribute('data-date'))).getTime();
      const tooltip = document.querySelector(`tool-tip[for="${id}"]`);
      const textContent = tooltip ? tooltip.textContent : '';
      const numberMatch = textContent.match(/^(\d+)/);
      const number = numberMatch ? parseInt(numberMatch[1], 10) : 0;

      list.push({ id, number, date });
    }
    list = list.sort(function (a, b) {
      return a.date - b.date;
    });
    return {
      update_time: new Date().toISOString(),
      data: list
    };
  });

  // Save the result as JSON files
  const statsDir = './dist/statistics_logs/';
  await makeDirectory(statsDir);

  const dateString = new Date().toISOString().split('T')[0];
  fs.writeFileSync(path.join(statsDir, `${dateString}.json`), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(statsDir, 'latest.json'), JSON.stringify(result, null, 2));

  await browser.close();
  return result;
}

function smoothArray(array) {
  const length = array.length;
  const result = [];
  for (let i = 1; i < length; i += 3) {
    const curr = array[i];
    const prev = array[i - 1] || curr;
    const next = array[i + 1] || curr;
    result.push((prev + curr + next) / 3);
  }
  return result;
}

async function renderGraph(data) {
  const imagesDir = './dist/images/';
  await makeDirectory(imagesDir);

  const width = 720;
  const height = 200;

  const translatedData = data.map((g) => {
    return g.number + 5;
  });

  const smoothedData = smoothArray(smoothArray(translatedData));

  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  for (const dataPoint of smoothedData) {
    if (dataPoint > max) {
      max = dataPoint;
    }
    if (dataPoint < min) {
      min = dataPoint;
    }
    count++;
  }

  const verticalRange = max - min + 5;
  const horizontalRange = count - 1;
  const samples = [];
  let previousValue = smoothedData[0];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const x = (i / horizontalRange) * width;
    const y = (1 - smoothedData[i] / verticalRange) * height;
    samples.push([x, y, 0.5 + Math.random() * 0.5, t]);
    t += 4 + (Math.abs(smoothedData[i] - previousValue) / verticalRange) * 30;
  }

  const strokeData = processStrokeSamples(
    samples,
    {
      lastX: samples[0][0],
      lastY: samples[0][1],
      lastTime: samples[0][3],
      lastDyDxSign: 1,
      side: 1
    },
    {
      BASE_R: 2,
      minDt: 1,
      minMove: 1,
      MIN_R: 0.1,
      MAX_R: 4
    }
  );

  const strokeWidth = 2;
  const strokeFill = '#56ab5a';
  const padding = 1;
  const linearGradient = `<linearGradient id="lingrad" gradientUnits="userSpaceOnUse" x1="${width / 2}" y1="0" x2="${width / 2}" y2="${height}"><stop offset="0%" stop-color="rgba(86, 171, 90, 0.3)" /><stop offset="73%" stop-color="rgba(86, 171, 90, 0.09)" /><stop offset="100%" stop-color="rgba(86, 171, 90, 0)" /></linearGradient>`;
  const backgroundPathData = [`M0,${height + 10}`].concat(segmentsToPath(strokeData.points, 'L', 'L')).concat([`L${width},${height + 10}`, `L${0},${height + 10}`, 'Z']);
  const background = `<path d="${backgroundPathData.join(' ')}" fill="url(#lingrad)"/>`;
  const leftPathData = segmentsToPath(strokeData.pointsLeft, 'M', 'L');
  const centerPathData = segmentsToPath(strokeData.points, 'M', 'L');
  const rightPathData = segmentsToPath(strokeData.pointsRight, 'M', 'L');

  const stroke = `<path d="${leftPathData.join(' ')}" stroke="${strokeFill}" stroke-width="${strokeWidth}" fill="none"/><path d="${centerPathData.join(' ')}" stroke="${strokeFill}" stroke-width="${strokeWidth}" fill="none"/><path d="${rightPathData.join(' ')}" stroke="${strokeFill}" stroke-width="${strokeWidth}" fill="none"/>`;
  const svgText = `<svg stroke-miterlimit="10" style="fill-rule: nonzero; clip-rule: evenodd; stroke-linecap: round; stroke-linejoin: round" version="1.1" viewBox="0 0 ${width + padding * 2} ${height + padding * 2}" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>${linearGradient}</defs><g width="${width}" height="${height}" transform="translate(${padding} ${padding})">${background}${stroke}</g></svg>`;

  for (const scale of [3, 6, 12, 15]) {
    const fileName = `contribution_graph@${scale}x`;
    const outputFilePath = `${imagesDir}${fileName}.png`;
    await rasterize(svgText, outputFilePath, width * scale, height * scale, 2);
  }
}

async function main() {
  const contributionData = await getContributionData();
  await renderGraph(contributionData.data);
  process.exit(0);
}

main();

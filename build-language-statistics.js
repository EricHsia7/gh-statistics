const { getFiles, readFile, writeTextFile, makeDirectory } = require('./files.js');
const { rasterize } = require('./graphic.js');
const colors = require('./colors.json');
const { sha256 } = require('./hash.js');

function hexToRGBA(string) {
  const len = string.length;
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  switch (len) {
    case 4:
      // #fff
      red = parseInt(string[1] + string[1], 16) / 255;
      green = parseInt(string[2] + string[2], 16) / 255;
      blue = parseInt(string[3] + string[3], 16) / 255;
      alpha = 1;
      break;
    case 7:
      // #ffffff
      red = parseInt(string.slice(1, 3), 16) / 255;
      green = parseInt(string.slice(3, 5), 16) / 255;
      blue = parseInt(string.slice(5, 7), 16) / 255;
      alpha = 1;
      break;
    case 9:
      // #ffffffff
      red = parseInt(string.slice(1, 3), 16) / 255;
      green = parseInt(string.slice(3, 5), 16) / 255;
      blue = parseInt(string.slice(5, 7), 16) / 255;
      alpha = parseInt(string.slice(7, 9), 16) / 255;
      break;
    default:
      return undefined;
      break;
  }
  return [red, green, blue, alpha];
}

/**
 *
 * @param {red} r 0 <= r <= 1
 * @param {green} g 0 <= g <= 1
 * @param {blue} b 0 <= b <= 1
 */
function rgbToOKLCH(r, g, b) {
  function linearlizeRGB(c) {
    if (c <= 0.04045) {
      return c / 12.92;
    } else {
      return Math.pow((c + 0.055) / 1.055, 2.4);
    }
  }

  const linearlizedR = linearlizeRGB(r);
  const linearlizedG = linearlizeRGB(g);
  const linearlizedB = linearlizeRGB(b);

  const L = 0.4122214708 * linearlizedR + 0.5363325363 * linearlizedG + 0.0514459929 * linearlizedB;
  const M = 0.2119034982 * linearlizedR + 0.6806995451 * linearlizedG + 0.1073969566 * linearlizedB;
  const S = 0.0883024619 * linearlizedR + 0.2817188376 * linearlizedG + 0.6299787005 * linearlizedB;

  const L1 = Math.cbrt(L);
  const M1 = Math.cbrt(M);
  const S1 = Math.cbrt(S);

  const L_ab = 0.2104542553 * L1 + 0.793617785 * M1 - 0.0040720468 * S1;
  const A = 1.9779984951 * L1 - 2.428592205 * M1 + 0.4505937099 * S1;
  const B = 0.0259040371 * L1 + 0.7827717662 * M1 - 0.808675766 * S1;

  const C = Math.hypot(A, B);
  const H = (Math.atan2(B, A) * (180 / Math.PI)) % 360;

  return [L_ab, C, H];
}

function OKLCHToRGB(l, c, h) {
  function applyGammaTransformation(x) {
    if (x <= 0.00313080495356) {
      return x * 12.92;
    } else {
      return Math.exp(Math.log(x) / 2.4) * 1.055 - 0.055;
    }
  }

  const H = h * (Math.PI / 180);
  const A = c * Math.cos(H);
  const B = c * Math.sin(H);

  const L1 = 0.99999999845052 * l + 0.396337792173768 * A + 0.215803758060759 * B;
  const M1 = 1.000000008881761 * l - 0.105561342323656 * A - 0.063854174771706 * B;
  const S1 = 1.000000054672411 * l - 0.089484182094966 * A - 1.291485537864092 * B;

  const L = Math.pow(L1, 3);
  const M = Math.pow(M1, 3);
  const S = Math.pow(S1, 3);

  const linearlizedR = 4.076741661347994 * L - 3.307711590408194 * M + 0.230969928729428 * S;
  const linearlizedG = -1.268438004092176 * L + 2.609757400663372 * M - 0.34131939631022 * S;
  const linearlizedB = -0.004196086541837 * L - 0.703418614459449 * M + 1.707614700930945 * S;

  const r = applyGammaTransformation(linearlizedR);
  const g = applyGammaTransformation(linearlizedG);
  const b = applyGammaTransformation(linearlizedB);

  return [r, g, b];
}

function shimmerPair(accent, { sheen = 0.08, shift = 12, vivid = 0.08, C0 = 0.12, specular = 0.15 } = {}) {
  const [l, c, h] = accent;
  const k = Math.min(1, c / C0);
  const dh = shift * k;
  const dL = sheen * (2 - k);
  return [
    [l + dL * (1 - l), c * (1 - specular), h],
    [l + dL * (1 - l), c * (1 + vivid), (h - dh + 360) % 360]
  ];
}

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
  const width = 400;
  // Dynamic height based on number of items prevents squishing if list is long
  const rowHeight = 16;
  const margin = { top: 10, right: 50, bottom: 10, left: 80 }; // Increased left margin for labels
  const height = rowHeight * count + margin.top + margin.bottom;

  const chartWidth = width - margin.left - margin.right;
  const barGap = 8;
  // In horizontal, the thickness of the bar is the 'height' of the rect
  const barThickness = rowHeight - barGap;
  const fontFamily = "'Noto Sans', sans-serif";

  const definitions = [];
  const elements = [];

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
    const linearGradientID = `linear-gradient-${sha256(name)}`;
    const [r, g, b, a] = hexToRGBA(color);
    const [color1, color2] = shimmerPair(rgbToOKLCH(r, g, b));
    const colorStop1 = OKLCHToRGB(...color1);
    const colorStop2 = OKLCHToRGB(...color2);

    definitions.push(`<linearGradient id="${linearGradientID}" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="rgb(${colorStop1.join(',')})"/><stop offset="100%" stop-color="rgb(${colorStop2.join(',')})"/></linearGradient>`);
    elements.push(`<rect x="${x}" y="${y}" width="${barLength}" height="${barThickness}" fill="url(#${linearGradientID})" rx="${barThickness / 2}" />`);

    // Add Label Text (The Driver Name) - Aligned to the LEFT of the bar
    // text-anchor="end" makes the text end at the x coordinate
    elements.push(`<text x="${x - 10}" y="${y + barThickness / 2 + 3.8}" text-anchor="end" fill="${categoryTextColor}" font-size="12" font-family="${fontFamily}" font-weight="600">${name}</text>`);

    // Add Percentage Text (The Score) - Aligned to the RIGHT of the bar
    const percent = (probability * 100).toFixed(1) + '%';
    // Position it slightly after the end of the bar
    elements.push(`<text x="${x + barLength + 8}" y="${y + barThickness / 2 + 3.8}" text-anchor="start" fill="${valueTextColor}" font-size="12" font-family="${fontFamily}" font-weight="400">${percent}</text>`);
  });

  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${definitions.join('')}</defs>${elements.join('')}</svg>`;

  for (const scale of [3, 6, 12, 15]) {
    const fileName = `language_statistics:${tag}@${scale}x`;
    const outputFilePath = `${imagesDir}${fileName}`;
    await rasterize(svgText, outputFilePath, width * scale, height * scale, 1);
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

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
  // OKLCH -> linear sRGB (your matrices)
  function oklchToLinearRGB(l, c, h) {
    const rad = h * (Math.PI / 180);
    const A = c * Math.cos(rad);
    const B = c * Math.sin(rad);
    const L1 = 0.99999999845052 * l + 0.396337792173768 * A + 0.215803758060759 * B;
    const M1 = 1.000000008881761 * l - 0.105561342323656 * A - 0.063854174771706 * B;
    const S1 = 1.000000054672411 * l - 0.089484182094966 * A - 1.291485537864092 * B;
    const L = L1 ** 3,
      M = M1 ** 3,
      S = S1 ** 3;
    return [4.076741661347994 * L - 3.307711590408194 * M + 0.230969928729428 * S, -1.268438004092176 * L + 2.609757400663372 * M - 0.34131939631022 * S, -0.004196086541837 * L - 0.703418614459449 * M + 1.707614700930945 * S];
  }

  // linear sRGB -> OKLab (for perceptual distance)
  function linearRGBToOKLab([r, g, b]) {
    const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_, 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_, 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_];
  }

  const gamma = (x) => (x <= 0.00313080495356 ? x * 12.92 : Math.exp(Math.log(x) / 2.4) * 1.055 - 0.055);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const inGamut = ([r, g, b]) => {
    const e = 1e-4;
    return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e;
  };
  const clipLinear = (rgb) => rgb.map(clamp01);
  const deltaEOK = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const toOutput = (lin) => lin.map((x) => clamp01(gamma(clamp01(x))));

  // Achromatic extremes
  if (l >= 1) return [1, 1, 1];
  if (l <= 0) return [0, 0, 0];

  // Already displayable
  let rgb = oklchToLinearRGB(l, c, h);
  if (inGamut(rgb)) return toOutput(rgb);

  const JND = 0.02; // just-noticeable difference in OKLab
  const EPS = 1e-4;
  const rad = h * (Math.PI / 180);
  const labOf = (chroma) => [l, chroma * Math.cos(rad), chroma * Math.sin(rad)];

  // If clipping the full-chroma color is already imperceptible, just clip
  let clipped = clipLinear(oklchToLinearRGB(l, c, h));
  if (deltaEOK(linearRGBToOKLab(clipped), labOf(c)) < JND) {
    return toOutput(clipped);
  }

  // Otherwise binary-search chroma, clipping + ΔE-checking each step
  let min = 0,
    max = c,
    minInGamut = true;
  while (max - min > EPS) {
    const chroma = (min + max) / 2;
    const current = oklchToLinearRGB(l, chroma, h);

    if (minInGamut && inGamut(current)) {
      min = chroma;
      continue;
    }

    clipped = clipLinear(current);
    const E = deltaEOK(linearRGBToOKLab(clipped), labOf(chroma));
    if (E < JND) {
      if (JND - E < EPS) return toOutput(clipped);
      minInGamut = false;
      min = chroma;
    } else {
      max = chroma;
    }
  }
  return toOutput(clipped);
}

function hslToRGB(h, s, l) {
  const i = h / 60;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((i % 2) - 1));
  const m = l - c / 2;

  const pattern = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x]
  ][Math.floor(i) % 6];

  const [R, G, B] = pattern;

  return [R + m, G + m, B + m];
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r:
        h = (g - b) / delta + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      case b:
        h = (r - g) / delta + 4;
        break;
    }

    h *= 60;
  }

  return [h, s, l];
}

function interpolateInHSL(rgb1, rgb2, dt = 0.01) {
  const [h1, s1, l1] = rgbToHsl(rgb1[0], rgb1[1], rgb1[2]);
  const [h2, s2, l2] = rgbToHsl(rgb2[0], rgb2[1], rgb2[2]);
  const stops = [];

  let dH = h2 - h1;
  if (dH > 180) dH = 360 - dH;
  if (dH < -180) dH += 360;
  const dh = dH * dt;
  const ds = (s2 - s1) * dt;
  const dl = (l2 - l1) * dt;
  for (let t = 0, h = h1, s = s1, l = l1; t < 1; t += dt, h += dh, s += ds, l += dl) {
    stops.push([t, hslToRGB(h, s, l)]);
  }
  return stops;
}

function stringifyRGB(r, g, b) {
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
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

function computePositions(deg) {
  const rad = (deg * Math.PI) / 180;

  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const len = Math.abs(dx) + Math.abs(dy); // projection onto unit square

  const x1 = 0.5 - (dx * len) / 2;
  const y1 = 0.5 - (dy * len) / 2;
  const x2 = 0.5 + (dx * len) / 2;
  const y2 = 0.5 + (dy * len) / 2;

  return [x1, y1, x2, y2];
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

  const [x1, y1, x2, y2] = computePositions(120);

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

    definitions.push(
      `<linearGradient id="${linearGradientID}" x1="${x1 * 100}%" y1="${y1 * 100}%" x2="${x2 * 100}%" y2="${y2 * 100}%">${interpolateInHSL(colorStop1, colorStop2, 0.01)
        .map((stop) => `<stop offset="${(Math.round(stop[0] * 1e3) / 1e3) * 100}%" stop-color="${stringifyRGB(stop[1][0], stop[1][1], stop[1][2])}"/>`)
        .join('')}</linearGradient>`
    );
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

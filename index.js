const puppeteer = require('puppeteer');
const ghpages = require('gh-pages');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

async function makeDirectory(path) {
  // Check if the path already exists
  try {
    await fs.promises.access(path);
    // If there is no error, it means the path already exists
    console.log('Given directory already exists!');
  } catch (error) {
    // If there is an error, it means the path does not exist
    // Try to create the directory
    try {
      await fs.promises.mkdir(path, { recursive: true });
      // If there is no error, log a success message
      console.log('New directory created successfully!');
    } catch (error) {
      // If there is an error, log it
      console.log(error);
      process.exit(1);
    }
  }
}

function segmentsToPath(segments, scale) {
  if (segments.length < 1) {
    return '';
  }
  var pathCommand = `M${segments[0].x * scale},${segments[0].y * scale}`;
  for (var i = 1; i < segments.length - 1; i++) {
    var c = segments[i];
    var n = segments[i + 1] || c;

    pathCommand += `Q${c.x * scale},${c.y * scale},${(c.x * scale + n.x * scale) / 2},${(c.y * scale + n.y * scale) / 2}`;
  }
  var lastPoint = segments[segments.length - 1];
  pathCommand += `M${lastPoint.x},${lastPoint.y}`;
  return pathCommand;
}

function distanceToSegment(point, start, end) {
  var dx = end.x - start.x;
  var dy = end.y - start.y;
  var d = dx * dx + dy * dy;
  var t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / d;

  if (t < 0) {
    dx = point.x - start.x;
    dy = point.y - start.y;
  } else if (t > 1) {
    dx = point.x - end.x;
    dy = point.y - end.y;
  } else {
    var closestPoint = { x: start.x + t * dx, y: start.y + t * dy };
    dx = point.x - closestPoint.x;
    dy = point.y - closestPoint.y;
  }

  return Math.sqrt(dx * dx + dy * dy);
}

function simplifyPath(points, tolerance) {
  if (points.length < 3) {
    return points;
  }

  var dmax = 0;
  var index = 0;

  // Find the point with the maximum distance
  for (var i = 1; i < points.length - 1; i++) {
    var d = distanceToSegment(points[i], points[0], points[points.length - 1]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  // If max distance is greater than tolerance, split the curve
  if (dmax > tolerance) {
    var leftPoints = points.slice(0, index + 1);
    var rightPoints = points.slice(index);
    var simplifiedLeft = simplifyPath(leftPoints, tolerance);
    var simplifiedRight = simplifyPath(rightPoints, tolerance);
    return simplifiedLeft.slice(0, simplifiedLeft.length - 1).concat(simplifiedRight);
  } else {
    return [points[0], points[points.length - 1]];
  }
}

function pathCommandToCoordinates(str, precision) {
  var points = [];
  var regex = /((m|M)\s{0,1}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)|(l|L)\s{0,1}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)|(h|H)\s{0,1}([0-9\.\-]*)|(v|V)\s{0,1}([0-9\.\-]*)|(c|C)\s{0,1}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)[\,\s]{1,2}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)[\,\s]{1,2}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)|(s|S)\s{0,1}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)[\,\s]{1,2}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)|(q|Q)\s{0,1}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)[\,\s]{1,2}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)|(t|T)\s{0,1}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)|(Z|z))/gm;
  var m = regex.exec(str);
  while ((m = regex.exec(str)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex) {
      regex.lastIndex++;
    }
    // The result can be accessed through the `m`-variable.
    m.forEach((match, groupIndex) => {
      if (match === 'M') {
        var x = parseFloat(m[groupIndex + 1]);
        var y = parseFloat(m[groupIndex + 3]);
        points.push({ x, y });
      }
      if (match === 'L') {
        var x = parseFloat(m[groupIndex + 1]);
        var y = parseFloat(m[groupIndex + 3]);
        var p = points[points.length - 1] || { x: null, y: null };
        var pX = p.x;
        var pY = p.y;
        if (pX === null || pY === null) {
          points.push({ x, y });
        } else {
          var distance = Math.sqrt(Math.pow(x - pX, 2) + Math.pow(y - pY, 2));
          for (var h = 0; h < distance / precision; h++) {
            var a = pX + (x - pX) * (h / (distance / precision));
            var b = pY + (y - pY) * (h / (distance / precision));
            points.push({ x: a, y: b });
          }
        }
      }
      if (match === 'H') {
        var x = m[groupIndex + 1];
        var y = 0;
        var p = points[points.length - 1] || { x: null, y: null };
        var pX = p.x;
        var pY = p.y;
        if (pX === null || pY === null) {
          points.push({ x, y });
        } else {
          var distance = Math.abs(x - pX);
          for (var h = 0; h < distance / precision; h++) {
            var a = pX + (x - pX) * (h / (distance / precision));
            points.push({ x: a, y: pY });
          }
        }
      }
      if (match === 'V') {
        var x = 0;
        var y = m[groupIndex + 1];
        var p = points[points.length - 1] || { x: null, y: null };
        var pX = p.x;
        var pY = p.y;
        if (pX === null || pY === null) {
          points.push({ x, y });
        } else {
          var distance = Math.abs(y - pY);
          for (var h = 0; h < distance / precision; h++) {
            var a = pY + (y - pY) * (h / (distance / precision));
            points.push({ x: pX, y: a });
          }
        }
      }
      if (match === 'C') {
        var x1 = m[groupIndex + 1];
        var y1 = m[groupIndex + 3];
        var x2 = m[groupIndex + 4];
        var y2 = m[groupIndex + 6];
        var x = m[groupIndex + 7];
        var y = m[groupIndex + 9];
        var p = points[points.length - 1] || { x: null, y: null };
        var pX = p.x;
        var pY = p.y;
        if (pX === null || pY === null) {
          points.push({ x, y });
        } else {
          var distance = Math.sqrt(Math.pow(x - pX, 2) + Math.pow(y - pY, 2));
          for (var h = 0; h < distance / precision; h++) {
            var t = Math.min(Math.max(h / (distance / precision), 0), 1);
            var a = Math.pow(1 - t, 3) * pX + 3 * Math.pow(1 - t, 2) * t * x1 + 3 * (1 - t) * Math.pow(t, 2) * x2 + Math.pow(t, 3) * x;
            var b = Math.pow(1 - t, 3) * pY + 3 * Math.pow(1 - t, 2) * t * y1 + 3 * (1 - t) * Math.pow(t, 2) * y2 + Math.pow(t, 3) * y;

            points.push({ x: a, y: b });
          }
        }
      }
      if (match === 'S') {
        var x2 = m[groupIndex + 1];
        var y2 = m[groupIndex + 3];
        var x = m[groupIndex + 4];
        var y = m[groupIndex + 6];
        var p = points[points.length - 1] || { x: null, y: null };
        var pX = p.x;
        var pY = p.y;

        if (pX === null || pY === null) {
          points.push({ x, y });
        } else {
          var distance = Math.sqrt(Math.pow(x - pX, 2) + Math.pow(y - pY, 2));
          for (var h = 0; h < distance / precision; h++) {
            var t = Math.min(Math.max(h / (distance / precision), 0), 1);
            var a = Math.pow(1 - t, 3) * pX + 3 * Math.pow(1 - t, 2) * t * (2 * pX - x2) + 3 * (1 - t) * Math.pow(t, 2) * x2 + Math.pow(t, 3) * x;
            var b = Math.pow(1 - t, 3) * pY + 3 * Math.pow(1 - t, 2) * t * (2 * pY - y2) + 3 * (1 - t) * Math.pow(t, 2) * y2 + Math.pow(t, 3) * y;
            points.push({ x: a, y: b });
          }
        }
      }
      if (match === 'Q') {
        var x1 = parseFloat(m[groupIndex + 1]);
        var y1 = parseFloat(m[groupIndex + 3]);
        var x = parseFloat(m[groupIndex + 4]);
        var y = parseFloat(m[groupIndex + 6]);
        var p = points[points.length - 1] || { x: null, y: null };
        var pX = p.x;
        var pY = p.y;
        if (pX === null || pY === null) {
          points.push({ x, y });
        } else {
          var distance = Math.sqrt(Math.pow(x - pX, 2) + Math.pow(y - pY, 2));
          for (var h = 0; h < distance / precision; h++) {
            var t = Math.min(Math.max(h / (distance / precision), 0), 1);
            var a = Math.pow(1 - t, 2) * pX + 2 * (1 - t) * t * x1 + Math.pow(t, 2) * x;
            var b = Math.pow(1 - t, 2) * pY + 2 * (1 - t) * t * y1 + Math.pow(t, 2) * y;
            points.push({ x: a, y: b });
          }
        }
      }
      if (match === 'T') {
        var x = m[groupIndex + 1];
        var y = m[groupIndex + 3];
      }
      if (!(match === undefined)) {
        // console.log(`Found match, group ${groupIndex}: ${match}`);
      }
    });
  }
  return points;
}

async function getContributionData() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const username = 'your-github-username'; // Replace with the actual GitHub username
  await page.goto(`https://github.com/users/${username}/contributions`);

  // Evaluate scripts on the document
  const result = await page.evaluate(() => {
    const list = [];
    const elements = document.querySelectorAll('td.ContributionCalendar-day');

    for (const element of elements) {
      const id = element.id;
      const date = element.getAttribute('data-date');
      const tooltip = document.querySelector(`tool-tip[for="${id}"]`);
      const textContent = tooltip ? tooltip.textContent : '';
      const numberMatch = textContent.match(/^(\d+)/);
      const number = numberMatch ? parseInt(numberMatch[1], 10) : 0;

      list.push({ id, number, date });
    }

    return {
      update_time: new Date().toISOString(),
      data: list
    };
  });

  // Save the result as JSON files
  const statsDir = './dist/statistics_logs/';
  var statsDir_instance = await makeDirectory(statsDir);

  const dateString = new Date().toISOString().split('T')[0];
  fs.writeFileSync(path.join(statsDir, `${dateString}.json`), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(statsDir, 'latest.json'), JSON.stringify(result, null, 2));

  await browser.close();
  return result;
}

async function renderGraph(data) {
  const imagesDir = './dist/images/';
  var imagesDir_instance = await makeDirectory(imagesDir);

  const width = 350;
  const height = 200;
  var min = Math.min(...data.map((g) => g.number));
  var max = Math.max(...data.map((g) => g.number));
  var length = data.length;
  var points = [];
  for (var i = 0; i < length; i++) {
    var x = (i / length) * width;
    var y = (1 - data[i].number / (max - min)) * height;
    points.push({ x, y });
  }

  var output_scales = [1, 2, 4];
  for (var s of output_scales) {
    const canvas = createCanvas(width * s, height * s);
    const ctx = canvas.getContext('2d');

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3 * s;
    var path_data = `M${0},${height * s} ${segmentsToPath(simplifyPath(points, 0.8), s)} M${width * s},${height * s}`;
    var path_points = pathCommandToCoordinates(path_data, 1);
    ctx.beginPath();
    path_points.forEach(function (e) {
      ctx.lineTo(e.x, e.y);
    });
    ctx.stroke();

    const fileName = `contribution_graph_${width}x${height}@${s}x`;
    const outputFilePath = `${imagesDir}${fileName}.png`;

    const outputStream = fs.createWriteStream(outputFilePath);
    const pngStream = canvas.createPNGStream();
    pngStream.pipe(outputStream);

    await new Promise((resolve) => {
      outputStream.on('finish', () => {
        resolve();
      });
    });
  }
}
async function main() {
  var contributionData = await getContributionData();
  var graph = await renderGraph(contributionData.data);
  process.exit(0);
}
main();

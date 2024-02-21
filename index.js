const puppeteer = require('puppeteer');
const ghpages = require('gh-pages');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

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
  const statsDir = './statistics_logs';
  if (!fs.existsSync(statsDir)) {
    fs.mkdirSync(statsDir);
  }
  const dateString = new Date().toISOString().split('T')[0];
  fs.writeFileSync(path.join(statsDir, `${dateString}.json`), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(statsDir, 'latest.json'), JSON.stringify(result, null, 2));

  await browser.close();
  return result;
}

async function renderGraph(data) {
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

    ctx.fillStyle = '#000000';
    var path_data = `M${0},${height * s} ${segmentsToPath(simplifyPath(points, 0.8), s)} M${width * s},${height * s}`;
    var p = new Path2D(path_data);
    ctx.fill(p);

    const fileName = `contribution_graph_${width}x${height}@${s}x`;
    const outputFilePath = `./images/${fileName}.png`;

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
  ghpages.publish('./', { add: true, branch: 'release' }, function () {
    process.exit(0);
  });
}
main();

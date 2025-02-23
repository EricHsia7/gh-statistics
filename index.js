const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const username = process.env.GITHUB_ACTOR;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

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
  pathCommand += `M${lastPoint.x * scale},${lastPoint.y * scale}`;
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
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto(`https://github.com/users/${username}/contributions`);

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
  var statsDir_instance = await makeDirectory(statsDir);

  const dateString = new Date().toISOString().split('T')[0];
  fs.writeFileSync(path.join(statsDir, `${dateString}.json`), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(statsDir, 'latest.json'), JSON.stringify(result, null, 2));

  await browser.close();
  return result;
}

function smoothArray(array) {
  var array_length = array.length;
  var result_array = [];
  for (var i = 1; i < array_length; i += 3) {
    var curr = array[i];
    var prev = array[i - 1] || curr;
    var next = array[i + 1] || curr;
    result_array.push((prev + curr + next) / 3);
  }
  return result_array;
}

async function renderGraph(data) {
  const imagesDir = './dist/images/';
  await makeDirectory(imagesDir);

  const width = 360;
  const height = 100;
  const width_crop = 10;
  const height_crop = 0;
  data = data.map((g) => {
    return g.number + 5;
  });
  const processed_data = smoothArray(smoothArray(data));

  const min = Math.min(...processed_data);
  const max = Math.max(...processed_data) + 5;
  const length = processed_data.length;
  let points = [];
  for (let i = 0; i < length; i++) {
    const x = (i / (length - 1)) * width;
    const y = (1 - processed_data[i] / (max - min)) * height;
    points.push({ x, y });
  }

  const output_scales = [3, 6, 12, 15];
  for (const s of output_scales) {
    const canvas = createCanvas((width - width_crop) * s, (height - height_crop) * s);
    const ctx = canvas.getContext('2d');

    ctx.strokeStyle = '#56ab5a';
    const lingrad = ctx.createLinearGradient(width * 0.5 * s, 0, width * 0.5 * s, height * s);
    lingrad.addColorStop(0, 'rgba(86, 171, 90, 0.3)');
    lingrad.addColorStop(0.73, 'rgba(86, 171, 90, 0.09)');
    lingrad.addColorStop(1, 'rgba(86, 171, 90, 0)');
    ctx.fillStyle = lingrad;
    ctx.lineWidth = (8 / 9) * s + 1 / s;
    var path_data = `M${0},${height * s + 10} ${segmentsToPath(simplifyPath(points, 0.8), s)} L${width * s},${height * s + 10} L${0},${height * s + 10}`;
    var path_points = pathCommandToCoordinates(path_data, 1);

    ctx.beginPath();
    for (const d of path_points) {
      ctx.lineTo(d.x, d.y);
    }
    ctx.stroke();
    ctx.fill();
    ctx.closePath();

    const fileName = `contribution_graph@${s}x`;
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

async function makeRequestToGithubAPI(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  const result = await response.json();
  return result;
}

function formatDate(date) {
  return `${[date.getFullYear(), date.getMonth() + 1, date.getDate()].map((e) => String(e).padStart(2, '0')).join('-')} ${[date.getHours(), date.getMinutes(), date.getSeconds()].map((e) => String(e).padStart(2, '0')).join(':')}`;
}

async function getStatsJSON() {
  // const thisyear = new Date().getFullYear()
  const commitsAPI = `https://api.github.com/search/commits?q=author:${username}&per_page=1`; // committer-date:thisyear
  const pullsAPI = `https://api.github.com/search/issues?q=author:${username}&type:pr&per_page=1`;
  const issuesAPI = `https://api.github.com/search/issues?q=author:${username}&type:issue&per_page=1`;

  const commits = await makeRequestToGithubAPI(commitsAPI);
  const pulls = await makeRequestToGithubAPI(pullsAPI);
  const issues = await makeRequestToGithubAPI(issuesAPI);

  const commits_count = commits.total_count;
  const pulls_count = pulls.total_count;
  const issues_count = issues.total_count;

  const now = new Date();
  const updateTime = formatDate(now);

  const json = {
    commit: commits_count,
    pull: pulls_count,
    issues: issues_count,
    update_time: updateTime
  };

  return JSON.stringify(json, null, 2);
}

async function getLanguageColorsData() {
  const url = 'https://raw.githubusercontent.com/ozh/github-colors/master/colors.json';
  const response = await fetch(url);
  const json = response.json();
  return json;
}

async function getOpenGraphImage(url) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto(url);

  // Evaluate scripts on the document
  const result = await page.evaluate(() => {
    const elements = document.querySelectorAll('meta[property="og:image"]');
    let url = '';
    for (const element of elements) {
      const content = element.getAttribute('content');
      if (/https:\/\/repository-images\.githubusercontent\.com\/[0-9]*\/[a-f0-9-]*/im.test(content)) {
        url = content;
        break;
      }
    }
    return {
      url: url
    };
  });
  await browser.close();
  const size = await new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = function () {
        resolve({
          width: parseInt(img.width),
          height: parseInt(img.height)
        });
      };
      img.src = result.url;
    } catch (error) {
      reject(error);
    }
  });
  return {
    url: result.url,
    size: size
  };
}

function getRecentEvents(events) {
  const result = [];
  let quantity = 0;
  for (const event of events) {
    let recentEvent = {};
    const eventType = event.type;
    if (eventType === 'PushEvent') {
      if (!event.hasOwnProperty('payload')) {
        continue;
      }
      if (!event.payload.hasOwnProperty('commits')) {
        continue;
      }
      if (event.payload.commits[0] === undefined) {
        continue;
      }
      if (!event.payload.commits[0].hasOwnProperty('message')) {
        continue;
      }
      recentEvent.title = `Commit - ${event.payload.commits[0].message}`;
      recentEvent.url = `https://github.com/${event.repo.name}/commit/${event.payload.commits[0].sha}`;
      const created_at = new Date(event.created_at);
      recentEvent.time = formatDate(created_at);
      result.push(recentEvent);
      quantity += 1;
    }

    if (eventType === 'PullRequestEvent') {
      if (!event.hasOwnProperty('payload')) {
        continue;
      }
      recentEvent.title = `PR - ${event.payload.pull_request.title} (${event.payload.pull_request.state})`;
      recentEvent.url = event.payload.pull_request.html_url;
      const updated_at = new Date(event.payload.pull_request.updated_at);
      recentEvent.time = formatDate(updated_at);
      result.push(recentEvent);
      quantity += 1;
    }

    if (quantity >= 3) {
      break;
    }
  }

  return result.slice(0, 3);
}

function isActive(pushed_at, events) {
  const oneDayInMilliseconds = 24 * 60 * 60 * 1000;
  const pushed_at_time = new Date(pushed_at).getTime();
  const now = new Date().getTime();
  if (now - pushed_at_time > 30 * oneDayInMilliseconds) {
    // 1 month
    return false;
  }
  if (events.length === 0) {
    return false;
  }

  // Extract time differences for PushEvents
  const timeDifferences = events.filter((event) => event.type === 'PushEvent').map((event) => now - new Date(event.created_at).getTime());

  if (timeDifferences.length === 0) return false;

  // Calculate average
  const average = timeDifferences.reduce((sum, time) => sum + time, 0) / timeDifferences.length;

  // Calculate standard deviation
  const squaredDifferences = timeDifferences.map((time) => Math.pow(time - average, 2));
  const standardDeviation = Math.sqrt(squaredDifferences.reduce((sum, diff) => sum + diff, 0) / timeDifferences.length);

  // Check if within thresholds
  return average <= 10 * oneDayInMilliseconds && standardDeviation <= 7 * oneDayInMilliseconds;
}

async function resolveGitHubAPIContent(property, value) {
  if (String(value).indexOf('https://api.github.com') > -1 && String(property).indexOf('_url') > -1) {
    const json = await makeRequestToGithubAPI(value);
    return json;
  } else {
    if (value === undefined || value === null) {
      return '';
    } else {
      return value;
    }
  }
}

async function getRepositiry(name, languageColorsData) {
  const url = `https://api.github.com/repos/${name}`;
  const repoData = await makeRequestToGithubAPI(url);
  const full_name = repoData.full_name;
  const tags = await resolveGitHubAPIContent('tags_url', repoData.tags_url);
  const description = repoData.description;
  const htmlURL = repoData.html_url;
  const pushed_at = repoData.pushed_at;
  const created_at = repoData.created_at;
  const updated_at = repoData.updated_at;
  const events = await resolveGitHubAPIContent('events_url', repoData.events_url);
  const languages = await resolveGitHubAPIContent('languages_url', repoData.languages_url);
  const openGraphImage = await getOpenGraphImage(htmlURL);
  const active = isActive(pushed_at, events);
  const recentEvents = getRecentEvents(events);

  const languagesWithColor = [];
  for (const key in languages) {
    const value = languages[key];
    languagesWithColor.push({
      lang: key,
      value: value,
      color: languageColorsData[key].color
    });
  }
  languagesWithColor.sort(function (a, b) {
    return b.value - a.value;
  });

  const result = {
    full_name,
    tags,
    description,
    pushed_at,
    created_at,
    updated_at,
    active,
    recent_events: recentEvents,
    open_graph_image: openGraphImage,
    languages: languagesWithColor
  };

  return result;
}

async function getRepositories() {
  const list = ['EricHsia7/bus', 'EricHsia7/pwdgen2'];
  const languageColorsData = await getLanguageColorsData();

  const repos = [];
  for (const name of list) {
    const repo = await getRepositiry(name, languageColorsData);
    repos.push(repo);
  }
  const now = new Date();
  const updateTime = formatDate(now);
  const result = { repos: repos, update_time: updateTime };
  return JSON.stringify(result, null, 2);
}

async function createTextFile(filePath, data, encoding = 'utf-8') {
  try {
    await fs.promises.writeFile(filePath, data, { encoding });
    return `Text file '${filePath}' has been created successfully with ${encoding} encoding!`;
  } catch (err) {
    throw new Error(`Error writing to file: ${err}`);
  }
}

async function main() {
  const contributionData = await getContributionData();
  await renderGraph(contributionData.data);
  const statsJSON = await getStatsJSON();
  await createTextFile('./dist/stats.json', statsJSON);
  const repositoriesJSON = await getRepositories();
  await createTextFile('./dist/repositories.json', repositoriesJSON);
  process.exit(0);
}

main();

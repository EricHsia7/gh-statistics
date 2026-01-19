const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { Jimp } = require('jimp');
const puppeteer = require('puppeteer');
const { makeDirectory } = require('./files.js');
const { segmentsToPath, simplifyPath } = require('./graphic.js');

const GITHUB_USERNAME = process.env.GITHUB_ACTOR;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function downloadImage(url, filepath) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(buffer));

  console.log(`Image saved to ${filepath}`);
}

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
  const array_length = array.length;
  const result_array = [];
  for (let i = 1; i < array_length; i += 3) {
    const curr = array[i];
    const prev = array[i - 1] || curr;
    const next = array[i + 1] || curr;
    result_array.push((prev + curr + next) / 3);
  }
  return result_array;
}

async function rasterize(svgText, outputPath, width, height, scale) {
  const svg = Buffer.from(svgText, 'utf-8');
  const options = {
    fitTo: {
      mode: 'width',
      value: width * scale
    }
  };
  const resvg = new Resvg(svg, options);
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  const resizedImage = await Jimp.fromBuffer(pngBuffer);
  resizedImage.resize({ w: width, h: height });
  await resizedImage.write(outputPath);
}

async function renderGraph(data) {
  const imagesDir = './dist/images/';
  await makeDirectory(imagesDir);

  const width = 360;
  const height = 100;

  data = data.map((g) => {
    return g.number + 5;
  });

  const processedData = smoothArray(smoothArray(data));

  const min = Math.min(...processedData);
  const max = Math.max(...processedData) + 5;
  const length = processedData.length;
  const points = [];
  for (let i = 0; i < length; i++) {
    const x = (i / (length - 1)) * width;
    const y = (1 - processedData[i] / (max - min)) * height;
    points.push({ x, y });
  }
  const linearGradient = `<linearGradient id="lingrad" gradientUnits="userSpaceOnUse" x1="${width / 2}" y1="0" x2="${width / 2}" y2="${height}"><stop offset="0%" stop-color="rgba(86, 171, 90, 0.3)" /><stop offset="73%" stop-color="rgba(86, 171, 90, 0.09)" /><stop offset="100%" stop-color="rgba(86, 171, 90, 0)" /></linearGradient>`;
  const pathData = `M${0},${height + 10} ${segmentsToPath(simplifyPath(points, 0.8), 1)} L${width},${height + 10} L${0},${height + 10}`;
  const path = `<path d="${pathData}" stroke="#56ab5a" stroke-width="${8 / 9}" fill="url(#lingrad)"/>`;
  const svgText = `<svg stroke-miterlimit="10" style="fill-rule: nonzero; clip-rule: evenodd; stroke-linecap: round; stroke-linejoin: round" version="1.1" viewBox="0 0 ${width} ${height}" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>${linearGradient}</defs><g width="${width}" height="${height}" transform="translate(${-5} ${0})">${path}</g></svg>`;

  for (const scale of [3, 6, 12, 15]) {
    const fileName = `contribution_graph@${scale}x`;
    const outputFilePath = `${imagesDir}${fileName}.png`;
    await rasterize(svgText, outputFilePath, width * scale, height * scale, 1);
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
  const commitsAPI = `https://api.github.com/search/commits?q=author:${GITHUB_USERNAME}&per_page=1`; // committer-date:thisyear
  const pullsAPI = `https://api.github.com/search/issues?q=author:${GITHUB_USERNAME}&type:pr&per_page=1`;
  const issuesAPI = `https://api.github.com/search/issues?q=author:${GITHUB_USERNAME}&type:issue&per_page=1`;

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
  const name = `./${btoa(encodeURIComponent(result.url)).replace(/[\/\+\-\=\.\:]*/gim, '')}.png`;
  await downloadImage(result.url, name);
  const dimensions = sizeOf(name);
  return {
    url: result.url,
    size: {
      width: dimensions.width,
      height: dimensions.height
    }
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

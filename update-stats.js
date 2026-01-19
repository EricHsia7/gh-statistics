const fs = require('fs');
const path = require('path');
const { writeTextFile } = require('./files.js');
const { makeRequestToGitHubAPI } = require('./github-api.js');

const GITHUB_USERNAME = process.env.GITHUB_ACTOR;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

function formatDate(date) {
  return `${[date.getFullYear(), date.getMonth() + 1, date.getDate()].map((e) => String(e).padStart(2, '0')).join('-')} ${[date.getHours(), date.getMinutes(), date.getSeconds()].map((e) => String(e).padStart(2, '0')).join(':')}`;
}

async function getStatsJSON() {
  const commitsAPI = `https://api.github.com/search/commits?q=author:${GITHUB_USERNAME}&per_page=1`;
  const pullsAPI = `https://api.github.com/search/issues?q=author:${GITHUB_USERNAME}&type:pr&per_page=1`;
  const issuesAPI = `https://api.github.com/search/issues?q=author:${GITHUB_USERNAME}&type:issue&per_page=1`;

  const commits = await makeRequestToGitHubAPI(commitsAPI, GITHUB_TOKEN);
  const pulls = await makeRequestToGitHubAPI(pullsAPI, GITHUB_TOKEN);
  const issues = await makeRequestToGitHubAPI(issuesAPI, GITHUB_TOKEN);

  const commits_count = commits.total_count;
  const pulls_count = pulls.total_count;
  const issues_count = issues.total_count;

  const now = new Date();
  const updateTime = formatDate(now);

  const result = {
    commit: commits_count,
    pull: pulls_count,
    issues: issues_count,
    update_time: updateTime
  };

  return JSON.stringify(result, null, 2);
}

async function main() {
  const statsJSON = await getStatsJSON();
  await writeTextFile('./dist/stats.json', statsJSON);
  process.exit(0);
}

main();

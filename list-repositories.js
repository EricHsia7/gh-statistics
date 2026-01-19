const fs = require('fs');
const path = require('path');
const { makeDirectory, writeTextFile, readFile } = require('./files.js');
const { makeRequestToGitHubAPI } = require('./github-api.js');

const GITHUB_USERNAME = process.env.GITHUB_ACTOR;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TODAY = process.env.TODAY;

async function listRepositories() {
  async function getPage(page) {
    const url = `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100&page=${page}`;
    const data = await makeRequestToGitHubAPI(url, GITHUB_TOKEN);
    if (data.length > 0) {
      const nextPageData = await getPage(page + 1);
      return data.concat(nextPageData);
    } else {
      return data;
    }
  }
  const result = await getPage(1);
  return result;
}

async function main() {
  const outputDir = './repositories-list';
  const outputDirCreation = await makeDirectory(outputDir);
  let useCache = false;
  if (outputDirCreation === 0) {
    useCache = false;
  } else if (outputDirCreation === 1) {
    const date = await readFile(`${outputDir}/date.txt`);
    const time = new Date(date).getTime();
    if (new Date().getTime() - time < 60 * 60 * 24 * 1000 * 7) {
      useCache = true;
    } else {
      useCache = false;
    }
  }

  if (useCache) {
    console.log('Using cached repositories list.');
  } else {
    const list = await listRepositories();
    const result = { repositories: list };
    await writeTextFile(`${outputDir}/index.json`, JSON.stringify(result));
    await writeTextFile(`${outputDir}/date.txt`, TODAY);
    console.log('Successfully updated repositories list.');
  }

  process.exit(0);
}

main();

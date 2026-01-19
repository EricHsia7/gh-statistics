const { writeTextFile, readFile, makeDirectory } = require('./files.js');
const { makeRequestToGitHubAPI } = require('./github-api.js');
const cachedRepositoriesList = require('./repositories-list/index.json');
const sha256 = require('sha256');

const GITHUB_USERNAME = process.env.GITHUB_ACTOR;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const LIST_REPOSITORIES_TOKEN = process.env.LIST_REPOSITORIES_TOKEN;

const now = new Date().getTime();

function sha256N(content, n) {
  let result = content;
  if (n < 1) {
    n = 1;
  }
  for (let i = 0; i < n; i++) {
    result = sha256(result);
  }
  return result;
}

async function getLanguageStatistics() {
  const limit = 16;
  const hashList = [];
  const updateList = [];
  let index = 0;
  for (const repository of cachedRepositoriesList.repositories) {
    const hash = sha256N(`${repository.id}${repository.full_name}`, (repository.id % 3) + 2);
    const filePath = `./language_statistics/repo_${hash}.json`;
    hashList.push(hash);
    const fileContent = await readFile(filePath);
    if (fileContent !== false && typeof fileContent === 'string') {
      const json = JSON.parse(fileContent);
      if (now - json.last_retrieval > 60 * 60 * 24 * 7 * 1000) {
        updateList.push([index, json.last_retrieval]);
      } else {
        updateList.push([index, json.last_retrieval * 1000]);
      }
    } else {
      updateList.push([index, -Infinity]);
    }
    index++;
  }
  updateList.sort(function (a, b) {
    return a[1] - b[1];
  });
  const outputDir = './deploy/language_statistics';
  await makeDirectory(outputDir);
  let count = 0;
  for (const item of updateList) {
    if (count < limit) {
      const filePath = `${outputDir}/repo_${hashList[item[0]]}.json`;
      const languages = await makeRequestToGitHubAPI(cachedRepositoriesList.repositories[item[0]].languages_url, LIST_REPOSITORIES_TOKEN);
      const content = {
        languages: languages,
        last_retrieval: now
      };
      await writeTextFile(filePath, JSON.stringify(content, null, 2));
    }
    count++;
  }
}

async function main() {
  await getLanguageStatistics();
  process.exit(0);
}

main();

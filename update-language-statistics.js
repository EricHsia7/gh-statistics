const { writeTextFile, readFile, makeDirectory } = require('./files.js');
const { makeRequestToGitHubAPI } = require('./github-api.js');
const cachedRepositoriesList = require('./repositories-list/index.json');
const sha256 = require('sha256');

const GITHUB_USERNAME = process.env.GITHUB_ACTOR;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
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
  const outputDir = './deploy/language_statistics';
  await makeDirectory(outputDir);
  const limit = 16;
  const hashList = [];
  const filePathList = [];
  const updateList = [];
  let index = 0;
  for (const repository of cachedRepositoriesList.repositories) {
    const hash = sha256N(`${repository.id}${repository.full_name}`, (repository.id % 3) + 2);
    const filePath = `${outputDir}/repo_${hash}.json`;
    hashList.push(hash);
    filePathList.push(filePath);
    const fileContent = await readFile(filePath);
    if (fileContent !== false && typeof fileContent === 'string') {
      const json = JSON.parse(fileContent);
      if (now - json.last_retrieval > 60 * 60 * 24 * 7 * 1000) {
        updateList.push([index, json.last_retrieval]);
      } else {
        updateList.push([index, Infinity]);
      }
    } else {
      updateList.push([index, -Infinity]);
    }
    index++;
  }
  updateList.sort(function (a, b) {
    return a[1] - b[1];
  });

  let count = 0;
  for (const item of updateList) {
    if (count < limit) {
      const filePath = filePathList[item[0]];
      const languages = await makeRequestToGitHubAPI(cachedRepositoriesList.repositories[item[0]].languages_url, GITHUB_TOKEN);
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

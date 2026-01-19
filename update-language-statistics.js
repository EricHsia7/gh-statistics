const { writeTextFile, readFile } = require('./files.js');
const { makeRequestToGitHubAPI } = require('./github-api.js');
const cachedRepositoriesList = require('./repositories-list/index.json');

const GITHUB_USERNAME = process.env.GITHUB_ACTOR;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TODAY = process.env.TODAY;

async function getLanguageStatistics() {
  const outputDir = './deploy/language_statistics'
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
      updateList.push([index, json.last_retrieval]);
    } else {
      updateList.push([index, -Infinity]);
    }
    index++;
  }
  updateList.sort((a, b) => a[1] - b[1]);

  let count = 0;
  for (const repositoryIndex of updateList) {
    if (count < limit) {
      const now = new Date().getTime();
      const filePath = filePathList[repositoryIndex];
      const languages = await makeRequestToGitHubAPI(cachedRepositoriesList.repositories[repositoryIndex].languages_url, GITHUB_TOKEN);
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

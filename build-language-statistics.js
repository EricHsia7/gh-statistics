const { getFiles, readFile, writeTextFile } = require('./files.js');

async function getLanguageColorsData() {
  const url = 'https://raw.githubusercontent.com/ozh/github-colors/master/colors.json';
  const response = await fetch(url);
  const json = response.json();
  return json;
}

async function main() {
  const files = await getFiles('./language_statistics', 'json');
  const languages = {};
  for (const file of files) {
    const fileContent = await readFile(file.path.full);
    const json = JSON.parse(fileContent);
    for (const language in json) {
      if (!languages.hasOwnProperty(language)) {
        languages[language] = 0;
      }
      languages[language] += json[language];
    }
  }
  await writeTextFile('./dist/language_statistics.json', JSON.stringify(languages, null, 2));
  process.exit(0);
}

main();

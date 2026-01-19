const { writeTextFile } = require('./files');

async function main() {
  const today = new Date();
  today.setMilliseconds(0);
  today.setSeconds(0);
  today.setMinutes(0);
  today.setHours(0);
  await writeTextFile('./get-time.txt', new Date().toISOString());
  process.exit(0);
}

main();

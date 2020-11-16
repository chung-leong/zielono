const FileRetrieval = require('./file-retrieval');
const { overrideRequire } = FileRetrieval;
const SSRExecution = require('./ssr-execution');
const { generatePage } = SSRExecution;
const ContentOutput = require('./content-output');
const { outputResult, outputError } = ContentOutput;

async function main() {
  overrideRequire({});

  const ssr = require('./index.js');
  const log = [];
  try {
    const { headers, html } = await generatePage(ssr, log, {});
    await outputResult(headers, html);
  } catch (err) {
    await outputError(err, log);
  }
}

main();

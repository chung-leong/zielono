const { overrideRequire } = require('./file-retrieval-git');
const { generatePage } = require('./ssr-execution');

process.once('message', async (msg) => {
  try {
    const gitOptions = {}
    overrideRequire(gitOptions);
    const ssr = require('./index.js');
    const pageOptions = {};
    const result = await generatePage(ssr, pageOptions);
    process.send(result);
  } catch (error) {
    process.send({ error });
  }
});

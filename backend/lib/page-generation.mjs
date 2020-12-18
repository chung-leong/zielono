import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import fetch from 'cross-fetch';
import { getAgent } from './http-agents.mjs';
import { requireGit, overrideRequire } from './file-retrieval.mjs';

const ssrRootFolder = 'ssr';

async function generatePage(params, repo, options) {
  const { locale } = options;
  // fork Node.js child process
  const scriptPath = fileURLToPath(import.meta.url);
  const env = { ...process.env, LC_ALL: locale };
  const child = fork(scriptPath, [ 'fork' ], { env });
  // impose time limit
  const timeout = setTimeout(() => child.kill(), 5000);
  // listen for initial message from child
  const messageInit = new Promise((resolve, reject) => {
    child.on('message', (msg) => {
      resolve(msg);
    });
  });
  const response = await messageInit;
  // send parameters
  child.send({ params, repo, options });
  // listen for final message from child
  const messageFinal = new Promise((resolve, reject) => {
    child.on('message', (msg) => {
      resolve(msg);
    });
  });
  const exit = new Promise((resolve, reject) => {
    child.once('exit', () => {
      reject(new Error(child.killed ? 'Timeout' : 'Premature exit'))
    });
  });
  // wait for result
  const result = await Promise.race([ messageFinal, exit ]);
  clearTimeout(timeout);
  child.disconnect();
  if (result.error) {
    const error = new Error;
    Object.assign(error, result.error);
    throw error;
  }
  return result;
}

/**
 * Run HTML rendering code stored in a git repo
 *
 * @param  {object} params
 * @param  {object} repo
 * @param  {object} options
 *
 * @return {object}
 */
async function runRemoteCode(params, repo, options) {
  const { token, ref } = options;
  overrideRequire(repo, { token, ref });
  const ssr = requireGit(`./${ssrRootFolder}/index.js`);
  const sources = [];
  // create fetch()
  global.fetch = (url, options) => {
    fetch(url, options);
  };
  const html = await ssr.render(params);
  // prevent eval from being used afterward
  delete global.eval;
  delete global.fetch;
  return { html, sources };
}

if (process.argv[2] === 'fork') {
  process.once('message', async (msg) => {
    try {
      const { params, repo, options } = msg;
      const result = await runRemoteCode(params, repo, options);
      process.send(result);
    } catch (err) {
      process.send({
        error: { message: err.message, stack: err.stack }
      });
    }
  });
  process.send({ status: 'ready' });
}

export {
  generatePage,
  ssrRootFolder,
};

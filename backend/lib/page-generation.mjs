import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import fetch from 'cross-fetch';
import { getAgent } from './http-agents.mjs';
import { requireGit, overrideRequire } from './file-retrieval.mjs';

async function generatePage(pageParams, gitParams, locale) {
  // fork Node.js child process, running as "nobody"
  const scriptPath = fileURLToPath(import.meta.url);
  const env = { ...process.env, LC_ALL: locale };
  const uid = 65534, gid = 65534;
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
  child.send({ page: pageParams, git: gitParams });
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
 * @param  {object} pageParams
 * @param  {object} gitParams
 *
 * @return {object}
 */
async function runRemoteCode(pageParams, gitParams) {
  overrideRequire(gitParams);
  const ssr = requireGit('./ssr/index.js');
  const sources = [];
  // create fetch()
  global.fetch = (url, options) => {
    fetch(url, options);
  };
  const html = await ssr.render(pageParams);
  // prevent eval from being used afterward
  delete global.eval;
  delete global.fetch;
  return { html, sources };
}

if (process.argv[2] === 'fork') {
  process.once('message', async (msg) => {
    try {
      const { page, git } = msg;
      const result = await runRemoteCode(page, git);
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
};

import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import fetch from 'cross-fetch';
import { getAgent } from './http-agents.mjs';
import { requireGit, overrideRequire } from './file-retrieval.mjs';

async function generatePage(params, timeLimit) {
  // fork Node.js child process, running as "nobody"
  const scriptPath = fileURLToPath(import.meta.url);
  const env = {}, uid = 65534, gid = 65534;
  const child = fork(scriptPath, [ 'fork' ], { });
  // impose time limit
  const timeout = setTimeout(() => child.kill(), timeLimit);
  // listen for initial message from child
  const messageInit = new Promise((resolve, reject) => {
    child.on('message', (msg) => {
      resolve(msg);
    });
  });
  const response = await messageInit;
  // send parameters
  child.send(params);
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
    throw new Error(result.error.message);
  }
  return result;
}

/**
 * Run HTML rendering code stored in a git repo
 *
 * @param  {object} options
 *
 * @return {object}
 */
async function runRemoteCode(options) {
  overrideRequire(options);
  const ssr = requireGit('./backend/test/assets/hello.js');

  // TODO: run the code
  const sources = [];
  const html = `<html>${ssr.hello('Sam')}</html>`;

  // prevent eval from being used afterward
  delete global.eval;
  return { html, sources };
}

if (process.argv[2] === 'fork') {
  process.once('message', async (msg) => {
    try {
      const result = await runRemoteCode(msg);
      process.send(result);
    } catch (err) {
      console.error(err);
      process.send({ err: err.message });
    }
  });
  process.send({ status: 'ready' });
}

export {
  generatePage,
};

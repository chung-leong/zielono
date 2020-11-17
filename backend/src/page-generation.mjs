import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';

async function runSubprocess(params, timeLimit) {
  // fork Node.js child process, running as "nobody"
  const folder = dirname(fileURLToPath(import.meta.url));
  const scriptPath = `${folder}/page-generation/main.js`;
  const env = {}, uid = 65534, gid = 65534;
  const child = fork(scriptPath, [], { });
  // impose time limit
  const timeout = setTimeout(() => child.kill(), timeLimit);
  // listen for message from child
  const message = new Promise((resolve, reject) => {
    child.once('message', (msg) => {
      resolve(msg);
    });
  });
  const exit = new Promise((resolve, reject) => {
    child.once('exit', () => {
      reject(new Error(child.killed ? 'Timeout' : 'Premature exit'))
    });
  });
  // send parameters
  child.send(params);
  // wait for result
  const result = await Promise.race([ message, exit ]);
  clearTimeout(timeout);
  child.disconnect();
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result;
}

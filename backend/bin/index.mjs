#!/usr/bin/env node

import isEqual from 'lodash/isEqual.js';
import { startHTTPServer, stopHTTPServer } from '../lib/request-handling.mjs';
import { setConfigFolder, preloadConfig, watchConfigFolder, unwatchConfigFolder,
  configEventEmitter } from '../lib/config-management.mjs';
import { watchGitRepos, unwatchGitRepos } from '../lib/git-watching.mjs';
import { displayError } from '../lib/error-handling.mjs';

async function runServer() {
  try {
    const cwd = process.cwd();
    setConfigFolder(cwd);
    const { server, sites } = await preloadConfig();
    await startHTTPServer();
    configEventEmitter.on('server-change', async (before, after) => {
      try {
        if (before && after) {
          if (!isEqual(before.listen, after.listen)) {
            await stopHTTPServer();
            await startHTTPServer();
          }
        } else if (!before) {
          await startHTTPServer();
        } else if (!after) {
          await stopHTTPServer();
        }
        displayServerInfo(after);
      } catch (err) {
        displayError(err, 'config-change');
      }
    });
    await watchConfigFolder();
    await watchGitRepos();
    displayServerInfo(server);
    displaySiteInfo(sites);
    process.on('SIGTERM', async () => {
      await Promise.all([
        unwatchConfigFolder(),
        unwatchGitRepos(),
        stopHTTPServer(),
      ]);
      process.exit(0);
    });
  } catch (err) {
    displayError(err, 'startup');
    process.exit(1);
  }
}

function displayServerInfo(server) {
  if (server) {
    let location;
    if (typeof(server.listen[0]) === 'number') {
      const [ port, address = '0.0.0.0' ] = server.listen;
      location = `address ${address} port ${port}`;
    } else if (typeof(server.listen[0]) === 'string') {
      const [ ipc ] = server.listen;
      location = `IPC chanell "${ipc}"`;
    } else if (typeof(server.listen[0]) === 'object') {
      location = JSON.stringify(server.listen[0]);
    }
    console.log(`Serving HTTP on ${location}`);
  } else {
    console.log('Shutting down HTTP service');
  }
}

function displaySiteInfo(sites) {
  const names = sites.map((s) => {
    if (s.domains.length > 0) {
      return `${s.name} (${s.domains[0]})`;
    } else {
      return s.name;
    }
  });
  const count = names.length;
  if (count > 0) {
    console.log(`Site${count !== 1 ? 's' : ''} available:`);
    for (let name of names) {
      console.log(`  - ${name}`);
    }
  } else {
    console.log(`No sites available`);
  }
}

runServer();

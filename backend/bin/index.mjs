#!/usr/bin/env node

import { startHTTPServer, stopHTTPServer } from '../lib/request-handling.mjs';
import { setConfigFolder, getServerConfig, preloadConfig } from '../lib/config-management.mjs';
import { displayError } from '../lib/error-handling.mjs';

async function runServer() {
  try {
    const cwd = process.cwd();
    setConfigFolder(cwd);
    const { server, sites } = await preloadConfig();
    await startHTTPServer();
    process.on('SIGTERM', async () => {
      await stopHTTPServer();
      process.exit(0);
    });
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
  } catch (err) {
    displayError(err, 'start-up');
    process.exit(1);
  }
}

runServer();

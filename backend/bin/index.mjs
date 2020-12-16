#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, resolve, dirname } from 'path';
import { Command as CommandBase } from 'commander';
import isEqual from 'lodash/isEqual.js';
import { startHTTPServer, stopHTTPServer } from '../lib/request-handling.mjs';
import { setConfigFolder, loadConfig, loadSiteConfigs, loadAccessTokens } from '../lib/config-loading.mjs';
import { watchConfigFolder, unwatchConfigFolder, configEventEmitter } from '../lib/config-watching.mjs';
import { watchGitRepos, unwatchGitRepos } from '../lib/git-watching.mjs';
import { displayError } from '../lib/error-handling.mjs';

async function main(argv) {
  const program = new Command;
  const programInfo = getProgramInfo();
  program
    .name(programInfo.name)
    .description(programInfo.description)
    .version(programInfo.version, '-v, --version')
    .action(runServer)
    .command('site')
      .description('managing websites')
      .helpOption(false)
      .command('add')
        .description('add a new website')
        .action(addSite)
      .end()
      .command('list')
        .description('list websites')
        .action(listSites)
      .end()
      .command('log <site-name>')
        .description('show code history')
        .action(showSiteHistory)
      .end()
      .command('remove <site-name>')
        .description('remove a site')
        .action(removeSite)
      .end()
    .end()
    .command('token')
      .description('adding/removing personal access tokens')
      .command('add')
        .description('add or update a personal access token')
        .action(addToken)
      .end()
      .command('remove <url>')
        .description('remove a personal access token')
        .action(removeToken)
      .end()
    .end()
    .command('service')
      .description('using Zielono as a systemd service')
      .command('add')
        .description('add Zielono as a systemd service')
        .action(addService)
      .end()
      .command('remove')
        .description('remove Zielono as a systemd service')
        .action(removeService)
      .end()
    .end()
  .end();

  try {
    setConfigFolder(process.cwd());
    await program.parseAsync(argv);
  } catch (err) {
    displayError(err, 'startup');
    process.exit(1);
  }
}

async function runServer() {
  await startServer();
}

async function startServer() {
  const { server, sites } = await loadConfig();
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
  process.on('SIGTERM', stopServer);
}

async function stopServer() {
  try {
    await Promise.all([
      unwatchConfigFolder(),
      unwatchGitRepos(),
      stopHTTPServer(),
    ]);
    process.exit(0);
  } catch (err) {
    displayError(err);
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

async function addSite() {
  const name = await ask('Site identifier: ', {});
}

async function listSites(cmd) {
  const sites = await loadSiteConfigs();
  const names = sites.map((s) => {
    if (s.domains.length > 0) {
      return `${s.name} (${s.domains[0]})`;
    } else {
      return s.name;
    }
  });
  for (let name of names) {
    console.log(name);
  }
}

async function showSiteHistory() {

}

async function removeSite() {

}

async function addToken() {

}

async function removeToken() {

}

async function addService() {

}

async function removeService() {

}

async function ask(prompt, options) {
  const { required } = options;
  const { createInterface } = await import('readline');
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal : true,
  });
  let answer;
  while (!answer) {
    answer = await new Promise((resolve) => rl.question(prompt, resolve));
  }
  rl.close();
  return answer;
}

function getProgramInfo() {
  const scriptPath = dirname(fileURLToPath(import.meta.url));
  const packagePath = resolve(join(scriptPath, '../package.json'));
  const text = readFileSync(packagePath);
  return JSON.parse(text);
}

class Command extends CommandBase {
  createCommand(name) {
    const cmd = new Command(name);
    cmd.helpOption(false);
    cmd.addHelpCommand(false);
    return cmd;
  }

  end() {
    return this.parent;
  }
}

main(process.argv);

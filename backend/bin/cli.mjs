#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, resolve, dirname } from 'path';
import { Command as CommandBase } from 'commander';
import { createInterface } from 'readline';
import { findBestMatch } from 'string-similarity';
import Colors from 'colors/safe.js'; const { brightBlue } = Colors;
import { setConfigFolder, loadConfig, loadSiteConfigs, loadAccessTokens } from '../lib/config-loading.mjs';
import { findPageVersions } from '../lib/page-linking.mjs';
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
    displayError(err, 'cli');
    process.exit(1);
  }
}

async function runServer() {
  await import('./daemon.mjs');
}

async function addSite() {
  const name = await ask('Site identifier: ', {});
}

async function listSites() {
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

async function showSiteHistory(name) {
  const { server, sites } = await loadConfig();
  const site = getSite(sites, name);
  const versions = await findPageVersions(site, { useRef: true });
  for (let version of versions) {
    const { url, author, email, date, message } = version;
    const dateObj = new Date(date);
    const dateStr = dateObj.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).replace(/,/g, '') + ' ' + dateObj.toLocaleString(undefined, {
      year: 'numeric'
    });
    const tzOffset = dateObj.getTimezoneOffset(), min = Math.abs(tzOffset);
    const tzDiff = (tzOffset >= 0 ? '-' : '+') + Math.floor(min / 60).toLocaleString(undefined, {
      minimumIntegerDigits: 2,
    }) + (min % 60).toLocaleString(undefined, {
      minimumIntegerDigits: 2
    });
    console.log(brightBlue(url));
    console.log(`Author: ${author} <${email}>`);
    console.log(`Date:   ${dateStr} ${tzDiff}`);
    console.log(``);
    const lines = message.split('\n');
    for (let line of lines) {
      console.log(`    ${line}`);
    }
    console.log(``);
  }
}

async function removeSite() {
  const sites = await loadSiteConfigs();
  const site = getSite(sites, name);

}

function getSite(sites, name) {
  let site = sites.find((s) => s.name === name);
  if (!site) {
    site = sites.find((s) => s.domains.includes(name));
  }
  if (!site) {
    let msg = `Unable to find site "${name}"`;
    // look for similar name
    const names = sites.map((s) => s.name);
    let similar;
    if (name.indexOf('.') !== -1) {
      // include domain names
      for (let site of sites) {
        for (let domain of site.domains) {
          names.push(domain);
        }
      }
    }
    const { bestMatch } = findBestMatch(name, names);
    if (bestMatch.rating > 0.5) {
      msg += ` (you mean "${bestMatch.target}", perhaps?)`;
    }
    throw new Error(msg);
  }
  return site;
}

async function addToken() {
  const tokens = await loadAccessTokens();
}

async function removeToken() {
  const tokens = await loadAccessTokens();
}

async function addService() {

}

async function removeService() {

}

async function ask(prompt, options) {
  const { required } = options;
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

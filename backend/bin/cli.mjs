#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, resolve, dirname } from 'path';
import { Command as CommandBase } from 'commander';
import readline from 'readline';
import { findBestMatch } from 'string-similarity';
import Colors from 'colors/safe.js'; const { brightBlue, gray } = Colors;
import { setConfigFolder, loadConfig, loadSiteConfigs, loadAccessTokens } from '../lib/config-loading.mjs';
import { saveServerConfig, saveSiteConfig, saveAccessTokens } from '../lib/config-saving.mjs';
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
      .command('log [<site-id>]')
        .description('show code history')
        .action(showSiteHistory)
      .end()
      .command('remove [<site-id>]')
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
      .command('remove [<url>]')
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
  const sites = await loadSiteConfigs();
  const names = sites.map((s) => s.name);
  const name = await ask('Site identifier: ', {});
  if (!name) {
    return;
  }
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
  const names = sites.map((s) => s.name);
  if (name === undefined) {
    name = await ask('Site identifier', {
      completer: createBasicCompleter(names)
    });
    if(!name) {
      return;
    }
  }
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

async function removeSite(name) {
  const sites = await loadSiteConfigs();
  const names = sites.map((s) => s.name);
  if (name === undefined) {
    name = await ask('Site identifier', {
      completer: createBasicCompleter(names)
    });
    if(!name) {
      return;
    }
  }
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
  const entries = await loadAccessTokens();
  const url = await ask('User or repo URL: ', {});
  if (!url) {
    return;
  }
  const token = await ask('Personal access token: ', { required: true });
  const entry = { url, token };
  const newEntries = entries.slice();
  const index = newEntries.findIndex((e) => e.url === url);
  if (index !==  -1) {
    entries[index] = entry;
  } else {
    entries.push(entry);
  }
  saveAccessTokens(newEntries);
}

async function removeToken(url) {
  const entries = await loadAccessTokens();
  const urls = entries.map((e) => e.url);
  if (url === undefined) {
    url = await ask('User or repo URL: ', {
      completer: createBasicCompleter(urls, 'url')
    });
    if (!url) {
      return;
    }
  }
  const newEntries = entries.slice();
  const index = newEntries.findIndex((e) => e.url === url);
  if (index === -1) {
    throw new Error(`No token associated with "${url}"`);
  }
  newEntries.splice(index, 1);
  saveAccessTokens(newEntries);
}

async function addService() {

}

async function removeService() {

}

function createBasicCompleter(completions) {
  return (line) => {
    const hits = completions.filter((c) => c.startsWith(line));
    return [ hits, line ];
  };
}

async function ask(prompt, options) {
  const { required, completer } = options;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    completer,
  });
  const printPreview = (result) => {
    const [ hits, line ] = result;
    if (hits.length === 0 || rl.line !== line) {
      return;
    }
    const hit = hits[0];
    const preview = hit.substr(line.length);
    process.stdout.write(gray(preview));
    readline.moveCursor(process.stdin, -preview.length, 0);
  };
  const keypressHandler = (c, k) => {
    readline.clearLine(process.stdin, 1);
    if (completer.length === 1) {
      const result = completer(rl.line);
      printPreview(result);
    } else if (completer.length === 2) {
      completer(rl.line, (result) => printPreview(result));
    }
  };
  process.stdin.on('keypress', keypressHandler);
  let answer;
  do {
    answer = await new Promise((resolve) => rl.question(prompt, resolve));
    answer.trim();
  } while (!answer && required);
  rl.close();
  process.stdin.off('keypress', keypressHandler);
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

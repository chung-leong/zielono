#!/usr/bin/env node

import Fs, { existsSync } from 'fs'; const { writeFile, readFile, readdir, readlink } = Fs.promises;
import { fileURLToPath } from 'url';
import { join, resolve, dirname, basename, extname } from 'path';
import { exec } from 'child_process';
import { Command as CommandBase } from 'commander';
import readline from 'readline';
import { findBestMatch } from 'string-similarity';
import Colors from 'colors/safe.js'; const { brightBlue, brightRed, gray } = Colors;
import { setConfigFolder, getConfigFolder, loadConfig, loadSiteConfigs, loadAccessTokens } from '../lib/config-loading.mjs';
import { saveServerConfig, saveSiteConfig, saveAccessTokens, removeSiteConfig } from '../lib/config-saving.mjs';
import { findPageVersions } from '../lib/page-linking.mjs';
import { displayError } from '../lib/error-handling.mjs';

async function main(argv) {
  const program = new Command;
  const programInfo = await getProgramInfo();
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
  const name = await ask('Site identifier: ', {
    validater: (name) => {
      if (names.includes(name)) {
        throw new Error(`Identifier "${name}" is already used by another site`);
      } else if(/[^\w\-\.]/.test(name)) {
        throw new Error(`Identifer should only contain alphanumeric characters, underscore, dash, and period`)
      }
    }
  });
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
    name = await ask('Site identifier: ', {
      completer: createBasicCompleter(names)
    });
    if(!name) {
      return;
    }
  }
  const site = getSite(sites, name);
  await removeSiteConfig(name);
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
  const configFolder = getConfigFolder();
  const systemdFolder = '/etc/systemd/system';
  if (!existsSync(systemdFolder)) {
    throw new Error(`The folder "${systemdFolder}" does not exist`);
  }
  await loadConfig();
  const validater = (name) => {
    const symlinkPath = join(systemdFolder, `zielono.${name}.service`);
    if (existsSync(symlinkPath)) {
      throw new Error(`Identifier "${name}" is already used by another service`);
    } else if(/[^\w\-\.]/.test(name)) {
      throw new Error(`Identifer should only contain alphanumeric characters, underscore, dash, and period`)
    }
  };
  let completer;
  try {
    const nameDefault = basename(configFolder);
    validater(nameDefault);
    completer = createBasicCompleter([ nameDefault ]);
  } catch (err) {
  }
  const name = await ask('Service identifier: ', {
    completer,
    validater,
    prefill: true,
  });
  if (!name) {
    return;
  }
  const serviceName = `zielono.${name}`;
  const unitFileName = `${serviceName}.service`;
  const unitFilePath = join(configFolder, unitFileName);
  const info = await getProgramInfo();
  const nodePath = process.argv[0];
  const scriptPath = dirname(fileURLToPath(import.meta.url));
  const daemonPath = join(scriptPath, 'daemon.mjs');
  const nginxUser = await findNginxUser();
  const q = (path) => /\s/.test(path) ? `"${path}"` : path;
  const lines = [
    `[Unit]`,
    `Description=${info.description} - ${name}`,
    `Documentation=${info.homepage}`,
    `After=network.target`,
    ``,
    `[Service]`,
    `WorkingDirectory=${configFolder}`,
    `Environment=NODE_ENV=production`,
    `Environment=PATH=${process.env.PATH}`,
    `Type=simple`,
    `User=${nginxUser}`,
    `ExecStart=${q(nodePath)} ${q(daemonPath)}`,
    `Restart=on-failure`,
    ``,
    `[Install]`,
    `WantedBy=multi-user.target`
  ];
  await writeFile(unitFilePath, lines.join('\n'));
  const commands = [
    `sudo ln -s ${q(unitFilePath)} ${q(systemdFolder)}`,
    `sudo chgrp -R ${nginxUser} .`,
    `sudo systemctl daemon-reload`
  ];
  await execCommands(commands, { cwd: configFolder });
  console.log(`To enable service:`);
  console.log(``);
  console.log(`    sudo systemctl enable ${serviceName}`);
  console.log(``);
  console.log(`To start service:`);
  console.log(``);
  console.log(`    sudo service ${serviceName} start`);
}

async function removeService() {
  const configFolder = getConfigFolder();
  const systemdFolder = '/etc/systemd/system';
  if (!existsSync(systemdFolder)) {
    throw new Error(`The folder "${systemdFolder}" does not exist`);
  }
  let unitFileName, serviceName;
  const names = await readdir(configFolder);
  for (let name of names) {
    let m;
    if (m = /^(zielono\..*)\.service$/.exec(name)) {
      unitFileName = name;
      serviceName = m[1];
      break;
    }
  }
  if (!unitFileName) {
    throw new Error(`No systemd unit file found in "${configFolder}"`);
  }
  const unitFilePath = join(configFolder, unitFileName);
  const symlinkPath = join(systemdFolder, unitFileName);
  let symlinkTarget;
  try {
    symlinkTarget = await readlink(symlinkPath);
  } catch (err) {
    throw new Error(`Unable to read symlink ${symlinkPath}`);
  }
  if (symlinkTarget !== unitFilePath) {
    throw new Error(`Symlink ${symlinkPath} does not point to ${unitFilePath}`);
  }
  const q = (path) => /\s/.test(path) ? `"${path}"` : path;
  const commands = [
    `sudo service ${serviceName} stop`,
    `sudo rm ${symlinkPath} ${unitFilePath}`,
    `sudo systemctl daemon-reload`
  ];
  await execCommands(commands);
}

function createBasicCompleter(completions) {
  return (line) => {
    const hits = completions.filter((c) => c.startsWith(line));
    return [ hits, line ];
  };
}

async function ask(prompt, options) {
  const { required, completer, validater, prefill } = options;
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
  const keypressHandler = () => {
    if (completer) {
      readline.clearLine(process.stdin, 1);
      if (completer.length === 1) {
        const result = completer(rl.line);
        printPreview(result);
      } else if (completer.length === 2) {
        completer(rl.line, (result) => printPreview(result));
      }
    }
    if (validater) {
      let { line } = rl;
      readline.moveCursor(process.stdin, -line.length, 0);
      try {
        validater(line);
      } catch (err) {
        line = brightRed(rl.line);
      }
      process.stdout.write(line);
    }
  };
  process.stdin.on('keypress', keypressHandler);
  let answer, error;
  do {
    error = undefined;
    answer = await new Promise((resolve) => {
      rl.question(prompt, resolve);
      if (prefill) {
        rl.write(null, { name: 'tab' });
      }
    });
    answer = answer.trim();
    if (validater) {
      try {
        validater(answer);
      } catch (err) {
        error = err;
        answer = undefined;
        console.log(err.message);
      }
    }
  } while (!answer && (required || error));
  rl.close();
  process.stdin.off('keypress', keypressHandler);
  return answer;
}

async function getProgramInfo() {
  const scriptPath = dirname(fileURLToPath(import.meta.url));
  const packagePath = resolve(join(scriptPath, '../package.json'));
  const text = await readFile(packagePath);
  return JSON.parse(text);
}

async function findNginxUser() {
  try {
    const text = await readFile('/etc/nginx/nginx.conf', 'utf-8');
    const m = /^\s*user\s*(.*);/m.exec(text);
    if (m) {
      return m[1];
    }
  } catch (err) {
  }
  return 'www-data';
}

async function execCommands(commands, options) {
  return new Promise((resolve, reject) => {
    exec(commands.join(' && '), options, (err, stdout, stderr) => {
      if (!err || stderr.length === 0) {
        resolve(stdout);
      } else {
        err.stderr = stderr;
        reject(err);
      }
    });
  });
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

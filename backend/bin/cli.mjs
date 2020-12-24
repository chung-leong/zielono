#!/usr/bin/env node

import Fs, { existsSync } from 'fs'; const { writeFile, readFile, readdir, readlink } = Fs.promises;
import { fileURLToPath } from 'url';
import { join, resolve, dirname, basename, extname } from 'path';
import { exec } from 'child_process';
import { Command as CommandBase } from 'commander';
import readline from 'readline';
import { findBestMatch } from 'string-similarity';
import kebabCase from 'lodash/kebabCase.js';
import Colors from 'colors/safe.js'; const { brightBlue, brightRed, brightYellow, gray } = Colors;
import { setConfigFolder, getConfigFolder, loadConfig, loadSiteConfigs, loadAccessTokens } from '../lib/config-loading.mjs';
import { saveServerConfig, saveSiteConfig, saveAccessTokens, removeSiteConfig } from '../lib/config-saving.mjs';
import { findPageVersions } from '../lib/page-linking.mjs';
import { retrieveFromCloud } from '../lib/file-retrieval.mjs';
import { findGitAdapter } from '../lib/git-adapters.mjs';
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
  const folder = getConfigFolder();
  const names = await readdir(folder);
  if (!names.includes('zielono.yaml')) {
    const msg = `Server configuration file not found in ${folder}`;
    if (names.length > 0) {
      throw new Error(msg);
    }
    console.log(msg);
    if (await confirm(`Do you wish to create it?`, { default: false })) {
      await addServer(true);
    } else {
      throw new Error;
    }
  }
  await import('./daemon.mjs');
}

async function addServer() {
  const port = await ask('Server port number: ', {
    completer: createBasicCompleter([ '8080', '8000' ]),
    validater: (text) => {
      if (!/^(\d+)$/.test(text)) {
        throw new Error('Invalid number');
      }
    },
    prefilled: true
  });
  if (!port) {
    return;
  }
  const config = {
    listen: parseInt(port)
  };
  await saveServerConfig(config);
  if (await confirm(`Do you wish to add a site?`, { default: true })) {
    await addSite();
  }
}

async function addSite(cmd) {
  const genericSiteURL = 'https://github.com/chung-leong/zielono-generic-site';
  const instruction = !cmd;
  const sites = await loadSiteConfigs();
  print(instruction,
    `Please provide an identifier for the new site. `
  + `It will be used as the name of the site's config file. `
  + `It will also appear in the site's URL--if no domain name is assigned to it.`
  );
  const names = sites.map((s) => s.name);
  const name = await ask('Site identifier: ', {
    validater: createNameValidater(names, 'site')
  });
  if (!name) {
    return;
  }
  const config = {};
  print(instruction,
    `One or more domain names can be assigned to a site. `
  + `Separate multiple domain names with a space or comma. `
  + `Leave this blank if you wish to add them later.`
  );
  const domains = await ask('Domain names: ', {});
  if (domains) {
    config.domains = domains.split(/,\s*|\s+/);
  }
  print(instruction,
    `Excel files will be used as data sources for the site. `
  + `They can reside on a local drive or in the Cloud.`
  );
  if (await confirm('Do you wish to attach an Excel file to the site?', { default: true })) {
    print(instruction,
      `To use a file on Dropbox or OneDrive, `
    + `make it viewable by the public using the "Share" functionality `
    + `then copy the URL here.`
    );
    const path = await ask('Local path or URL: ', {});
    if (path) {
      const file = {};
      const normalizeName = (name) => {
        const ext = extname(name);
        return kebabCase(name.substr(0, name.length - ext.length));
      };
      let completer;
      if (/^https?:/.test(path)) {
        file.url = path;
        let buffer;
        completer = async (line, callback) => {
          const completions = [];
          if (!buffer) {
            try {
              buffer = await retrieveFromCloud(path, { method: 'HEAD' });
            } catch (err) {
            }
          }
          if (buffer && buffer.filename) {
            completions.push(normalizeName(buffer.filename));
          }
          const hits = completions.filter((c) => c.startsWith(line));
          callback(null, [ hits, line ]);
        };
      } else {
        file.path = path;
        const fileId = normalizeName(basename(path));
        completer = createBasicCompleter([ fileId ]);
      }
      file.name = await ask('File identifier: ', {
        required: true,
        prefilled: true,
        completer,
        validater: createNameValidater([], 'file')
      });
      config.files = [ file ];
    }
  }
  print(instruction,
    `Zielono can render HTML pages using code stored in a Git repository. `
  + `The repository can reside either locally or at GitHub. `
  + `See ${genericSiteURL} for an example of the expected file structure. `
  );
  if (await confirm('Do you wish to attach a Git reposity to the site?', { default: true })) {
    const paths = [];
    for (let site of sites) {
      if (site.page) {
        const { code } = site.page;
        paths.push(code.url || code.path);
      }
    }
    const path = await ask('Path to working folder or URL: ', {
      completer: createBasicCompleter(paths)
    });
    if (path) {
      const code = {};
      const key = /^https?:/.test(path) ? 'url' : 'path';
      code[key] = path;
      config.page = { code };
      const adapter = findGitAdapter(code);
      if (adapter && adapter.name === 'github') {
        print(instruction,
          `You will need to add a GitHub personal access token if the repository is private. `
        + `Accessing GitHub with an access token will also reduce the likihood of being rate-limited. `
        );
      }
    }
  }
  await saveSiteConfig(name, config);
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
    throw new Error(`The folder ${systemdFolder} does not exist`);
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
    prefilled: true,
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
    throw new Error(`The folder ${systemdFolder} does not exist`);
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
    throw new Error(`No systemd unit file found in ${configFolder}`);
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
  const unique = [];
  for (let completion of completions) {
    if (!unique.includes(completion)) {
      unique.push(completion);
    }
  }
  return (line) => {
    const hits = unique.filter((c) => c.startsWith(line));
    return [ hits, line ];
  };
}

function createNameValidater(names, type) {
  return (name) => {
    if (names.includes(name)) {
      throw new Error(`Identifier "${name}" is already used by another ${type}`);
    } else if(/[^\w\-\.]/.test(name)) {
      throw new Error(`Identifer should only contain alphanumeric characters, underscore, dash, and period`);
    }
  };
}

async function ask(prompt, options) {
  const { required, completer, validater, prefilled } = options;
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
        completer(rl.line, (err, result) => printPreview(result));
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
      if (prefilled) {
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

async function confirm(prompt, options) {
  const { default: defValue  } = options;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  if (defValue === true) {
    prompt +=  ' [Y/n] ';
  } else if (defValue === false) {
    prompt +=  ' [y/N] ';
  } else {
    prompt +=  ' [y/n] ';
  }
  let answer;
  do {
    answer = await new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
    answer = answer.trim();
    if (/^(y|yes)$/i.test(answer)) {
      answer = true;
    } else if (/^(n|no)$/i.test(answer)) {
      answer = false;
    } else if (!answer) {
      answer = defValue;
    } else {
      answer = undefined;
    }
  } while (answer === undefined);
  rl.close();
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

function print(show, text) {
  if (!show) {
    return;
  }
  console.log(brightYellow(text));
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

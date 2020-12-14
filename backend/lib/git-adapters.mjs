import { exec } from 'child_process';
import Fs from 'fs'; const { readFile } = Fs.promises;
import { join } from 'path';
import fetch from 'cross-fetch';
import Chokidar from 'chokidar';
import isEqual from 'lodash/isEqual.js';
import { getHash } from './content-storage.mjs';
import { getAgent as agent } from './http-agents.mjs';
import { HttpError } from './error-handling.mjs';
import { getHookSecret } from './request-handling-hook.mjs';
import { findServerConfig } from './config-loading.mjs';

class GitAdapter {
  constructor(name) {
    this.name = name;
  }

  parsePath(path) {
    const folders = path.split('/');
    const filename = folders.pop();
    if (!filename) {
      throw new Error(`Invalid path: ${path}`);
    }
    return { folders, filename };
  }

  isCommitID(string) {
    return string && /^[a-f0-9]{40}$/.test(string);
  }

  canHandle(options) { return false };
  async retrieveFile(path, options) {}
  async retrieveVersions(path, options) {}
  async watchFolder(path, options, callback) {}
  async unwatchFolder(path, options) {}
}

class GitRemoteAdapter extends GitAdapter {
  async retrieveJSON(url, options) {
    const { accessToken, body, method, headers: additionalHeaders } = options;
    const headers = { ...additionalHeaders };
    const timeout = 5000;
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    const fetchOpts = { headers, timeout, agent, method };
    if (body) {
      if (!method) {
        fetchOpts.method = 'POST';
      }
      fetchOpts.body = (typeof(body) === 'string') ? body : JSON.stringify(body);
    }
    const res = await fetch(url, fetchOpts);
    if (res.status >= 200 && res.status <= 299) {
      if (res.status === 204) {
        return null;
      } else {
        const json = await res.json();
        return json;
      }
    } else {
      let message = await res.text();
      try {
        const json = JSON.parse(message);
        if (json && json.message) {
          message = json.message;
        }
      } catch (err) {
      }
      throw new HttpError(res.status, message);
    }
  }

  async processHookMessage(hash, msg) { return false };
}

class GitHubAdapter extends GitRemoteAdapter {
  constructor() {
    super('github');
    this.baseURL = 'https://github.com';
    this.apiURL = 'https://api.github.com';
    this.watches = [];
  }

  canHandle(options) {
    const { url } = options;
    return url && url.startsWith(this.baseURL);
  }

  async retrieveFile(path, options) {
    const { url, accessToken, ref } = options;
    const { owner, repo } = this.parseURL(url);
    const { folders, filename } = this.parsePath(path);
    const apiOpts = { owner, repo, ref, accessToken };
    const blob = await this.findBlob(folders, filename, apiOpts);
    const buffer = Buffer.from(blob.content, blob.encoding);
    buffer.filename = filename;
    buffer.sha = blob.sha;
    return buffer;
  }

  async retrieveVersions(path, options) {
    const { url, accessToken } = options;
    const { owner, repo } = this.parseURL(url);
    const apiOpts = { owner, repo, accessToken };
    const commits = await this.findCommits(path, apiOpts);
    const versions = [];
    for (let { sha, commit } of commits) {
      versions.push({
        sha,
        author: commit.author.name,
        date: commit.author.date,
        message: commit.message,
      });
    }
    return versions;
  }

  async retrieveVersionRefs(path, options) {
    const { url, accessToken } = options;
    const { owner, repo } = this.parseURL(url);
    const apiOpts = { owner, repo, accessToken };
    // retrieve tags and branches
    const tags = await this.findTags(apiOpts);
    const branches = await this.findBranches(apiOpts);
    // retrieve commits affecting the path
    const relevantCommitRefs = {};
    const relevantCommits = await this.findCommits(path, apiOpts);
    const relevantCommitHash = {};
    for (let commit of relevantCommits) {
      relevantCommitHash[commit.sha] = commit;
    }
    // retrieve all commits (the recent ones, anyway)
    const allCommits = await this.findCommits(null, apiOpts);
    const allCommitHash = {};
    for (let commit of allCommits) {
      allCommitHash[commit.sha] = commit;
    }
    // go down all branches and tags and see if they
    for (let ref of [ ...branches, ...tags]) {
      const stack = [], checked = [];
      let sha = ref.commit.sha;
      while (sha) {
        // see if it's one of the relevant commit
        checked.push(sha);
        if (relevantCommitHash[sha]) {
          const folder = tags.includes(ref) ? 'tags' : 'heads';
          let refs = relevantCommitRefs[sha];
          if (!refs) {
            relevantCommitRefs[sha] = refs = [];
          }
          refs.push(`${folder}/${ref.name}`);
          break;
        } else {
          // check parent(s)
          const commit = allCommitHash[sha];
          if (commit) {
            for (let parent of commit.parents) {
              stack.push(parent.sha);
            }
          }
          sha = stack.pop();
          // just in case the server returns weird data
          if (checked.includes(sha)) {
            break;
          }
        }
      }
    }
    return relevantCommitRefs;
  }

  async watchFolder(path, options, callback) {
    const versions = await this.retrieveVersionRefs(path, options);
    let watch = this.watches.find((w) => isEqual(w.options, options));
    if (!watch) {
      const hash = getHash(options.url);
      watch = { hash, options, folders: [] };
      this.watches.push(watch);
      watch.hook = await this.installHook(hash, watch.options);
    }
    watch.folders.push({ path, versions, callback });
  }

  async unwatchFolder(path, options) {
    let watch = this.watches.find((w) => isEqual(w.options, options));
    if (watch) {
      watch.folders = watch.folders.filter((f) => f.path !== path);
      if (watch.folders.length === 0) {
        const index = this.watches.indexOf(watch);
        this.watches.splice(index, 1);
        await this.uninstallHook(watch.hook, watch.options);
      }
    }
  }

  async processHookMessage(hash, msg) {
    for (let watch of this.watches) {
      if (hash === watch.hash) {
        const { created, deleted, commits } = msg;
        for (let folder of folders) {
          let impacted = false;
          if (created || deleted) {
            impacted = true;
          } else if (commits.length >= 20) {
            // we might not be seeing all the changes
            impacted = true;
          } else {
            // see if there's a file in the folder being watched
            for (let { added, removed, modified } of commits) {
              for (let path of [ ...added, ...removed, ...modified ]) {
                if (path.startsWith(`${folder.path}/`)) {
                  impacted = true;
                  break;
                }
              }
            }
          }
          if (impacted) {
            const { path, callback } = folder;
            const versions = await this.retrieveVersionRefs(path, options);
            if (!isEqual(folder.versions, versions)) {
              const before = folder.versions, after = versions;
              folder.versions = versions;
              callback(before, after);
            }
          }
        }
        return true;
      }
    }
    return false;
  };

  async findBlob(folders, filename, options) {
    const folder = await this.findFolder(folders, options);
    const fileNode = folder.tree.find((f) => f.type === 'blob' && f.path === filename);
    if (!fileNode) {
      const filePath = [ ...folders, filename ].join('/');
      throw new HttpError(404, `Cannot find file in repo: ${filePath}`);
    }
    const blob = await this.retrieveJSON(fileNode.url, options);
    return blob;
  }

  async findFolder(folders, options) {
    let folder = await this.findRoot(options);
    for (let [ index, path ] of folders.entries()) {
      const folderNode = folder.tree.find((f) => f.type === 'tree' && f.path === path);
      if (!folderNode) {
        const folderPath = folders.slice(0, index + 1).join('/');
        throw new HttpError(404, `Cannot find folder in repo: ${folderPath}`);
      }
      folder = await this.retrieveJSON(folderNode.url, options);
    }
    return folder;
  }

  async findRoot(options) {
    const commit = await this.findCommit(options);
    const folder = await this.retrieveJSON(commit.tree.url, options);
    return folder;
  }

  async findCommitRef(options) {
    const url = this.getURL('repos/:owner/:repo/git/ref/:ref', options);
    const tag = await this.retrieveJSON(url, options);
    return tag;
  }

  async findCommit(options) {
    let commit;
    if (this.isCommitID(options.ref)) {
      const url = this.getURL('repos/:owner/:repo/git/commits/:ref', options);
      commit = await this.retrieveJSON(url, options);
    } else {
      if (!options.ref) {
        const repo = await this.findRepo(options);
        options.ref = `heads/${repo.default_branch}`;
      }
      const ref = await this.findCommitRef(options);
      commit = await this.retrieveJSON(ref.object.url, options);
    }
    return commit;
  }

  async findCommits(path, options) {
    let url = this.getURL('repos/:owner/:repo/commits', options);
    if (path) {
      url += `?path=${encodeURIComponent(path)}`;
    }
    const commits = await this.retrieveJSON(url, options);
    return commits;
  }

  async findRepo(options) {
    const url = this.getURL('repos/:owner/:repo', options);
    const repo = await this.retrieveJSON(url, options);
    return repo;
  }

  async findBranches(options) {
    const url = this.getURL('repos/:owner/:repo/branches', options);
    const branches = await this.retrieveJSON(url, options);
    return branches;
  }

  async findTags(options) {
    const url = this.getURL('repos/:owner/:repo/tags', options);
    const tags = await this.retrieveJSON(url, options);
    return tags;
  }

  async installHook(hash, options) {
    const baseURL = await getServerBaseURL();
    const hookURL = `${baseURL}/-/hook/${hash}`;
    await this.uninstallOldHooks(hookURL);
    const url = this.getURL('repos/:owner/:repo/hooks', options);
    const config = {
      url: hookURL,
      secret: getHookSecret(),
      insecure_ssl: false,
      content_type: 'json',
    };
    const body = { config };
    const hook = await this.retrieveJSON(url, { ...options, body });
    return hook;
  }

  async uninstallHook(hook, options) {
    const url = this.getURL('repos/:owner/:repo/hooks/:id', { ...options, ...hook });
    const method = 'DELETE';
    await this.retrieveJSON(url, { ...options, method });
  }

  async uninstallOldHooks(hookURL, options) {
    let count = 0;
    const hooks = await this.findHooks(options);
    for (let { id, url } of hooks) {
      if (url === hookURL) {
        await this.uninstallHook({ id }, options);
        count++;
      }
    }
    return count;
  }

  async findHooks(options) {
    const url = this.getURL('repos/:owner/:repo/hooks', options);
    const hooks = await this.retrieveJSON(url, options);
    return hooks;
  }

  parseURL(url) {
    const [ owner, repo ] = url.substr(this.baseURL.length + 1).split('/');
    const re = /^[\w\-]+$/;
    if (!re.test(owner) || !re.test(repo) || !url.startsWith(this.baseURL)) {
      throw new Error(`Invalid GitHub URL: ${url}`);
    }
    return { owner, repo };
  }

  getURL(url, options) {
    const relativeURL = url.replace(/:(\w+)/g, (m0, name) => {
      return options[name];
    });
    return `${this.apiURL}/${relativeURL}`;
  }

  async retrieveJSON(url, options) {
    const headers = { accept: 'application/vnd.github.v3+json' };
    options = { ...options, headers };
    return super.retrieveJSON(url, options);
  }
}

class GitLocalAdapter extends GitAdapter {
  constructor() {
    super('local');
    this.watches = [];
  }

  canHandle(options) {
    const { path } = options;
    return !!path;
  }

  async retrieveFile(path, options) {
    const { filename } = this.parsePath(path);
    const { ref, path: workingFolder } = options;
    let buffer;
    if (!ref) {
      // load file from working folder directly
      const fullPath = join(workingFolder, path);
      buffer = await readFile(fullPath);
    } else {
      const ref2 = ref.replace(/^heads\/origin\//, 'origin/');
      const command = `git show ${ref2}:${path}`;
      buffer = await this.runGit(command, options);
    }
    buffer.filename = filename;
    buffer.sha = getHash(`blob ${buffer.length}\0`, buffer);
    return buffer;
  }

  async retrieveVersions(path, options) {
    const commits = await this.findCommits(path, options);
    const versions = [];
    for (let { sha, author, date, message } of commits) {
      versions.push({ sha, author, date, message });
    }
    return versions;
  }

  async retrieveVersionRefs(path, options) {
    // retrieve tags and branches
    const tags = await this.findTags(options);
    const branches = await this.findBranches(options);
    // retrieve commits affecting the path
    const relevantCommitRefs = {};
    const relevantCommits = await this.findCommits(path, options);
    const relevantCommitHash = {};
    for (let commit of relevantCommits) {
      relevantCommitHash[commit.sha] = commit;
    }
    // retrieve all commits (the recent ones, anyway)
    const allCommits = await this.findCommits(null, options);
    const allCommitHash = {};
    for (let commit of allCommits) {
      allCommitHash[commit.sha] = commit;
    }
    // go down all branches and tags and see if they
    for (let ref of [ ...branches, ...tags]) {
      const stack = [], checked = [];
      let sha = ref.sha;
      while (sha) {
        // see if it's one of the relevant commit
        checked.push(sha);
        if (relevantCommitHash[sha]) {
          const folder = tags.includes(ref) ? 'tags' : 'heads';
          let refs = relevantCommitRefs[sha];
          if (!refs) {
            relevantCommitRefs[sha] = refs = [];
          }
          refs.push(`${folder}/${ref.name}`);
          break;
        } else {
          // check parent(s)
          const commit = allCommitHash[sha];
          if (commit) {
            const parents = commit.parent.split(/\s+/);
            for (let parent of parents) {
              stack.push(parent);
            }
          }
          sha = stack.pop();
          // just in case the server returns weird data
          if (checked.includes(sha)) {
            break;
          }
        }
      }
    }
    return relevantCommitRefs;
  }

  async watchFolder(path, options, callback) {
    const versions = await this.retrieveVersionRefs(path, options);
    let watch = this.watches.find((w) => isEqual(w.options, options));
    if (!watch) {
      const search = join(options.path, '.git', 'refs', '**');
      const watcher = Chokidar.watch(search, { ignoreInitial: true });
      let timeout = 0;
      for (let event of [ 'add', 'unlink', 'change' ]) {
        watcher.on(event, (path) => {
          if (timeout) {
            clearTimeout(timeout);
          }
          timeout = setTimeout(() => this.handleRefChange(path, watch), 100);
        });
      }
      watch = { options, watcher, folders: [] };
      this.watches.push(watch);
      await new Promise((resolve, reject) => {
        watcher.once('ready', resolve);
        watcher.once('error', (msg) => reject(msg));
      });
    }
    watch.folders.push({ path, versions, callback });
  }

  async unwatchFolder(path, options) {
    let watch = this.watches.find((w) => isEqual(w.options, options));
    if (watch) {
      watch.folders = watch.folders.filter((f) => f.path !== path);
      if (watch.folders.length === 0) {
        const index = this.watches.indexOf(watch);
        this.watches.splice(index, 1);
        await watch.watcher.close();
      }
    }
  }

  async handleRefChange(path, watch) {
    const { options, folders } = watch;
    for (let folder of folders) {
      const { path, callback } = folder;
      const versions = await this.retrieveVersionRefs(path, options);
      if (!isEqual(folder.versions, versions)) {
        const before = folder.versions, after = versions;
        folder.versions = versions;
        callback(before, after);
      }
    }
  }

  async findCommits(path, options) {
    const fields = {
      sha: '%H',
      parent: '%P',
      message: '%s',
      author: '%aN',
      date: '%aD',
    };
    const fieldEntries = Object.entries(fields);
    const fieldStrings = fieldEntries.map(([ n, v ]) => `${n}: ${v}`);
    const format = fieldStrings.join('%n') + '%n';
    const command = `git log -100 --pretty=format:'${format}' '${path || '.'}'`;
    const buffer = await this.runGit(command, options);
    const commits = [];
    const sections = buffer.toString().split(/(\r?\n){2}/).map((s) => s.trim());
    for (let section of sections) {
      if (section) {
        const lines = section.split(/\r?\n/);
        const commit = {};
        for (let line of lines) {
          if (line) {
            const index = line.indexOf(':');
            const name = line.substr(0, index);
            const value = line.substr(index + 2);
            commit[name] = value;
          }
        }
        commits.push(commit);
      }
    }
    return commits;
  }

  async findTags(options) {
    const tags = [];
    const command = `git show-ref --tags --dereference`;
    const buffer = await this.runGit(command, options);
    const lines = buffer.toString().split(/\r?\n/);
    for (let line of lines) {
      if (line) {
        const [ sha, ref ] = line.split(' ');
        const name = ref.split('/').slice(2).join('/');
        if (/\^\{\}$/.test(name)) {
          // the previous one is annotated
          tags[tags.length - 1].sha = sha;
        } else {
          tags.push({ name, sha });
        }
      }
    }
    return tags;
  }

  async findBranches(options) {
    const command = `git show-ref --heads`;
    const buffer = await this.runGit(command, options);
    const lines = buffer.toString().split(/\r?\n/);
    const branches = [];
    for (let line of lines) {
      if (line) {
        const [ sha, ref ] = line.split(' ');
        const name = ref.split('/').slice(2).join('/');
        branches.push({ name, sha });
      }
    }
    return branches;
  }

  async runGit(command, options) {
    const { path } = options;
    const buffer = await new Promise((resolve, reject) => {
      const execOpts = {
        cwd: path,
        encoding: 'buffer',
        timeout: 5000,
      };
      exec(command, execOpts, (err, stdout, stderr) => {
        if (!err || stderr.length === 0) {
          resolve(stdout);
        } else {
          err.stderr = stderr;
          reject(err);
        }
      });
    });
    return buffer;
  }
}

const gitAdapters = [];

function findGitAdapter(options) {
  return gitAdapters.find((a) => a.canHandle(options));
}

function addGitAdapter(adapter) {
  if (!(adapter instanceof GitAdapter)) {
    throw new Error('Invalid adapter');
  }
  gitAdapters.unshift(adapter);
  return adapter;
}

function removeGitAdapter(adapter) {
  const index = gitAdapters.indexOf(adapter);
  if (index !== -1) {
    gitAdapters.splice(index, 1);
  }
}

async function processHookMessage(hash, msg) {
  for (let adapter of gitAdapters) {
    if (adapter instanceof GitRemoteAdapter) {
      const handled = await adapter.processHookMessage(hash, msg);
      if (handled) {
        break;
      }
    }
  }
}

function getServerBaseURL() {

}

addGitAdapter(new GitHubAdapter);
addGitAdapter(new GitLocalAdapter);

export {
  findGitAdapter,
  addGitAdapter,
  removeGitAdapter,
  processHookMessage,
  GitAdapter,
  GitRemoteAdapter,
  GitHubAdapter,
  GitLocalAdapter,
};

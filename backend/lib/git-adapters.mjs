import { exec } from 'child_process';
import Fs from 'fs'; const { readFile } = Fs.promises;
import { join, dirname, basename } from 'path';
import fetch from 'cross-fetch';
import Chokidar from 'chokidar';
import isEqual from 'lodash/isEqual.js';
import { getHash } from './content-naming.mjs';
import { getAgent as agent } from './http-agents.mjs';
import { HttpError } from './error-handling.mjs';
import { getHookSecret } from './request-handling-hook.mjs';
import { findServerConfig, findAccessToken } from './config-loading.mjs';

class GitAdapter {
  constructor(name) {
    this.name = name;
  }

  isCommitID(string) {
    return string && /^[a-f0-9]{40}$/.test(string);
  }

  canHandle(repo) { return false };
  async retrieveFile(path, repo, options) {}
  async retrieveVersions(path, repo, options) {}
  async watchFolder(path, repo, options, callback) {}
  async unwatchFolder(path, repo, options) {}
  async getDefaultBranch(repo, options) {}
}

class GitRemoteAdapter extends GitAdapter {
  async retrieveJSON(url, options) {
    const { token, body, method, headers: additionalHeaders } = options;
    const headers = { ...additionalHeaders };
    const timeout = 5000;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
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

  canHandle(repo) {
    const { url } = repo;
    return url && url.startsWith(this.baseURL);
  }

  async retrieveFile(path, repo, options) {
    const { token, ref: refSpec } = options;
    let ref = refSpec;
    if (!ref) {
      ref = await this.getDefaultBranch(repo, { token });
    }
    const blob = await this.getBlob(path, repo, { token, ref });
    const buffer = Buffer.from(blob.content, blob.encoding);
    buffer.filename = basename(path);
    buffer.sha = blob.sha;
    return buffer;
  }

  async retrieveVersions(path, repo, options) {
    const { token } = options;
    const commits = await this.getCommits(path, repo, { token });
    const versions = [];
    for (let { sha, commit } of commits) {
      versions.push({
        sha,
        author: commit.author.name,
        email: commit.author.email,
        date: commit.author.date,
        message: commit.message,
      });
    }
    return versions;
  }

  async retrieveVersionRefs(path, repo, options) {
    const { token } = options;
    // retrieve tags and branches
    const tags = await this.getTags(repo, { token });
    const branches = await this.getBranches(repo, { token });
    // retrieve commits affecting the path
    const relevantCommitRefs = {};
    const relevantCommits = await this.getCommits(path, repo, { token });
    const relevantCommitHash = {};
    for (let commit of relevantCommits) {
      relevantCommitHash[commit.sha] = commit;
    }
    // retrieve all commits (the recent ones, anyway)
    const allCommits = await this.getCommits('', repo, { token });
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

  async watchFolder(path, repo, options, callback) {
    const { token } = options;
    const versions = await this.retrieveVersionRefs(path, repo, { token });
    let watch = this.watches.find((w) => isEqual(w.repo, repo));
    if (!watch) {
      const hash = getHash(repo.url);
      const hook = await this.installHook(hash, repo, { token });
      watch = { hash, repo, hook, folders: [] };
      this.watches.push(watch);
    }
    watch.folders.push({ path, versions, callback });
  }

  async unwatchFolder(path, repo, options) {
    const { token } = options;
    let watch = this.watches.find((w) => isEqual(w.repo, repo));
    if (watch) {
      watch.folders = watch.folders.filter((f) => f.path !== path);
      if (watch.folders.length === 0) {
        const { hook } = watch;
        await this.uninstallHook(hook, repo, { token });
        const index = this.watches.indexOf(watch);
        this.watches.splice(index, 1);
      }
    }
  }

  async processHookMessage(hash, msg) {
    for (let watch of this.watches) {
      if (hash === watch.hash) {
        const { folders, repo } = watch;
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
            const token = findAccessToken(repo.url);
            const versions = await this.retrieveVersionRefs(path, repo, { token });
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

  async getBlob(path, repo, options) {
    const { token, ref } = options;
    const folderPath = dirname(path);
    const filename = basename(path);
    const folder = await this.getFolder(folderPath, repo, { token, ref });
    const fileNode = folder.tree.find((f) => f.type === 'blob' && f.path === filename);
    if (!fileNode) {
      const filePath = [ ...folders, filename ].join('/');
      throw new HttpError(404, `Cannot find file in repo: ${filePath}`);
    }
    const blob = await this.retrieveJSON(fileNode.url, { token });
    return blob;
  }

  async getFolder(folderPath, repo, options) {
    const { token, ref } = options;
    const folderNames = folderPath.split('/');
    let folder = await this.getRoot(repo, { token, ref });
    for (let [ index, name ] of folderNames.entries()) {
      const folderNode = folder.tree.find((f) => f.type === 'tree' && f.path === name);
      if (!folderNode) {
        const folderPath = folderNames.slice(0, index + 1).join('/');
        throw new HttpError(404, `Cannot find folder in repo: ${folderPath}`);
      }
      folder = await this.retrieveJSON(folderNode.url, { token });
    }
    return folder;
  }

  async getRoot(repo, options) {
    const { token, ref } = options;
    let commit;
    if (this.isCommitID(ref)) {
      const url = this.getURL('repos/:owner/:repo/git/commits/:ref', repo, { ref });
      commit = await this.retrieveJSON(url, { token });
    } else {
      const url = this.getURL('repos/:owner/:repo/git/ref/:ref', repo, { ref });
      const tag = await this.retrieveJSON(url, { token });
      commit = await this.retrieveJSON(tag.object.url, { token });
    }
    const folder = await this.retrieveJSON(commit.tree.url, { token });
    return folder;
  }

  async getCommits(path, repo, options) {
    const { token } = options;
    let url = this.getURL('repos/:owner/:repo/commits', repo);
    if (path) {
      url += `?path=${encodeURIComponent(path)}`;
    }
    const commits = await this.retrieveJSON(url, { token });
    return commits;
  }

  async getRepo(repo, options) {
    const { token } = options;
    const url = this.getURL('repos/:owner/:repo', repo);
    const info = await this.retrieveJSON(url, { token });
    return info;
  }

  async getDefaultBranch(repo, options) {
    const { token } = options;
    const info = await this.getRepo(repo, { token });
    return `heads/${info.default_branch}`;
  }

  async getBranches(repo, options) {
    const { token } = options;
    const url = this.getURL('repos/:owner/:repo/branches', repo);
    const branches = await this.retrieveJSON(url, { token });
    return branches;
  }

  async getTags(repo, options) {
    const { token } = options;
    const url = this.getURL('repos/:owner/:repo/tags', repo);
    const tags = await this.retrieveJSON(url, { token });
    return tags;
  }

  async installHook(hash, repo, options) {
    const { token } = options;
    const baseURL = getServerBaseURL();
    const hookURL = join(baseURL, `/-/hook/${hash}`);
    await this.uninstallOldHooks(hookURL, { token });
    const url = this.getURL('repos/:owner/:repo/hooks', repo);
    const config = {
      url: hookURL,
      secret: getHookSecret(),
      insecure_ssl: false,
      content_type: 'json',
    };
    const body = { config };
    const hook = await this.retrieveJSON(url, { token, body });
    return hook;
  }

  async uninstallHook(hook, repo, options) {
    const { token } = options;
    const url = this.getURL('repos/:owner/:repo/hooks/:id', repo, hook);
    const method = 'DELETE';
    await this.retrieveJSON(url, { token, method });
  }

  async uninstallOldHooks(hookURL, repo, options) {
    const { token } = options;
    let count = 0;
    const hooks = await this.getHooks(repo, { token });
    for (let hook of hooks) {
      if (hook.url === hookURL) {
        await this.uninstallHook(hook, repo, { token });
        count++;
      }
    }
    return count;
  }

  async getHooks(repo, options) {
    const { token } = options;
    const url = this.getURL('repos/:owner/:repo/hooks', repo);
    const hooks = await this.retrieveJSON(url, { token });
    return hooks;
  }

  getURL(url, repo, vars) {
    const subpath = repo.url.substr(this.baseURL.length + 1);
    const names = subpath.split('/');
    const context = { owner: names[0], repo: names[1], ...vars };
    const relativeURL = url.replace(/:(\w+)/g, (m0, name) => {
      return context[name];
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

  canHandle(repo) {
    const { path } = repo;
    return !!path;
  }

  async retrieveFile(path, repo, options) {
    const { ref: refSpec } = options;
    let buffer;
    if (!refSpec) {
      // load file from working folder directly
      const fullPath = join(repo.path, path);
      buffer = await readFile(fullPath);
    } else {
      let ref = refSpec;
      if (ref.startsWith('heads/origin/')) {
        ref = ref.substr(6);
      }
      const command = `git show ${ref}:${path}`;
      buffer = await this.runGit(command, options);
    }
    buffer.filename = basename(path);
    buffer.sha = getHash(`blob ${buffer.length}\0`, buffer);
    return buffer;
  }

  async retrieveVersions(path, repo, options) {
    const commits = await this.getCommits(path, repo, {});
    return commits;
  }

  async retrieveVersionRefs(path, repo, options) {
    // retrieve tags and branches
    const tags = await this.getTags(repo, {});
    const branches = await this.getBranches(repo, {});
    // retrieve commits affecting the path
    const relevantCommitRefs = {};
    const relevantCommits = await this.getCommits(path, repo, {});
    const relevantCommitHash = {};
    for (let commit of relevantCommits) {
      relevantCommitHash[commit.sha] = commit;
    }
    // retrieve all commits (the recent ones, anyway)
    const allCommits = await this.getCommits('', repo, {});
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

  async getDefaultBranch(repo, options) {
    const command = `git rev-parse --symbolic-full-name HEAD`;
    const buffer = await this.runGit(command, repo);
    const lines = buffer.toString().split(/\r?\n/);
    let ref = lines[0];
    if (ref.startsWith('refs/')) {
      ref = ref.substr(5);
    }
    if (ref.startsWith('heads/origin/')) {
      ref = ref.substr(6);
    }
    return ref
  }

  async watchFolder(path, repo, options, callback) {
    const versions = await this.retrieveVersionRefs(path, repo, {});
    let watch = this.watches.find((w) => isEqual(w.repo, repo));
    if (!watch) {
      const search = join(repo.path, '.git', 'refs', '**');
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
      watch = { watcher, repo, folders: [] };
      this.watches.push(watch);
      await new Promise((resolve, reject) => {
        watcher.once('ready', resolve);
        watcher.once('error', (msg) => reject(msg));
      });
    }
    watch.folders.push({ path, versions, callback });
  }

  async unwatchFolder(path, repo, options) {
    let watch = this.watches.find((w) => isEqual(w.repo, repo));
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
    const { repo, folders } = watch;
    for (let folder of folders) {
      const { path, callback } = folder;
      const versions = await this.retrieveVersionRefs(path, repo, {});
      if (!isEqual(folder.versions, versions)) {
        const before = folder.versions, after = versions;
        folder.versions = versions;
        callback(before, after);
      }
    }
  }

  async getCommits(path, repo, options) {
    const command = `git log -120 --pretty=raw -z '${path || '.'}'`;
    const buffer = await this.runGit(command, repo);
    const commits = [];
    const sections = buffer.toString().split('\0');
    for (let section of sections) {
      const lines = section.trim().split(/\r?\n/);
      const commit = {};
      let messageLines = null;
      for (let line of lines) {
        if (!messageLines) {
          if (line) {
            const index = line.indexOf(' ');
            const name = line.substr(0, index);
            const value = line.substr(index + 1);
            if (name === 'commit') {
              commit.sha = value;
            } else if (name === 'parent') {
              commit.parent = value;
            } else if (name === 'author') {
              const m = /(.*?) <(.*?)> (\d+)/.exec(value);
              if (m) {
                commit.author = m[1];
                commit.email = m[2];
                const timestamp = parseInt(m[3]);
                const date = new Date(timestamp * 1000);
                commit.date = date.toISOString();
              }
            }
          } else {
            messageLines = [];
          }
        } else {
          messageLines.push(line.trimStart());
        }
      }
      commit.message = messageLines.join('\n');
      commits.push(commit);
    }
    return commits;
  }

  async getTags(repo, options) {
    const tags = [];
    const command = `git show-ref --tags --dereference`;
    const buffer = await this.runGit(command, repo);
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

  async getBranches(repo, options) {
    const command = `git show-ref --heads`;
    const buffer = await this.runGit(command, repo);
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

  async runGit(command, repo) {
    const buffer = await new Promise((resolve, reject) => {
      const execOpts = {
        cwd: repo.path,
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

function findGitAdapter(repo) {
  return gitAdapters.find((a) => a.canHandle(repo));
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
  const server = findServerConfig();
  if (server.ngrok && server.ngrok.url) {
    return server.ngrok.url;
  } else if (server.nginx && server.nginx.url) {
    return server.nginx.url;
  } else {
    // TODO
    return '';
  }
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

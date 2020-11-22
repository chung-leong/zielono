import startsWith from 'lodash/startsWith.js';
import includes from 'lodash/includes.js';
import find from 'lodash/find.js';
import deasync from 'deasync';
import fetch from 'cross-fetch';
import { join } from 'path';
import Module, { createRequire } from 'module';

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

  async retrieveJSON(url, options) {
    const { accessToken } = options;
    const headers = {};
    const fetchOptions = { headers };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    const req = await fetch(url, fetchOptions);
    if (req.status == 200) {
      const json = await req.json();
      return json;
    } else {
      let message = await req.text();
      try {
        const json = JSON.parse(message);
        if (json && json.message) {
          message = json.message;
        }
      } catch (err) {
      }
      throw new Error(message);
    }
  }
}

class GitHubAdapter extends GitAdapter {
  constructor() {
    super('github');
    this.baseURL = 'https://github.com';
    this.apiURL = 'https://api.github.com';
  }

  canHandle(options) {
    const { url } = options;
    return startsWith(url, this.baseURL);
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
    const tags = await this.findTags(apiOpts);
    const branches = await this.findBranches(apiOpts);
    const versions = [];
    for (let { sha, commit } of commits) {
      const version =  {
        sha,
        author: commit.author.name,
        date: commit.author.date,
        message: commit.message,
      };
      const branch = find(branches, { commit: { sha }});
      if (branch) {
        version.branch = branch.name;
      }
      const tag = find(tags, { commit: { sha }});
      if (tag) {
        version.tag = tag.name;
      }
      versions.push(version);
    }
    return versions;
  }

  async findBlob(folders, filename, options) {
    const folder = await this.findFolder(folders, options);
    const fileNode = find(folder.tree, { path: filename, type: 'blob' });
    if (!fileNode) {
      const filePath = [ ...folders, filename ].join('/');
      throw new Error(`Cannot find file in repo: ${filePath}`);
    }
    const blob = await this.retrieveJSON(fileNode.url, options);
    return blob;
  }

  async findFolder(folders, options) {
    let folder = await this.findRoot(options);
    for (let [ index, path ] of folders.entries()) {
      const folderNode = find(folder.tree, { path, type: 'tree' });
      if (!folderNode) {
        const folderPath = folders.slice(0, index + 1).join('/');
        throw new Error(`Cannot find folder in repo: ${folderPath}`);
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

  parseURL(url) {
    const [ owner, repo ] = url.substr(this.baseURL.length + 1).split('/');
    const re = /^[\w\-]+$/;
    if (!re.test(owner) || !re.test(repo) || !startsWith(url, this.baseURL)) {
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
}

const gitAdapters = [
  new GitHubAdapter
];

async function retrieveFromGit(path, options) {
  const { url } = options;
  const adapter = find(gitAdapters, (a) => a.canHandle(options));
  if (adapter) {
    const buffer = await adapter.retrieveFile(path, options);
    return buffer;
  } else {
    throw new Error(`Cannot find an adapter for repo: ${url}`);
  }
}

const retrieveFromGitSync = deasync((path, options, cb) => {
  retrieveFromGit(path, options).then((data) => {
    cb(null, data);
  }).catch((err) => {
    cb(err, null);
  });
});

const gitFS = '/$git/';
let resolveFilenameBefore, jsExtensionBefore;

/**
 * Override require() so that code can be retrieved from remote location
 *
 * @param  {object} options
 */
function overrideRequire(options) {
  const moduleWhitelist = [ 'stream' ];
  // override filename resolution
  resolveFilenameBefore = Module._resolveFilename;
  Module._resolveFilename = function(request, parent, isMain) {
    if (startsWith(request, './') && startsWith(parent.filename, gitFS)) {
      const path = join(parent.path, request);
      if (startsWith(path, gitFS)) {
        return path;
      }
    } else if (includes(moduleWhitelist, request)) {
      return resolveFilenameBefore(request, parent, isMain);
    }
    throw new Error(`Cannot find module '${request}'`);
  };
  // override JS loader
  jsExtensionBefore = Module._extensions['.js'];
  Module._extensions['.js'] = function(module, path) {
    if (startsWith(path, gitFS)) {
      const repoPath = path.substr(gitFS.length);
      let content = retrieveFromGitSync(repoPath, options);
      if (typeof(content) != 'string') {
        content = content.toString();
      }
      module._compile(content, path);
    } else {
      jsExtensionBefore(module, path);
    }
  };
}

function requireGit(path) {
  const require = createRequire(gitFS);
  return require(path);
}

function restoreRequire() {
  if (resolveFilenameBefore && jsExtensionBefore) {
    Module._resolveFilename = resolveFilenameBefore;
    Module._extensions['.js'] = jsExtensionBefore;
    resolveFilenameBefore = jsExtensionBefore = undefined;
  }
}

export {
  requireGit,
  overrideRequire,
  restoreRequire,
  retrieveFromGit,
  retrieveFromGitSync,
  GitHubAdapter,
};

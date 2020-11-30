import fetch from 'cross-fetch';
import { getAgent as agent } from './http-agents.mjs';
import { HttpError } from './error-handling.mjs';

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
}

class GitRemoteAdapter extends GitAdapter {
  async retrieveJSON(url, options) {
    const { accessToken } = options;
    const headers = {};
    const timeout = 5000;
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    const res = await fetch(url, { headers, timeout, agent });
    if (res.status === 200) {
      const json = await res.json();
      return json;
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
}

class GitHubAdapter extends GitRemoteAdapter {
  constructor() {
    super('github');
    this.baseURL = 'https://github.com';
    this.apiURL = 'https://api.github.com';
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
    const relevantCommits = await this.findCommits(path, apiOpts);
    const tags = await this.findTags(apiOpts);
    const branches = await this.findBranches(apiOpts);
    const versions = [];
    for (let { sha, commit } of relevantCommits) {
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
        checked.push(sha)          ;
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
}

const gitAdapters = [];

function findGitAdapter(options) {
  return gitAdapters.find((a) => a.canHandle(options));
}

function addGitAdapter(adapter) {
  gitAdapters.push(adapter);
}

addGitAdapter(new GitHubAdapter);

export {
  findGitAdapter,
  GitAdapter,
  GitRemoteAdapter,
  GitHubAdapter,
};
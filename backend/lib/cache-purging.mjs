import Fs from 'fs'; const { readdir, open, unlink, stat } = Fs.promises;
import { join } from 'path';
import { findServerConfig } from './config-loading.mjs';

class NginxCacheScanner {
  constructor() {
    this.entries = [];
    this.shown = [];
  }

  async scan(path) {
    await this.scanFolder(path);
    return this.entries;
  }

  addEntry(entry) {
    this.entries.push(entry);
  }

  async scanFolder(path) {
    const names = await readdir(path);
    const md5RegExp = /^[0-9a-f]{32}$/;
    for (let name of names) {
      if (name.charAt(0) === '.') {
        continue;
      }
      try {
        const childPath = join(path, name);
        const child = await stat(childPath);
        if (child.isFile() && md5RegExp.test(name)) {
          const entry = await this.loadEntry(childPath, child);
          this.addEntry(entry);
        } else if (child.isDirectory()) {
          await this.scanFolder(childPath);
        }
      } catch (err) {
        if (!this.shown.includes(err.message)) {
          console.error(err.message);
          this.shown.push(err.message);
        }
      }
    }
  }

  async loadEntry(path, stats) {
    const buf = Buffer.alloc(1024);
    const fh = await open(path, 'r');
    try {
      await fh.read(buf, 0, 1024, 0);
      const keySI = buf.indexOf('KEY:');
      const keyEI = buf.indexOf('\n', keySI);
      const statusSI = buf.indexOf(' ', keyEI + 1);
      const statusEI = buf.indexOf(' ', statusSI + 1);
      if (keySI === -1 || keyEI === -1) {
        throw new Error('Unable to find key');
      }
      const key = buf.toString('utf-8', keySI + 4, keyEI).trim();
      const status = parseInt(buf.toString('utf-8', statusSI + 1, statusEI));
      const slashIndex = key.indexOf('/');
      if (slashIndex === -1 || key.charAt(slashIndex - 1) === ':') {
        throw new Error('proxy_cache_key should be $proxy_host$uri$is_args$args');
      }
      const url = {
        hostname: key.substr(0, slashIndex),
        path: key.substr(slashIndex)
      };
      const { mtime, size } = stats;
      return { url, status, path, mtime, size };
    } finally {
      await fh.close();
    }
  }
}

class NginxCacheSweeper extends NginxCacheScanner {
  constructor(hostname, predicate) {
    super();
    this.removing = [];
    this.removed = [];
    this.criteria = [ { hostname, predicate } ];
    this.completion = null;
  }

  start(path) {
    this.completion = this.sweep(path);
  }

  async sweep(path) {
    await super.scan(path);
    for (let entry of this.removing) {
      try {
        await unlink(entry.path);
        this.removed.push(entry);
      } catch (err) {
        console.error(err);
      }
    }
  }

  addEntry(entry) {
    super.addEntry(entry);
    if (this.meetCriteria(entry)) {
      this.removing.push(entry);
    }
  }

  addCriterion(hostname, predicate) {
    const criterion = { hostname, predicate };
    this.criteria.push(criterion);
    // run check against list of cache entries already discovered
    for (let entry of this.entries) {
      if (this.meetCriterion(entry, criterion)) {
        const index = this.removing.indexOf(entry);
        if (index === -1) {
          this.removing.push(entry);
        }
      }
    }
  }

  findResults(hostname, predicate) {
    const criterion = { hostname, predicate };
    const list = []
    for (let entry of this.removed) {
      if (this.meetCriterion(entry, criterion)) {
        list.push(entry);
      }
    }
    return list;
  }

  meetCriteria(entry) {
    for (let criterion of this.criteria) {
      if (this.meetCriterion(entry, criterion)) {
        return true;
      }
    }
    return false;
  }

  meetCriterion(entry, criterion) {
    const { hostname, predicate } = criterion;
    if (entry.url.hostname === hostname) {
      if (predicate === undefined) {
        return true;
      } else if (typeof(predicate) === 'string') {
        return (predicate === entry.url.path);
      } else if (predicate instanceof RegExp) {
        return predicate.test(entry.url.path);
      } else if (predicate instanceof Function) {
        return predicate(entry.url.path);
      } else if (predicate instanceof Array) {
        return predicate.includes(entry.url.path);
      }
      return false;
    }
  }
}

let sweeper = null;

async function purgeCache(hostname, predicate) {
  const server = findServerConfig();
  if (!server.nginx || !server.nginx.cache) {
    return [];
  }
  if (sweeper) {
    sweeper.addCriterion(hostname, predicate);
  } else {
    sweeper = new NginxCacheSweeper(hostname, predicate);
    sweeper.start(server.nginx.cache.path);
  }
  await sweeper.completion;
  return sweeper.findResults(hostname, predicate);
}

export {
  purgeCache,
  NginxCacheScanner,
  NginxCacheSweeper,
};

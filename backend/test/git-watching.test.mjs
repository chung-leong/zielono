import Fs from 'fs'; const { stat } = Fs.promises;
import { resolve } from 'path';
import Chai from 'chai'; const { expect } = Chai;
import remove from 'lodash/remove.js';
import delay from 'delay';
import './helpers/conditional-testing.mjs';
import { createTempFolder, saveYAML } from './helpers/file-saving.mjs';
import { getRepoPath } from './helpers/path-finding.mjs';
import { loadConfig } from '../lib/config-loading.mjs';
import { watchConfigFolder, unwatchConfigFolder } from '../lib/config-watching.mjs';
import { ExpectedError } from '../lib/error-handling.mjs';
import { GitAdapter, addGitAdapter, removeGitAdapter } from '../lib/git-adapters.mjs';
import { findGitAdapter } from '../lib/git-adapters.mjs';

import {
  watchGitRepos,
  unwatchGitRepos,
  gitEventEmitter,
} from '../lib/git-watching.mjs';

describe('Git watching', function() {
  describe('watchGitRepos()', function() {
    class GitTestAdapter extends GitAdapter {
      constructor() {
        super('test');
        this.canWatch = this.canUnwatch = true;
        this.list = [];
        this.resolve = null;
      }

      canHandle() { return true };

      watchFolder(path, repo, options) {
        this.changed();
        if (!this.canWatch) {
          throw new ExpectedError;
        }
        this.list.push({ path, repo, options });
      }

      unwatchFolder(path, repo, options) {
        this.changed();
        if (!this.canUnwatch) {
          throw new ExpectedError;
        }
        remove(this.list, { path, repo, options });
      }

      change() {
        return new Promise((resolve) => this.resolve = resolve);
      }

      changed() {
        const resolve = this.resolve;
        this.resolve = null;
        if (resolve) {
          resolve();
        }
      }
    }
    it('should add and remove watches as sites are added or modified', async function() {
      const tmpFolder = await createTempFolder();
      await saveYAML(tmpFolder, 'zielono', {});
      await saveYAML(tmpFolder, 'site-1', { code: { path: '/abc' } });
      await loadConfig(tmpFolder.path);
      await watchConfigFolder();
      const adapter = addGitAdapter(new GitTestAdapter);
      try {
        const count1 = await watchGitRepos();
        expect(count1).to.equal(1);
        expect(adapter.list).to.eql([
          {
            path: 'ssr',
            repo: {
              path: '/abc',
              url: undefined,
            },
            options: {
              token: undefined
            }
          }
        ]);
        await saveYAML(tmpFolder, 'site-2', { code: { path: '/efg' } });
        await Promise.race([ adapter.change(), delay(1000) ]);
        expect(adapter.list).to.eql([
          {
            path: 'ssr',
            repo: {
              path: '/abc',
              url: undefined,
            },
            options: {
              token: undefined
            }
          },
          {
            path: 'ssr',
            repo: {
              path: '/efg',
              url: undefined,
            },
            options: {
              token: undefined
            }
          }
        ]);
        await saveYAML(tmpFolder, 'site-1', {});
        await Promise.race([ adapter.change(), delay(1000) ]);
        expect(adapter.list).to.eql([
          {
            path: 'ssr',
            repo: {
              path: '/efg',
              url: undefined,
            },
            options: {
              token: undefined
            }
          }
        ]);
        const count2 = await unwatchGitRepos();
        expect(count2).to.equal(0);
      } finally {
        removeGitAdapter(adapter);
        await unwatchConfigFolder();
      }
    })
    it('should retry when failure occurs', async function() {
      const tmpFolder = await createTempFolder();
      await saveYAML(tmpFolder, 'zielono', {});
      await saveYAML(tmpFolder, 'site-1', { code: { path: '/abc' } });
      await loadConfig(tmpFolder.path);
      await watchConfigFolder();
      const adapter = addGitAdapter(new GitTestAdapter);
      try {
        const count1 = await watchGitRepos();
        expect(count1).to.equal(1);
        adapter.canWatch = false;
        await saveYAML(tmpFolder, 'site-2', { code: { path: '/efg' } });
        await Promise.race([ adapter.change(), delay(500) ]);
        expect(adapter.list).to.have.lengthOf(1);
        adapter.canWatch = true;
        await Promise.race([ adapter.change(), delay(1100) ]);
        expect(adapter.list).to.have.lengthOf(2);
        adapter.canUnwatch = false;
        const count2 = await unwatchGitRepos();
        expect(count2).to.equal(2);
      } finally {
        removeGitAdapter(adapter);
        await unwatchConfigFolder();
      }
    })
  })
  describe('gitEventEmitter', function() {
    it('should emit event when a git tag is added', async function() {
      const repoPath = resolve(getRepoPath(), '../zielono-generic-site');
      try {
        await stat(repoPath);
      } catch (err) {
        this.skip();
        return;
      }
      const repo = { path: repoPath };
      const adapter = findGitAdapter(repo);
      const tag = `test-tag-${Math.floor(Math.random() * 1000)}`;
      const commit = '3e5561a9074a5dc00acfd746b446014335ff4b9f';
      try {
        const tmpFolder = await createTempFolder();
        await saveYAML(tmpFolder, 'zielono', {});
        await saveYAML(tmpFolder, 'site-1', { code: repo });
        await loadConfig(tmpFolder.path);
        await watchConfigFolder();
        const count = await watchGitRepos();
        expect(count).to.equal(1);
        let change, done;
        const event = new Promise((resolve) => done = resolve);
        await gitEventEmitter.on('code-change', (before, after, site) => {
          change = { before, after, site };
          done();
        });
        await adapter.runGit(`git tag -a ${tag} ${commit} -m "Test"`, repo);
        await Promise.race([ event, delay(500) ]);
        expect(change).to.have.property('before');
        expect(change).to.have.property('after');
        expect(change).to.have.property('site');
        const { before, after } = change;
        const refsBefore = before['3e5561a9074a5dc00acfd746b446014335ff4b9f'];
        const refsAfter = after['3e5561a9074a5dc00acfd746b446014335ff4b9f'];
        expect(refsBefore).to.not.contain(`tags/${tag}`);
        expect(refsAfter).to.contain(`tags/${tag}`);
      } finally {
        await unwatchGitRepos();
        await unwatchConfigFolder();
        try {
          await adapter.runGit(`git tag -d ${tag}`, options);
        } catch (err) {
        }
      }
    })
  })
})

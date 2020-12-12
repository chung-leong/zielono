import Chai from 'chai'; const { expect } = Chai;
import remove from 'lodash/remove.js';
import delay from 'delay';
import './helpers/conditional-testing.mjs';
import { createTempFolder, saveYAML } from './helpers/file-loading.mjs';
import { setConfigFolder, watchConfigFolder, unwatchConfigFolder } from '../lib/config-management.mjs';
import { ExpectedError } from '../lib/error-handling.mjs';
import { GitAdapter, addGitAdapter, removeGitAdapter } from '../lib/git-adapters.mjs';

import {
  watchGitRepos,
  unwatchGitRepos,
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

      watchFolder(path, options) {
        this.changed();
        if (!this.canWatch) {
          throw new ExpectedError;
        }
        this.list.push({ path, options });
      }

      unwatchFolder(path, options) {
        this.changed();
        if (!this.canUnwatch) {
          throw new ExpectedError;
        }
        remove(this.list, { path, options });
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
      addGitAdapter()
      const tmpFolder = await createTempFolder();
      setConfigFolder(tmpFolder.path);
      await saveYAML(tmpFolder, 'zielono', {});
      await saveYAML(tmpFolder, 'site-1', { code: { path: '/abc' } });
      await watchConfigFolder();
      const adapter = addGitAdapter(new GitTestAdapter);
      try {
        const count1 = await watchGitRepos();
        expect(count1).to.equal(1);
        expect(adapter.list).to.eql([
          {
            path: 'www',
            options: {
              path: '/abc',
              url: undefined,
              accessToken: undefined
            }
          }
        ]);
        await saveYAML(tmpFolder, 'site-2', { code: { path: '/efg' } });
        await Promise.race([ adapter.change(), delay(1000) ]);
        expect(adapter.list).to.eql([
          {
            path: 'www',
            options: {
              path: '/abc',
              url: undefined,
              accessToken: undefined
            }
          },
          {
            path: 'www',
            options: {
              path: '/efg',
              url: undefined,
              accessToken: undefined
            }
          }
        ]);
        await saveYAML(tmpFolder, 'site-1', {});
        await Promise.race([ adapter.change(), delay(1000) ]);
        expect(adapter.list).to.eql([
          {
            path: 'www',
            options: {
              path: '/efg',
              url: undefined,
              accessToken: undefined
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
      addGitAdapter()
      const tmpFolder = await createTempFolder();
      setConfigFolder(tmpFolder.path);
      await saveYAML(tmpFolder, 'zielono', {});
      await saveYAML(tmpFolder, 'site-1', { code: { path: '/abc' } });
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
})

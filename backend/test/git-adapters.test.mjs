import Chai from 'chai'; const { expect } = Chai;
import delay from 'delay';
import './helpers/conditional-testing.mjs';
import { createTempFolder, saveYAML } from './helpers/file-saving.mjs';
import { getRepoPath } from './helpers/path-finding.mjs';
import { getAccessToken, getServiceURL } from './helpers/test-environment.mjs';
import { createTempConfig } from './helpers/config-creation.mjs';
import { getHash } from '../lib/content-storage.mjs';

import {
  findGitAdapter,
  GitAdapter,
  GitRemoteAdapter,
  GitHubAdapter,
  GitLocalAdapter,
} from '../lib/git-adapters.mjs';

describe('Git adapters', function() {
  this.timeout(10000);
  before(async function() {
    await createTempConfig();
  })
  describe('findGitAdapter', function() {
    it('should find GitHub adapter', function() {
      const repo = {
        url: 'https://github.com/chung-leong/test',
      };
      const adapter = findGitAdapter(repo);
      expect(adapter).to.be.instanceOf(GitHubAdapter);
      expect(adapter).to.have.property('name', 'github');
    })
    it('should find GitHub adapter', function() {
      const repo = {
        path: getRepoPath(),
      };
      const adapter = findGitAdapter(repo);
      expect(adapter).to.be.instanceOf(GitLocalAdapter);
      expect(adapter).to.have.property('name', 'local');
    })
  })
  describe('GitAdapter', function() {
    const adapter = new GitAdapter('test');
    describe('isCommitID()', function() {
      it('should return true if the given string seems to be a sha1 hash', function() {
        const result = adapter.isCommitID('b3a7b37f86efde136d7601a98614fa458c77d0ff');
        expect(result).to.be.true;
      })
      it('should return false if the string is something else', function() {
        const result = adapter.isCommitID('heads/main');
        expect(result).to.be.false;
      })
    })
  })
  describe('GitRemoteAdapter', function() {
    const adapter = new GitRemoteAdapter('test');
    skip.if.watching.or.no.github.
    describe('retrieveJSON()', function() {
      it('should retrieve a JSON object from remote server', async function() {
        const url = 'https://api.github.com/repos/chung-leong/zielono/git/ref/heads/main';
        const token = getAccessToken('github');
        const json = await adapter.retrieveJSON(url, { token });
        expect(json).to.have.keys([ 'ref', 'url', 'node_id', 'object' ]);
      })
    })
  })
  describe('GitHubAdapter', function() {
    const adapter = new GitHubAdapter;
    const token = getAccessToken('github');
    describe('getURL()', function() {
      it('should replace placeholders in URL with actual parameters', function() {
        const repo = {
          url: 'https://github.com/chung-leong/zielono'
        };
        const vars = {
          ref: 'heads/main',
        };
        const result  = adapter.getURL('repos/:owner/:repo/git/ref/:ref', repo, vars);
        expect(result).to.eql('https://api.github.com/repos/chung-leong/zielono/git/ref/heads/main');
      });
    })
    skip.if.watching.or.no.github.
    describe('findRepo()', function() {
      it('should retrieve info about repo', async function() {
        const repo = {
          url: 'https://github.com/chung-leong/zielono'
        };
        const info = await adapter.findRepo(repo, { token });
        expect(info).to.have.property('default_branch', 'main');
        expect(info).to.have.property('name', 'zielono');
        expect(info).to.have.property('full_name', 'chung-leong/zielono');
        expect(info).to.have.property('private', false);
      })
    })
    skip.if.watching.or.no.github.
    describe('retrieveFile()', function() {
      it('should retrieve file from default branch of repo', async function() {
        const path = 'backend/test/assets/hello.json';
        const repo = {
          url: 'https://github.com/chung-leong/zielono'
        };
        const buffer = await adapter.retrieveFile(path, repo, { token });
        expect(buffer).to.be.instanceOf(Buffer);
        expect(buffer).to.have.property('filename', 'hello.json');
        expect(buffer).to.have.property('sha', 'b4fefce728d51a59bcf3f4a022d145f0ba7cc8d2');
        const json = JSON.parse(buffer);
        expect(json).to.eql({ message: 'hello world', version: 2 });
      })
      it('should retrieve file from a tagged commit', async function() {
        const path = 'backend/test/assets/hello.json';
        const ref = 'tags/test-target';
        const repo = {
          url: 'https://github.com/chung-leong/zielono',
        };
        const buffer = await adapter.retrieveFile(path, { token, ref });
        expect(buffer).to.be.instanceOf(Buffer);
        expect(buffer).to.have.property('filename', 'hello.json');
        expect(buffer).to.have.property('sha', 'b4fefce728d51a59bcf3f4a022d145f0ba7cc8d2');
        const json = JSON.parse(buffer);
        expect(json).to.eql({ message: 'hello world', version: 2 });
      })
      it('should retrieve file from a specific commit', async function() {
        const path = 'backend/test/assets/hello.json';
        const ref = 'b3a7b37f86efde136d7601a98614fa458c77d0ff';
        const repo = {
          url: 'https://github.com/chung-leong/zielono',
        };
        const buffer = await adapter.retrieveFile(path, repo, { token, ref });
        expect(buffer).to.be.instanceOf(Buffer);
        expect(buffer).to.have.property('filename', 'hello.json');
        expect(buffer).to.have.property('sha', 'a03f21b9d6c25fd82ac3496cb1ab91dd5126c55f');
        const json = JSON.parse(buffer);
        expect(json).to.eql({ message: 'hello world', version: 1 });
      })
    })
    skip.if.watching.or.no.github.
    describe('retrieveVersions()', function() {
      it('should retrieve a list of relevant commits', async function() {
        const repo = {
          url: 'https://github.com/chung-leong/zielono',
        };
        const path = 'backend/test/assets/hello.json';
        const versions = await adapter.retrieveVersions(path, repo, { token });
        const shas = versions.map((v) => v.sha);
        expect(shas).to.eql([
          '1fde120a0a87d45e9a5df72d6abedf9b5e6ff1a1',
          'b3a7b37f86efde136d7601a98614fa458c77d0ff',
          '2482b2b389e8aa3f61415287e1a25893de64ac03',
        ]);
      })
    })
    skip.if.watching.or.no.github.
    describe('retrieveVersionRefs()', function() {
      it('should retrieve a branches and tags associated with relavant commits', async function() {
        const repo = {
          url: 'https://github.com/chung-leong/zielono',
        };
        const path = 'backend/test/assets/hello.json';
        const refs = await adapter.retrieveVersionRefs(path, repo, { token });
        expect(refs).to.eql({
          '1fde120a0a87d45e9a5df72d6abedf9b5e6ff1a1': [
            'heads/main',
            'tags/test-target'
          ]
        });
      })
    })
    skip.if.watching.or.no.github.
    describe('findHooks()', function() {
      it('should find existing web hooks', async function() {
        const repo = {
          url: 'https://github.com/chung-leong/zielono',
        };
        const hooks = await adapter.findHooks(repo, { token });
        expect(hooks).to.be.an('array');
      })
      skip.if.no.ngrok.
      it('should find a web hook that has just been added', async function() {
        const repo = {
          url: 'https://github.com/chung-leong/zielono',
        };
        const hooksBefore = await adapter.findHooks(repo, { token });
        const hash = '1234567890';
        const hook = await adapter.installHook(hash, repo, { token });
        const hooksAfter = await adapter.findHooks(repo, { token });
        try {
          expect(hooksAfter.length).to.be.above(hooksBefore.length);
        } finally {
          await adapter.uninstallHook(hook, repo, { token });
        }
      })
    })
    skip.if.watching.or.no.github.or.no.ngrok.
    describe('uninstallOldHooks()', function() {
      it('should remove web hooks with same URL', async function() {
        const repo = {
          url: 'https://github.com/chung-leong/zielono',
        };
        const hash = '1234567890';
        const hook = await adapter.installHook(hash, repo, { token });
        const hooksBefore = await adapter.findHooks(repo, { token });
        const count = await this.uninstallOldHooks(hook.url, repo, { token });
        expect(count).to.be.above(0);
        const hooksAfter = await adapter.findHooks(repo, { token });
        expect(hooksAfter.length).to.be.below(hooksBefore.length);
      })
    })
    skip.if.watching.or.no.github.or.no.ngrok.
    describe('installHook()', function() {
      it('should install a web hook', async function() {
        const repo = {
          url: 'https://github.com/chung-leong/zielono',
        };
        const hash = '1234567890';
        const hook = await adapter.installHook(hash, repo, { token });
        try {
          expect(hook).to.have.property('id').that.is.a('number');
          expect(hook).to.have.property('url').that.is.a('string');
        } finally {
          await adapter.uninstallHook(hook, repo, { token });
        }
      })
    })
    skip.if.watching.or.no.github.or.no.ngrok.
    describe('uninstallHook()', function() {
      it('should uninstall a web hook', async function() {
        const repo = {
          url: 'https://github.com/chung-leong/zielono',
        };
        const hash = '1234567890';
        const hook = await adapter.installHook(hash, repo, { token });
        const hooksBefore = await adapter.findHooks(repo, { token });
        await adapter.uninstallHook(hook, repo, { token });
        const hooksAfter = await adapter.findHooks(repo, { token });
        expect(hooksAfter.length).to.be.below(hooksBefore.length);
      })
    })
  })
  describe('GitLocalAdapter', function() {
    const adapter = new GitLocalAdapter;
    describe('retrieveFile()', function() {
      it('should retrieve file from default branch of repo', async function() {
        const path = 'backend/test/assets/hello.json';
        const repo = {
          path: getRepoPath(),
        };
        const buffer = await adapter.retrieveFile(path, repo, {});
        expect(buffer).to.be.instanceOf(Buffer);
        expect(buffer).to.have.property('filename', 'hello.json');
        expect(buffer).to.have.property('sha', 'b4fefce728d51a59bcf3f4a022d145f0ba7cc8d2');
        const json = JSON.parse(buffer);
        expect(json).to.eql({ message: 'hello world', version: 2 });
      })
      it('should retrieve file from a tagged commit', async function() {
        const path = 'backend/test/assets/hello.json';
        const ref = 'tags/test-target';
        const repo = {
          path: getRepoPath(),
        };
        const buffer = await adapter.retrieveFile(path, repo, { ref });
        expect(buffer).to.be.instanceOf(Buffer);
        expect(buffer).to.have.property('filename', 'hello.json');
        expect(buffer).to.have.property('sha', 'b4fefce728d51a59bcf3f4a022d145f0ba7cc8d2');
        const json = JSON.parse(buffer);
        expect(json).to.eql({ message: 'hello world', version: 2 });
      })
      it('should retrieve file from a specific commit', async function() {
        const path = 'backend/test/assets/hello.json';
        const ref = 'b3a7b37f86efde136d7601a98614fa458c77d0ff';
        const repo = {
          path: getRepoPath(),
        };
        const buffer = await adapter.retrieveFile(path, repo, { ref });
        expect(buffer).to.be.instanceOf(Buffer);
        expect(buffer).to.have.property('filename', 'hello.json');
        expect(buffer).to.have.property('sha', 'a03f21b9d6c25fd82ac3496cb1ab91dd5126c55f');
        const json = JSON.parse(buffer);
        expect(json).to.eql({ message: 'hello world', version: 1 });
      })
    })
    describe('retrieveVersions()', function() {
      it('should retrieve a list of relevant commits', async function() {
        const repo = {
          path: getRepoPath(),
        };
        const path = 'backend/test/assets/hello.json';
        const versions = await adapter.retrieveVersions(path, repo, {});
        const shas = versions.map((v) => v.sha);
        expect(shas).to.eql([
          '1fde120a0a87d45e9a5df72d6abedf9b5e6ff1a1',
          'b3a7b37f86efde136d7601a98614fa458c77d0ff',
          '2482b2b389e8aa3f61415287e1a25893de64ac03',
        ]);
      })
    })
    describe('retrieveVersionRefs()', function() {
      it('should retrieve a branches and tags associated with relavant commits', async function() {
        const repo = {
          path: getRepoPath(),
        };
        const path = 'backend/test/assets/hello.json';
        const refs = await adapter.retrieveVersionRefs(path, repo, {});
        expect(refs).to.eql({
          '1fde120a0a87d45e9a5df72d6abedf9b5e6ff1a1': [
            'heads/main',
            'tags/test-target'
          ]
        });
      })
    })
    describe('unwatchFolder()', function() {
      it('should remove watch', async function() {
        const repo = {
          path: getRepoPath(),
        };
        const path = 'backend/test/assets/hello.json';
        await adapter.watchFolder(path, repo, {}, (before, after) => {});
        await adapter.unwatchFolder(path, repo, {});
        expect(adapter.watches).to.have.lengthOf(0);
      })
    })
    describe('watchFolder()', function() {
      it('should invoke callback when new tag is added', async function() {
        const repo = {
          path: getRepoPath(),
        };
        const path = 'backend/test/assets/hello.json';
        const tag = `test-tag-${Math.floor(Math.random() * 1000)}`;
        const commit = '98002397cce514aae2ffddc4caceec861f0ae709';
        try {
          let change, done;
          const event = new Promise((resolve) => done = resolve);
          await adapter.watchFolder(path, repo, {}, (before, after) => {
            change = { before, after };
            done();
          });
          await adapter.runGit(`git tag -a ${tag} ${commit} -m "Test"`, repo);
          await Promise.race([ event, delay(500) ]);
          expect(change).to.have.property('before').that.is.an('object');
          expect(change).to.have.property('after').that.is.an('object');
          const { before, after } = change;
          const refsBefore = before['1fde120a0a87d45e9a5df72d6abedf9b5e6ff1a1'];
          const refsAfter = after['1fde120a0a87d45e9a5df72d6abedf9b5e6ff1a1'];
          expect(refsBefore).to.not.contain(`tags/${tag}`);
          expect(refsAfter).to.contain(`tags/${tag}`);
        } finally {
          adapter.unwatchFolder(path, repo, {});
          try {
            await adapter.runGit(`git tag -d ${tag}`, repo);
          } catch (err) {
          }
        }
      })
      it('should invoke callback when new branch is added', async function() {
        const repo = {
          path: getRepoPath(),
        };
        const path = 'backend/test/assets/hello.json';
        const branch = `test-branch-${Math.floor(Math.random() * 1000)}`;
        const commit = '98002397cce514aae2ffddc4caceec861f0ae709';
        try {
          let change, done;
          const event = new Promise((resolve) => done = resolve);
          await adapter.watchFolder(path, repo, {}, (before, after) => {
            change = { before, after };
            done();
          });
          await adapter.runGit(`git branch ${branch} ${commit}`, repo);
          await Promise.race([ event, delay(500) ]);
          expect(change).to.have.property('before').that.is.an('object');
          expect(change).to.have.property('after').that.is.an('object');
          const { before, after } = change;
          const refsBefore = before['1fde120a0a87d45e9a5df72d6abedf9b5e6ff1a1'];
          const refsAfter = after['1fde120a0a87d45e9a5df72d6abedf9b5e6ff1a1'];
          expect(refsBefore).to.not.contain(`heads/${branch}`);
          expect(refsAfter).to.contain(`heads/${branch}`);
        } finally {
          adapter.unwatchFolder(path, repo, {});
          try {
            await adapter.runGit(`git branch -d ${branch}`, repo);
          } catch (err) {
          }
        }
      })
    })
    describe('processHookMessage()', function() {
      class GitHubTestAdapter extends GitHubAdapter {
        constructor() {
          super();
          this.retrievalCount = 0;
        }

        async retrieveVersionRefs(path, repo, options) {
          this.retrievalCount++;
          return {};
        }

        async installHook(hash, repo, options) {
          return { id: 0 };
        }

        async uninstallHook(hook, repo, options) {
        }
      }
      const repo = { url: 'https://github.com/someone/project' };
      const hash = getHash(repo.url);
      it('should trigger rescanning when a new branch is created', async function() {
        const adapter = new GitHubTestAdapter;
        await adapter.watchFolder('ssr', repo, {}, () => {});
        expect(adapter.retrievalCount).to.equal(1);
        await adapter.processHookMessage(hash, { created: true });
        expect(adapter.retrievalCount).to.equal(2);
      })
      it('should trigger rescanning when a branch is deleted', async function() {
        const adapter = new GitHubTestAdapter;
        await adapter.watchFolder('ssr', repo, {}, () => {});
        expect(adapter.retrievalCount).to.equal(1);
        await adapter.processHookMessage(hash, { created: false, deleted: true });
        expect(adapter.retrievalCount).to.equal(2);
      })
      it('should trigger rescanning when there are more than 20 commits in a push', async function() {
        const adapter = new GitHubTestAdapter;
        await adapter.watchFolder('ssr', repo, {}, () => {});
        expect(adapter.retrievalCount).to.equal(1);
        const commits = [];
        for (let i = 0; i < 22; i++) {
          commits.push({ added: [], removed: [], modified: [ 'README.md' ] });
        }
        await adapter.processHookMessage(hash, { created: false, commits });
        expect(adapter.retrievalCount).to.equal(2);
      })
      it('should trigger rescanning when a commit involves changes to the watched folder', async function() {
        const adapter = new GitHubTestAdapter;
        await adapter.watchFolder('ssr', repo, {}, () => {});
        expect(adapter.retrievalCount).to.equal(1);
        const commits = [
          { added: [], removed: [], modified: [ 'ssr/index.js' ] }
        ];
        await adapter.processHookMessage(hash, { created: false, commits });
        expect(adapter.retrievalCount).to.equal(2);
      })
      it('should not trigger rescanning when a commit does not touch the watched folder', async function() {
        const adapter = new GitHubTestAdapter;
        await adapter.watchFolder('ssr', repo, {}, () => {});
        expect(adapter.retrievalCount).to.equal(1);
        const commits = [
          { added: [], removed: [], modified: [ 'src/something.js' ] }
        ];
        await adapter.processHookMessage(hash, { created: false, commits });
        expect(adapter.retrievalCount).to.equal(1);
      })
    })
  })
})

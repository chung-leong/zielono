import Chai from 'chai'; const { expect } = Chai;
import { apply, getAccessToken } from './helpers/test-conditioning.mjs'; apply();

import {
  findGitAdapter,
  GitHubAdapter,
} from '../src/git-adapters.mjs';

describe('Git adapters', function() {
  this.timeout(10000);
  describe('#findGitAdapter', function() {
    it('should find GitHub adapter', function() {
      const options = {
        url: 'https://github.com/chung-leong/test',
      };
      const adapter = findGitAdapter(options);
      expect(adapter).to.be.instanceOf(GitHubAdapter);
      expect(adapter).to.have.property('name', 'github');
    })
  })
  describe('#GitHubAdapter', function() {
    const adapter = new GitHubAdapter;
    const accessToken = getAccessToken('github');
    describe('#parsePath()', function() {
      it('should parse a path into folders and filename', function() {
        const path = 'hello/world/something.png';
        const result = adapter.parsePath(path);
        expect(result).to.eql({
          folders: [ 'hello', 'world' ],
          filename: 'something.png',
        })
      })
    })
    describe('#parseURL()', function() {
      it('should extract user and repo name from GitHub URL', function() {
        const url = 'https://github.com/chung-leong/zielono';
        const result = adapter.parseURL(url);
        expect(result).to.eql({
          owner: 'chung-leong',
          repo: 'zielono',
         });
      })
      it('should throw if the URL is invalid', function() {
        const url = 'https://pornhub.com/';
        expect(() => adapter.parseURL(url)).to.throw();
      })
    })
    describe('#getURL()', function() {
      it('should replace placeholders in URL with actual parameters', function() {
        const url = 'https://api.github.com/repos/chung-leong/zielono/git/ref/heads/main';
        const options = {
          ref: 'heads/main',
          owner: 'chung-leong',
          repo: 'zielono',
        };
        const result  = adapter.getURL('repos/:owner/:repo/git/ref/:ref', options);
        expect(result).to.eql(url);
      });
    })
    describe('#isCommitID()', function() {
      it('should return true if the given string seems to be a sha1 hash', function() {
        const result = adapter.isCommitID('b3a7b37f86efde136d7601a98614fa458c77d0ff');
        expect(result).to.be.true;
      })
      it('should return false if the string is something else', function() {
        const result = adapter.isCommitID('heads/main');
        expect(result).to.be.false;
      })
    })
    describe.skip.if.no.github('#retrieveJSON()', function() {
      it('should retrieve a JSON object from remote server', async function() {
        const url = 'https://api.github.com/repos/chung-leong/zielono/git/ref/heads/main';
        const json = await adapter.retrieveJSON(url, { accessToken });
        expect(json).to.have.keys([ 'ref', 'url', 'node_id', 'object' ]);
      })
    })
    describe.skip.if.no.github('#findRepo()', function() {
      it('should retrieve info about repo', async function() {
        const options = {
          ref: 'heads/main',
          owner: 'chung-leong',
          repo: 'zielono',
          accessToken,
        };
        const repo = await adapter.findRepo(options);
        expect(repo).to.have.property('default_branch', 'main');
        expect(repo).to.have.property('name', 'zielono');
        expect(repo).to.have.property('full_name', 'chung-leong/zielono');
        expect(repo).to.have.property('private', false);
      })
    })
    describe.skip.if.no.github('#retrieveFile()', function() {
      it('should retrieve file from default branch of repo', async function() {
        const path = 'backend/test/assets/hello.json';
        const options = {
          url: 'https://github.com/chung-leong/zielono',
          accessToken,
        };
        const buffer = await adapter.retrieveFile(path, options);
        expect(buffer).to.be.instanceOf(Buffer);
        expect(buffer).to.have.property('filename', 'hello.json');
        expect(buffer).to.have.property('sha');
        const json = JSON.parse(buffer);
        expect(json).to.eql({ message: 'hello world', version: 2 });
      })
      it('should retrieve file from a tagged commit', async function() {
        const path = 'backend/test/assets/hello.json';
        const options = {
          url: 'https://github.com/chung-leong/zielono',
          ref: 'tags/test-target',
          accessToken,
        };
        const buffer = await adapter.retrieveFile(path, options);
        expect(buffer).to.be.instanceOf(Buffer);
        expect(buffer).to.have.property('filename', 'hello.json');
        expect(buffer).to.have.property('sha');
        const json = JSON.parse(buffer);
        expect(json).to.eql({ message: 'hello world', version: 2 });
      })
      it('should retrieve file from a specific commit', async function() {
        const path = 'backend/test/assets/hello.json';
        const options = {
          url: 'https://github.com/chung-leong/zielono',
          ref: 'b3a7b37f86efde136d7601a98614fa458c77d0ff',
          accessToken,
        };
        const buffer = await adapter.retrieveFile(path, options);
        expect(buffer).to.be.instanceOf(Buffer);
        expect(buffer).to.have.property('filename', 'hello.json');
        expect(buffer).to.have.property('sha');
        const json = JSON.parse(buffer);
        expect(json).to.eql({ message: 'hello world', version: 1 });
      })
    })
    describe.skip.if.no.github('#retrieveVersions()', function() {
      it('should retrieve a list of relevant commits', async function() {
        const options = {
          url: 'https://github.com/chung-leong/zielono',
          accessToken,
        };
        const path = 'backend/test/assets/hello.json';
        const versions = await adapter.retrieveVersions(path, options);
        const shas = versions.map((v) => v.sha);
        expect(shas).to.eql([
          '1fde120a0a87d45e9a5df72d6abedf9b5e6ff1a1',
          'b3a7b37f86efde136d7601a98614fa458c77d0ff',
          '2482b2b389e8aa3f61415287e1a25893de64ac03',
        ]);
      })
    })
    describe.skip.if.no.github('#retrieveVersionRefs()', function() {
      it('should retrieve a branches and tags associated with relavant commits', async function() {
        const options = {
          url: 'https://github.com/chung-leong/zielono',
          accessToken,
        };
        const path = 'backend/test/assets/hello.json';
        const refs = await adapter.retrieveVersionRefs(path, options);
        expect(refs).to.eql({
          '1fde120a0a87d45e9a5df72d6abedf9b5e6ff1a1': [
            'heads/main',
            'tags/test-target'
          ]
        });
      })
    })
  })
})
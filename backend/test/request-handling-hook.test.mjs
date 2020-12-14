import Chai from 'chai'; const { expect } = Chai;
import HttpMocks from 'node-mocks-http'; const { createRequest, createResponse } = HttpMocks;
import delay from 'delay';
import { getHash } from '../lib/content-storage.mjs'
import './helpers/conditional-testing.mjs';
import { GitRemoteAdapter, addGitAdapter, removeGitAdapter } from '../lib/git-adapters.mjs';

import {
  getHookSecret,
  calculateSignature,
  handleHookRequest,
} from '../lib/request-handling-hook.mjs';

describe('Hook request handling', function() {
  describe('getHookSecret()', function() {
    it('should a hash that is unique to the machine', function() {
      const hash = getHookSecret();
      const empty = getHash('');
      const bad = getHash('undefined')
      expect(hash).to.not.equal(empty);
      expect(hash).to.not.equal(bad);
    })
  })
  describe('calculateSignature()', function() {
    it('should caculate a sha256 signature', function() {
      const signature1 = calculateSignature('{}');
      expect(signature1).to.satisfy((s) => s.startsWith('sha256='));
      const signature2 = calculateSignature('{ "count": 5 }');
      expect(signature2).to.not.equal(signature1);
    })
  })
  describe('handleHookRequest()', function() {
    const next = (err) => {
      if (err) {
        throw err;
      }
    };
    it('should refuse to process request without matching signature', async function() {
      const signature = calculateSignature('{}');
      const msg = { count: 5 };
      const body = JSON.stringify(msg);
      const req = createRequest({
        body,
        params: { hash: '1234567890' },
        headers: { 'x-hub-signature-256': signature },
      });
      const res = createResponse();
      try {
        await handleHookRequest(req, res, next);
        expect.fail();
      } catch (err) {
        expect(err).to.have.property('status', 403);
      }
    })
    it('should send message to git adapter', async function() {
      class GitTestAdapter extends GitRemoteAdapter {
        constructor() {
          super('test');
          this.messages = [];
          this.resolve = null;
        }

        async processHookMessage(hash, msg) {
          this.messages.push(msg);
          if (this.resolve) {
            this.resolve();
            this.resolve = null;
          } else
          return true;
        }

        change() {
          return new Promise((resolve) => this.resolve = resolve);
        }
      }
      const adapter = addGitAdapter(new GitTestAdapter);
      try {
        const msg = { count: 5 };
        const body = JSON.stringify(msg);
        const signature = calculateSignature(body);
        const req = createRequest({
          body,
          params: { hash: '1234567890' },
          headers: { 'x-hub-signature-256': signature },
        });
        const res = createResponse();
        const called = adapter.change();
        await handleHookRequest(req, res, next);
        await Promise.race([ called, delay(500) ]);
        expect(adapter.messages).to.have.lengthOf(1);
        expect(adapter.messages[0]).to.eql(msg);
      } finally {
        removeGitAdapter(adapter);
      }
    })
  })
})

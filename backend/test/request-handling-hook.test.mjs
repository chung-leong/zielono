import Chai from 'chai'; const { expect } = Chai;
import { createHmac } from 'crypto';
import HttpMocks from 'node-mocks-http'; const { createRequest, createResponse } = HttpMocks;
import delay from 'delay';
import { getHash } from '../lib/content-naming.mjs'
import './helpers/conditional-testing.mjs';
import { GitRemoteAdapter, addGitAdapter, removeGitAdapter } from '../lib/git-adapters.mjs';

import {
  getHookSecret,
  handleHookRequestValidation,
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
  describe('handleHookRequestValidation()', function() {
    it('should set req.valid to true when signature matches', function() {
      const data = Buffer.from('{ "count": 5 }');
      const secret = getHookSecret();
      const hash = createHmac('sha256', secret);
      hash.update(data)
      const signature = 'sha256=' + hash.digest('hex');
      const req = createRequest({
        params: { hash: '1234567890' },
        headers: { 'x-hub-signature-256': signature },
      });
      const res = createResponse();
      handleHookRequestValidation(req, res, () => {});
      req.emit('data', data);
      req.emit('end');
      expect(req).to.have.property('valid', true);
    })
    it('should set req.valid to false when signature does not match', function() {
      const data = Buffer.from('{ "count": 5 }');
      const secret = getHookSecret();
      const hash = createHmac('sha256', secret);
      hash.update(data)
      const signature = 'sha256=' + hash.digest('hex');
      const req = createRequest({
        params: { hash: '1234567890' },
        headers: { 'x-hub-signature-256': signature },
      });
      const res = createResponse();
      handleHookRequestValidation(req, res, () => {});
      req.emit('data', Buffer.from('{ "count": 6 }'));
      req.emit('end');
      expect(req).to.have.property('valid', false);
    })
  })
  describe('handleHookRequest()', function() {
    const next = (err) => {
      if (err) {
        throw err;
      }
    };
    it('should refuse to process request when validation failed', async function() {
      const msg = { count: 5 };
      const body = JSON.stringify(msg);
      const req = createRequest({
        body,
        params: { hash: '1234567890' },
        valid: false,
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
        const body = { count: 5 };
        const req = createRequest({
          body,
          params: { hash: '1234567890' },
          valid: true,
        });
        const res = createResponse();
        const called = adapter.change();
        await handleHookRequest(req, res, next);
        await Promise.race([ called, delay(500) ]);
        expect(adapter.messages).to.have.lengthOf(1);
        expect(adapter.messages[0]).to.eql(body);
      } finally {
        removeGitAdapter(adapter);
      }
    })
  })
})

import { networkInterfaces } from 'os';
import { getHash } from './content-storage.mjs';
import { createHmac } from 'crypto';
import { processHookMessage } from './git-adapters.mjs'
import { HttpError } from './error-handling.mjs';

async function handleHookRequest(req, res, next) {
  try {
    const { body } = req;
    const { hash } = req.params;
    const signature = req.headers['x-hub-signature-256'];
    const correctSignature = calculateSignature(body);
    if (signature !== correctSignature) {
      throw new HttpError(403);
    }
    const json = JSON.parse(body);
    await processHookMessage(hash, json);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

let hookSecret;

function getHookSecret() {
  if (!hookSecret) {
    const macAddresses = [];
    for (let [ name, interfaces ] of Object.entries(networkInterfaces())) {
      for (let { mac, internal } of interfaces) {
        if (!internal && !macAddresses.includes(mac)) {
          macAddresses.push(mac);
        }
      }
    }
    hookSecret = getHash(macAddresses.join(' '));
  }
  return hookSecret;
}

function calculateSignature(body) {
  const secret = getHookSecret();
  const hash = createHmac('sha256', secret);
  hash.update(body);
  return 'sha256=' + hash.digest('hex');
}

export {
  handleHookRequest,
  getHookSecret,
  calculateSignature,
};

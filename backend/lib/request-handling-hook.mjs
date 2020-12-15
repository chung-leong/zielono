import { networkInterfaces } from 'os';
import { getHash } from './content-storage.mjs';
import { createHmac } from 'crypto';
import { processHookMessage } from './git-adapters.mjs'
import { HttpError } from './error-handling.mjs';

function handleHookRequestValidation(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];
  if (signature) {
    const secret = getHookSecret();
    const hash = createHmac('sha256', secret);
    req.on('data', (data) => {
      hash.update(data)
    });
    req.on('end', () => {
      const computed = 'sha256=' + hash.digest('hex');
      req.valid = (signature === computed);
    });
  }
  next();
}

async function handleHookRequest(req, res, next) {
  try {
    const { body, valid } = req;
    const { hash } = req.params;
    if (!valid) {
      throw new HttpError(403);
    }
    await processHookMessage(hash, body);
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

export {
  handleHookRequest,
  handleHookRequestValidation,
  getHookSecret,
};

import { existsSync } from 'fs';
import 'mocha-skip-if';
import { getAccessToken, getServiceURL } from './test-environment.mjs';
import { getGenericCodePath } from './path-finding.mjs';

skip.condition({
  watching: /:watch/.test(process.env.npm_lifecycle_event),
  github: () => getAccessToken('github'),
  ngrok: () => getServiceURL('ngrok'),
});
skip.condition('generic.code', () => existsSync(getGenericCodePath()));

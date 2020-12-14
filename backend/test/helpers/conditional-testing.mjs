import 'mocha-skip-if';
import { getAccessToken, getServiceURL } from './test-environment.mjs';

skip.condition({
  watching: /:watch/.test(process.env.npm_lifecycle_event),
  github: () => getAccessToken('github'),
  ngrok: () => getServiceURL('ngrok'),
});

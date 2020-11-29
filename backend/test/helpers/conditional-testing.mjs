import 'mocha-skip-if';
import { getAccessToken } from './access-tokens.mjs';

skip.condition({
  watching: /:watch/.test(process.env.npm_lifecycle_event),
  github: () => getAccessToken('github'),
});

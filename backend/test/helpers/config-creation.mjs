import { createTempFolder, saveYAML } from './file-saving.mjs';
import { getAssetPath } from './path-finding.mjs';
import { loadConfig, setConfigFolder } from '../../lib/config-loading.mjs';

async function createTempConfig(load = true) {
  const tmpFolder = await createTempFolder();
  await saveYAML(tmpFolder, 'site1', {
    domains: [ 'duck.test', 'www.duck.test' ],
    files: [
      { name: 'sushi', path: getAssetPath('sushi.xlsx'), timeZone: 'Europe/Warsaw' },
      { name: 'sample', path: getAssetPath('sample.xlsx') },
      { name: 'image', path: getAssetPath('image.xlsx') },
    ]
  });
  await saveYAML(tmpFolder, 'site2', {
    domains: [ 'chicken.test', 'www.chicken.test' ],
    files: [
      { name: 'sushi', url: 'https://www.dropbox.com/scl/fi/v6rp5jdiliyjjwp4l4chi/sushi.xlsx?dl=0&rlkey=30zvrg53g5ovu9k8pr63f25io' },
    ]
  });
  await saveYAML(tmpFolder, 'zielono', {
    listen: 8080,
    nginx: {
      cache: {
        path: '/var/cache/nginx'
      }
    }
  });
  await saveYAML(tmpFolder, '.tokens', [
    {
      url: 'https://github.com/chung-leong/zielono/',
      token: 'AB1234567890'
    }
  ], 0o600);
  if (load) {
    await loadConfig(tmpFolder.path);
  } else {
    setConfigFolder(tmpFolder.path);
  }
  after(() => setConfigFolder(undefined));
  return tmpFolder;
}

export {
  createTempConfig
};

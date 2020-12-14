import Fs from 'fs'; const { writeFile, unlink } = Fs.promises;
import { join } from 'path';
import Tmp from 'tmp-promise';
import JsYAML from 'js-yaml'; const { safeLoad, safeDump } = JsYAML;

async function createTempFolder() {
  const tmp = await Tmp.dir({ unsafeCleanup: true });
  after(() => tmp.cleanup());
  return { path: tmp.path };
}

async function saveYAML(tmpFolder, filename, json, mode) {
  const text = safeDump(json, { skipInvalid: true });
  const path = join(tmpFolder.path, filename + '.yaml');
  await writeFile(path, text, { mode });
}

async function removeYAML(tmpFolder, filename) {
  const path = join(tmpFolder.path, filename + '.yaml');
  await unlink(path);
}

export {
  createTempFolder,
  saveYAML,
  removeYAML,
};

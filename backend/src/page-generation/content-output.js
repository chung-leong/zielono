const Events = require('events');
const { once } = Events;

const { stdin, stdout, stderr, exit } = process;

async function outputResult(headers, contents) {
  const chunks = [];
  chunks.push(`200 OK\n`);
  for (let header of headers) {
    chunks.push(header);
  }
  chunks.push('\n');
  chunks.push(contents);
  await writeStream(stdout, chunks);
  exit(0);
}

async function outputError(err, log) {
  const status = err.status || 500;
  const statusText = err.statusText || 'Internal Server Error';
  const chunks = [];
  chunks.push(`${status} ${statusText}\n`);
  chunks.push(`\n`);
  chunks.push(`${err.message}\n`);
  if (err.html) {
    await writeStream(stdout, chunks);
    exit(0);
  } else {
    await writeStream(stderr, chunks);
    exit(1);
  }
}

/**
 * Write data into a stream
 *
 * @param  {WritableStream} stream
 * @param  {string[]|Buffer[]} chunks
 */
async function writeStream(stream, chunks) {
  for (let chunk of chunks) {
    if (!stream.write(chunk)) {
      await once(stream, 'drain');
    }
  }
  stream.end();
  await once(stream, 'finish');
}

module.exports = {
  outputResult,
  outputError,
};

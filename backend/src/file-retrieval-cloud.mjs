import replace from 'lodash/replace.js';
import trim from 'lodash/trim.js';
import trimEnd from 'lodash/trimEnd.js';
import fetch from 'cross-fetch';

async function retrieveFromCloud(url, options) {
  const { etag } = options;
  const fileURL = getDownloadURL(url);
  const timeout = 5000;
  const headers = {};
  if (etag) {
    headers['If-None-Match'] = etag;
  }
  const res = await fetch(fileURL, { headers, timeout });
  if (res.status === 200) {
    const buffer = await res.buffer();
    buffer.type = res.headers.get('content-type');
    buffer.etag = res.headers.get('etag');

    // get filename
    const disposition = res.headers.get('content-disposition');
    if (disposition) {
      const m = /filename=(".+?"|\S+)/i.exec(disposition);
      if (m) {
        const filename = trim(m[1], ' "');
        buffer.filename = filename;
      }
    }
    return buffer;
  } else if (res.status === 304) {
    return null;
  } else {
    let message;
    try {
      const json = await res.json();
      message = json.error;
    } catch (err) {
      try {
        message = await res.text();
      } catch (err) {
      }
    }
    throw new Error(message);
  }
}

/**
 * Adjust a URL based on the cloud storage provider so that we receive the
 * actual contents
 *
 * @param  {string} url
 *
 * @return {string}
 */
function getDownloadURL(url) {
  return getDropboxURL(url)
      || getOneDriveURL(url)
      || url;
}

/**
 * Return the download URL for a shared file on Dropbox
 *
 * @param  {string} url
 *
 * @return {string|undefined}
 */
function getDropboxURL(url) {
  if (/^https:\/\/(www\.dropbox\.com)\//.test(url)) {
    url = replace(url, 'www.dropbox.com', 'dl.dropboxusercontent.com');
    url = replace(url, '?dl=0', '?dl=1');
    return url;
  }
}

/**
 * Return the download URL for a shared file on OneDrive
 *
 * @param  {string} url
 *
 * @return {string|undefined}
 */
function getOneDriveURL(url) {
  if (/^https:\/\/(1drv\.ms|onedrive\.live\.com)\//.test(url)) {
    // encode url as base64
    let token = Buffer.from(url).toString('base64');
    token = trimEnd(token, '=');
    token = replace(token, /\//g, '_');
    token = replace(token, /\+/g, '-');
    token = 'u!' + token;
    return `https://api.onedrive.com/v1.0/shares/${token}/root/content`;
  }
}

export {
  retrieveFromCloud,
  getDownloadURL,
};

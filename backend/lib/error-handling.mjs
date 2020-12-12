import { StructError } from 'superstruct';

class HttpError extends Error {
  constructor(...args) {
    super();
    for (let arg of args) {
      if (typeof(arg) === 'number') {
        this.status = arg;
      } else if (typeof(arg) === 'string') {
        this.message = arg;
      } else if (typeof(arg) === 'object') {
        Object.assign(this, arg);
      }
    }
    if (!this.status) {
      this.status = 500;
    }
    if (!this.message) {
      const httpErrorNames = {
        400: 'Bad Request',
        401: 'Unauthorized',
        402: 'Payment Required',
        403: 'Forbidden',
        404: 'Not Found',
        405: 'Method Not Allowed',
        406: 'Not Acceptable',
        407: 'Proxy Authentication Required',
        408: 'Request Timeout',
        409: 'Conflict',
        410: 'Gone',
        411: 'Length Required',
        412: 'Precondition Failed',
        413: 'Payload Too Large',
        414: 'URI Too Long',
        415: 'Unsupported Media Type',
        422: 'Unprocessable Entity',
        429: 'Too Many Requests',

        500: 'Internal Server Error',
        501: 'Not Implemented',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout',
      };
      this.name = httpErrorNames[this.status];
    }
  }
}

class ErrorCollection extends Error {
  constructor(errors) {
    super();
    const [ first ] = errors;
    this.message = first.message;
    this.errors = [];
    this.add(errors);
  }

  add(errors) {
    for (let err of errors) {
      if (err instanceof this.constructor) {
        this.add(err.errors);
      } else {
        this.errors.push(err);
      }
    }
  }
}

class ExpectedError extends Error {
}

function displayError(error, context) {
  if (error instanceof ErrorCollection) {
    for (let err of error.errors) {
      displayError(err, context);
    }
    return;
  }
  let msg;
  if (error instanceof StructError) {
    const { type, value, refinement, key, filename, lineno } = error;
    let reason = error.message;
    if (refinement) {
      if (refinement === 'url-or-path') {
        if (value.url) {
          reason = `property "url" and "path" cannot both be present`;
        } else {
          reason = `property "url" or "path" is required`;
        }
      }
    } else {
      if (type === 'never') {
        reason = `unrecognized property "${key}"`;
      } else {
        const article = /^[aeiou]/i.test(type) ? 'an' : 'a';
        if (value === undefined) {
          reason = `required property "${key}" is missing`;
        } else {
          reason = `property "${key}" should be ${article} ${type}`;
        }
      }
    }
    msg = `Error encounter in ${filename} (line ${lineno}): ${reason}`;
  } else if (error instanceof ExpectedError) {
    return;
  } else {
    msg = error.message;
  }
  console.error(msg);
}

export {
  HttpError,
  ErrorCollection,
  ExpectedError,
  displayError,
};

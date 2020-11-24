class HTTPError extends Error {
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

export {
  HTTPError,
};

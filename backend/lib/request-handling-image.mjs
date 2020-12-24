import { loadSiteContent, loadSiteContentMeta } from './content-loading.mjs';

/**
 * Handle image request
 *
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
async function handleImageRequest(req, res, next) {
  try {
    const { site } = req;
    const { hash, filename = '' } = req.params;
    const meta = await loadSiteContentMeta(site, 'images', hash);
    const content = await loadSiteContent(site, 'images', hash, meta.format);
    const dot = filename.lastIndexOf('.');
    const filters = (dot !== -1) ? filename.substr(0, dot) : filename;
    let format = (dot !== -1) ? filename.substr(dot + 1) : meta.format;
    if (format === 'jpg') {
      format = 'jpeg';
    }
    let buffer = content;
    // parse the filter string
    const operations = decodeFilters(filters, format).filter((op) => {
      // get rid of redundant resizing
      if (op.name === 'resize') {
        return (op.args[0] !== meta.width || op.args[1] !== meta.height);
      } else if (op.name === 'width') {
        return (op.args[0] !== meta.width);
      } else if (op.name === 'height') {
        return (op.args[0] !== meta.height);
      } else {
        return true;
      }
    });
    if (meta.format !== format || operations.length > 0) {
      buffer = await transformImage(buffer, operations, format);
    }
    const maxAge = 365 * 24 * 60 * 60;
    res.set('Cache-control', `public, max-age=${maxAge}, immutable`);
    res.set('ETag', hash);
    res.type(`image/${format}`);
    res.set('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

/**
 * Extract metadata of given image
 *
 * @param  {Buffer} buffer
 * @param  {string} format
 *
 * @return {object}
 */
async function getImageMeta(buffer, format) {
  if (format === 'svg') {
    const { default: SVGSON } = await import('svgson');
    const svg = await SVGSON.parse(buffer.toString());
    return extractSVGMeta(svg);
  } else {
    const { default: createImage } = await import('sharp');
    const image = createImage(buffer);
    return image.metadata();
  }
}

/**
 * Apply filters to an image and reencode it in the specified format
 *
 * @param  {Buffer} buffer
 * @param  {object[]} operations
 * @param  {string} format
 *
 * @return {Buffer}
 */
async function transformImage(buffer, operations, format) {
  if (format === 'svg') {
    return transformSVGDocument(buffer, operations);
  } else {
    return transformRasterImage(buffer, operations, format);
  }
}

/**
 * Apply filters on an image
 *
 * @param  {Buffer} buffer
 * @param  {object[]} operations
 * @param  {string} format
 *
 * @return {Buffer}
 */
async function transformRasterImage(buffer, operations, format) {
  const { default: createImage } = await import('sharp');
  const image = createImage(buffer);
  const { strategy } = createImage;
  image.settings = {
    quality: 90,
    lossless: false,
    resize: {
      position: strategy.entropy
    }
  };
  image.rotate();
  applyOperators(image, operations);
  const { quality, lossless } = image.settings;
  switch (format.toLowerCase()) {
    case 'webp':
      image.webp({ quality, lossless });
      break;
    case 'png':
      image.png();
      break;
    case 'jpeg':
      image.jpeg({ quality });
      break;
    default:
      throw new Error(`Unknown output format: ${format}`);
  }
  return image.toBuffer();
}

/**
 * Apply filters on an SVG document
 *
 * @param  {Buffer} buffer
 * @param  {object[]} operations
 *
 * @return {Buffer}
 */
async function transformSVGDocument(buffer, operations) {
  // parse the XML doc
  const { default: SVGSON } = await import('svgson');
  const svg = await SVGSON.parse(buffer.toString());
  if (svg.name === 'svg') {
    // see what changes are needed
    const params = {};
    applyOperators(params, operations);
    // get the dimensions first
    let { width, height, viewBox } = extractSVGMeta(svg);

    if (params.crop) {
      const vbScaleX = viewBox[2] / width;
      const vbScaleY = viewBox[3] / height;
      width = params.crop.width;
      height = params.crop.height;
      viewBox[0] = params.crop.left * vbScaleX + viewBox[0];
      viewBox[1] = params.crop.top * vbScaleY + viewBox[1];
      viewBox[2] = params.crop.width * vbScaleX;
      viewBox[3] = params.crop.height * vbScaleY;
    }
    if (params.width !== undefined || params.height !== undefined) {
      if (params.width && params.height === undefined) {
        height = Math.round(height * (params.width / width));
        width = params.width;
      } else if (params.height && params.width === undefined) {
        width = Math.round(width * (params.height / height));
        height = params.height;
      } else {
        width = params.width;
        height = params.height;
      }
    }
    if (!svg.attributes) {
      svg.attributes = {};
    }
    svg.attributes.width = `${width}`;
    svg.attributes.height = `${height}`;
    svg.attributes.viewBox = viewBox.join(' ');
  }
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>`;
  const newXML = header + SVGSON.stringify(svg);
  return Buffer.from(newXML, 'utf-8');
}

function extractSVGMeta(svg) {
  const { attributes = {} } = svg;
  let width = parseFloat(attributes.width) || 0;
  let height = parseFloat(attributes.height) || 0;
  const viewBoxString = attributes.viewBox;
  let viewBox;
  if (viewBoxString) {
    viewBox = viewBoxString.split(/\s+/).map((s) => parseInt(s));
  }
  if (!width && viewBox) {
    width = viewBox[2];
  }
  if (!height && viewBox) {
    height = viewBox[3];
  }
  if (!width) {
    width = 1000;
  }
  if (!height) {
    height = 1000;
  }
  if (!viewBox) {
    viewBox = [ 0, 0, width, height ];
  }
  return { width, height, viewBox, format: 'svg' };
}

/**
 * Decode filter string, searching for commands and parameters
 *
 * @param  {string} filterString
 * @param  {string} format
 *
 * @return {object[]}
 */
function decodeFilters(filterString, format) {
  const operations = [];
  const operators = (format === 'svg') ? svgOperators : sharpOperators;
  for (let part of filterString.split(/[ +]/)) {
    let cmd = '';
    const args = [];
    const regExp = /(\D+)(\d*)/g;
    let m;
    while(m = regExp.exec(part)) {
      if (!cmd) {
        cmd = m[1];
      } else {
        // ignore the delimiter
      }
      const arg = parseInt(m[2]);
      if (arg === arg) {
        args.push(arg);
      }
    }
    if (cmd) {
      for (let [ name, operator ] of Object.entries(operators)) {
        // see which operator's name start with the letter(s)
        if (name.substr(0, cmd.length) === cmd) {
          operations.push({ name, operator, args })
          break;
        }
      }
    }
  }
  return operations;
}

function applyOperators(target, operations) {
  for (let { name, operator, args } of operations) {
    operator.apply(target, args);
  }
}

const sharpOperators = {
  background(r, g, b, a) {
    this.background(r / 100, g / 100, b / 100, a / 100);
  },
  blur(sigma) {
    this.blur(sigma / 10 || 0.3)
  },
  crop(left, top, width, height) {
    this.extract({ left, top, width, height });
  },
  extract(channel) {
    this.extractChannel(channel);
  },
  flatten() {
    this.flatten();
  },
  flip() {
    this.flip();
  },
  flop() {
    this.flop();
  },
  height(height) {
    this.resize(undefined, height, this.settings.resize);
  },
  gamma(gamma) {
    this.gamma(gamma / 10 || 2.2);
  },
  grayscale() {
    this.grayscale();
  },
  negate() {
    this.negate();
  },
  normalize() {
    this.normalize();
  },
  lossless() {
    this.settings.lossless = true;
  },
  position(pos) {
    this.settings.resize.position = pos;
  },
  quality(quality) {
    if (quality) {
      this.settings.quality = quality;
    }
  },
  rotate(degree) {
    this.rotate(degree);
  },
  resize(width, height) {
    this.resize(width, height, this.settings.resize);
  },
  sharpen() {
    this.sharpen();
  },
  trim() {
    this.trim();
  },
  width(width) {
    this.resize(width, undefined, this.settings.resize);
  },
};

// current implementation is fairly limited
const svgOperators = {
  crop(left, top, width, height) {
    this.crop = { left, top, width, height };
  },
  height(height) {
    this.height = height;
  },
  resize(width, height) {
    this.width = width;
    this.height = height;
  },
  width(width) {
    this.width = width;
  },
};

process.env.VIPS_WARNING = false;

export {
  handleImageRequest,
  decodeFilters,
  transformImage,
  getImageMeta,
};

import round from 'lodash/round.js';
import { loadSiteContent } from './content-storage.mjs';

/**
 * Handle image request
 *
 * @param  {Request} req
 * @param  {Response} res
 * @param  {function} next
 */
async function handleImageRequest(req, res, next) {
  try {
    const { site } = req;
    const { hash, filename = '' } = req.params;
    const { content, meta } = await loadSiteContent(site, 'images', hash);
    const dot = filename.lastIndexOf('.');
    const filters = (dot !== -1) ? filename.substr(0, dot) : filename;
    let format = (dot !== -1) ? filename.substr(dot + 1) : meta.format;
    if (format === 'jpg') {
      format = 'jpeg';
    }
    let buffer = content;
    if (meta.format !== format || filters) {
      buffer = await transformImage(buffer, filters, format);
    }
    res.type(`image/${format}`);
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
 * @param  {string} filters
 * @param  {string} format
 *
 * @return {Buffer}
 */
async function transformImage(buffer, filters, format) {
  if (format === 'svg') {
    return transformSVGDocument(buffer, filters);
  } else {
    return transformRasterImage(buffer, filters, format);
  }
}

/**
 * Apply filters on an image
 *
 * @param  {Buffer} buffer
 * @param  {string} filters
 * @param  {string} format
 *
 * @return {Buffer}
 */
async function transformRasterImage(buffer, filters, format) {
  const { default: createImage } = await import('sharp');
  const image = createImage(buffer);
  image.settings = {
    quality: 90,
    lossless: false,
  };
  image.rotate();
  applyOperators(image, sharpOperators, filters);
  const quality = image.settings.quality;
  const lossless = image.settings.lossless;
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
 * @param  {string} filters
 *
 * @return {Buffer}
 */
async function transformSVGDocument(buffer, filters) {
  // parse the XML doc
  const { default: SVGSON } = await import('svgson');
  const svg = await SVGSON.parse(buffer.toString());
  if (svg.name === 'svg') {
    // see what changes are needed
    const params = {};
    applyOperators(params, svgOperators, filters);
    // get the dimensions first
    let { width, height, viewBox } = extractSVGMeta(svg);

    if (params.crop) {
      const vbScaleX = viewBox[2] / width;
      const vbScaleY = viewBox[3] / height;
      const vbPrecision = Math.max(0, Math.round(3 - Math.log10(viewBox[2])));
      width = params.crop.width;
      height = params.crop.height;
      viewBox[0] = round(params.crop.left * vbScaleX + viewBox[0], vbPrecision);
      viewBox[1] = round(params.crop.top * vbScaleY + viewBox[1], vbPrecision);
      viewBox[2] = round(params.crop.width * vbScaleX, vbPrecision);
      viewBox[3] = round(params.crop.height * vbScaleY, vbPrecision);
    }
    if (params.width !== undefined || params.height !== undefined) {
      if (params.width && params.height === undefined) {
        height = round(height * (params.width / width));
        width = params.width;
      } else if (params.height && params.width === undefined) {
        width = round(width * (params.height / height));
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
 * Find functions for filters and call them on target
 *
 * @param  {Object} target
 * @param  {Object} operators
 * @param  {string} filters
 */
function applyOperators(target, operators, filters) {
  for (let filter of filters.split(/[ +]/)) {
    let cmd = '';
    const args = [];
    const regExp = /(\D+)(\d*)/g;
    let m;
    while(m = regExp.exec(filter)) {
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
          operator.apply(target, args);
          break;
        }
      }
    }
  }
}

const sharpOperators = {
  background: function(r, g, b, a) {
    this.background(r / 100, g / 100, b / 100, a / 100);
  },
  blur: function(sigma) {
    this.blur(sigma / 10 || 0.3)
  },
  crop: function(left, top, width, height) {
    this.extract({ left, top, width, height });
  },
  extract: function(channel) {
    this.extractChannel(channel);
  },
  flatten: function() {
    this.flatten();
  },
  flip: function() {
    this.flip();
  },
  flop: function() {
    this.flop();
  },
  height: function(height) {
    this.resize(null, height);
  },
  gamma: function(gamma) {
    this.gamma(gamma / 10 || 2.2);
  },
  grayscale: function() {
    this.grayscale();
  },
  negate: function() {
    this.negate();
  },
  normalize: function() {
    this.normalize();
  },
  lossless: function() {
    this.settings.lossless = true;
  },
  quality: function(quality) {
    if (quality) {
      this.settings.quality = quality;
    }
  },
  rotate: function(degree) {
    this.rotate(degree);
  },
  resize: function(width, height) {
    this.resize(width, height);
  },
  sharpen: function() {
    this.sharpen();
  },
  trim: function() {
    this.trim();
  },
  width: function(width) {
    this.resize(width, null);
  },
};

// current implementation is fairly limited
const svgOperators = {
  crop: function(left, top, width, height) {
    this.crop = { left, top, width, height };
  },
  height: function(height) {
    this.height = height;
  },
  resize: function(width, height) {
    this.width = width;
    this.height = height;
  },
  width: function(width) {
    this.width = width;
  },
};

process.env.VIPS_WARNING = false;

export {
  handleImageRequest,
  transformImage,
  getImageMeta,
};

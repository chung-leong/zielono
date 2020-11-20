import includes from 'lodash/includes.js';
import isEmpty from 'lodash/isEmpty.js';
import toLower from 'lodash/toLower.js';
import round from 'lodash/round.js';
import floor from 'lodash/round.js';
import ExcelJS from 'exceljs'; const { ValueType } = ExcelJS;

/**
 * Extract and translate Excel styling info into CSS
 *
 * @param  {Cell} cell
 *
 * @return {object|undefined}
 */
function extractCellStyle(cell) {
  const style = {};
  addAlignment(style, cell);
  addBorder(style, cell);
  addFill(style, cell);
  addFont(style, cell);
  if(!isEmpty(style)) {
    return style;
  }
}

/**
 * Extract Rich text, translating style info into CSS
 *
 * @param  {object[]} richText
 *
 * @return {object[]}
 */
function extractRichText(richText) {
  const newSegments = [];
  for (let segment of richText) {
    const style = {};
    addFont(style, segment);
    const newSegment = { text: segment.text };
    if (!isEmpty(style)) {
      newSegment.style = style;
    }
    newSegments.push(newSegment);
  }
  return newSegments;
}

/**
 * Attach rules controlling cell alignment to style object
 *
 * @param  {object} style
 * @param  {Cell} cell
 */
function addAlignment(style, cell) {
  const { horizontal, vertical, indent } = cell.alignment || {};
  let textAlign = getDefaultAlignment(cell), verticalAlign = 'bottom';
  if (horizontal && horizontal !== 'general') {
    textAlign = horizontal;
  }
  if (vertical) {
    verticalAlign = vertical;
  }
  if (textAlign !== 'left' && textAlign !== undefined) {
    style.textAlign = textAlign;
  }
  if (verticalAlign !== 'top') {
    style.verticalAlign = verticalAlign;
  }
  if (indent) {
    style.paddingLeft = `${indent * 10}pt`;
  }
}

/**
 * Return horizontal aligment used by default for given vakye tyoe
 *
 * @param  {Cell} cell
 *
 * @return {string}
 */
function getDefaultAlignment(cell) {
  const { effectiveType } = cell;
  if (effectiveType !== undefined) {
    if (effectiveType === ValueType.Number || effectiveType === ValueType.Date) {
      return 'right';
    } else {
      return 'left';
    }
  }
}

/**
 * Attach rules controlling cell borders to style object
 *
 * @param  {object} style
 * @param  {Cell} cell
 */
function addBorder(style, cell) {
  const { left, right, top, bottom } = cell.border || {};
  const leftStr = convertBorder(left);
  const rightStr = convertBorder(right);
  const topStr = convertBorder(top);
  const bottomStr = convertBorder(bottom);
  if (leftStr === rightStr && leftStr === topStr && leftStr === bottomStr) {
    if (leftStr) {
      style.border = leftStr;
    }
  } else {
    if (leftStr) {
      style.borderLeft = leftStr;
    }
    if (rightStr) {
      style.borderRight = rightStr;
    }
    if (topStr) {
      style.borderTop = topStr;
    }
    if (bottomStr) {
      style.borderBottom = bottomStr;
    }
  }
}

function convertBorder(border) {
  if (border) {
    const { style, color } = border;
    const colorStr = convertColor(color) || '#000000';
    let type = 'solid', thickness = '1px';
    switch (style) {
      case 'dotted':
      case 'dashed':
      case 'double':
        type = style;
        break;
      case 'thin':
        break;
      case 'thick':
        thickness = '3px';
        break;
      case 'hair':
        thickness = '0.5px';
        break;
      case 'mediumDashed':
        type = 'dashed';
        thickness = '3px';
        break;
    }
    return `${thickness} ${type} ${colorStr}`;
  }
}

/**
 * Convert a color object into a CSS-compatible string
 *
 * @param  {object} color
 *
 * @return {string|undefined}
 */
function convertColor(color) {
  const argb = extractColor(color);
  return stringifyARGB(argb);
}

/**
 * Extract ARGB values from a color object
 *
 * @param  {object} color
 *
 * @return {object|undefined}
 */
function extractColor(color) {
  if (color) {
    let argb;
    if (color.argb) {
      return parseARGB(color.argb);
    } else if (color.theme !== undefined) {
      return getThemeColor(color.theme, color.tint);
    } else if (color.indexed) {
      return getIndexedColor(color.indexed);
    }
  }
}

/**
 * Attach rules controlling cell background to style object
 *
 * @param  {object} style
 * @param  {Cell} cell
 */
function addFill(style, cell) {
  const { type, pattern, fgColor } = cell.fill || {};
  if (type === 'pattern' && pattern === 'solid') {
    const colorStr = convertColor(fgColor);
    if (colorStr) {
      style.backgroundColor = colorStr;
    }
  }
}

/**
 * Attach rules controlling font to style object
 *
 * @param  {object} style
 * @param  {Cell} cell
 */
function addFont(style, cell) {
  const defaultFontNames = [ 'Calibri', 'Arial' ];
  const defaultFontSizes = [ 10, 11 ];
  const defaultTextColor = '#000000';
  const { name, size, color, italic, underline, bold } = cell.font || {};
  // don't apply the font when it's the default
  if (name && !includes(defaultFontNames, name)) {
    style.fontFamily = name;
  }
  // don't apply font size when it's the default used by Excel (or LibreOffice)
  if (size && !includes(defaultFontSizes, size)) {
    style.fontSize = size + 'pt';
  }
  const colorStr = convertColor(color);
  if (colorStr && colorStr !== defaultTextColor) {
    style.color = colorStr;
  }
  if (italic) {
    style.fontStyle = 'italic';
  }
  if (bold) {
    style.fontWeight = 'bold';
  }
  if (underline) {
    style.textDecoration = 'underline';
  }
}

/**
 * Return a color by name (or index expressed as a name)
 *
 * @param  {string} name
 *
 * @return {object|undefined}
 */
function getNamedColor(name) {
  const namedColorIndices = {
    black: 1,
    white: 2,
    red: 3,
    green: 4,
    blue: 5,
    yellow: 6,
    magenta: 7,
    cyan: 8,
  };
  let index = namedColorIndices[toLower(name)];
  if (!index) {
    index = parseInt(name);
  }
  return getIndexedColor(index);
}

/**
 * Return an indexed Excel color
 *
 * @param  {number} index
 *
 * @return {object|undefined}
 */
function getIndexedColor(index) {
  const indexedColors = [
    undefined,
    { a: 0xff, r: 0x00, g: 0x00, b: 0x00 },
    { a: 0xff, r: 0xff, g: 0xff, b: 0xff },
    { a: 0xff, r: 0xff, g: 0x00, b: 0x00 },
    { a: 0xff, r: 0x00, g: 0xff, b: 0x00 },
    { a: 0xff, r: 0x00, g: 0x00, b: 0xff },
    { a: 0xff, r: 0xff, g: 0xff, b: 0x00 },
    { a: 0xff, r: 0xff, g: 0x00, b: 0xff },
    { a: 0xff, r: 0x00, g: 0xff, b: 0xff },
    { a: 0xff, r: 0x80, g: 0x00, b: 0x00 },
    { a: 0xff, r: 0x00, g: 0x80, b: 0x00 },
    { a: 0xff, r: 0x00, g: 0x00, b: 0x80 },
    { a: 0xff, r: 0x80, g: 0x80, b: 0x00 },
    { a: 0xff, r: 0x80, g: 0x00, b: 0x80 },
    { a: 0xff, r: 0x00, g: 0x80, b: 0x80 },
    { a: 0xff, r: 0xc0, g: 0xc0, b: 0xc0 },
    { a: 0xff, r: 0x80, g: 0x80, b: 0x80 },
    { a: 0xff, r: 0x99, g: 0x99, b: 0xff },
    { a: 0xff, r: 0x99, g: 0x33, b: 0x66 },
    { a: 0xff, r: 0xff, g: 0xff, b: 0xcc },
    { a: 0xff, r: 0xcc, g: 0xff, b: 0xff },
    { a: 0xff, r: 0x66, g: 0x00, b: 0x66 },
    { a: 0xff, r: 0xff, g: 0x80, b: 0x80 },
    { a: 0xff, r: 0x00, g: 0x66, b: 0xcc },
    { a: 0xff, r: 0xcc, g: 0xcc, b: 0xff },
    { a: 0xff, r: 0x00, g: 0x00, b: 0x80 },
    { a: 0xff, r: 0xff, g: 0x00, b: 0xff },
    { a: 0xff, r: 0xff, g: 0xff, b: 0x00 },
    { a: 0xff, r: 0x00, g: 0xff, b: 0xff },
    { a: 0xff, r: 0x80, g: 0x00, b: 0x80 },
    { a: 0xff, r: 0x80, g: 0x00, b: 0x00 },
    { a: 0xff, r: 0x00, g: 0x80, b: 0x80 },
    { a: 0xff, r: 0x00, g: 0x00, b: 0xff },
    { a: 0xff, r: 0x00, g: 0xcc, b: 0xff },
    { a: 0xff, r: 0xcc, g: 0xff, b: 0xff },
    { a: 0xff, r: 0xcc, g: 0xff, b: 0xcc },
    { a: 0xff, r: 0xff, g: 0xff, b: 0x99 },
    { a: 0xff, r: 0x99, g: 0xcc, b: 0xff },
    { a: 0xff, r: 0xff, g: 0x99, b: 0xcc },
    { a: 0xff, r: 0xcc, g: 0x99, b: 0xff },
    { a: 0xff, r: 0xff, g: 0xcc, b: 0x99 },
    { a: 0xff, r: 0x33, g: 0x66, b: 0xff },
    { a: 0xff, r: 0x33, g: 0xcc, b: 0xcc },
    { a: 0xff, r: 0x99, g: 0xcc, b: 0x00 },
    { a: 0xff, r: 0xff, g: 0xcc, b: 0x00 },
    { a: 0xff, r: 0xff, g: 0x99, b: 0x00 },
    { a: 0xff, r: 0xff, g: 0x66, b: 0x00 },
    { a: 0xff, r: 0x66, g: 0x66, b: 0x99 },
    { a: 0xff, r: 0x96, g: 0x96, b: 0x96 },
    { a: 0xff, r: 0x00, g: 0x33, b: 0x66 },
    { a: 0xff, r: 0x33, g: 0x99, b: 0x66 },
    { a: 0xff, r: 0x00, g: 0x33, b: 0x00 },
    { a: 0xff, r: 0x33, g: 0x33, b: 0x00 },
    { a: 0xff, r: 0x99, g: 0x33, b: 0x00 },
    { a: 0xff, r: 0x99, g: 0x33, b: 0x66 },
    { a: 0xff, r: 0x33, g: 0x33, b: 0x99 },
    { a: 0xff, r: 0x33, g: 0x33, b: 0x33 },
  ];
  return indexedColors[index];
}

/**
 * Return a color from a theme, with optional tinting
 *
 * @param  {number} theme
 * @param  {number} tint
 *
 * @return {object|undefined}
 */
function getThemeColor(theme, tint) {
  const themeColors = [
    { a: 0xff, r: 0xff, g: 0xff, b: 0xff },   // lt1
    { a: 0xff, r: 0x00, g: 0x00, b: 0x00 },   // dk1
    { a: 0xff, r: 0xe7, g: 0xe6, b: 0xe6 },   // lt2
    { a: 0xff, r: 0x44, g: 0x54, b: 0x6a },   // dk2
    { a: 0xff, r: 0x44, g: 0x72, b: 0xc4 },   // accent1
    { a: 0xff, r: 0xed, g: 0x7d, b: 0x31 },   // acentt2
    { a: 0xff, r: 0xa5, g: 0xa5, b: 0xa5 },   // accent3
    { a: 0xff, r: 0xff, g: 0xc0, b: 0x00 },   // accent4
    { a: 0xff, r: 0x5b, g: 0x9b, b: 0xd5 },   // accent5
    { a: 0xff, r: 0x70, g: 0xad, b: 0x47 },   // accent6
    { a: 0xff, r: 0x05, g: 0x63, b: 0xc1 },   // hlink
    { a: 0xff, r: 0x95, g: 0x4f, b: 0x72 }    // folHlink
  ];
  let argb = themeColors[theme];
  if (argb) {
    if (tint) {
      argb = {
        a: applyTint(argb.a, tint),
        r: applyTint(argb.r, tint),
        g: applyTint(argb.g, tint),
        b: applyTint(argb.b, tint),
      };
    }
    return argb;
  }
}

/**
 * Helper function that apply a tint to a ARGB channel
 *
 * @param  {number} n
 * @param  {number} tint
 *
 * @return {number}
 */
function applyTint(n, tint) {
  if (tint > 0) {
    n = n + (255 - n) * tint;
  } else {
    n = n + n * tint;
  }
  if (n > 255) {
    n = 255;
  } else if (n < 0) {
    n = 0;
  } else {
    n = round(n);
  }
  return n;
}

/**
 * Parse a string representation of an ARGB color
 *
 * @param  {string} s
 * @return {object|undefined}
 */
function parseARGB(s) {
  if (typeof(s) === 'string') {
    if (s.charAt(0) === '#') {
      s = s.substr(1);
    }
    const a = parseInt(s.substr(0, 2), 16);
    const r = parseInt(s.substr(2, 2), 16);
    const g = parseInt(s.substr(4, 2), 16);
    const b = parseInt(s.substr(6, 2), 16);
    return { a, r, g, b };
  }
}

/**
 * Return string representation of a color specified as ARGB
 *
 * @param  {object} argb
 *
 * @return {string}
 */
function stringifyARGB(argb) {
  if (argb) {
    const { a, r, g, b } = argb;
    if (a === 255) {
      return `#${hex(r)}${hex(g)}${hex(b)}`;
    } else {
      return `rgba(${r}, ${g}, ${b}, ${round(a / 255, 2)})`;
    }
  }
}

/**
 * Helper function that returns a zero-padded, hexadecimal  number
 *
 * @param  {string} n
 *
 * @return {string}
 */
function hex(n) {
  let hex = floor(n).toString(16);
  if (hex.length < 2) {
    hex = '0' + hex;
  }
  return hex;
}

/**
 * Apply CSS style to contents
 *
 * @param  {object} contents
 * @param  {object} style
 */
function applyStyle(contents, style) {
  if (style) {
    if (contents.style) {
      for (let name in style) {
        contents.style[name] = style[name];
      }
    } else {
      contents.style = style;
    }
  }
}

export {
  extractCellStyle,
  extractRichText,
  extractColor,
  getNamedColor,
  getIndexedColor,
  getThemeColor,
  parseARGB,
  stringifyARGB,
  applyStyle,
};

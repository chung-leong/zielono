import Lodash from 'lodash'; const { includes, isEmpty, round, toLower } = Lodash;
import ExcelJS from 'exceljs'; const { ValueType } = ExcelJS;

function extractCellStyle(cell) {
  const style = {};
  applyAlignment(style, cell);
  applyBorder(style, cell);
  applyFill(style, cell);
  applyFont(style, cell);
  return style;
}

function extractRichText(richText) {
  const newSegments = [];
  for (let segment of richText) {
    const style = {};
    applyFont(style, segment);
    const newSegment = { text: segment.text };
    if (!isEmpty(style)) {
      newSegment.style = style;
    }
    newSegments.push(newSegment);
  }
  return newSegments;
}

function applyAlignment(style, cell) {
  const { horizontal, vertical, indent } = cell.alignment || {};
  let textAlign = getDefaultAlignment(cell), verticalAlign = 'bottom';
  if (horizontal && horizontal !== 'general') {
    textAlign = horizontal;
  }
  if (vertical) {
    verticalAlign = vertical;
  }
  if (textAlign !== 'left') {
    style.textAlign = textAlign;
  }
  if (verticalAlign !== 'top') {
    style.verticalAlign = verticalAlign;
  }
  if (indent) {
    style.paddingLeft = `${indent * 10}pt`;
  }
}

function getDefaultAlignment(cell) {
  const { effectiveType } = cell;
  if (effectiveType === ValueType.Number || effectiveType === ValueType.Date) {
    return 'right';
  } else {
    return 'left';
  }
}

function applyBorder(style, cell) {
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
        type = 'dotted';
        break;
      case 'mediumDashed':
        type = 'dashed';
        thickness = '3px';
        break;
    }
    return `${type} ${thickness} ${colorStr}`;
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
  if (color) {
    const { argb, theme, tint } = color;
    if (argb) {
      const alpha255 = parseInt(argb.substr(0, 2), 16);
      if (alpha255 === 255) {
        return '#' + toLower(argb.substr(2));
      } else {
        const r = parseInt(argb, argb.substr(2, 2), 16);
        const g = parseInt(argb, argb.substr(4, 2), 16);
        const b = parseInt(argb, argb.substr(6, 2), 16);
        const a = round(alpha255 / 255, 2);
        return `rgba(${r},${g},${b},${a})`;
      }
    } else if (theme !== undefined) {
      return getThemeColor(theme, tint);
    }
  }
}

function applyFill(style, cell) {
  const { type, pattern, fgColor } = cell.fill || {};
  if (type === 'pattern' && pattern === 'solid') {
    const colorStr = convertColor(fgColor);
    if (colorStr) {
      style.backgroundColor = colorStr;
    }
  }
}

const defaultFontNames = [ 'Calibri', 'Arial' ];
const defaultFontSizes = [ 10, 11 ];
const defaultColor = '#000000';

function applyFont(style, cell) {
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
  if (colorStr && colorStr !== defaultColor) {
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

const indexedColors = [
  '',
  '#000000',
  '#ffffff',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#800000',
  '#008000',
  '#000080',
  '#808000',
  '#800080',
  '#008080',
  '#c0c0c0',
  '#808080',
  '#9999ff',
  '#993366',
  '#ffffcc',
  '#ccffff',
  '#660066',
  '#ff8080',
  '#0066cc',
  '#ccccff',
  '#000080',
  '#ff00ff',
  '#ffff00',
  '#00ffff',
  '#800080',
  '#800000',
  '#008080',
  '#0000ff',
  '#00ccff',
  '#ccffff',
  '#ccffcc',
  '#ffff99',
  '#99ccff',
  '#ff99cc',
  '#cc99ff',
  '#ffcc99',
  '#3366ff',
  '#33cccc',
  '#99cc00',
  '#ffcc00',
  '#ff9900',
  '#ff6600',
  '#666699',
  '#969696',
  '#003366',
  '#339966',
  '#003300',
  '#333300',
  '#993300',
  '#993366',
  '#333399',
  '#333333',
];

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

function getNamedColor(name) {
  let index = namedColorIndices[toLower(name)];
  if (!index) {
    index = parseInt(name);
  }
  return indexedColors[index];
}

function getIndexedColor(index) {
  return indexedColors[index];
}

const themeColors = [
  [ 0xff, 0xff, 0xff ],   // lt1
  [ 0x00, 0x00, 0x00 ],   // dk1
  [ 0xe7, 0xe6, 0xe6 ],   // lt2
  [ 0x44, 0x54, 0x6a ],   // dk2
  [ 0x44, 0x72, 0xc4 ],   // accent1
  [ 0xed, 0x7d, 0x31 ],   // acentt2
  [ 0xa5, 0xa5, 0xa5 ],   // accent3
  [ 0xff, 0xc0, 0x00 ],   // accent4
  [ 0x5b, 0x9b, 0xd5 ],   // accent5
  [ 0x70, 0xad, 0x47 ],   // accent6
  [ 0x05, 0x63, 0xc1 ],   // hlink
  [ 0x95, 0x4f, 0x72 ]    // folHlink
];

function getThemeColor(theme, tint) {
  const rgb = themeColors[theme];
  if (rgb) {
    //console.log(theme, rgb, tint);
    const hexes = rgb.map((n) => {
      if (tint > 0) {
        n = Math.round(n + (255 - n) * tint);
        n = Math.min(255, n);
      } else if (tint < 0) {
        n = Math.round(n * (1 + tint));
        n = Math.max(0, n);
      }
      let hex = n.toString(16);
      if (hex.length < 2) {
        hex = '0' + hex;
      }
      return hex;
    });
    return '#' + hexes.join('');
  }
}

export {
  extractCellStyle,
  extractRichText,
  getNamedColor,
  getIndexedColor,
  getThemeColor,
};

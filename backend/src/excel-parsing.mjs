import trim from 'lodash/trim.js';
import camelCase from 'lodash/camelCase.js';
import split from 'lodash/split.js';
import filter from 'lodash/filter.js';
import isEmpty from 'lodash/isEmpty.js';
import ExcelJS from 'exceljs'; const { Workbook, ValueType } = ExcelJS;
import { formatValue } from './excel-formatting.mjs';
import { extractCellStyle, extractRichText } from './excel-styling.mjs';
import { ExcelConditionalStyling } from './excel-styling-conditional.mjs';
import BaseXform from 'exceljs/lib/xlsx/xform/base-xform.js';
import CfvoXform from 'exceljs/lib/xlsx/xform/sheet/cf/cfvo-xform.js';

/**
 * Parse an Excel file
 *
 * @param  {Buffer} buffer
 *
 * @return {object}
 */
async function parseExcelFile(buffer) {
  const workbook = new Workbook;
  await workbook.xlsx.load(buffer);
  const keywords = extractKeywords(workbook.keywords);
  const title = trim(workbook.title);
  const description = trim(workbook.description);
  const subject = trim(workbook.subject);
  const sheets = [];
  for (let worksheet of workbook.worksheets) {
    const sheet = await parseExcelWorksheet(worksheet);
    if (sheet) {
      sheets.push(sheet);
    }
  }
  return { title, subject, description, keywords, sheets };
}

/**
 * Parse an Excel worksheet
 *
 * @param  {Worksheet} worksheet
 *
 * @return {(object|undefined)}
 */
async function parseExcelWorksheet(worksheet) {
  const { state, rowCount, columnCount } = worksheet;
  const sheetNameFlags = extractNameFlags(worksheet.name);
  if (state === 'visible' && sheetNameFlags) {
    // find images used in worksheet first
    const worksheetImages = worksheet.getImages();
    const media = {};
    if (worksheetImages) {
      for (let worksheetImage of worksheetImages) {
        // the anchor of the image (top left corner)
        const { nativeCol, nativeRow } = worksheetImage.range.tl;
        const c = nativeCol + 1;
        const r = nativeRow + 1;
        const workbookImage = worksheet.workbook.getImage(worksheetImage.imageId);
        media[`${c}:${r}`] = workbookImage;
      }
    }
    const conditionalStyling = new ExcelConditionalStyling(worksheet);
    // process the cells
    const columns = [];
    const rows = [];
    const isUsing = {};
    for (let r = 1; r <= rowCount; r++) {
      const worksheetRow = worksheet.getRow(r);
      if (!worksheetRow.hasValues) {
        continue;
      }
      if (r === 1) {
        // use first row as column names
        for (let c = 1; c <= columnCount; c++) {
          const worksheetCell = worksheetRow.getCell(c);
          const columnNameFlags = extractNameFlags(worksheetCell.text);
          if (columnNameFlags) {
            const column = columnNameFlags;
            columns.push(column);
            isUsing[c] = true;
          }
        }
        if (columns.length === 0) {
          break;
        }
      } else {
        // all the remaining rows as treated as data rows
        const row = [];
        for (let c = 1; c <= columnCount; c++) {
          if (isUsing[c]) {
            const worksheetCell = worksheetRow.getCell(c);
            const contents = extractCellContents(worksheetCell, media[`${c}:${r}`]);
            row.push(contents);
            conditionalStyling.check(worksheetCell, contents);
          }
        }
        rows.push(row);
      }
    }
    // apply conditional styling
    conditionalStyling.apply();
    // don't return empty sheets
    if (columns.length > 0) {
      return { ...sheetNameFlags, columns, rows };
    }
  }
}

/**
 * Extract keywords from a text string
 *
 * @param  {string} text
 *
 * @return {string[]}
 */
function extractKeywords(text) {
  const trimmed = trim(text);
  const keywords = filter(split(trimmed, /\s*,\s*|\s+/));
  return keywords;
}

/**
 * Extract name and possible flags enclosed in parentheses
 *
 * @param  {string} text
 *
 * @return {(object|undefined)}
 */
function extractNameFlags(text) {
  const trimmed = trim(text);
  if (trimmed) {
    // look for text in parentheses
    const m = /\s*\(([^\)]+)\)$/.exec(trimmed);
    const results = {};
    if (m) {
      const name = trimmed.substr(0, trimmed.length - m[0].length);
      const nameCC = camelCase(name);
      const flags = split(m[1], /\s*,\s*/);
      return { name, nameCC, flags };
    } else {
      const nameCC = camelCase(trimmed);
      return { name: trimmed, nameCC };
    }
  }
}

/**
 * Extract value from a cell in a worksheet
 *
 * @param  {Cell} worksheetCell
 * @param  {(Image|undefined)} media
 *
 * @return {(object|string)}
 */
function extractCellContents(worksheetCell, media) {
  // extract style
  const style = extractCellStyle(worksheetCell);
  // get the cell's value and determine what to use for formatting purpose
  const { type, effectiveType, numFmt } = worksheetCell;
  let effectiveValue = (type === ValueType.Formula) ? worksheetCell.result : worksheetCell.value;
  let formattingValue = effectiveValue;
  if (effectiveType === ValueType.RichText) {
    // use plain text
    formattingValue = worksheetCell.text;
    effectiveValue = extractRichText(effectiveValue.richText);
  } else if (effectiveType === ValueType.Hyperlink) {
    // use display text
    formattingValue = worksheetCell.text;
  } else if (effectiveType === ValueType.Null) {
    // treat as 0
    formattingValue = 0;
  }
  // apply formatting if there's one
  const contents = {};
  if (numFmt && numFmt !== '@') {
    try {
      // need locale
      const result = formatValue(formattingValue, numFmt, {});
      if (result.color) {
        style.color = result.color;
      }
      contents.text = result.text;
    } catch (e) {
      // probably a type mismatch error
    }
  }
  contents.value = effectiveValue;
  if (!isEmpty(style)) {
    contents.style = style;
  }
  // attach image
  if (media && media.type === 'image') {
    contents.image = media;
  }
  return contents;
}

function adjustDate(date) {
  const offset = date.getTimezoneOffset();
  return (offset) ? new Date(date.getTime() + offset * 60 * 1000) : date;
}

// hot-patch bug in ExcelJS
CfvoXform.prototype.parseOpen = function(node) {
  const value = BaseXform.toFloatValue(node.attributes.val);
  this.model = {
    type: node.attributes.type,
    value: !isNaN(value) ? value : node.attributes.val,
  };
};

export {
  parseExcelFile,
  extractKeywords,
  extractNameFlags,
  adjustDate,
};

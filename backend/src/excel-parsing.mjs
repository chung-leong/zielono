import trim from 'lodash/trim.js';
import camelCase from 'lodash/camelCase.js';
import split from 'lodash/split.js';
import filter from 'lodash/filter.js';
import ExcelJS from 'exceljs'; const { Workbook, ValueType } = ExcelJS;
import { formatValue } from './excel-formatting.mjs';
import { extractCellStyle, extractRichText, applyStyle } from './excel-styling.mjs';
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
    // TODO: need locale
    const conditionalStyling = new ExcelConditionalStyling(worksheet, {});
    // process the cells
    const columns = [];
    const rows = [];
    const isUsing = {};
    let lowestNonEmptyRow = 1;
    for (let r = 1; r <= rowCount; r++) {
      const worksheetRow = worksheet.getRow(r);
      if (r === 1) {
        // use first row as column names
        for (let c = 1; c <= columnCount; c++) {
          const workshetColumn = worksheet.getColumn(c);
          if (workshetColumn.hidden) {
            continue;
          }
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
        if (worksheetRow.hidden) {
          // skip hidden rows
          continue;
        }
        if (worksheetRow.hasValues) {
          const prevNonEmptyRow = lowestNonEmptyRow;
          if (r > lowestNonEmptyRow) {
            lowestNonEmptyRow = r;
            if (r !== prevNonEmptyRow + 1) {
              // go back and process the empty rows above this one
              r = prevNonEmptyRow;
              continue;
            }
          }
        } else {
          if (r > lowestNonEmptyRow) {
            // don't process an empty row unless there's something beneath it
            continue;
          }
        }
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
  const contents = {};
  // extract style
  const style = extractCellStyle(worksheetCell);
  if (style) {
    contents.style = style;
  }
  // get the cell's value
  const { type, effectiveType, numFmt } = worksheetCell;
  let value = (type === ValueType.Formula) ? worksheetCell.result : worksheetCell.value;
  if (value instanceof Date) {
    // reinterpret time as local time
    value = adjustDate(value);
  } else if (effectiveType === ValueType.RichText) {
    value = extractRichText(value.richText);
  }
  contents.value = value;
  // apply formatting
  try {
    // TODO: need locale
    const result = formatValue(value, numFmt, {});
    if (result) {
      applyStyle(contents, result.style);
      contents.text = result.text;
    }
  } catch (e) {
    // probably a type mismatch error
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
  const  { type, val, gte } = node.attributes;
  let value = BaseXform.toFloatValue(val);
  if (isNaN(value)) {
    value = val;
  }
  this.model = { type, value };
  if (gte !== undefined) {
    this.model.gte = (gte === '0');
  }
};

export {
  parseExcelFile,
  extractKeywords,
  extractNameFlags,
  adjustDate,
};

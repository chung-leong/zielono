import trim from 'lodash/trim.js';
import camelCase from 'lodash/camelCase.js';
import split from 'lodash/split.js';
import filter from 'lodash/filter.js';
import ExcelJS from 'exceljs'; const { Workbook, ValueType } = ExcelJS;
import './exceljs-patching.mjs';
import { formatValue } from './excel-formatting.mjs';
import { extractCellStyle, extractRichText, applyStyle } from './excel-styling.mjs';
import { ExcelConditionalStyling } from './excel-styling-conditional.mjs';
import { setTimeZone, restoreTimeZone } from './time-zone-management.mjs';

/**
 * Parse an Excel file
 *
 * @param  {Buffer} buffer
 * @param  {object} options
 *
 * @return {object}
 */
async function parseExcelFile(buffer, options) {
  const workbook = new Workbook;
  await workbook.xlsx.load(buffer);
  const keywords = extractKeywords(workbook.keywords);
  const title = trim(workbook.title);
  const description = trim(workbook.description);
  const subject = trim(workbook.subject);
  const sheets = [];
  for (let worksheet of workbook.worksheets) {
    const sheet = await parseExcelWorksheet(worksheet, options);
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
 * @param  {object} options
 *
 * @return {(object|undefined)}
 */
async function parseExcelWorksheet(worksheet, options) {
  const { state, rowCount, columnCount } = worksheet;
  const { locale, timeZone } = options;
  const sheetNameFlags = extractNameFlags(worksheet.name);
  if (state === 'visible' && sheetNameFlags) {
    // set time zone so dates are interpreted correctly
    setTimeZone(timeZone);
    // find images used in worksheet first
    const wsImages = worksheet.getImages();
    const wsMedia = {};
    if (wsImages) {
      for (let wsImage of wsImages) {
        // the anchor of the image (top left corner)
        const { nativeCol, nativeRow } = wsImage.range.tl;
        const c = nativeCol + 1;
        const r = nativeRow + 1;
        const workbookImage = worksheet.workbook.getImage(wsImage.imageId);
        wsMedia[`${c}:${r}`] = workbookImage;
      }
    }
    const conditionalStyling = new ExcelConditionalStyling(worksheet, { locale });
    // process the cells
    const columns = [];
    const rows = [];
    const isUsing = {};
    let lowestNonEmptyRow = 1;
    for (let r = 1; r <= rowCount; r++) {
      const wsRow = worksheet.getRow(r);
      if (r === 1) {
        // use first row as column names
        for (let c = 1; c <= columnCount; c++) {
          const workshetColumn = worksheet.getColumn(c);
          if (workshetColumn.hidden) {
            continue;
          }
          const wsCell = wsRow.getCell(c);
          const columnNameFlags = extractNameFlags(wsCell.text);
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
        // all the remaining rows are treated as data rows
        if (wsRow.hidden) {
          // skip hidden rows
          continue;
        }
        if (wsRow.hasValues) {
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
            const wsCell = wsRow.getCell(c);
            const media = wsMedia[`${c}:${r}`];
            const contents = extractCellContents(wsCell, media, { locale });
            row.push(contents);
            conditionalStyling.check(wsCell, contents);
          }
        }
        rows.push(row);
      }
    }
    // apply conditional styling
    conditionalStyling.apply();
    // restore time zone
    restoreTimeZone();
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
 * @param  {Cell} wsCell
 * @param  {(Image|undefined)} media
 * @param  {object} options
 *
 * @return {(object|string)}
 */
function extractCellContents(wsCell, media, options) {
  const { locale } = options;
  const contents = {};
  // extract style
  const style = extractCellStyle(wsCell, true);
  if (style) {
    contents.style = style;
  }
  // get the cell's value
  const { type, effectiveType, numFmt } = wsCell;
  let value = (type === ValueType.Formula) ? wsCell.result : wsCell.value;
  if (value instanceof Date) {
    // reinterpret time as local time
    value = reinterpretDate(value);
  } else if (effectiveType === ValueType.RichText) {
    value = extractRichText(value.richText);
  }
  contents.value = value;
  // apply formatting
  try {
    const result = formatValue(value, numFmt, { locale });
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

/**
 * Reinterpret a date as being in the current time zone
 *
 * Example: '12:45:00 GMT' -> '12:45:00 CET'
 *
 * @param  {Date} date
 *
 * @return {Date}
 */
function reinterpretDate(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const milliseconds = date.getUTCMilliseconds();
  return new Date(year, month, day, hours, minutes, seconds, milliseconds);
}

export {
  parseExcelFile,
  extractKeywords,
  extractNameFlags,
  reinterpretDate,
};

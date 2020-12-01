import camelCase from 'lodash/camelCase.js';
import ExcelJS from 'exceljs'; const { Workbook, ValueType } = ExcelJS;
import './exceljs-patching.mjs';
import colCache from 'exceljs/lib/utils/col-cache.js';
import { Readable } from 'stream';
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
  const { omitStyle } = options;
  const workbook = new Workbook;
  await workbook.xlsx.load(buffer);
  const { keywords, title, description, subject, category } = workbook;
  const { contentStatus: status } = workbook;
  const meta = { title, subject, description, keywords, category, status };
  const sheets = [];
  let expiration;
  for (let worksheet of workbook.worksheets) {
    const sheet = await parseExcelWorksheet(worksheet, options);
    if (sheet) {
      if (sheet.expiration) {
        if (!expiration || sheet.expiration < expiration) {
          expiration = sheet.expiration;
        }
        sheet.expiration = undefined;
      }
      sheets.push(sheet);
    }
  }
  const json = { ...meta, sheets, expiration };
  if (omitStyle) {
    stripCellStyle(json);
  }
  return json;
}

/**
 * Parse an CVS file
 *
 * @param  {Buffer} buffer
 * @param  {object} options
 *
 * @return {object}
 */
async function parseCSVFile(buffer, options) {
  const { sheetName } = options;
  const workbook = new Workbook;
  const stream = Readable.from(buffer);
  await workbook.csv.read(stream, { sheetName });
  const worksheet = workbook.worksheets[0];
  const sheet = await parseExcelWorksheet(worksheet, options);
  return { sheets: [ sheet ] };
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
  const { locale, timeZone, withNames = 1 } = options;
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
    if (withNames < 1) {
      for (let c = 1; c <= columnCount; c++) {
        const wsColumn = worksheet.getColumn(c);
        if (!wsColumn.hidden) {
          const name = colCache.n2l(c);
          const column = { name };
          columns.push(column);
          isUsing[c] = true;
        }
      }
      sheetNameFlags.nameless = true;
    }
    let lowestNonEmptyRow = 1;
    for (let r = 1; r <= rowCount; r++) {
      const wsRow = worksheet.getRow(r);
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
      if (r === withNames) {
        // use the row as column names
        for (let c = 1; c <= columnCount; c++) {
          const wsColumn = worksheet.getColumn(c);
          if (wsColumn.hidden) {
            continue;
          }
          const wsCell = wsRow.getCell(c);
          const media = wsMedia[`${c}:${r}`];
          const contents = extractCellContents(wsCell, media, { locale });
          const { value, ...remaining } = contents;
          const columnNameFlags = extractNameFlags(value + '');
          if (columnNameFlags) {
            const column = { ...columnNameFlags, ...remaining };
            columns.push(column);
            isUsing[c] = true;
          }
        }
        if (columns.length === 0) {
          break;
        }
      } else if (r > withNames) {
        // all the remaining rows are treated as data rows
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
  const trimmed = (text || '').trim();
  const keywords = trimmed.split(/\s*,\s*|\s+/).filter(Boolean);
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
  const trimmed = (text || '').trim();
  if (trimmed) {
    // look for text in parentheses
    const m = /\s*\(([^\)]+)\)$/.exec(trimmed);
    const results = {};
    if (m) {
      const name = trimmed.substr(0, trimmed.length - m[0].length);
      const nameCC = camelCase(name);
      const flags = m[1].split(/\s*,\s*/);
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
 * @param  {Cell}              wsCell
 * @param  {(Image|undefined)} media
 * @param  {object}            options
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

/**
 * Remove style object from cells and columns
 *
 * @param  {Object} json
 */
function stripCellStyle(json) {
  for (let sheet of json.sheets){
    for (let column of sheet.columns) {
      if (column.style) {
        delete column.style;
      }
    }
    for (let row of sheet.rows) {
      for (let cell of row) {
        if (cell.style) {
          delete cell.style;
        }
      }
    }
  }
}

export {
  parseExcelFile,
  parseCSVFile,
  extractNameFlags,
  reinterpretDate,
  stripCellStyle,
};

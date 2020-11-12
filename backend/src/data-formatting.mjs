import Lodash from 'lodash'; const { split, toLower } = Lodash;
import { getExcelColor } from './excel-colors.mjs';
const { floor, round, abs } = Math;

function formatValue(value, formatString, options) {
  // handle conditional formatting
  const parts = split(formatString, /;/);
  let applicablePart = parts[0];
  let usingNegFormat = false, usingZeroFormat = false;
  if (typeof(value) === 'number') {
    if (value === 0 && parts.length >= 3) {
      applicablePart = parts[2];
      usingZeroFormat = true;
    } else if (value < 0 && parts.length >= 2) {
      applicablePart = parts[1];
      usingNegFormat = true;
    }
  }

  // create a closure for replacing matching patterns
  let color;
  let removeFraction = false;
  let remaining = applicablePart;
  const replacements = [];
  const find = (pattern, callback) => {
    if (remaining) {
      const m = pattern.exec(remaining);
      if (m) {
        // invoke callback, store the result, and take out the matching part
        const { index } = m;
        const result = callback(m);
        const offset = result.length - m[0].length;
        replacements.unshift({ index, offset, result });
        remaining = remaining.substr(0, index) + remaining.substr(index + m[0].length);
      }
    }
  };
  const apply = () => {
    let text = remaining;
    for (let i = 0; i < replacements.length; i++) {
      const { index, offset, result } = replacements[i];
      if (result) {
        text = text.substr(0, index) + result + text.substr(index);
      }
      if (offset !== 0) {
        // adjust changes that are behind this one
        for (let j = i + 1; j < replacements.length; j++) {
          const prev = replacements[j];
          if (prev.index > index) {
            prev.index += offset;
          }
        }
      }
    }
    return { text, color };
  };

  // find currency symbol/locale
  find(/\[\$([^-\]]*)-([0-9]+)]/, (m) => {
    return m[1];
  });
  // find color
  find(/\[(BLACK|BLUE|CYAN|GREEN|MAGENTA|RED|WHITE|YELLOW|COLOR\s*(\d\d?))\]/i, (m) => {
    color = getExcelColor(m[1] || m[0]);
    return '';
  });
  // find fraction
  find(/\?+\/[\?0-9]*/, (m) => {
    removeFraction = true;
    return formatFraction(value, m[0], options);
  });
  // find numeric
  find(/[#0](.*[#0])?/, (m) => {
    let effectiveValue = value;
    // remove fractional part if it's shown already
    if (removeFraction) {
      effectiveValue = floor(effectiveValue);
    }
    // deal with percentage
    if (applicablePart.includes('%')) {
      effectiveValue *= 100;
    }
    return formatNumber(effectiveValue, m[0], { omitSign: usingNegFormat, ...options });
  });
  // find quoted string
  find(/"(.*)"/, (m) => {
    return m[1];
  });
  return apply();
}

/**
 * Format a number in accordance to format string
 *
 * @param  {number} number
 * @param  {string} formatString
 * @param  {object} options
 *
 * @return {string}
 */
function formatNumber(number, formatString, options) {
  const { omitSign, locale } = options;
  const stringifyOptions = {
    signDisplay: (omitSign) ? 'never' : 'auto',
    useGrouping: false,
    minimumIntegerDigits: 0,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  };
  let irregular = false;
  let commaEncountered = false, periodEncountered = false;
  let zeroEncountered1 = false, zeroEncountered2 = false;
  let poundEncountered1 = false, poundEncountered2 = false;
  for (let i = 0; i < formatString.length; i++) {
    const c = formatString.charAt(i);
    if (!periodEncountered) {
      if (c === '0') {
        stringifyOptions.minimumIntegerDigits++;
        zeroEncountered1 = true;
      } else if (c === '#' && !zeroEncountered1) {
        poundEncountered1 = true;
      } else if (c === '.') {
        periodEncountered = true;
      } else if (c === ',' && !commaEncountered) {
        stringifyOptions.useGrouping = true;
        commaEncountered = true;
      } else {
        irregular = true;
        break;
      }
    } else {
      if (c === '0' && !poundEncountered2) {
        stringifyOptions.minimumFractionDigits++;
        stringifyOptions.maximumFractionDigits++;
        zeroEncountered2 = true;
      } else if (c === '#') {
        stringifyOptions.maximumFractionDigits++;
        poundEncountered2 = true;
      } else {
        irregular = true;
        break;
      }
    }
  }

  if (!irregular) {
    // we can use toLocaleString() to handle the regular case
    // function doesn't allow minimumIntegerDigits to be zero
    // we need to bump it to 1 and strip out the zero afterward
    let stripLeadingZero = false;
    if (stringifyOptions.minimumIntegerDigits === 0) {
      stringifyOptions.minimumIntegerDigits = 1;
      stripLeadingZero = true;
    }
    let res = number.toLocaleString(locale, stringifyOptions);
    if (stripLeadingZero) {
      if (res.substr(0, 1) === '0') {
        res = res.substr(1);
      } else if (res.substr(0, 2) === '-0') {
        res = (res.length > 2) ? '-' + res.substr(2) : '';
      }
    }
    return res;
  } else {
    // handle irregular patterns by first converting the number to string
    // and get the integer and fractional parts
    let numberString = number.toString();
    let addSign = false;
    if (numberString.charAt(0) === '-') {
      numberString = numberString.substr(1);
      addSign = true;
    }
    const numberParts = split(numberString, '.');
    const intPart = numberParts[0], fraPart = numberParts[1] || '';
    // break the format string into characters and count how many
    // digits are needed for the integer part and the fraction part
    const lastPeriodIndex = formatString.lastIndexOf('.');
    const chars = [];
    let intDigitCount = 0, fraDigitCount = 0;
    for (let i = 0; i < formatString.length; i++) {
      const c = formatString.charAt(i);
      chars.push(c);
      if (c === '#' || c === '0') {
        if (i < lastPeriodIndex || lastPeriodIndex === -1) {
          intDigitCount++;
        } else {
          fraDigitCount++;
        }
      }
    }
    // replace # or 0 in the pattern with digits, starting with the fractional part
    let intDigitUsed = 0, fraDigitUsed = 0;
    if (lastPeriodIndex !== -1) {
      for (let i = lastPeriodIndex + 1; i < formatString.length; i++) {
        const c = chars[i];
        if (c === '#' || c === '0') {
          let replacement = '';
          if (fraDigitUsed < fraPart.length) {
            replacement = fraPart.charAt(fraDigitUsed);
            fraDigitUsed++;
          } else if (c === '0') {
            replacement = '0';
          }
          chars[i] = replacement;
        }
      }
    }
    // handle the integer part, replacing from the decimal point if there's one
    for (let i = (lastPeriodIndex !== -1) ? lastPeriodIndex - 1 : formatString.length; i >= 0; i--) {
      const c = chars[i];
      if (c === '#' || c === '0') {
        let replacement = '';
        if (intDigitUsed < intPart.length) {
          if (intDigitUsed + 1 < intDigitCount) {
            replacement = intPart.charAt(intPart.length - intDigitUsed - 1);
          } else {
            // the last digit--include all remaining digits
            replacement = intPart.substr(0, intPart.length - intDigitUsed);
            // include sign as well unless it's begin omitted
            if (!omitSign && addSign) {
              replacement = '-' + replacement;
            }
          }
          intDigitUsed++;
        } else if (c === '0') {
          replacement = '0';
        }
        chars[i] = replacement;
      }
    }
    return chars.join('');
  }
}

/**
 * Format the fractional part of number as a fraction
 *
 * @param  {number} number
 * @param  {string} formatString
 * @param  {object} options
 *
 * @return {string}
 */
function formatFraction(number, formatString) {
  const [ nomPart, demPart ] = split(formatString, '/');
  const dem = parseInt(demPart);
  if (dem > 0) {
    const whole = floor(number);
    const x = number - whole;
    const nom = round(x * dem);
    return (nom) ? `${nom}/${dem}` : '';
  } else {
    const { nom, dem } = findFraction(number, demPart.length);
    return (dem) ? `${nom}/${dem}` : '';
  }
}

/**
 * Find fractional representation of a number, limited by width of denominator
 *
 * @param  {number} number
 * @param  {number} width
 *
 * @return {object}
 */
function findFraction(number, width) {
  // deal with negative number
  if (number < 0) {
    const res = findFraction(-number, width);
    res.whole = -res.whole;
    return res;
  }
  const whole = floor(number);
  const x = number - whole;
  // the cutoff and error shrinks with increasing width
  const range = Math.pow(10, width - 1);
  const error = 0.0001 / range;
  const cutoff = 0.1 / range;
  const limit = 10 * range;
  if (x <= cutoff) {
    return { whole };
  } else if (1 - cutoff < x) {
    return { whole: whole + 1 };
  }
  // the lower fraction is 0/1
  let lowerN = 0, lowerD = 1;
  // the upper fraction is 1/1
  let upperN = 1, upperD = 1;
  // remember the best effort
  let nom, dem, minDelta = Infinity;
  for(;;) {
    // the middle fraction is (lowerN + upperN) / (lowerD + upperD)
    const middleN = lowerN + upperN;
    const middleD = lowerD + upperD;
    // see if the denominator is too wide
    if (middleD >= limit) {
      break;
    }
    // see how much the guess is off by
    const diff1 = middleN - middleD * (x + error);
    const diff2 = middleN - middleD * (x - error);
    const delta = abs(diff1 + diff2);
    if (delta < minDelta) {
      nom = middleN;
      dem = middleD;
      minDelta = delta;
    }
    if (diff1 > 0) {
      // middle is our new upper
      upperN = middleN;
      upperD = middleD;
    } else if (diff2 < 0) {
      // middle is our new lower
      lowerN = middleN;
      lowerD = middleD;
    } else {
      // done
      break;
    }
  }
  return { whole, nom, dem };
}

export {
  formatValue,
  formatNumber,
  formatFraction,
  findFraction,
};

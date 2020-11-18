import split from 'lodash/split.js';
import repeat from 'lodash/repeat.js';
import toLower from 'lodash/toLower.js';
import Lcid from 'lcid';
import { getNamedColor, stringifyARGB } from './excel-styling.mjs';
const { floor, round, abs } = Math;

function formatValue(value, formatString, options) {
  // handle conditional formatting
  const parts = split(formatString, /;/);
  let applicablePartIndex = 0;
  let omitSign = false;
  if (typeof(value) === 'number') {
    if (value === 0 && parts.length >= 3) {
      applicablePartIndex = 2;
    } else if (value < 0 && parts.length >= 2) {
      applicablePartIndex = 1;
      omitSign = true;
    }
  }

  // create a closure for replacing matching patterns
  let locale = options.locale;
  let color;
  let removeFraction = false, emptyFraction = false;
  let remaining = parts[applicablePartIndex];
  const replacements = [];
  const find = (regExp, callback, type) => {
    if (remaining) {
      let m;
      while (m = regExp.exec(remaining)) {
        // check type
        if (!matchType(value, type)) {
          throw new Error(`Type mismatch`);
        }
        // remove matching section from string
        const { index } = m;
        remaining = remaining.substr(0, index) + remaining.substr(index + m[0].length);
        // invoke callback, store the result, and take out the matching part
        const currentPartIndex = applicablePartIndex;
        const result = callback(m) || '';
        if (currentPartIndex !== applicablePartIndex) {
          // the callback called skip()
          break;
        }
        const offset = result.length - m[0].length;
        replacements.unshift({ index, offset, result });
        if (!regExp.global) {
          break;
        }
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
  const skip = () => {
    remaining = parts[++applicablePartIndex] || '';
    replacements.splice(0)
  };

  // find escaped sequences
  find(/\\(.)/g, (m) => {
    return m[1];
  });
  // find condition (e.g. [<=9999999])
  find(/\[(<=?|>=?|=)\s*(\d+)\s*\]/, (m) => {
    const op = m[1], operand = parseInt(m[2]);
    const result = compareValues(op, value, operand);
    if (!result) {
      skip();
    }
  });
  // find currency symbol/locale
  find(/\[\$([^-\]]*)(-([0-9a-f]+))?]/i, (m) => {
    if (m[3]) {
      // locale can be overridden only for dates
      if (value instanceof Date) {
        const lcid = parseInt(m[3], 16);
        const formatLocale = Lcid.from(lcid);
        if (formatLocale) {
          locale = toLower(formatLocale).replace(/_/g, '-');
        }
      }
    }
    return m[1];
  });
  // find quoted string
  find(/"(.*?)"/, (m) => {
    return m[1];
  });
  // find color
  find(/\[(BLACK|BLUE|CYAN|GREEN|MAGENTA|RED|WHITE|YELLOW|COLOR\s*(\d\d?))\]/i, (m) => {
    const argb = getNamedColor(m[1] || m[0]);
    color = stringifyARGB(argb);
  });
  // find spacer
  find(/(_+)\)/, (m) => {
    return repeat(' ', m[1].length);
  });
  // find string placeholder
  find(/@/g, (m) => {
    return value + '';
  }, String);
  // find AM/PM
  const time = new TimeParser(value, { locale });
  find(/\bAM\/PM\b/, (m) => {
    time.hour12 = true;
    return time.period;
  }, Date);
  // find hour (minute, second) count
  find(/\[(h+|m+|s+)\]/ig, (m) => {
    // need to remove timezone offset
    const tzOffset = value.getTimezoneOffset() * 60 * 1000;
    let count = ((value.getTime() - tzOffset) / 1000) + (25569 * 24 * 3600);
    const unit = toLower(m[1].charAt(0));
    if (unit == 'h') {
      count /= 3600;
    } else if (unit === 'm') {
      count /= 60;
    }
    count = floor(count);
    return count.toLocaleString(locale, { minimumIntegerDigits: m[1].length, useGrouping: false });
  }, Date);
  // find hour
  find(/h{1,2}/i, (m) => {
    return time.hours.toLocaleString(locale, { minimumIntegerDigits: m[0].length });
  }, Date);
  // find minute
  find(/m{1,2}(?=:)|(?<=:)m{1,2}/i, (m) => {
    return time.minutes.toLocaleString(locale, { minimumIntegerDigits: m[0].length });
  }, Date);
  // find second
  find(/(s{1,2})(\.([#0]+))?/i, (m) => {
    const strOptions = { minimumIntegerDigits: m[1].length };
    let seconds = time.seconds;
    if (m[3]) {
      // attach decimal part
      seconds += time.fractionalSecond;
      strOptions.maximumFractionDigits = m[3].length;
    }
    return seconds.toLocaleString(locale, strOptions);
  }, Date);
  // find year
  find(/yyyy|yy/i, (m) => {
    const year = chooseComponent(m, { 2: '2-digit', 4: 'numeric' });
    return value.toLocaleDateString(locale, { year });
  }, Date);
  // find month (initial)
  find(/m{5}/i, (m) => {
    return value.toLocaleDateString(locale, { month: 'long' }).charAt(0);
  }, Date);
  // find month
  find(/m{1,4}/i, (m) => {
    const month = chooseComponent(m, { 1: 'numeric', 2: '2-digit', 3: 'short', 4: 'long' });
    return value.toLocaleDateString(locale, { month });
  }, Date);
  // find weekday
  find(/d{3,4}/i, (m) => {
    const weekday = chooseComponent(m, { 3: 'short', 4: 'long' });
    return value.toLocaleDateString(locale, { weekday });
  }, Date);
  // find day
  find(/d{1,2}/i, (m) => {
    const day = chooseComponent(m, { 1: 'numeric', 2: '2-digit' });
    return value.toLocaleDateString(locale, { day });
  }, Date);
  // find fraction
  find(/\?+\/[\?0-9]*/, (m) => {
    removeFraction = true;
    let text = formatFraction(value, m[0], { locale });
    if (!text) {
      // put in a spacer
      text = repeat(' ', m[0].length);
      emptyFraction = true;
    }
    return text;
  }, Number);
  // find numeric
  find(/[#0](.*[#0])?/, (m) => {
    let effectiveValue = value;
    // remove fractional part if it's shown already
    if (removeFraction) {
      effectiveValue = floor(effectiveValue);
    }
    // deal with percentage
    if (remaining.includes('%')) {
      effectiveValue *= 100;
    }
    let text = formatNumber(effectiveValue, m[0], { locale, omitSign });
    if (removeFraction) {
      if (!text && emptyFraction) {
        // put in a zero when the fraction is also empty
        text = '0';
      }
    }
    return text;
  }, Number);
  return apply();
}

/**
 * Helper function that checks a value's type
 *
 * @param  {*} value
 * @param  {Class} type
 *
 * @return {Boolean}
 */
function matchType(value, type) {
  return (type === undefined)
      || (type === Number && typeof(value) === 'number')
      || (type === String && typeof(value) === 'string')
      || (value instanceof type);
}

/**
 * Helper function that performs a comparison between two values
 *
 * @param  {String} op
 * @param  {number} v1
 * @param  {number} v2
 *
 * @return {boolean}
 */
function compareValues(op, v1, v2) {
  switch(op) {
    case '=': return (v1 == v2);
    case '>': return (v1 > v2);
    case '>=': return (v1 >= v2);
    case '<': return (v1 < v2);
    case '<=': return (v1 <= v2);
    default: return false;
  }
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
  // separate the formatting string into different parts
  const fsParts = separateNumericString(formatString, 'format');
  // count the number of placeholders in each
  const intCounts = countDigitPlaceholders(fsParts.integer);
  const fraCounts = countDigitPlaceholders(fsParts.fraction);
  const expCounts = countDigitPlaceholders(fsParts.exponent);
  // validate them
  const intValid = validateNumericFormatString(fsParts.integer, 'integer');
  const fraValid = validateNumericFormatString(fsParts.fraction, 'fraction');
  const expValid = validateNumericFormatString(fsParts.exponent, 'exponent');
  const irregular = !(intValid && fraValid && expValid);
  const strOptions = {
    signDisplay: !omitSign ? 'auto' : 'never',
    useGrouping: !irregular ? fsParts.integer.includes(',') : false,
    minimumIntegerDigits: intCounts.required,
    maximumFractionDigits: fraCounts.total,
    minimumFractionDigits: fraCounts.required,
  };
  if (expCounts.total > 0) {
    // use engineering notation when the pattern is something like ##0.00E+00
    strOptions.notation = (intCounts.total === 3) ? 'engineering' : 'scientific';
  }
  // toLocaleString() doesn't allow minimumIntegerDigits to be zero
  // we need to bump it to 1 and strip out the zero afterward
  let stripLeadingZero = false;
  if (strOptions.minimumIntegerDigits === 0) {
    strOptions.minimumIntegerDigits = 1;
    stripLeadingZero = true;
  }
  if (!irregular) {
    // we can use toLocaleString() to handle the regular case
    let res = number.toLocaleString(locale, strOptions);
    if (stripLeadingZero) {
      res = removeLeadingZero(res);
    }
    if (expCounts.total > 0) {
      res = normalizeExponent(res, expCounts.required, fsParts.exponentLC);
    }
    return res;
  } else {
    // handle irregular patterns by first converting the number to string
    // and get the integer, fractional, and exponent parts
    const numString = number.toLocaleString('en-us', strOptions);
    const numParts = separateNumericString(numString, 'value');
    // then we stick the digits into the pattern manually
    const intPart = replaceDigitPlaceholders(fsParts.integer, numParts.integer, 'integer');
    const fraPart = replaceDigitPlaceholders(fsParts.fraction, numParts.fraction, 'fraction');
    const expPart = replaceDigitPlaceholders(fsParts.exponent, numParts.exponent, 'exponent');
    // stitch everything back together
    let text = intPart;
    if (fraPart) {
      text += '.' + fraPart;
    }
    if (expPart) {
      text += (fsParts.exponentLC ? 'e' : 'E') + expPart;
    }
    return text;
  }
}

/**
 * A helper function for formatNumber() that remove leading zero from a numeric string
 *
 * @param  {string} string
 *
 * @return {string}
 */
function removeLeadingZero(string) {
  if (string.substr(0, 1) === '0') {
    return string.substr(1);
  } else if (string.substr(0, 2) === '-0') {
    return (string.length > 2) ? '-' + string.substr(2) : '';
  } else {
    return string;
  }
}

/**
 * A helper function for formatNumber() that makes the exponent matcg Excel's convention
 *
 * @param  {string} string
 * @param  {number} width
 * @param  {boolean} lowercase
 *
 * @return {string}
 */
function normalizeExponent(string, width, lowercase) {
  const expIndex = string.lastIndexOf('E');
  if (expIndex !== -1) {
    const expSymbol = (lowercase) ? 'e' : 'E';
    let sign = '+';
    let exp = string.substr(expIndex + 1);
    if (exp.charAt(0) === '-') {
      exp = exp.substr(1);
      sign = '-';
    }
    while (exp.length < width) {
      exp = '0' + exp;
    }
    return string.substr(0, expIndex) + expSymbol + sign + exp;
  } else {
    return string;
  }
}

/**
 * A helper function for formatNumber() that counts the number of placeholders in
 * a formatting string
 *
 * @param  {string} string
 *
 * @return {object}
 */
function countDigitPlaceholders(string) {
  let required = 0, total = 0;
  for (let i = 0; i < string.length; i++) {
    const c = string.charAt(i);
    if (c === '0') {
      required++;
      total++;
    } else if (c === '#') {
      total++;
    }
  }
  return { required, total };
}

/**
 * A helper function for formatNumber() that validates different parts of a numeric
 * formatting string
 *
 * @param  {string} string
 * @param  {string} type
 *
 * @return {boolean}
 */
function validateNumericFormatString(string, type) {
  if (type === 'fraction') {
    let poundEncountered = false;
    for (let i = 0; i < string.length; i++) {
      const c = string.charAt(i);
      if (c === '0' && !poundEncountered) {
        // ok
      } else if (c === '#') {
        poundEncountered = true;
      } else {
        return false;
      }
    }
  } else {
    let commaEncountered = false, zeroEncountered = false;
    for (let i = 0; i < string.length; i++) {
      const c = string.charAt(i);
      if (c === '0') {
        zeroEncountered = true;
      } else if (c === '#' && !zeroEncountered) {
        // ok
      } else if (c === ',' && !commaEncountered) {
        commaEncountered = true;
      } else {
        return false;
      }
    }
  }
  return true;
}

/**
 * A help function for formatNumber() that separate the different parts of a numeric string
 * (or formatting string)
 *
 * @param  {string} string
 * @param  {string} type
 *
 * @return {object}
 */
function separateNumericString(string, type) {
  let integer = '', fraction = '', exponent = '', exponentLC = false;
  const periodIndex = string.indexOf('.');
  const expSymbol = (type === 'format') ? 'E+' : 'E';
  let expIndex = string.lastIndexOf(expSymbol);
  if (expIndex === -1 && expSymbol.length === 2) {
    // formatting string can use either E+ or e+
    expIndex = string.lastIndexOf('e+');
    if (expIndex !== -1) {
      exponentLC = true;
    }
  }
  let endIndex = string.length;
  if (expIndex !== -1) {
    exponent = string.substr(expIndex + expSymbol.length);
    endIndex = expIndex;
  }
  if (periodIndex !== -1) {
    fraction = string.substr(periodIndex + 1, endIndex - periodIndex - 1);
    endIndex = periodIndex;
  }
  integer = string.substr(0, endIndex);
  return { integer, fraction, exponent, exponentLC };
}

/**
 * A helper function for formatNumber() that replaces '#' and '0' with actual digits
 *
 * @param  {string} formatString
 * @param  {string} digits
 * @param  {string} type
 *
 * @return {string}
 */
function replaceDigitPlaceholders(formatString, digits, type) {
  const chars = [];
  let count = 0;
  for (let i = 0; i < formatString.length; i++) {
    const c = formatString.charAt(i);
    chars.push(c);
    if (c === '#' || c === '0') {
      count++;
    }
  }
  let used = 0;
  if (type === 'fraction') {
    // replace from left-to-right
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (c === '#' || c === '0') {
        let replacement = '';
        if (used < digits.length) {
          replacement = digits.charAt(used);
          used++;
        } else if (c === '0') {
          replacement = '0';
        }
        chars[i] = replacement;
      }
    }
  } else {
    // strip out the sign so we're only dealing with actual digits
    let sign = '', fc = digits.charAt(0);
    if (fc === '-' || fc === '+') {
      digits = digits.substr(1);
      sign = fc;
    }
    if (type === 'exponent' && !sign) {
      // always use sign for exponent
      sign = '+';
    } else if (type === 'integer' && digits === '0') {
      // the integer part can be completely empty when it's 0
      // meanwhile, the exponent always has at least one digit
      digits = '';
    }
    // replace from right-to-left
    for (let i = chars.length - 1; i >= 0; i--) {
      const c = chars[i];
      if (c === '#' || c === '0') {
        let replacement = '';
        if (used < digits.length) {
          if (used + 1 < count) {
            replacement = digits.charAt(digits.length - used - 1);
          } else {
            // the last digit--include all remaining digits
            replacement = digits.substr(0, digits.length - used);
          }
        } else if (c === '0') {
          replacement = '0';
        }
        used++;
        if (used === count && sign) {
          // include sign as well
          replacement = sign + replacement;
        }
        chars[i] = replacement;
      }
    }
  }
  return chars.join('');
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

/**
 * Helper function that picks a value based on the length of the regexp match
 *
 * @param  {array} match
 * @param  {object} chooses
 *
 * @return {string}
 */
function chooseComponent(match, chooses) {
  return chooses[match[0].length];
}

/**
 * Helper class that extract time values in accordance with specified time zone
 */
class TimeParser {
  constructor(date, options) {
    this._date = date;
    this._options = options;
    this._hour12 = false;
    this._values = null;
  }

  get(name) {
    if (!this._values) {
      this._values = {};
      const { locale } = this._options;
      const hourCycle = (this._hour12) ? 'h12' : 'h23';
      const text = this._date.toLocaleTimeString(locale, { hourCycle });
      const m = /(\d+)\D(\d+)\D(\d+)\s*(\S+)?/.exec(text);
      this._values.hours = parseInt(m[1]);
      this._values.minutes = parseInt(m[2]);
      this._values.seconds = parseInt(m[3]);
      this._values.period = m[4];
    }
    return this._values[name];
  }

  get period() { return this.get('period') }
  get hours() { return this.get('hours') }
  get minutes() { return this.get('minutes') }
  get seconds() { return this.get('seconds') }
  get fractionalSecond() { return this._date.getMilliseconds() / 1000 }

  set hour12(value) {
    this._hour12 = value;
    this._values = null;
  };
}

export {
  formatValue,
  formatNumber,
  formatFraction,
  findFraction,
};
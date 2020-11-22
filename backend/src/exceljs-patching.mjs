import BaseXform from 'exceljs/lib/xlsx/xform/base-xform.js';
import CfvoXform from 'exceljs/lib/xlsx/xform/sheet/cf/cfvo-xform.js';
import DatabarXform from 'exceljs/lib/xlsx/xform/sheet/cf/databar-xform.js';
import BooleanXform from 'exceljs/lib/xlsx/xform/simple/boolean-xform.js';
import BorderXform from 'exceljs/lib/xlsx/xform/style/border-xform.js';

// fix incorrect handling of formula and missing gte
CfvoXform.prototype.parseOpen = function(node) {
  this.model = {
    type: node.attributes.type,
    value: BaseXform.toFloatValue(node.attributes.val),
    gte: BaseXform.toBoolValue(node.attributes.gte),
  };
  if (isNaN(this.model.value)) {
    this.model.value = node.attributes.val;
  }
};
// add missing showValue
DatabarXform.prototype.createNewModel = function({attributes}) {
  return {
    showValue: BaseXform.toBoolValue(attributes.showValue),
    cfvo: [],
  };
};
// fix <i val="0" /> handling
BooleanXform.prototype.parseOpen = function(node) {
  if (node.name === this.tag) {
    this.model = (node.attributes.val !== '0');
  }
};
// add missing vertical and horizontal to map
BorderXform.prototype.parseOpen = function(node) {
  if (this.parser) {
    this.parser.parseOpen(node);
    return true;
  }
  switch (node.name) {
    case 'border':
      this.reset();
      this.diagonalUp = !!node.attributes.diagonalUp;
      this.diagonalDown = !!node.attributes.diagonalDown;
      return true;
    default:
      if (!this.map.vertical) {
        const EdgeXform = this.map.top.constructor;
        this.map.vertical = new EdgeXform('vertical');
        this.map.horizontal = new EdgeXform('horizontal');
      }
      this.parser = this.map[node.name];
      if (this.parser) {
        this.parser.parseOpen(node);
        return true;
      }
      return false;
  }
};

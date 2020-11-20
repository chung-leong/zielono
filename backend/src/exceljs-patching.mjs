import BaseXform from 'exceljs/lib/xlsx/xform/base-xform.js';
import CfvoXform from 'exceljs/lib/xlsx/xform/sheet/cf/cfvo-xform.js';
import DatabarXform from 'exceljs/lib/xlsx/xform/sheet/cf/databar-xform.js';

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

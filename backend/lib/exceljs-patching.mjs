import BaseXform from 'exceljs/lib/xlsx/xform/base-xform.js';
import CfvoXform from 'exceljs/lib/xlsx/xform/sheet/cf/cfvo-xform.js';
import DatabarXform from 'exceljs/lib/xlsx/xform/sheet/cf/databar-xform.js';
import BooleanXform from 'exceljs/lib/xlsx/xform/simple/boolean-xform.js';
import BorderXform from 'exceljs/lib/xlsx/xform/style/border-xform.js';
import BlipFillXform from 'exceljs/lib/xlsx/xform/drawing/blip-fill-xform.js';
import WorkSheetXform from 'exceljs/lib/xlsx/xform/sheet/worksheet-xform.js';
import RelType from 'exceljs/lib/xlsx/rel-type.js';
import Image from 'exceljs/lib/doc/image.js';
import Anchor from 'exceljs/lib/doc/anchor.js';

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
// add stretch and srcRect
BlipFillXform.prototype.parseOpen = function(node) {
  if (this.parser) {
    this.parser.parseOpen(node);
    return true;
  }

  switch (node.name) {
    case this.tag:
      this.reset();
      break;
    default:
      if (!this.map['a:stretch']) {
        this.map['a:stretch'] = new BooleanXform({ tag: 'a:stretch' });
        this.map['a:srcRect'] = new SrcRectform();
      }
      this.parser = this.map[node.name];
      if (this.parser) {
        this.parser.parseOpen(node);
      }
      break;
  }
  return true;
};
BlipFillXform.prototype.parseClose = function(name) {
  if (this.parser) {
    if (!this.parser.parseClose(name)) {
      this.parser = undefined;
    }
    return true;
  }
  switch (name) {
    case this.tag:
      this.model = this.map['a:blip'].model;
      this.model.stretch = this.map['a:stretch'].model;
      this.model.srcRect = this.map['a:srcRect'].model;
      return false;
    default:
      return true;
  }
};
// add srcRect to image
WorkSheetXform.prototype.reconcile = function(model, options) {
  // options.merges = new Merges();
  // options.merges.reconcile(model.mergeCells, model.rows);
  const rels = (model.relationships || []).reduce((h, rel) => {
    h[rel.Id] = rel;
    if (rel.Type === RelType.Comments) {
      model.comments = options.comments[rel.Target].comments;
    }
    if (rel.Type === RelType.VmlDrawing && model.comments && model.comments.length) {
      const vmlComment = options.vmlDrawings[rel.Target].comments;
      model.comments.forEach((comment, index) => {
        comment.note = Object.assign({}, comment.note, vmlComment[index]);
      });
    }
    return h;
  }, {});
  options.commentsMap = (model.comments || []).reduce((h, comment) => {
    if (comment.ref) {
      h[comment.ref] = comment;
    }
    return h;
  }, {});
  options.hyperlinkMap = (model.hyperlinks || []).reduce((h, hyperlink) => {
    if (hyperlink.rId) {
      h[hyperlink.address] = rels[hyperlink.rId].Target;
    }
    return h;
  }, {});
  options.formulae = {};

  // compact the rows and cells
  model.rows = (model.rows && model.rows.filter(Boolean)) || [];
  model.rows.forEach(row => {
    row.cells = (row.cells && row.cells.filter(Boolean)) || [];
  });

  this.map.cols.reconcile(model.cols, options);
  this.map.sheetData.reconcile(model.rows, options);
  this.map.conditionalFormatting.reconcile(model.conditionalFormattings, options);

  model.media = [];
  if (model.drawing) {
    const drawingRel = rels[model.drawing.rId];
    const match = drawingRel.Target.match(/\/drawings\/([a-zA-Z0-9]+)[.][a-zA-Z]{3,4}$/);
    if (match) {
      const drawingName = match[1];
      const drawing = options.drawings[drawingName];
      drawing.anchors.forEach(anchor => {
        if (anchor.medium) {
          const image = {
            type: 'image',
            imageId: anchor.medium.index,
            range: anchor.range,
            hyperlinks: anchor.picture.hyperlinks,
            srcRect: anchor.picture.srcRect,
          };
          model.media.push(image);
        }
      });
    }
  }

  const backgroundRel = model.background && rels[model.background.rId];
  if (backgroundRel) {
    const target = backgroundRel.Target.split('/media/')[1];
    const imageId = options.mediaIndex && options.mediaIndex[target];
    if (imageId !== undefined) {
      model.media.push({
        type: 'background',
        imageId,
      });
    }
  }

  model.tables = (model.tables || []).map(tablePart => {
    const rel = rels[tablePart.rId];
    return options.tables[rel.Target];
  });

  delete model.relationships;
  delete model.hyperlinks;
  delete model.comments;
}
Object.defineProperty(Image.prototype, 'model', {
  configurable: true,
  set: function({type, imageId, range, hyperlinks, srcRect}) {
    this.type = type;
    this.imageId = imageId;
    this.srcRect = srcRect;

    if (type === 'image') {
      if (typeof range === 'string') {
        const decoded = colCache.decode(range);
        this.range = {
          tl: new Anchor(this.worksheet, {col: decoded.left, row: decoded.top}, -1),
          br: new Anchor(this.worksheet, {col: decoded.right, row: decoded.bottom}, 0),
          editAs: 'oneCell',
        };
      } else {
        this.range = {
          tl: new Anchor(this.worksheet, range.tl, 0),
          br: range.br && new Anchor(this.worksheet, range.br, 0),
          ext: range.ext,
          editAs: range.editAs,
          hyperlinks: hyperlinks || range.hyperlinks,
        };
      }
    }
  }
});

class SrcRectform extends BaseXform {
  get tag() {
    return 'a:srcRect';
  }

  render(xmlStream, model) {
    xmlStream.leafNode(this.tag, {
      'r': model.r,
      'b': model.b,
      't': model.t,
      'l': model.l,
    });
  }

  parseOpen(node) {
    this.model = {
      r: BaseXform.toIntValue(node.attributes.r),
      b: BaseXform.toIntValue(node.attributes.b),
      t: BaseXform.toIntValue(node.attributes.t),
      l: BaseXform.toIntValue(node.attributes.l),
    };
  }

  parseText() {}

  parseClose() {
    return false;
  }
}

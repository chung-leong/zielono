import Chai from 'chai'; const { expect } = Chai;

import {
  findFraction,
} from '../src/data-formatting.mjs';

describe('Excel parsing', function() {
  describe('#findFraction()', function() {
    it('should return expected results', function() {
      expect(findFraction(1.95, 1)).to.eql({ whole: 2 });
      expect(findFraction(1.05, 1)).to.eql({ whole: 1 });
      expect(findFraction(1.95, 2)).to.eql({ whole: 1, nom: 19, dem: 20 });
      expect(findFraction(0.006, 3)).to.eql({ whole: 0, nom: 3, dem: 500 });
      expect(findFraction(0.272, 2)).to.eql({ whole: 0, nom: 3, dem: 11 });
      expect(findFraction(0.272, 3)).to.eql({ whole: 0, nom: 34, dem: 125 });
      expect(findFraction(0.378, 1)).to.eql({ whole: 0, nom: 3, dem: 8 });
      expect(findFraction(0.378, 2)).to.eql({ whole: 0, nom: 31, dem: 82 });
      expect(findFraction(0.378, 3)).to.eql({ whole: 0, nom: 189, dem: 500 });
      expect(findFraction(0.717, 1)).to.eql({ whole: 0, nom: 5, dem: 7 });
      expect(findFraction(0.717, 2)).to.eql({ whole: 0, nom: 38, dem: 53 });
      expect(findFraction(0.717, 3)).to.eql({ whole: 0, nom: 38, dem: 53 });
      expect(findFraction(0.806, 1)).to.eql({ whole: 0, nom: 4, dem: 5 });
      //expect(findFraction(0.806, 2)).to.eql({ whole: 0, nom: 52, dem: 67 });
      expect(findFraction(0.806, 3)).to.eql({ whole: 0, nom: 403, dem: 500 });
    })
    it('should handles negative numbers correctly', function() {
      expect(findFraction(-1.95, 2)).to.eql({ whole: -1, nom: 19, dem: 20 });
      expect(findFraction(-0.006, 3)).to.eql({ whole: -0, nom: 3, dem: 500 });
    })
  })
})

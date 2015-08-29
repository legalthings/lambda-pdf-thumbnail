(function() {
  'use strict';
  var makePdfThumbnail = require('./make-pdf-thumbnail'),
      fs = require('fs'),
      bufferEqual = require('buffer-equal');

  var inputbuffer = fs.readFileSync('test.pdf');
  var expectedOutputBuffer = fs.readFileSync('expected.png');

  jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000000;
  describe('make-pdf-thumbnail', function() {
    var result;

    beforeEach(function(done){
      result = {};
      makePdfThumbnail(inputbuffer, 72, function(err, buffer) {
        if (err) {
          result.succes = false;
        }

        result.outputbuffer = buffer;
        done();
      });
    });

    it('making thumbnail', function() {
      expect(bufferEqual(result.outputbuffer, expectedOutputBuffer)).toBe(true);
    });
  });
})();

(function() {
  'use strict';
  var makePdfThumbnail = require('./make-pdf-thumbnail'),
      fs = require('fs'),
      bufferEqual = require('buffer-equal');

  var pdfDataStream = fs.createReadStream('test.pdf');
  var pdfBuffer = fs.readFileSync('test.pdf');
  var expectedOutputBuffer = fs.readFileSync('expected.png');

  describe('make-pdf-thumbnail', function() {
    var result;

    it('thumbnail from stream', function(done){
      result = {};
      makePdfThumbnail.fromStream(pdfDataStream, 72, function(err, outputStream) {
        expect(err).toBeFalsy();
        var buffers = [];

        outputStream.on('data', function(pieceBuffer) {
          buffers.push(pieceBuffer);
        });

        outputStream.on('end', function() {
          expect(bufferEqual(Buffer.concat(buffers), expectedOutputBuffer)).toBe(true);
          done();
        });

        outputStream.on('error', function (streamErr){
          expect(streamErr).toBeFalse();
          done();
        });
      });
    });

    it('thumbnail from buffer', function(done) {
      makePdfThumbnail.fromBuffer(pdfBuffer, 72, function(err, buffer) {
        expect(err).toBeFalsy();
        expect(bufferEqual(buffer, expectedOutputBuffer)).toBe(true);
        done();
      });
    });
  });
})();

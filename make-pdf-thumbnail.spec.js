(function() {
  'use strict';
  var makePdfThumbnail = require('./make-pdf-thumbnail'),
      fs = require('fs'),
      bufferEqual = require('buffer-equal');

  var inputFilename = 'test.pdf';
  var pdfDataStream = fs.createReadStream(inputFilename);
  var pdfBuffer = fs.readFileSync(inputFilename);
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

    it('thumbnail from file', function(done) {
      makePdfThumbnail.fromFile(inputFilename, 'test-output/output.png', 72, function(err) {
        var outputBuffer = fs.readFileSync('test-output/output.png');
        expect(err).toBeFalsy();
        expect(bufferEqual(outputBuffer, expectedOutputBuffer)).toBe(true);
        done();
      });
    });

    it('thumbnail from stream to file', function(done) {
      makePdfThumbnail.fromStreamToFile(pdfDataStream, 'test-output/output.png', 72, function(err, filename) {
        var outputBuffer = fs.readFileSync('test-output/output.png');
        expect(err).toBeFalsy();
        expect(bufferEqual(outputBuffer, expectedOutputBuffer)).toBe(true);
        done();
      });
    });
  });
})();

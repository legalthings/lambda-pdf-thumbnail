(function() {
  'use strict';
  var spawn = require('child_process').spawn;

  function spawnGsProcess(resolution, inputFilename, outputFilename) {
    outputFilename = outputFilename || '-';
    inputFilename = inputFilename || '-';
    var gs = '/usr/bin/gs';
    if (process.platform === 'darwin') {
      gs = '/usr/local/bin/gs';
    }
    return spawn(gs, ['-dQUIET', '-dPARANOIDSAFER', '-dBATCH', '-dNOPAUSE',
                                 '-dNOPROMPT', '-sDEVICE=png16m', '-dTextAlphaBits=4',
                                 '-dGraphicsAlphaBits=4', '-r' + resolution,
                                 '-dFirstPage=1', '-dLastPage=1', '-sOutputFile=' + outputFilename, inputFilename]);
  }

  /* This function converts a stream, containing pdf data, to a png thumbnail.
   * Only the first page is used for the thumbnail.
   *
   * Resolution sets the device resolution.
   *
   * Callback must have the form of function(error, outputStream) ...
   */
  module.exports.fromStream = function fromStream(readStream, resolution, callback) {
    var gsProcess = spawnGsProcess(resolution);
    readStream.pipe(gsProcess.stdin);

    gsProcess.on('error', callback);

    gsProcess.on('exit', function () {
      callback(null, gsProcess.stdout);
    });

    return gsProcess.stdout;
  };

  /* This function converts a buffer, containing pdf data, to a png thumbnail.
   * Only the first page is used for the thumbnail.
   *
   * Resolution sets the device resolution.
   *
   * Callback must have the form of function(error, outputBuffer) ...
   */
  module.exports.fromBuffer = function fromBuffer(buffer, resolution, callback) {
    var gsProcess = spawnGsProcess(resolution);
    var buffers = [];

    gsProcess.stdin.write(buffer, null, function () {
      gsProcess.stdin.end();
    });

    gsProcess.stdout.on('data', function (pieceBuffer) {
      buffers.push(pieceBuffer);
    });

    gsProcess.on('error', callback);

    gsProcess.on('exit', function () {
      callback(null, Buffer.concat(buffers));
    });

    gsProcess.stdout.on('error', function (err) {
      callback(err);
    });
  };

  module.exports.fromFile = function fromFile(inputFilename, outputFilename, resolution, callback) {
    var gsProcess = spawnGsProcess(resolution, inputFilename, outputFilename);
    gsProcess.on('error', callback);

    gsProcess.on('exit', function () {
      callback(null);
    });
  };

  module.exports.fromStreamToFile = function toFile(inputStream, outputFilename, resolution, callback) {
    var gsProcess = spawnGsProcess(resolution, '-', outputFilename);
    inputStream.pipe(gsProcess.stdin);

    gsProcess.on('error', callback);

    gsProcess.on('exit', function () {
      callback(null, outputFilename);
    });

  };

})();

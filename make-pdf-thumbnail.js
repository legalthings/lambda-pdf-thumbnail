var spawn = require('child_process').spawn;

/* This function converts a buffer, containing pdf data, to a png thumbnail.
 * Only the first page is used for the thumbnail.
 *
 * Resolution sets the device resolution.
 *
 * Callback must have the form of function(error, outputBuffer) ...
 */

module.exports = function makePdfThumbnail(buffer, resolution, callback) {
  'use strict';
  var gsProcess = spawn('/usr/bin/gs', ['-dQUIET', '-dPARANOIDSAFER', '-dBATCH', '-dNOPAUSE',
                                         '-dNOPROMPT', '-sDEVICE=png16m', '-dTextAlphaBits=4',
                                         '-dGraphicsAlphaBits=4', '-dDEVICEXRESOLUTION=' + resolution,
                                         '-dFirstPage=1', '-dLastPage=1', '-sOutputFile=-','-']);

  gsProcess.stdin.write(buffer, null, function () {
    gsProcess.stdin.end();
  });

  var buffers = [];
  gsProcess.stdout.on('data', function (buffer) {
    //console.log('processing data');
    buffers.push(buffer);
  });

  gsProcess.on('exit', function () {
    callback(null, Buffer.concat(buffers));
  });

  gsProcess.stdout.on('error', function (err) {
    callback(err);
  });
};

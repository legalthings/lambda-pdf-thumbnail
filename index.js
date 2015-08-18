// dependencies
var async = require('async');
var AWS = require('aws-sdk');
var util = require('util');
var spawn = require('child_process').spawn;
var path = require('path');

// get reference to S3 client 
var s3 = new AWS.S3();

/* This function converts a buffer, containing pdf data, to a png thumbnail.
 * Only the first page is used for the thumbnail.
 *
 * Resolution sets the device resolution.
 *
 * Callback must have the form of function(error, outputBuffer) ...
 */
function makePdfThumbnail(buffer, resolution, callback) {
  var gs_process = spawn('/usr/bin/gs', ['-dQUIET', '-dPARANOIDSAFER', '-dBATCH', '-dNOPAUSE',
                                         '-dNOPROMPT', '-sDEVICE=png16m', '-dTextAlphaBits=4',
                                         '-dGraphicsAlphaBits=4', '-dDEVICEXRESOLUTION=' + resolution,
                                         '-dFirstPage=1', '-dLastPage=1', '-sOutputFile=-','-']);

  gs_process.stdin.write(buffer, null, function () {
    gs_process.stdin.end();
  });

  var buffers = [];
  gs_process.stdout.on('data', function (buffer) {
    //console.log('processing data');
    buffers.push(buffer);
  });

  gs_process.on('exit', function () {
    callback(null, Buffer.concat(buffers));
  });

  gs_process.stdout.on('error', function (err) {
    callback(err);
  });
}

// This is based on the example code on :
// http://docs.aws.amazon.com/lambda/latest/dg/walkthrough-s3-events-adminuser-create-test-function-create-function.html
exports.handler = function(event, context) {
	// Read options from the event.
	console.log('Reading options from event:\n', util.inspect(event, {depth: 5}));
	var srcBucket = event.Records[0].s3.bucket.name;

	// Object key may have spaces or unicode non-ASCII characters.
  var srcKey    = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));  
	var dstBucket = 'legalthings-thumbnails'
	var dstKey    = path.basename(srcKey, '.pdf') + '-thumbnail.png';

	// Sanity check: validate that source and destination are different buckets.
	if (srcBucket == dstBucket) {
		console.error('Destination bucket must not match source bucket.');
		return;
	}

	// Infer the image type.
	var typeMatch = srcKey.match(/\.([^.]*)$/);
	if (!typeMatch) {
		console.error('unable to infer document type for key ' + srcKey);
		return;
	}

	var imageType = typeMatch[1];
	if (imageType != 'pdf') {
		console.log('skipping non-pdf ' + srcKey);
		return;
	}

	// Download the image from S3, transform, and upload to a different S3 bucket.
	async.waterfall([
		function download(next) {
			// Download the image from S3 into a buffer.
			s3.getObject({
					Bucket: srcBucket,
					Key: srcKey
				},
				next);
			},
		function transform(response, next) {
      makePdfThumbnail(response.Body, 72, function(err, buffer) {
        if (err) {
          next(err);
          return;
        }
		    next(null, 'image/png', buffer);
      })
      
		},
		function upload(contentType, data, next) {
			// Stream the transformed image to a different S3 bucket.
			s3.putObject({
					Bucket: dstBucket,
					Key: dstKey,
					Body: data,
					ContentType: contentType
				},
				next);
			}
		], function (err) {
			if (err) {
				console.error(
					'Unable to resize ' + srcBucket + '/' + srcKey +
					' and upload to ' + dstBucket + '/' + dstKey +
					' due to an error: ' + err
				);
			} else {
				console.log(
					'Successfully resized ' + srcBucket + '/' + srcKey +
					' and uploaded to ' + dstBucket + '/' + dstKey
				);
			}

			context.done();
		}
	);
};

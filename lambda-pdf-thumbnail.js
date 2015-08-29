// get reference to S3 client 
var async = require('async');
var AWS = require('aws-sdk');
var path = require('path');
var PdfThumbnailError = require('./pdf-thumbnail-error');
var makePdfThumbnail = require('./make-pdf-thumbnail');

function LambdaPdfThumbnail(options) {
  'use strict';
  options = options|| {};
  if (!('region' in options)) {
    options.region = 'us-west-1';
  }

  this.sourceHash = 'SourceBucket';
  this.destinationHash = 'DestinationBucket';
  this.resolution = 72;
  var keys = ['outputBucketName', 'dynamodb', 's3', 'sourceHash',
              'destinationHash', 'tableName', 'resolution'];

  if (!('outputBucketName' in options) && !('tableName' in options)) {
    throw new Error('Neither the output bucket or dynamodb table is specified');
  }

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key in options) {
      this[key] = options[key];
    }
  }

  this.s3 = this.s3 || new AWS.S3();
  this.dynamodb = this.dynamodb || new AWS.DynamoDB({region: options.region});
}

LambdaPdfThumbnail.prototype._getDestinationBucketName = function(inputBucketName, callback) {
  'use strict';
  if (this.outputBucketName) {
    callback(null, this.outputBucketName);
    return;
  }

  var params = {
    AttributesToGet: [
      this.destinationHash
    ],
    TableName: this.tableName,
    Key: {}
  };


  params.Key[this.sourceHash] = {'S': inputBucketName};
  var destinationHash = this.destinationHash;
  this.dynamodb.getItem(params, function(err, result) {
    if (result) {
      callback(null, result.Item[destinationHash].S);
    }
    else {
      callback(err);
    }
  });
};

/* This function creates a thumbnail from a pdf.
 * The source bucket and key, and destiny bucket and key must be specified of s3 must be specified.
 */
LambdaPdfThumbnail.prototype.generateThumbnail = function (srcBucket, srcKey, dstBucket, dstKey, callback) {
  'use strict';

  var context = this;
  var error;
  // Sanity check: validate that source and destination are different buckets.
  if (srcBucket === dstBucket) {
    error = new PdfThumbnailError(
      'Destination bucket must not match source bucket.',
      PdfThumbnailError.SAME_DST_SRC_BUCKET
    );
    callback(error);
    return;
  }

  // Infer the image type.
  var typeMatch = srcKey.match(/\.([^.]*)$/);
  if (!typeMatch) {
    error = new PdfThumbnailError(
      'unable to infer document type for key ' + srcKey,
      PdfThumbnailError.UNKNOWN_FILE_TYPE
    );
    callback(error);
    return;
  }

  var imageType = typeMatch[1];
  if (imageType !== 'pdf') {
    error = new PdfThumbnailError(
      'skipping non-pdf ' + srcKey,
      PdfThumbnailError.WRONG_FILE_TYPE
    );
    callback(error);
    return;
  }

  // Download the image from S3, transform, and upload to a different S3 bucket.
  var resolution = this.resolution;
  async.waterfall([
    function download(next) {
      // Download the image from S3 into a buffer.
      context.s3.getObject({
          Bucket: srcBucket,
          Key: srcKey
        },
        next);
      },
    function transform(response, next) {
      makePdfThumbnail(response.Body, resolution, function(err, buffer) {
        if (err) {
          next(err);
          return;
        }
        next(null, 'image/png', buffer);
      });
    },
    function upload(contentType, data, next) {
      // Stream the transformed image to a different S3 bucket.
      context.s3.putObject({
          Bucket: dstBucket,
          Key: dstKey,
          Body: data,
          ContentType: contentType
        },
        next);
      }
  ], callback);
};

LambdaPdfThumbnail.prototype.s3EventHandler = function(event, context) {
  'use strict';
  // Read options from the event.
  var srcBucket = event.Records[0].s3.bucket.name;

  // Object key may have spaces or unicode non-ASCII characters.
  var srcKey    = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  var dstBucket = 'legalthings-thumbnails';
  var dstKey    = path.basename(srcKey, '.pdf') + '-thumbnail.png';

  function done(err) {
    if (err) {
      console.error(
        'Unable to resize ' + srcBucket + '/' + srcKey +
          ' and upload to ' + dstBucket + '/' + dstKey +
          ' due to an error: ' + err
      );
      context.fail();
    }
    else {
      console.log(
        'Successfully resized ' + srcBucket + '/' + srcKey +
          ' and uploaded to ' + dstBucket + '/' + dstKey
      );
      context.done();
    }
  }

  this._getDestinationBucketName(srcBucket, function(err, dstBucket){
    if (err) {
      context.fail();
      return;
    }
    this.generateThumbnail(srcBucket, srcKey, dstBucket, dstKey, done);
  }.bind(this));
};

module.exports = LambdaPdfThumbnail;

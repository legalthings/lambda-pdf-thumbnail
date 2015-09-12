// get reference to S3 client 
var async = require('async');
var AWS = require('aws-sdk');
var path = require('path');
var makePdfThumbnail = require('./make-pdf-thumbnail');
var util = require('util');

/* This function creates a thumbnail from a pdf.
 * The source bucket and key, and destiny bucket and key must be specified of s3 must be specified.
 */
function generateThumbnail (s3, resolution, srcBucket, srcKey, dstBucket, dstKey, callback) {
  'use strict';

  var error;
  // Infer the image type.
  var typeMatch = srcKey.match(/\.([^.]*)$/);
  if (!typeMatch) {
    error = new Error(
      'unable to infer document type for key ' + srcKey
    );
    callback(error);
    return;
  }

  var imageType = typeMatch[1];
  if (imageType !== 'pdf') {
    error = new Error(
      'skipping non-pdf ' + srcKey
    );
    callback(error);
    return;
  }

  // Download the image from S3, transform, and upload to a different S3 bucket.
  async.waterfall([
    function transform(next) {
      var request = s3.getObject({
        Bucket: srcBucket,
        Key: srcKey
      });

      var pdfStream = request.createReadStream();
      makePdfThumbnail.fromStream(pdfStream, resolution, function(err, thumbnailStream) {
        if (err) {
          next(err);
          return;
        }
        next(null, 'image/png', thumbnailStream);
      });
    },
    function upload(contentType, data, next) {
      // Stream the transformed image to a different S3 bucket.
      s3.upload({
          Bucket: dstBucket,
          Key: dstKey,
          Body: data,
          ContentType: contentType
        },
        next);
      }
  ], callback);
}

function S3EventHandler(options) {
  'use strict';
  options = options || {};
  if (!('outputBucketName' in options) && !('tableName' in options)) {
    throw new Error('Neither the output bucket or dynamodb table is specified');
  }
  if (!('region' in options)) {
    throw new Error('region is not specified');
  }

  this.sourceHash = 'SourceBucket';
  this.destinationHash = 'DestinationBucket';
  this.resolution = 72 || options.resolution;
  var keys = ['outputBucketName', 'dynamodb', 's3', 'sourceHash',
              'destinationHash', 'tableName', 'resolution'];


  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key in options) {
      this[key] = options[key];
    }
  }

  this.s3 = this.s3 || new AWS.S3({region: options.region});
  this.dynamodb = this.dynamodb || new AWS.DynamoDB({region: options.region});
}

S3EventHandler.prototype._getDestinationBucketName = function(inputBucketName, callback) {
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

S3EventHandler.prototype.handler = function(event, context) {
  'use strict';
  // Read options from the event.
  var srcBucket = event.Records[0].s3.bucket.name;

  // Object key may have spaces or unicode non-ASCII characters.
  var srcKey    = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  var s3 = this.s3;
  var resolution = this.resolution;

  this._getDestinationBucketName(srcBucket, function(err, dstBucket){
    if (err) {
      console.error(
        'Unable to resize ' + srcKey + ' from ' + srcBucket +
          ' and upload to ' + dstBucket + '/' +
          ' due to an error: ' + util.inspect(err, {showHidden: false, depth: null})
      );
      context.fail();
      return;
    }

    function done(err, keys) {
      if (err) {
        console.error(
          'Unable to resize ' + srcKey + ' from ' + srcBucket +
            ' and upload to ' + dstBucket + '/' +
            ' due to an error: ' + util.inspect(err, {showHidden: false, depth: null})
        );
        context.fail();
      }
      else {
        for (var i = 0; i < keys.length; i++) {
          console.log(
            'Successfully resized ' + srcBucket + '/' + srcKey +
              ' and uploaded to ' + dstBucket + '/' + keys[i]
          );
        }
        context.done();
      }
    }

    var work = [];

    function createWork(resolution, dstKey) {
      return function(callback) {
        generateThumbnail(s3, resolution, srcBucket, srcKey, dstBucket, dstKey, function(err){
          callback(err, dstKey);
        });
      };
    }

    if (!isNaN(resolution)) {
      work.push(createWork(resolution, path.basename(srcKey, '.pdf') + '-thumbnail.png'));
    }
    else if (resolution !== null && typeof resolution === 'object') {
      for (var key in resolution) {
        if (resolution.hasOwnProperty(key)) {
          var dstKey = path.basename(srcKey, '.pdf') + key + '.png';
          work.push(createWork(resolution[key], dstKey));
        }
      }
    }

    async.parallel(work, done);
  }.bind(this));
};

module.exports = {
  S3EventHandler: S3EventHandler,
  generateThumbnail: generateThumbnail
};

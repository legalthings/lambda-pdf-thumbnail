// dependencies
var util = require('util');
var path = require('path');
var LambdaPdfThumbnail = require('./lambda-pdf-thumbnail');
var lambdaPdfThumbnail = new LambdaPdfThumbnail();

// This is based on the example code on :
// http://docs.aws.amazon.com/lambda/latest/dg/walkthrough-s3-events-adminuser-create-test-function-create-function.html
module.exports.handler = function(event, context) {
  'use strict';
  // Read options from the event.
  console.log('Reading options from event:\n', util.inspect(event, {depth: 5}));
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
    } else {
      console.log(
        'Successfully resized ' + srcBucket + '/' + srcKey +
          ' and uploaded to ' + dstBucket + '/' + dstKey
      );
      context.done();
    }
  }

  lambdaPdfThumbnail.generateThumbnail(srcBucket, srcKey, dstBucket, dstKey, done);
};

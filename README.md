# PDF thumbnail lambda

This package contains functionality to make a PNG thumbnail of the first page of
a pdf file, using Ghostscript. There is also functionality to work with S3 and S3 events.

## Installation

Ghostscript is required for the runtime, and Jasmine and Jshint are needed for the test.
The other node dependencies can be installed with:

    npm install

## make-pdf-thumbnail

This stand-alone module provides functionality to make a thumbnail of the first page of a pdf.

### Example usage
The function expects a buffer containing pdf data, the device resolution (72 is a good setting), and a callback. The callback has as second argument
the output buffer containing PNG data. No temporary files are used.
```
var makePdfThumbnail = require('./make-pdf-thumbnail');
var fs = require('fs');
makePdfThumbnail(inputBuffer, resolution, function(err, buffer) {
  if (err) {
    console.log('pdf error', err);
  }

});
```

## lambda-pdf-thumbnail
This module provides functionality to make a pdf thumbnail, where the data is read and written to S3 buckets.
In addition, a S3 event handler is provided. The bucket the thumbnail is saved to can be specified,
either by a bucket name, or by a dynamodb table that has an input-bucket to output-bucket mapping.

### Example usage

The generateThumbnail function expects as arguments: an AWS.S3 object, device resolution, and the input/output bucket and key.

```
var lambdaPdfThumbnail = require('./lambda-pdf-thumbnail');
lambdaPdfThumbnail.generateThumbnail(s3, 72, 'input-bucket', 'input.pdf',
                                     'output-bucket', 'output.png', function(err) {
                                     if (err) {
                                       console.log('generate thumbnail failed');
                                       return;
                                     }
                                     console.log('generate thumbnail succeeded');
});

```

To use the S3EventHandler, either the table name , or the output bucket must be specified.
In addition, the region property is required to stop AWS.DyanomDB from complaining.
The following example demonstrates how to make a handler that looks for *DestinationBucket* in the table
*TestTable* by searching with hash *SourceBucket*. 
```
var lambdaPdfThumbnail = require('./lambda-pdf-thumbnail');
var s3EventHandler = new lambdaPdfThumbnail.S3EventHandler({
  region:'eu-west-1',
  tableName: 'TestTable',
  s3: s3,
  dynamodb: dynamodb,

  // Optional properties with their default values
  sourceHash: 'SourceBucket',
  destinationHash: 'DestinationBucket',
  resolution: 72
});

module.exports.handler = lambdaPdfThumbnail.s3EventHandler;
```

A fixed output bucket can also be specified.
```
var lambdaPdfThumbnail = require('./lambda-pdf-thumbnail');
var s3EventHandler = new lambdaPdfThumbnail.S3EventHandler({
  region:'eu-west-1',
  outputBucketName: 'output-bucket'
  s3: s3,
  resolution: 72
});

module.exports.handler = lambdaPdfThumbnail.s3EventHandler;
```

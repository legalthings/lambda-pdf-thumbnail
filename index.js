var S3EventHandler = require('./lambda-pdf-thumbnail').S3EventHandler;
var s3EventHandler = new S3EventHandler({
  region: 'eu-west-1',
  resolution: 72,
  tableName: 'pdf-thumbnail-bucket-mapping',
  sourceHash: 'sourceBucket',
  destinationHash: 'destinationBucket'
});

// for some reason it needs to be wrapped into a function
exports.handler = function(event, context){
  'use strict';
  s3EventHandler.handler(event, context); 
};


var LambdaPdfThumbnail = require('./lambda-pdf-thumbnail');
var lambdaPdfThumbnail = new LambdaPdfThumbnail({
  region: 'eu-west-1',
  resolution: 72,
  tableName: 'pdf-thumbnail-bucket-mapping',
  sourceHash: 'sourceBucket',
  destinationHash: 'destinationBucket'
});

module.exports.handler = lambdaPdfThumbnail.s3EventHandler;

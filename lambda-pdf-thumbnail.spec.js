(function () {
  'use strict';

  var AWS = require('aws-sdk');
  var LambdaPdfThumbnail = require('./lambda-pdf-thumbnail');
  var PdfThumbnailError = require('./pdf-thumbnail-error');
  var async = require('async');
  var bufferEqual = require('buffer-equal');
  var fs = require('fs');
  var rimraf = require('rimraf');

  var dynaliteFolder = './mydb';
  var s3rverFolder = './s3rver';

  var S3rver = require('s3rver');
  var dynalite = require('dynalite');
  var dynaliteServer = dynalite({path: dynaliteFolder, createTableMs: 50});
  var s3rver = new S3rver();

  var inputbuffer = fs.readFileSync('test.pdf');
  var expectedOutputBuffer = fs.readFileSync('expected.png');

  var eventData = require('./event.json');
  var tableName = 'pdf-thumbnail-bucket-mappings';
  var inputBucketName = 'input-bucket';
  var outputBucketName = 'output-bucket';
  var inputKey = 'test.pdf';
  var outputKey = 'test.png';

  function setupS3rver(callback) {
    s3rver.setHostname('localhost')
      .setPort(10001)
      .setDirectory('./s3rver')
      .setSilent(true)
      .run(function(err) {
        if (err) {
          callback(err);
          return;
        }
        var config = {
          s3ForcePathStyle: true,
          accessKeyId: 'ACCESS_KEY_ID',
          secretAccessKey: 'SECRET_ACCESS_KEY',
          endpoint: new AWS.Endpoint('http://localhost:10001')
        };

        var s3 = new AWS.S3(config);
        callback(null, s3);
      });
  }

  function setupDynalite(callback) {
    dynaliteServer.listen(10002, function(err){
      if (err) {
        callback(err);
        return;
      }

      var config = {
        s3ForcePathStyle: true,
        accessKeyId: 'ACCESS_KEY_ID',
        secretAccessKey: 'SECRET_ACCESS_KEY',
        region: 'us-west-1',
        endpoint: new AWS.Endpoint('http://localhost:10002')
      };

      var dynamodb = new AWS.DynamoDB(config);
      callback(null, dynamodb);
    });
  }

  function createTable(dynamodb, callback) {
    var params = {
      TableName : tableName,
      KeySchema: [
        { AttributeName: 'SourceBucket', KeyType: 'HASH' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'SourceBucket', AttributeType: 'S' },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1
      }
    };

    dynamodb.createTable(params, function(err) {
      console.log('creating table err', err);
      var params = {
        TableName: tableName,
        Item: {
          SourceBucket: {S: inputBucketName},
          DestinationBucket: {S: outputBucketName}
        }
      };

      dynamodb.putItem(params, function(err) {
        callback(err);
      });
    });
  }

  function setupEnvironment(callback) {
    var dynamodb;
    async.waterfall([
      function startDynalite(next) {
        setupDynalite(function(err, dynolite){
          dynamodb = dynolite;
          next(err);
        });
      },
      //createTable,
      function createS3rverFolder(next) {
        fs.mkdir(s3rverFolder, function(err) {
          next(err);
        });
      },
      setupS3rver,
      function createIntputBucket(s3, next) {
        s3.createBucket({Bucket: inputBucketName}, function(err) {
          next(err, s3);
        });
      },
      function createOutputBucket(s3, next) {
        s3.createBucket({Bucket: outputBucketName}, function(err) {
          next(err, s3);
        });
      },
      function putTestFile(s3, next) {
        var params = {Bucket: inputBucketName, Key: inputKey, Body: inputbuffer};
        s3.putObject(params, function(err) {
          next(err, s3, dynamodb);
        });
      }
    ], callback);
  }

  function checkThumbnailOutput(s3, callback) {
    s3.getObject(
      {Bucket: outputBucketName, Key: outputKey},
      function(downloadError, response) {
        if (downloadError) {
          callback(downloadError);
          return;
        }

        callback(null, bufferEqual(response.Body, expectedOutputBuffer));
      });
  }

  function makeLambdaContext(s3, expect, done) {
    return {
      fail: function() {
        expect(false).toBe(true);
        done();
      },
      done: function() {
        checkThumbnailOutput(s3, function(err, correct) {
          expect(err).toBeFalsy();
          expect(correct).toBe(true);
          done();
        });
      }
    };

  }

  describe('lambda-pdf', function() {
    var lpt;
    var mocks3;
    var mockDynamodb;
    var lptWithDyno;

    it ('environment should be set up', function(done){
      setupEnvironment(function(err, s3, dynamodb) {
        console.log(err);
        expect(err).toBeFalsy();
        expect(s3).toBeTruthy();
        expect(dynamodb).toBeTruthy();
        mocks3 = s3;
        mockDynamodb = dynamodb;

        lpt = new LambdaPdfThumbnail({
          region:'eu-west-1',
          outputBucketName:'output-bucket',
          s3: mocks3
        });

        lptWithDyno = new LambdaPdfThumbnail({
          region:'eu-west-1',
          tableName: tableName,
          s3: mocks3,
          dynamodb: mockDynamodb
        });

        done();
      });
    });

    it('should return PdfThumbnailError with error code 0, when the source and destination is the same', function(done) {
      lpt.generateThumbnail(inputBucketName, 'test.pdf', inputBucketName, outputKey, function(err) {
        expect(err.errorcode).toBe(PdfThumbnailError.SAME_DST_SRC_BUCKET);
        done();
      });
    });

    it('should return PdfThumbnailError with error code 1, when the input file is of unknown type', function (done) {
      lpt.generateThumbnail(inputBucketName, 'test', outputBucketName, outputKey, function(err) {
        expect(err.errorcode).toBe(PdfThumbnailError.UNKNOWN_FILE_TYPE);
        done();
      });
    });

    it('should return PdfThumbnailError with error code 2, when the input file is not of type pdf', function (done) {
      lpt.generateThumbnail(inputBucketName, 'test.jpeg', outputBucketName, outputKey, function(err) {
        expect(err.errorcode).toBe(PdfThumbnailError.WRONG_FILE_TYPE);
        done();
      });
    });

    it('should make a thumbnail and save it in a bucket', function(done) {
      lpt.generateThumbnail(
        inputBucketName, inputKey,
        outputBucketName, outputKey, function(thumbnailError) {
          expect(thumbnailError).toBeFalsy();

          checkThumbnailOutput(mocks3, function(downloadError, correct){
            expect(downloadError).toBeFalsy();
            expect(correct).toBe(true);
            done();
          });
        });
    });

    it('s3 event handler with specified output-bucket should save a thumbnail', function(done){
      var context = makeLambdaContext(mocks3, expect, done);
      expect(lpt.outputBucketName).toBeDefined();
      expect(lpt.tableName).not.toBeDefined();
      lpt.s3EventHandler(eventData, context);
    });

    it('s3 event handler with specified dynamo database should save a thumbnail', function(done){
      console.log('mockDynamodb mocks3', !!mockDynamodb, !!mocks3);
      var context = makeLambdaContext(mocks3, expect, done);
      expect(lptWithDyno.outputBucketName).not.toBeDefined();
      expect(lptWithDyno.tableName).toBeDefined();
      lptWithDyno.s3EventHandler(eventData, context);
    });

    it('cleaning environment', function(done){
      rimraf(s3rverFolder, function(err){
        expect(err).toBeFalsy();
        done();
      });
    });
  });

}());

(function () {
  'use strict';

  var AWS = require('aws-sdk');
  var lambdaPdfThumbnail = require('./lambda-pdf-thumbnail');
  var async = require('async');
  var bufferEqual = require('buffer-equal');
  var fs = require('fs');
  var rimraf = require('rimraf');

  var dynaliteFolder = './mydb';
  var s3rverFolder = './s3rver';

  var S3rver = require('s3rver');
  var dynalite = require('dynalite');
  var dynaliteServer = dynalite({path: dynaliteFolder, createTableMs: 0});
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

    dynamodb.createTable(params, function() {
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
          next(err, dynolite);
        });
      },
      createTable,
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
    var mockS3;
    var mockDynamodb;

    beforeAll(function(done){
      setupEnvironment(function(err, s3, dynamodb) {
        if (err) console.log('setting up environment error', err);

        mockS3 = s3;
        mockDynamodb = dynamodb;

        done();
      }.bind(this));
    });

    it ('environment should be set up', function(){
      expect(mockS3).toBeDefined();
      expect(mockDynamodb).toBeDefined();
    });

    describe('generateThumbnail', function() {
      it('should return an error, when the input file is of unknown type', function (done) {
        lambdaPdfThumbnail.generateThumbnail(
          mockS3, 72,
          inputBucketName, 'test',
          outputBucketName, outputKey, function(err) {
            expect(function(){throw err;}).toThrowError('unable to infer document type for key test');
            done();
          });
      });

      it('should return an error, when the input file is not of type pdf', function (done) {
        lambdaPdfThumbnail.generateThumbnail(
          mockS3, 72, inputBucketName,
          'test.jpeg', outputBucketName,
          outputKey, function(err) {
            expect(function(){throw err;}).toThrowError('skipping non-pdf test.jpeg');
            done();
          });
      });

      it('should make a thumbnail and save it in a bucket', function(done) {
        lambdaPdfThumbnail.generateThumbnail(
          mockS3, 72,
          inputBucketName, inputKey,
          outputBucketName, outputKey, function(thumbnailError) {
            expect(thumbnailError).toBeFalsy();

            checkThumbnailOutput(mockS3, function(downloadError, correct){
              expect(downloadError).toBeFalsy();
              expect(correct).toBe(true);
              done();
            });
          });
      });

    });

    describe('s3 event handler', function(){
      it('should throw error if tableName or outputBucketName is not specified', function(){
        expect(function(){
          new lambdaPdfThumbnail.S3EventHandler({});
        }).toThrowError('Neither the output bucket or dynamodb table is specified');
      });

      it('should throw error if tableName or outputBucketName is not specified', function(){
        expect(function(){
          new lambdaPdfThumbnail.S3EventHandler({outputBucketName:'test'});
        }).toThrowError('region is not specified');
      });

      it('with specified output-bucket should save a thumbnail', function(done){
        var context = makeLambdaContext(mockS3, expect, done);
        var s3EventHandler = new lambdaPdfThumbnail.S3EventHandler({
          region:'eu-west-1',
          outputBucketName:'output-bucket',
          s3: mockS3
        });

        expect(s3EventHandler.outputBucketName).toBeDefined();
        expect(s3EventHandler.tableName).not.toBeDefined();
        s3EventHandler.handler(eventData, context);
      });

      it('with specified dynamo database should save a thumbnail', function(done){
        var context = makeLambdaContext(mockS3, expect, done);
        var s3EventHandlerWithDyno = new lambdaPdfThumbnail.S3EventHandler({
          region:'eu-west-1',
          tableName: tableName,
          s3: mockS3,
          dynamodb: mockDynamodb
        });
        expect(s3EventHandlerWithDyno.outputBucketName).not.toBeDefined();
        expect(s3EventHandlerWithDyno.tableName).toBeDefined();
        s3EventHandlerWithDyno.handler(eventData, context);
      });

    });

    afterAll(function(done){
      rimraf(s3rverFolder, function(err1){
        rimraf(dynaliteFolder, function(err2){
          if (err1 || err2){
            console.log('error deleting folders', err1, err2);
          }
          done();
        });
      });
    });
  });

}());

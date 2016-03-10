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

  var INPUT_BUFFER = fs.readFileSync('test/pdf/test.pdf');
  var EXPECTED_OUTPUT_HIGH = fs.readFileSync('test/images/expected-high.png');
  var EXPECTED_OUTPUT_MEDIUM = fs.readFileSync('test/images/expected-medium.png');
  var EXPECTED_OUTPUT_SMALL = fs.readFileSync('test/images/expected-low.png');

  var EVENT_DATA = require('./test-event.json');
  var TABLE_NAME = 'pdf-thumbnail-bucket-mappings';
  var INPUT_BUCKET_NAME = 'input-bucket';
  var OUT_PUTBUCKET_NAME = 'output-bucket';
  var INPUT_KEY = 'test.pdf';
  var OUTPUT_KEY = 'test-thumbnail.png';
  var VERIFIER_DATA = [{
    s3Bucket: OUT_PUTBUCKET_NAME,
    s3Key: OUTPUT_KEY,
    expectedOutputBuffer: EXPECTED_OUTPUT_HIGH
  }];

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
      TableName : TABLE_NAME,
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
        TableName: TABLE_NAME,
        Item: {
          SourceBucket: {S: INPUT_BUCKET_NAME},
          DestinationBucket: {S: OUT_PUTBUCKET_NAME}
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
        s3.createBucket({Bucket: INPUT_BUCKET_NAME}, function(err) {
          next(err, s3);
        });
      },
      function createOutputBucket(s3, next) {
        s3.createBucket({Bucket: OUT_PUTBUCKET_NAME}, function(err) {
          next(err, s3);
        });
      },
      function putTestFile(s3, next) {
        var params = {Bucket: INPUT_BUCKET_NAME, Key: INPUT_KEY, Body: INPUT_BUFFER};
        s3.putObject(params, function(err) {
          next(err, s3, dynamodb);
        });
      }
    ], callback);
  }

  function thumbnailVerifierHelper (s3, bucketname, key, expectedOutputBuffer) {
    return function (callback) {
      s3.getObject(
        {Bucket: bucketname, Key: key},
        function(downloadError, response) {
          if (downloadError) {
            callback(downloadError);
            return;
          }

          callback(null, bufferEqual(response.Body, expectedOutputBuffer));
        }
      );
    };
  }

  function thumbnailVerifier(s3, data, callback) {
    var work =[];

    data.forEach(function(element) {
      work.push(thumbnailVerifierHelper(
        s3,
        element.s3Bucket,
        element.s3Key,
        element.expectedOutputBuffer
      ));
    });

    async.parallel(work, callback);
  }

  function makeLambdaContext(verifierData, s3, expect, jasmineDone) {
    return {
      fail: function() {
        expect(false).toBe(true);
        jasmineDone();
      },
      done: function() {
        thumbnailVerifier(s3, verifierData, function(err, correctArray) {
          var correct = true;

          correctArray.forEach(function(bool){
            correct = correct && bool;
          });

          expect(err).toBeFalsy();
          expect(correct).toBe(true);
          jasmineDone();
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
          INPUT_BUCKET_NAME, 'test',
          OUT_PUTBUCKET_NAME, OUTPUT_KEY, function(err) {
            expect(function(){throw err;}).toThrowError('unable to infer document type for key test');
            done();
          });
      });

      it('should return an error, when the input file is not of type pdf', function (done) {
        lambdaPdfThumbnail.generateThumbnail(
          mockS3, 72, INPUT_BUCKET_NAME,
          'test.jpeg', OUT_PUTBUCKET_NAME,
          OUTPUT_KEY, function(err) {
            expect(function(){throw err;}).toThrowError('skipping non-pdf test.jpeg');
            done();
          });
      });

      it('should make a thumbnail and save it in a bucket', function(done) {
        lambdaPdfThumbnail.generateThumbnail(
          mockS3, 72,
          INPUT_BUCKET_NAME, INPUT_KEY,
          OUT_PUTBUCKET_NAME, OUTPUT_KEY, function(thumbnailError) {
            expect(thumbnailError).toBeFalsy();

            thumbnailVerifier(mockS3, VERIFIER_DATA, function(downloadError, correctArray) {
              expect(downloadError).toBeFalsy();
              expect(correctArray[0]).toBe(true);
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
        var verifierContext = makeLambdaContext(VERIFIER_DATA, mockS3, expect, done);
        var s3EventHandler = new lambdaPdfThumbnail.S3EventHandler({
          region:'eu-west-1',
          outputBucketName:'output-bucket',
          s3: mockS3
        });

        expect(s3EventHandler.outputBucketName).toBeDefined();
        expect(s3EventHandler.tableName).not.toBeDefined();
        s3EventHandler.handler(EVENT_DATA, verifierContext);
      });

      it('with specified output-bucket and multiple resolution should save mutliple thumbnails', function(done){
        var verifierData = [
          {
            s3Bucket: OUT_PUTBUCKET_NAME,
            s3Key: 'test-high.png',
            expectedOutputBuffer: EXPECTED_OUTPUT_HIGH
          },
          {
            s3Bucket: OUT_PUTBUCKET_NAME,
            s3Key: 'test-medium.png',
            expectedOutputBuffer: EXPECTED_OUTPUT_MEDIUM
          },
          {
            s3Bucket: OUT_PUTBUCKET_NAME,
            s3Key: 'test-low.png',
            expectedOutputBuffer: EXPECTED_OUTPUT_SMALL
          }
        ];
        var context = makeLambdaContext(verifierData, mockS3, expect, done);
        var s3EventHandler = new lambdaPdfThumbnail.S3EventHandler({
          region:'eu-west-1',
          outputBucketName:'output-bucket',
          s3: mockS3,
          resolution: {
            '-low': 26,
            '-medium': 52,
            '-high': 72
          }
        });

        expect(s3EventHandler.outputBucketName).toBeDefined();
        expect(s3EventHandler.tableName).not.toBeDefined();
        s3EventHandler.handler(EVENT_DATA, context);
      });

      it('with specified dynamo database should save a thumbnail', function(done){
        var context = makeLambdaContext(VERIFIER_DATA, mockS3, expect, done);
        var s3EventHandlerWithDyno = new lambdaPdfThumbnail.S3EventHandler({
          region:'eu-west-1',
          tableName: TABLE_NAME,
          s3: mockS3,
          dynamodb: mockDynamodb
        });
        expect(s3EventHandlerWithDyno.outputBucketName).not.toBeDefined();
        expect(s3EventHandlerWithDyno.tableName).toBeDefined();
        s3EventHandlerWithDyno.handler(EVENT_DATA, context);
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

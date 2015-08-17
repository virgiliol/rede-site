/*
 * Module dependencies
 */

var _ = require('underscore');
var request = require('supertest');
var async = require('async');
var should = require('should');
var moment = require('moment');
var mongoose = require('mongoose');

/*
 * The app
 */

var app = require('../../app');

/*
 * Models
 */

var Measurement = mongoose.model('Measurement');
var Sensor = mongoose.model('Sensor');

/*
 * Helpers
 */

var mongodb = require('../../lib/helpers/mongodb');
var express = require('../../lib/helpers/express');
var factory = require('../../lib/helpers/factory');
var messaging = require('../../lib/helpers/messaging');

/*
 * Config
 */
var config = require('../../config')['test'];
var apiPrefix = config.apiPrefix;
var numberOfSensors = 1;
var daysOfMeasurements = 90;
var measurementsInterval = 6;
var defaultPerPage = 20;


/*
 * Test data
 */
var nonExistingObjectHash = '556899153f90be8f422f3d3f';
var admin1;
var admin1AccessToken;
var user1;
var user1AccessToken;
var sensor1;
var sensorWith90DaysOfData;
var parameters = config.parameters;
var parametersCount = Object.keys(parameters).length;

/*
 * The tests
 */
describe('API: Measurements', function(){

  before(function (doneBefore) {
    this.timeout(10000);

    /*
     * Init database
     */
    mongodb.whenReady(function(){
      mongodb.clearDb(function(err){
        if (err) doneBefore(err);

        async.series([
          function (doneEach){
            factory.createAdmin(function(err,usr){
              if (err) return doneBefore(err);
              admin1 = usr;
              express.login(admin1.email, admin1.password, function(err, token){
                admin1AccessToken = token;
                doneEach(err);
              });
            });
          },
          function (doneEach){
            factory.createUser(function(err,usr){
              if (err) return doneBefore(err);
              user1 = usr;
              express.login(user1.email, user1.password, function(err, token){
                user1AccessToken = token;
                doneEach(err);
              });
            });
          },
          function (doneEach){
            factory.createSensorsWithMeasurements({numberOfSensors: numberOfSensors, days: daysOfMeasurements, interval: measurementsInterval}, function(err, sensor){
              if (err) doneBefore(err);
              sensor1 = sensor[0];
              doneEach();
            });
          }], doneBefore);
      });
    });
  });

  /*
   * GET measurements
  */
  describe('GET measurements', function(){
    it('return 200 and first page when a parameter is defined', function(doneIt){
      var payload = {
        sensor_id: sensor1._id.toHexString(),
        parameter_id: 'atmospheric_pressure'
      }

      /* The request */
    request(app)
      .get(apiPrefix + '/measurements')
      .query(payload)
      .expect('Content-Type', /json/)
      .expect(200)
      .end(onResponse);

      /* Verify response */
      function onResponse(err, res) {
        if (err) return doneIt(err);

        // Check pagination
        var body = res.body;
        body.should.have.property('count', daysOfMeasurements * 24 / measurementsInterval);
        body.should.have.property('perPage', defaultPerPage);
        body.should.have.property('page', 1);

        // Check sensor data
        body.should.have.property('sensor');
        body.sensor.should.have.property('_id', sensor1._id.toHexString());

        // Check parameter data
        body.should.have.property('parameter');
        body.parameter.should.have.property('_id', payload.parameter_id);

        /* Check data */
        var data = body.measurements;
        data.should.have.lengthOf(defaultPerPage);
        mongoose.model('Measurement')
          .find({
            sensor: payload.sensor_id,
            parameter: payload.parameter_id
          })
          .sort('-collectedAt')
          .limit(defaultPerPage)
          .lean()
          .exec(function(err, measurements){
            if (err) return doneIt(err);

            for (var i = 0; i < defaultPerPage; i++) {

              var measurement = measurements[i];
              data[i].should.have.property('_id', measurement._id.toHexString());
              data[i].should.have.property('value', measurement.value);
              data[i].should.not.have.property('parameter');
              data[i].should.not.have.property('sensor');

              var collectedAt = moment(data[i].collectedAt).format();
              collectedAt.should.equal(moment(measurement.collectedAt).format());
            }
            doneIt();
        });
      }
    });

    it('return 200 and first page when a parameter is NOT defined', function(doneIt){
      var payload = {
        sensor_id: sensor1._id.toHexString()
      }

      /* The request */
    request(app)
      .get(apiPrefix + '/measurements')
      .query(payload)
      .expect('Content-Type', /json/)
      .expect(200)
      .end(onResponse);

      /* Verify response */
      function onResponse(err, res) {
        if (err) return doneIt(err);

        // Check pagination
        var body = res.body;
        body.should.have.property('count', parametersCount * daysOfMeasurements * 24 / measurementsInterval);
        body.should.have.property('perPage', defaultPerPage);
        body.should.have.property('page', 1);

        // Check sensor data
        body.should.have.property('sensor');
        body.sensor.should.have.property('_id', sensor1._id.toHexString());

        // Check parameter data
        body.should.not.have.property('parameter');

        /* Check data */
        var data = body.measurements;
        data.should.have.lengthOf(defaultPerPage);
        mongoose.model('Measurement')
          .find({
            sensor: payload.sensor_id
          })
          .sort('-collectedAt')
          .limit(defaultPerPage)
          .lean()
          .exec(function(err, measurements){
            if (err) return doneIt(err);

            for (var i = 0; i < defaultPerPage; i++) {

              var measurement = measurements[i];
              data[i].should.have.property('_id', measurement._id.toHexString());
              data[i].should.have.property('value', measurement.value);
              data[i].should.have.property('parameter');
              data[i].should.not.have.property('sensor');

              var collectedAt = moment(data[i].collectedAt).format();
              collectedAt.should.equal(moment(measurement.collectedAt).format());
            }
            doneIt();
        });
      }
    });

    it('return 200 and valid data for correct pagination parameters', function(doneIt){

      var payload = {
        sensor_id: sensor1._id.toHexString(),
        parameter_id: 'atmospheric_pressure',
        page: 3,
        perPage: 14
      }

      /* The request */
      request(app)
        .get(apiPrefix + '/measurements')
        .query(payload)
        .expect('Content-Type', /json/)
        .expect(200)
        .end(onResponse);

      /* Verify response */
      function onResponse(err, res) {
        if (err) return doneIt(err);

        /* Check pagination */
        var body = res.body;
        body.should.have.property('count', daysOfMeasurements * 24 / measurementsInterval);
        body.should.have.property('perPage', payload.perPage);
        body.should.have.property('page', payload.page);
        body.should.have.property('measurements');

        /* Check data */
        var data = body.measurements;
        data.should.have.lengthOf(payload.perPage);
        mongoose.model('Measurement')
          .find({
            sensor: payload.sensor_id,
            parameter: payload.parameter_id
          })
          .sort('-collectedAt')
          .limit(payload.perPage)
          .skip(payload.perPage*(payload.page-1))
          .lean()
          .exec(function(err, measurements){
            if (err) return doneIt(err);
            for (var i = 0; i < payload.perPage; i++) {

              var measurement = measurements[i];
              data[i].should.have.property('_id', measurement._id.toHexString());
              data[i].should.have.property('value', measurement.value);
              data[i].should.not.have.property('parameter');
              data[i].should.not.have.property('sensor');

              var collectedAt = moment(data[i].collectedAt).format();
              collectedAt.should.equal(moment(measurement.collectedAt).format());

            }
             doneIt();
          });
      }
    });

    it('can filter by date range', function(doneIt){
      var fromDate = moment.utc().subtract(23, 'day').toISOString();
      var toDate = moment.utc().subtract(10, 'day').toISOString();

      var payload = {
        sensor_id: sensor1._id.toHexString(),
        parameter_id: 'atmospheric_pressure',
        fromDate: fromDate,
        toDate: toDate
      }

      /* The request */
    request(app)
      .get(apiPrefix + '/measurements')
      .query(payload)
      .expect(200)
      // .expect('Content-Type', /json/)
      .end(onResponse);

      /* Verify response */
      function onResponse(err, res) {
        if (err) return doneIt(err);

        // Check pagination
        var body = res.body;
        body.should.have.property('perPage', defaultPerPage);
        body.should.have.property('page', 1);

        // Check sensor data
        body.should.have.property('sensor');
        body.sensor.should.have.property('_id', sensor1._id.toHexString());

        // Check parameter data
        body.should.have.property('parameter');
        body.parameter.should.have.property('_id', payload.parameter_id);

        /* Check data */
        var data = body.measurements;
        data.should.have.lengthOf(defaultPerPage);
        mongoose.model('Measurement')
          .find({
            sensor: payload.sensor_id,
            parameter: payload.parameter_id,
            collectedAt: {
              $gte: fromDate,
              $lte: toDate
            }
          })
          .sort('-collectedAt')
          .lean()
          .exec(function(err, measurements){
            if (err) return doneIt(err);

            body.should.have.property('count', measurements.length);


            for (var i = 0; i < defaultPerPage; i++) {

              var measurement = measurements[i];
              data[i].should.have.property('_id', measurement._id.toHexString());
              data[i].should.have.property('value', measurement.value);
              data[i].should.not.have.property('parameter');
              data[i].should.not.have.property('sensor');

              var collectedAt = moment(data[i].collectedAt).format();
              collectedAt.should.equal(moment(measurement.collectedAt).format());
            }
            doneIt();
        });
      }
    });
  });


  /*
   * POST measurements/new
  */
  describe('POST measurements/new', function(){
    it('should return 200 for valid data', function(doneIt){
      var payload = {
        sensorIdentifier: sensor1.identifier,
        data: '2015-07-14T10:08:15-03:00;Tw=20.3;Ta:F=78.29;pH=6.9'
      }

      var time = new Date('2015-07-14T10:08:15-03:00');

      request(app)
        .post(apiPrefix + '/measurements/new')
        .send(payload)
        .expect(200)
        .expect('Content-Type', /json/)
        .end(function(err, res){
          if (err) return doneIt(err);
          var body = res.body;

          // Verify each parameter sent
          async.parallel([
            function(doneEach){
              Measurement
                .findOne({
                  sensor: sensor1._id,
                  parameter: 'water_temperature',
                  collectedAt: {
                    $gte: time,
                    $lte: time
                  }
                }, function(err, measurement){
                  if (err) return doneIt(err);
                  should.exist(measurement);
                  measurement.should.have.property('value', 20.3);
                  doneEach();
              });
            },function(doneEach){
              Measurement
                .findOne({
                  sensor: sensor1._id,
                  parameter: 'ambient_temperature',
                  collectedAt: {
                    $gte: time,
                    $lte: time
                  }
                }, function(err, measurement){
                  if (err) return doneIt(err);
                  should.exist(measurement);
                  measurement.should.have.property('value', 78.29);
                  doneEach();
              });
            },function(doneEach){
              Measurement
                .findOne({
                  sensor: sensor1._id,
                  parameter: 'ph',
                  collectedAt: {
                    $gte: time,
                    $lte: time
                  }
                }, function(err, measurement){
                  if (err) return doneIt(err);
                  should.exist(measurement);
                  measurement.should.have.property('value', 6.9);
                  doneEach();
              });
            }], doneIt);
        });
    });

    it('should return 400 for invalid timestamp', function(doneIt){
      var payload = {
        sensorIdentifier: sensor1.identifier,
        data: '2015-07-14T10:08:15-03:00Tw=20.3;Ta:F=78.29;pH=6.9'
      }

      request(app)
        .post(apiPrefix + '/measurements/new')
        .send(payload)
        .expect(400)
        .expect('Content-Type', /json/)
        .end(function(err, res){
          if (err) doneIt(err);
          res.body.messages.should.have.lengthOf(1);
          messaging.hasValidMessages(res.body).should.be.true;
          res.body.messages[0].should.have.property('text', 'measurements.data_string.invalid_timestamp');
          doneIt();
        });
    });

    it('should return 400 for missing measurements', function(doneIt){
      var payload = {
        sensorIdentifier: sensor1.identifier,
        data: '2015-07-14T10:08:15-03:00;'
      }

      request(app)
        .post(apiPrefix + '/measurements/new')
        .send(payload)
        .expect(400)
        .expect('Content-Type', /json/)
        .end(function(err, res){
          if (err) doneIt(err);
          res.body.messages.should.have.lengthOf(1);
          messaging.hasValidMessages(res.body).should.be.true;
          res.body.messages[0].should.have.property('text', 'measurements.data_string.missing_measurements');
          doneIt();
        });
    });

    it('should return 400 for malformed measurements', function(doneIt){
      var payload = {
        sensorIdentifier: sensor1.identifier,
        data: '2015-07-14T10:08:15-03:00;Tw=20.3;Ta:F=78.29;pH'
      }

      request(app)
        .post(apiPrefix + '/measurements/new')
        .send(payload)
        .expect(400)
        .expect('Content-Type', /json/)
        .end(function(err, res){
          if (err) doneIt(err);
          res.body.messages.should.have.lengthOf(1);
          messaging.hasValidMessages(res.body).should.be.true;
          res.body.messages[0].should.have.property('text', 'measurements.data_string.malformed_measurement');
          doneIt();
        });
    });
  });

  /*
   *  DEL measurements/:measurement_id
   */
  describe('DEL measurements/:measurement_id', function(){
    var measurementToDelete;

    before(function(doneBefore){
      Measurement.findOne(function(err, m){
        if (err) doneBefore(err);
        should.exist(m);

        measurementToDelete = m;
        doneBefore();
      });
    });

    context('not logged in', function(){
      it('should return 401 (Unauthorized)', function(doneIt){
        request(app)
          .del(apiPrefix + '/measurements/'+measurementToDelete._id.toHexString())
          .expect(401)
          .end(function(err,res){
            if (err) doneIt(err);
            res.body.messages.should.have.lengthOf(1);
            messaging.hasValidMessages(res.body).should.be.true;
            res.body.messages[0].should.have.property('text', 'access_token.unauthorized');
            doneIt();
          });
      });
    });

    context('when logged as regular user', function(){
      it('should return 401 (Unauthorized)', function(doneIt){
        request(app)
          .del(apiPrefix + '/measurements/'+measurementToDelete._id.toHexString())
          .set('Authorization', user1AccessToken)
          .expect(401)
          .end(function(err,res){
            if (err) doneIt(err);
            res.body.messages.should.have.lengthOf(1);
            messaging.hasValidMessages(res.body).should.be.true;
            res.body.messages[0].should.have.property('text', 'access_token.unauthorized');
            doneIt();
          });
      });
    });

    context('when logged as admin user', function(){
      it('delete and return 200 (Success)', function(doneIt){
        request(app)
          .del(apiPrefix + '/measurements/'+measurementToDelete._id.toHexString())
          .set('Authorization', admin1AccessToken)
          .expect(200)
          .end(function(err, res){
            if (err) doneIt(err);
            var body = res.body;

            // sensor should not exist
            Measurement.findById(measurementToDelete._id, function(err, m){
              if (err) return doneIt(err);
              should.not.exist(m);
              doneIt();
          });
        });
      });

      it('return 404 (Not found) for id not found', function(doneIt){
        request(app)
          .get(apiPrefix + '/sensors/'+ nonExistingObjectHash)
          .expect(404)
          .expect('Content-Type', /json/)
          .end(function(err, res){
            if (err) return doneIt(err);
            var body = res.body;

            res.body.messages.should.have.lengthOf(1);
            messaging.hasValidMessages(res.body).should.be.true;
            res.body.messages[0].should.have.property('text', 'sensors.not_found');

            doneIt();
          });
      });
    });
  });


  /*
   * GET measurements/aggregate
  */
  describe('GET measurements/aggregate', function(){
    it('aggregates by hour', function(doneIt){

      var startTimestamp = moment.utc().subtract(30, 'hour');
      var endTimestamp = moment.utc().subtract(5, 'hour');


      var payload = {
        sensor_id: sensor1._id.toHexString(),
        parameter_id: 'atmospheric_pressure',
        resolution: 'hour',
        startTimestamp: startTimestamp.toISOString(),
        endTimestamp: endTimestamp.toISOString()
      }

      var start = {
        year: moment(payload.startTimestamp).year(),
        month: moment(payload.startTimestamp).month() + 1,
        day: moment(payload.startTimestamp).date(),
        hour: moment(payload.startTimestamp).hour() + 1
      }

      var end = {
        year: moment(payload.endTimestamp).year(),
        month: moment(payload.endTimestamp).month() + 1,
        day: moment(payload.endTimestamp).date(),
        hour: moment(payload.endTimestamp).hour() + 1
      }

      /* The request */
      request(app)
        .get(apiPrefix + '/measurements/aggregate')
        .query(payload)
        .expect('Content-Type', /json/)
        .expect(200)
        .end(onResponse);

      /* Verify response */
      function onResponse(err, res) {
        if (err) return doneIt(err);

        // Check general data
        var body = res.body;
        body.should.have.property('sensor_id', sensor1._id.toHexString());
        body.should.have.property('parameter_id', payload.parameter_id);
        body.should.have.property('startTimestamp', startTimestamp.toISOString());
        body.should.have.property('endTimestamp', endTimestamp.toISOString());
        body.should.have.property('resolution', payload.resolution);
        body['aggregates'].length.should.be.above(0);

        // Check aggregation
        var aggregates = res.body.aggregates;
        _.each(aggregates, function(aggregate){
          should.exist(aggregate['_id']);

          var _id = aggregate['_id'];

          var date = moment().utc()
                      .year(_id.year)
                      .month(_id.month-1)
                      .date(_id.day)
                      .hour(_id.hour-1)
                      .toISOString();

          date.should.be.within(startTimestamp.toISOString(), endTimestamp.toISOString());
          aggregate['max'].should.be.Number();
          aggregate['avg'].should.be.Number();
          aggregate['min'].should.be.Number();
        });

        mongoose
          .model('Measurement')
          .count({
            sensor: payload.sensor_id,
            parameter: payload.parameter_id,
            collectedAt: {
              $gte: startTimestamp.toDate(),
              $lte: endTimestamp.toDate()
            }
          }, function (err, dbCount) {
            should.not.exist(err);
            body.should.have.property('count', dbCount);
            doneIt();
        });
      }
    });

    it('aggregates by day', function(doneIt){

      var startTimestamp = moment.utc().subtract(45, 'day').hours(0).minutes(0).seconds(0);
      var endTimestamp = moment.utc().subtract(5, 'day').hours(23).minutes(59).seconds(59);


      var payload = {
        sensor_id: sensor1._id.toHexString(),
        parameter_id: 'atmospheric_pressure',
        resolution: 'day',
        startTimestamp: startTimestamp.toISOString(),
        endTimestamp: endTimestamp.toISOString()
      }

      var start = {
        year: moment(payload.startTimestamp).year(),
        month: moment(payload.startTimestamp).month() + 1,
        day: moment(payload.startTimestamp).date()
      }

      var end = {
        year: moment(payload.endTimestamp).year(),
        month: moment(payload.endTimestamp).month() + 1,
        day: moment(payload.endTimestamp).date()
      }

      /* The request */
      request(app)
        .get(apiPrefix + '/measurements/aggregate')
        .query(payload)
        .expect('Content-Type', /json/)
        .expect(200)
        .end(onResponse);

      /* Verify response */
      function onResponse(err, res) {
        if (err) return doneIt(err);

        // Check general data
        var body = res.body;
        body.should.have.property('sensor_id', sensor1._id.toHexString());
        body.should.have.property('parameter_id', payload.parameter_id);
        body.should.have.property('startTimestamp');
        body.should.have.property('endTimestamp');
        body.should.have.property('resolution', payload.resolution);
        body['aggregates'].length.should.be.above(0);

        // Check aggregation
        var aggregates = res.body.aggregates;
        _.each(aggregates, function(aggregate){

          should.exist(aggregate['_id']);

          var _id = aggregate['_id'];

          var date = moment.utc()
                      .year(_id.year)
                      .month(_id.month-1)
                      .date(_id.day)
                      .toISOString();

          date.should.be.within(startTimestamp.toISOString(), endTimestamp.toISOString());
          aggregate['max'].should.be.Number();
          aggregate['avg'].should.be.Number();
          aggregate['min'].should.be.Number();
        });
        doneIt();
      }
    });
  });

  /*
   * After tests, clear database
   */
  after(mongodb.clearDb);
})

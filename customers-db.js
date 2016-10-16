'use strict'
var Pool = require('pg').Pool
var lib = require('http-helper-functions')
const db = require('./customers-pg.js')

function withErrorHandling(req, res, callback) {
  return function (err) {
    if (err == 404) 
      lib.notFound(req, res)
    else if (err)
      lib.internalError(res, err)
    else 
      callback.apply(this, Array.prototype.slice.call(arguments, 1))
  }
}

function createCustomerThen(req, res, id, customer, callback) {
  lib.internalizeURLs(customer, req.headers.host)
  db.createCustomerThen(id, customer, withErrorHandling(req, res, callback))
}

function withCustomerDo(req, res, id, callback) {
  db.withCustomerDo(id, withErrorHandling(req, res, callback))
}

function withCustomerFromNameDo(req, res, name, callback) {
  db.withCustomerFromNameDo(name, withErrorHandling(req, res, callback))
}

function deleteCustomerThen(req, res, id, callback) {
  db.deleteCustomerThen(id, withErrorHandling(req, res, callback))
}

function updateCustomerThen(req, res, id, customer, patchedCustomer, etag, callback) {
  lib.internalizeURLs(req, patchedCustomer)
  db.updateCustomerThen(id, customer, patchedCustomer, etag, withErrorHandling(req, res, callback))
}

function init(callback) {
  db.init(callback)
}

exports.createCustomerThen = createCustomerThen
exports.updateCustomerThen = updateCustomerThen
exports.deleteCustomerThen = deleteCustomerThen
exports.withCustomerDo = withCustomerDo
exports.withCustomerFromNameDo = withCustomerFromNameDo
exports.db = db
exports.init = init
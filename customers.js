'use strict'
const http = require('http')
const url = require('url')
const lib = require('http-helper-functions')
const pLib = require('permissions-helper-functions')
const db = require('./customers-db')

var initialized = false
const CUST = '/cust-'

function createAdminTeamFor(serverReq, serverRes, subject, initialMember, permissions_f, callback) {
  function secureSubject(teamURL) {
    var permissions = permissions_f(teamURL)
    permissions._subject = subject
    lib.sendInternalRequestThen(serverReq.headers, serverRes, '/permissions', 'POST', JSON.stringify(permissions), function (clientRes) {
      lib.getClientResponseBody(clientRes, function(body) {
        if (clientRes.statusCode == 201) {
          initialized = true
          callback(teamURL)
        } else
          lib.internalError(serverRes, `unable to secure ${subject} statusCode: ${clientRes.statusCode} body: ${body}`)
      })
    })
  }
  // because of the null relative URLs ('') in the following, the administrator for the team is the team itself
  var admins = {isA: 'Team', members: [initialMember], permissions: {_self: {read: [''], update: ['']}, _permissions: {read: [''], update: ['']}}} // '' is null relative URL
  lib.sendInternalRequestThen(serverReq.headers, serverRes, '/teams', 'POST', JSON.stringify(admins), function (clientRes) {
    lib.getClientResponseBody(clientRes, function(body) {
      if (clientRes.statusCode == 201)
        secureSubject(clientRes.headers.location)
      else
        lib.internalError(serverRes, `unable to create sysAdmin team statusCode: ${clientRes.statusCode} body: ${body}`)
    })
  })    
}

function init(serverReq, serverRes, callback) {
  // make sure there is a hostAdmin team. If not, create it and specify that only members of that team can create customers
  lib.sendInternalRequestThen(serverReq.headers, serverRes, '/permissions?/customers', 'GET', null, function (clientRes) {
    lib.getClientResponseBody(clientRes, function(body) {
      if (clientRes.statusCode == 404) {
        var initialAdmin = lib.getUser(serverReq.headers.authorization)
        var initialPermissions = function(teamURL) {
          return {
            _self: {read:[teamURL], create: [teamURL], delete: [teamURL]}, 
            _permissions: {read: [teamURL], update: [teamURL]}
          }
        }
        createAdminTeamFor(serverReq, serverRes, '/customers', initialAdmin, initialPermissions, callback) // current caller will be initial hostAdmin
      } else if (clientRes.statusCode == 200) {
        initialized = true
        callback()
      } else
        lib.internalError(res, 'unable to create permissions for /customers')
    })
  })
}

function verifyCustomer(customer) {
  var name = customer.name
  if (typeof name != 'string')
    return `customer name must be a string`
  if (customer.isA != 'Customer')
    return `customer must have an isA property with value "Customer"`
  if (customer.initialCustomerAdmin == null)
    return `customer must have an initial Admin`
  return null
}

function createCustomer(req, res, customer) {
  function primCreateCustomer() {
    pLib.ifAllowedThen(req, res, '/customers', '_self', 'create', function() {
      var err = verifyCustomer(customer)
      if (err !== null)
        lib.badRequest(res, err)
      else {
        db.db.withCustomerFromNameDo(customer.name, function(err) {
          if (err == 404) {
            var id = lib.uuid4()
            var selfURL = makeSelfURL(req, id)
            function initialPermissions(teamURL) {
              return {
                _self: {read:[teamURL], create: [teamURL], delete: [teamURL]}, 
                _permissions: {read: [teamURL], update: [teamURL]},
                dqss: {read:[teamURL], create: [teamURL], delete: [teamURL]}
              }
            }
            createAdminTeamFor(req, res, selfURL, customer.initialCustomerAdmin, initialPermissions, function(teamURL) {
              // Create permissions first. If we fail after creating the permissions resource but before creating the main resource, 
              // there will be a useless but harmless permissions document.
              // If we do things the other way around, a customer without matching permissions could cause problems.
              customer.customerAdminTeam = teamURL
              delete customer.initialCustomerAdmin
              db.createCustomerThen(req, res, id, customer, function(etag) {
                  addCalculatedProperties(req, customer, selfURL)
                  lib.created(req, res, customer, customer.self, etag)
              })
            })
          } else
            lib.duplicate(req, res)
        })
      }
    })
  }
  if (lib.getUser(req.headers.authorization) == null) 
    lib.unauthorized(req, res)
  else 
    if (initialized)
      primCreateCustomer()
    else
      init(req, res, primCreateCustomer)
}

function makeSelfURL(req, key) {
  return `//${req.headers.host}${CUST}${key}`
}

function addCalculatedProperties(req, entity, selfURL) {
  entity.self = selfURL
  entity._permissions = `scheme://authority/permissions?${entity.self}`
}

function getCustomer(req, res, id) {
  var trueURL = makeSelfURL(req, id)
  pLib.ifAllowedThen(req, res, trueURL, '_self', 'read', function() {
    db.withCustomerDo(req, res, id, function(customer , etag) {
      var selfURL = makeSelfURL(req, id)
      addCalculatedProperties(req, customer, selfURL)
      lib.found(req, res, customer, etag, trueURL)
    })
  })
}

function deleteCustomer(req, res, id) {
  var trueURL = makeSelfURL(req, id)
  pLib.ifAllowedThen(req, res, trueURL, '_self', 'delete', function() {
    lib.sendInternalRequestThen(req.headers, res, `/permissions?/customers;${id}`, 'DELETE', null, function (err, clientRes) {
      db.deleteCustomerThen(req, res, id, function (customer, etag) {
        var selfURL = makeSelfURL(req, id)
        addCalculatedProperties(req, customer, selfURL)
        lib.found(req, res, customer, etag, trueURL)
      })
    })
  })
}

function requestHandler(req, res) {
  function handleCustomerMethods(id) {
    if (req.method == 'GET') 
      getCustomer(req, res, id)
    else if (req.method == 'DELETE') 
      deleteCustomer(req, res, id)
    else
      lib.methodNotAllowed(req, res, ['GET', 'DELETE'])    
  }
  if (req.url == '/customers')
    if (req.method == 'POST')
      lib.getServerPostObject(req, res, createCustomer)
    else 
      lib.methodNotAllowed(req, res, ['POST'])
  else {
    var req_url = url.parse(req.url)
    if (req_url.pathname.startsWith(CUST) && req_url.search == null) 
      handleCustomerMethods(req_url.pathname.substring(CUST.length))
    else if (req_url.pathname.startsWith('/customers;') && req_url.search == null) 
      db.withCustomerFromNameDo(req, res, req_url.pathname.split('/')[1].substring('customers;'.length), function(id) {
        handleCustomerMethods(id)
      })
    else
      lib.notFound(req, res)
  }
}

db.init(function() {
  var port = process.env.PORT
  http.createServer(requestHandler).listen(port, function() {
    console.log(`server is listening on ${port}`)
  })
})
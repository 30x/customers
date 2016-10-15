'use strict'
const http = require('http')
const url = require('url')
const lib = require('http-helper-functions')
const pLib = require('permissions-helper-functions')
const db = require('./customers-db')

var initialized = false
const baseURL = `${process.env.INTERNAL_PROTOCOL}://${process.env.INTERNAL_ROUTER}`
const CUST = '/cust-'

function init(serverReq, serverRes, callback) {
  // make sure there is a sys_admin team. If not, create it and specify that only members of that team can create customers
  function createSysAdminTeam() {
    var sysAdmins = {isA: 'Team', members: [lib.getUser(serverReq.headers.authorization)], permissions: {_self: {read: [''], update: ['']}, _permissions: {read: [''], update: ['']}}} // '' is null relative URL
    lib.sendInternalRequest(serverReq.headers, '/teams', 'POST', JSON.stringify(sysAdmins), function (err, clientRes) {
      if (err)
        lib.internalError(serverRes, err)
      else
        lib.getClientResponseBody(clientRes, function(body) {
          if (clientRes.statusCode == 201)
            secureCustomersList(clientRes.headers.location)
          else
            lib.internalError(serverRes, `unable to create sysAdmin team statusCode: ${clientRes.statusCode} body: ${body}`)
        })
    })    
  }
  function secureCustomersList(teamURL) {
    var permissions = {_subject: '/customers', _self: {read:[teamURL], create: [teamURL], delete: [teamURL]}, _permissions: {read: [teamURL], update: [teamURL]}}
    lib.sendInternalRequestThen(serverReq.headers, serverRes, '/permissions', 'POST', JSON.stringify(permissions), function (clientRes) {
      lib.getClientResponseBody(clientRes, function(body) {
        if (clientRes.statusCode == 201) {
          initialized = true
          callback()
        } else
          lib.internalError(serverRes, `unable to secure /customers resource statusCode: ${clientRes.statusCode} body: ${body}`)
      })
    })
  }
  lib.sendInternalRequest(serverReq.headers, '/permissions?/customers', 'GET', null, function (err, clientRes) {
    if (err)
      lib.internalError(serverRes, err)
    else
      lib.getClientResponseBody(clientRes, function(body) {
        if (clientRes.statusCode == 404)
          createSysAdminTeam()
        else if (clientRes.statusCode == 200) {
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
  return null
}

function createCustomer(req, res, customer) {
  function primCreateCustomer() {
    var user = lib.getUser(req.headers.authorization)
    if (user == null) {
      lib.unauthorized(req, res)
    } else 
      pLib.ifAllowedThen(req, res, '/customers', '_self', 'create', function() {
        var err = verifyCustomer(customer)
        if (err !== null)
          lib.badRequest(res, err)
        else {
          var permissions = customer.permissions
          if (permissions !== undefined)
            delete customer.permissions
          var id = lib.uuid4()
          var selfURL = makeSelfURL(req, id)
          pLib.createPermissionsThen(req, res, selfURL, permissions, function(permissionsURL, permissions){
            // Create permissions first. If we fail after creating the permissions resource but before creating the main resource, 
            // there will be a useless but harmless permissions document.
            // If we do things the other way around, a customer without matching permissions could cause problems.
            db.createCustomerThen(req, res, id, customer, function(etag) {
              addCalculatedProperties(req, customer, selfURL)
              lib.created(req, res, customer, customer.self, etag)
            })
          })
        }
      })
  }
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
  entity._permissions = `protocol://authority/permissions?${entity.self}`
}

function getCustomer(req, res, id) {
  pLib.ifAllowedThen(req, res, '//' + req.headers.host + req.url, '_self', 'read', function() {
    db.withCustomerDo(req, res, id, function(customer , etag) {
      var selfURL = makeSelfURL(req, id)
      addCalculatedProperties(req, customer, selfURL)
      lib.found(req, res, customer, etag)
    })
  })
}

function deleteCustomer(req, res, id) {
  pLib.ifAllowedThen(req, res, '//' + req.headers.host + req.url, '_self', 'delete', function() {
    lib.sendInternalRequestThen(req.headers, res, `/permissions?/customers;${id}`, 'DELETE', null, function (err, clientRes) {
      db.deleteCustomerThen(req, res, id, function (customer, etag) {
        var selfURL = makeSelfURL(req, id)
        addCalculatedProperties(req, customer, selfURL)
        lib.found(req, res, customer, etag)
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
      db.withCustomerFromNameDo(req, res, req_url.pathname.split('/')[0].substring('/customers;'.length), function(id) {
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
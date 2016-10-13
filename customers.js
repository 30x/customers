'use strict'
const http = require('http')
const url = require('url')
const lib = require('http-helper-functions')
const pLib = require('permissions-helper-functions')

var initialized = false
var baseURL = `${process.env.INTERNAL_PROTOCOL}://${process.env.INTERNAL_ROUTER}`

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
    lib.sendInternalRequest(serverReq.headers, '/permissions', 'POST', JSON.stringify(permissions), function (err, clientRes) {
      if (err)
        lib.internalError(serverRes, err)
      else
        lib.getClientResponseBody(clientRes, function(body) {
          if (clientRes.statusCode == 201)
            callback()
          else
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
        else if (clientRes.statusCode == 200)
          callback()
        else
          lib.internalError(res, 'unable to create permissions for /customers')
      })
  })
}

function verifyCustomer(ns) {
  var name = ns.name
  if (typeof name != 'string')
    return `customer name must be a string`
  return null
}

function createCustomer(req, res, ns) {
  function primCreateCustomer() {
    var user = lib.getUser(req.headers.authorization)
    if (user == null) {
      lib.unauthorized(req, res)
    } else 
      pLib.ifAllowedThen(req.headers, null, '_self', 'create', function(err, reason) {
        if (err)
          lib.internalError(res, reason)
        else {
          var err = verifyCustomer(ns)
          if (err !== null)
            lib.badRequest(res, err)
          else {
            var permissions = ns.permissions
            if (permissions !== undefined)
              delete ns.permissions
            var selfURL = makeSelfURL(req, ns.name)
            lib.createPermissonsFor(req, res, selfURL, permissions, function(permissionsURL, permissions){
              addCalculatedCustomerProperties(req, ns, selfURL)
              lib.created(req, res, ns, selfURL)
            })
            // We are not going to store any information about a customer, since we can recover its name from its url 
          }
        }
      })
  }
  if (initialized)
    primCreateCustomer()
  else
    init(req, res, primCreateCustomer)
}

function makeSelfURL(req, key) {
  return `//${req.headers.host}/customers;${key}`
}

function addCalculatedCustomerProperties(req, map, selfURL) {
  map.self = selfURL
  map._permissions = `protocol://authority/permissions?${map.self}`
}

function getCustomer(req, res, id) {
  pLib.ifAllowedThen(req.headers, null, '_self', 'read', function(err, reason) {
    if (err)
      lib.internalError(res, reason)
    else {
      var selfURL = makeSelfURL(req, id)
      var customer = {isA: 'Customer', name: req.url.split('/').slice(-1)[0]}
      addCalculatedCustomerProperties(req, customer, selfURL)
      lib.found(req, res, customer)
    }
  })
}

function deleteCustomer(req, res, id) {
  lib.ifAllowedThen(req.headers, null, '_self', 'delete', function(err, reason) {
    if (err)
      lib.internalError(res, reason)
    else
      lib.sendInternalRequest(req.headers, `/permissions?/customers;${id}`, 'DELETE', null, function (err, clientRes) {
        if (err)
          lib.internalError(res, err)
        else if (clientRes.statusCode == 404)
          lib.notFound(req, res)
        else if (clientRes.statusCode == 200) {
          var selfURL = makeSelfURL(req, id)
          var customer = {isA: 'Customer', name: req.url.split('/').slice(-1)[0]}
          addCalculatedCustomerProperties(req, customer, selfURL)
          lib.found(req, res, customer)
        } else
          getClientResponseBody(clientRes, function(body) {
            var err = {statusCode: clientRes.statusCode, msg: `failed to create permissions for ${resourceURL} statusCode ${clientRes.statusCode} message ${body}`}
            internalError(serverRes, err)
          })
      })
  })
}

function requestHandler(req, res) {
  if (req.url == '/customers')
    if (req.method == 'POST')
      lib.getServerPostObject(req, res, createCustomer)
    else 
      lib.methodNotAllowed(req, res, ['POST'])
  else {
    var req_url = url.parse(req.url)
    if (req_url.pathname.lastIndexOf('/customers;', 0) > -1 && req_url.search == null) {
      var id = req_url.pathname.substring('/customers;'.length)
      if (req.method == 'GET') 
        getCustomer(req, res, id)
      else if (req.method == 'DELETE') 
        deleteCustomer(req, res, id)
      else
        lib.methodNotAllowed(req, res, ['GET', 'DELETE'])
    } else 
      lib.notFound(req, res)
  }
}

var port = process.env.PORT
http.createServer(requestHandler).listen(port, function() {
  console.log(`server is listening on ${port}`)
})

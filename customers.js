'use strict'
const http = require('http')
const url = require('url')
const lib = require('http-helper-functions')

var initialized = false
var baseURL = `${process.env.INTERNAL_PROTOCOL}://${process.env.INTERNAL_ROUTER}`

function init(serverReq, serverRes, callback) {
  // make sure there is a sys_admin team. If not, create it and specify that only members of that team can create customers
  function createSysAdminTeam() {
    var sysAdmins = {isA: 'Team', members: [lib.getUser(serverReq)]}
    lib.sendInternalRequest(serverReq, serverRes, '/teams', 'POST', JSON.stringify(sysAdmins), function (clientRes) {
      lib.getClientResponseBody(clientRes, function(body) {
        if (clientRes.statusCode == 201)
          patchSysAdminTeamPermissions(clientRes, body)
        else
          lib.internalError(serverRes, `unable to create sysAdmin team statusCode: ${clientRes.statusCode} body: ${body}`)
      })
    })    
  }
  function patchSysAdminTeamPermissions(clientRes, body) {
    var team = JSON.parse(body)
    var teamURL = clientRes.headers.location
    var permissionsURL = team._permissions
    var patch = {_permissions: {read:[teamURL], update: [teamURL], create: null, delete: null}, _self: {read:[teamURL], update: [teamURL], create: null, delete: null}}
    var patchHeaders = {'content-type': 'application/merge-patch+json'}
    lib.sendInternalRequest(serverReq, serverRes, permissionsURL, 'GET', JSON.stringify(patch), patchHeaders, function (clientRes) {
      lib.getClientResponseBody(clientRes, function(body) {
        if (clientRes.statusCode == 200) {
          patchHeaders['if-match'] = clientRes.headers.etag
          lib.sendInternalRequest(serverReq, serverRes, permissionsURL, 'PATCH', JSON.stringify(patch), patchHeaders, function (clientRes) {
            lib.getClientResponseBody(clientRes, function(body) {
              if (clientRes.statusCode == 200) // successfully patched permissions for sysAdmin team
                secureCustomersList(teamURL)
              else 
                lib.internalError(serverRes, `unable to patch sysAdmin team permissions statusCode: ${clientRes.statusCode} body: ${body}`)
            })
          })
        } else
          lib.internalError(serverRes, `unable to retrieve sysAdmin team permissions at ${team._permissions} statusCode: ${clientRes.statusCode} body: ${body}`)
      })
    })    
  }
  function secureCustomersList(teamURL) {
    var permissions = {_subject: '/customers', _self: {read:[teamURL], create: [teamURL], delete: [teamURL]}, _permissions: {read: [teamURL], update: [teamURL]}}
    lib.sendInternalRequest(serverReq, serverRes, '/permissions', 'POST', JSON.stringify(permissions), function (clientRes) {
      lib.getClientResponseBody(clientRes, function(body) {
        if (clientRes.statusCode == 201)
          callback()
        else
          lib.internalError(serverRes, `unable to secure /customers resource statusCode: ${clientRes.statusCode} body: ${body}`)
      })
    })
  }
  lib.sendInternalRequest(serverReq, serverRes, '/permissions?/customers', 'GET', null, function (clientRes) {
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
    var user = lib.getUser(req)
    if (user == null) {
      lib.unauthorized(req, res)
    } else 
      lib.ifAllowedThen(req, res, null, '_self', 'create', function() { 
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
  lib.ifAllowedThen(req, res, null, '_self', 'read', function() {
    var selfURL = makeSelfURL(req, id)
    var customer = {isA: 'Customer', name: req.url.split('/').slice(-1)[0]}
    addCalculatedCustomerProperties(req, customer, selfURL)
    lib.found(req, res, customer)
  })
}

function deleteCustomer(req, res, id) {
  lib.ifAllowedThen(req, res, null, '_self', 'delete', function() {
    lib.sendInternalRequest(req, res, `/permissions?/customers;${id}`, 'DELETE', null, function (clientRes) {
      if (clientRes.statusCode == 404)
        lib.notFound(req, res)
      else if (clientRes.statusCode == 200){
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

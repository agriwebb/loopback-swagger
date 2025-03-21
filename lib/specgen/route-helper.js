// Copyright IBM Corp. 2015,2019. All Rights Reserved.
// Node module: loopback-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

// Globalization
var g = require('strong-globalize')();

/**
 * Module dependencies.
 */

var debug = require('debug')('loopback:explorer:routeHelpers');
var _assign = require('lodash').assign;
var typeConverter = require('./type-converter');
var schemaBuilder = require('./schema-builder');

var idSuffix = / id$/;
/**
 * Export the routeHelper singleton.
 */
var routeHelper = module.exports = {
  /**
   * Given a route, generate an API description and add it to the doc.
   * If a route shares a path with another route (same path, different verb),
   * add it as a new operation under that path entry.
   *
   * Routes can be translated to API declaration 'operations',
   * but they need a little massaging first. The `accepts` and
   * `returns` declarations need some basic conversions to be compatible.
   *
   * This method will convert the route and add it to the doc.
   *
   * @param  {Route} route    Strong Remoting Route object.
   * @param  {Class} classDef Strong Remoting class.
   * @param  {TypeRegistry} typeRegistry Registry of types and models.
   * @param  {Object} operationIdRegistry Registry of operationIds mapping
   *  operationId to an operation object.
   * @param  {Object} paths   Swagger Path Object,
   *   see https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md#pathsObject
   */
  addRouteToSwaggerPaths: function(route, classDef, typeRegistry,
    operationIdRegistry, paths, acls, opts) {
    var entryToAdd = routeHelper.routeToPathEntry(route, classDef,
      typeRegistry,
      operationIdRegistry, acls, opts);
    if (!(entryToAdd.path in paths)) {
      paths[entryToAdd.path] = {};
    }
    paths[entryToAdd.path][entryToAdd.method] = entryToAdd.operation;
  },

  /**
   * Massage route.accepts.
   * @param  {Object} route    Strong Remoting Route object.
   * @param  {Class}  classDef Strong Remoting class.
   * @param  {TypeRegistry} typeRegistry Registry of types and models.
   * @return {Array}           Array of param docs.
   */
  convertAcceptsToSwagger: function(route, classDef, typeRegistry, opts) {
    var accepts = route.accepts || [];
    var split = route.method.split('.');
    if (classDef && classDef.sharedCtor &&
        classDef.sharedCtor.accepts && split.length > 2 /* HACK */) {
      accepts = [].concat(classDef.sharedCtor.accepts)
        .concat(accepts);
    }

    // Filter out parameters that are generated from the incoming request,
    // or generated by functions that use those resources.
    accepts = accepts.filter(function(arg) {
      // Allow undocumenting a param.
      if (arg.documented === false) return false;
      // Below conditions are only for 'http'
      if (!arg.http) return true;
      // Don't show derived arguments.
      if (typeof arg.http === 'function') return false;
      // Don't show arguments set to the incoming http request.
      // Please note that body needs to be shown, such as User.create().
      if (arg.http.source === 'req' ||
        arg.http.source === 'res' ||
        arg.http.source === 'context') {
        return false;
      }
      return true;
    });

    // Turn accept definitions in to parameter docs.
    accepts = accepts.map(
      routeHelper.acceptToParameter(route, classDef, typeRegistry, opts)
    );

    return accepts;
  },

  /**
   * Massage route.returns.
   * @param  {Object} route    Strong Remoting Route object.
   * @return {Object}          A single returns param doc.
   */
  convertReturnsToSwagger: function(route, typeRegistry, opts) {
    if (opts && opts.generateRelationProperties) {
      if (route.method.match(/\.(find|findOne|findById|__(get|findById)__*)/)) {
        var returns = route.returns;
        var type = returns[0].type;
        var passthrough = schemaBuilder.isPrimitiveType(String(type)) ||
          String(type) === 'any';
        var newType = passthrough ? type : type + 'WithRelations';
        returns[0].type = Array.isArray(type) ? [newType] : newType;
        route.returns = returns;
      }
    }

    var routeReturns = route.returns;
    if (!routeReturns || !routeReturns.length) {
      // An operation that returns nothing will have
      // no schema declaration for its response.
      return undefined;
    }

    // Filter out arguments having http.target set to 'header' or 'status'
    routeReturns = routeReturns.filter(function(arg) {
      const target = arg.http && arg.http.target;
      return target !== 'header' && target !== 'status';
    });

    if (routeReturns.length === 1 && routeReturns[0].root) {
      if (routeReturns[0].model) {
        return {$ref: typeRegistry.reference(routeReturns[0].model)};
      }
      return schemaBuilder.buildFromLoopBackType(routeReturns[0], typeRegistry);
    } else if (routeReturns.length === 1 && routeReturns[0].type === 'ReadableStream') {
      return {type: 'file'};
    }

    // Construct scheme for the return object
    var schema = {type: 'object'};
    schema.properties = {};
    routeReturns.forEach(function(ret) {
      var propName = ret.name || ret.arg;
      var idlType = schemaBuilder.getLdlTypeName(ret.type);
      // Take care of array which can be nested.
      // Note that we cannot simply use buildFromLoopBackType since it converts unknown type to
      // '$ref': '#/definitions/UnknownType', whereas we decided to emit 'type: object' for such a case.
      // See https://github.com/strongloop/loopback-swagger/pull/28#discussion_r54873911
      // The following code is needed to take care of a nested array of an unknown type.
      var itemIdlType = idlType;
      var genericIdlType = {type: 'object'};
      while (Array.isArray(itemIdlType)) {
        itemIdlType = schemaBuilder.getLdlTypeName(itemIdlType[0]);
        genericIdlType = {type: 'array', items: genericIdlType};
      }
      if (schemaBuilder.isPrimitiveType(itemIdlType)) {
        schema.properties[propName] =
          schemaBuilder.buildFromLoopBackType(ret, typeRegistry);
      } else {
        if (typeRegistry.isDefined(itemIdlType)) {
          schema.properties[propName] =
            schemaBuilder.buildFromLoopBackType(ret, typeRegistry);
        } else {
          debug('Swagger: temporarily using `object` instead of unknown ' +
          'type %j found in route %j', itemIdlType, route);
          schema.properties[propName] = genericIdlType;
        }
      }
      if (ret.required) {
        if (schema.required == null) {
          schema.required = [];
        }
        schema.required.push(propName);
      }
    });

    return schema;
  },

  /**
   * Converts from an sl-remoting-formatted "Route" description to a
   * Swagger-formatted "Path Item Object"
   * See swagger-spec/2.0.md#pathItemObject
   */
  routeToPathEntry: function(route, classDef,
    typeRegistry, operationIdRegistry, acls, opts) {
    // Some parameters need to be altered; eventually most of this should
    // be removed.
    var accepts = routeHelper.convertAcceptsToSwagger(route, classDef,
      typeRegistry, opts);
    var returns = routeHelper.convertReturnsToSwagger(route, typeRegistry, opts);
    var statusCode = route.returns && route.returns.length ? 200 : 204;

    if (route.http && route.http.status) {
      statusCode = route.http.status;
    }

    var responseMessages = {};
    responseMessages[statusCode] = {
      description: 'Request was successful',
      schema: returns,
      // TODO - headers, examples
    };

    if (route.returns && route.returns[0] && route.returns[0].example) {
      responseMessages[statusCode].examples = responseMessages[statusCode].examples || {};
      responseMessages[statusCode].examples['application/json'] = route.returns[0].example;
    }

    if (route.errors) {
      // TODO define new LDL syntax that is status-code-indexed
      // and which allow users to specify headers & examples
      route.errors.forEach(function(msg) {
        var schema = null;
        if (msg.responseModel) {
          schema = schemaBuilder.buildFromLoopBackType(msg.responseModel,
            typeRegistry);
        }
        responseMessages[msg.code] = {
          description: msg.message,
          schema: schema,
          // TODO - headers, examples
        };
      });
    }
    // const routeParts = rout.
    const methodParts = route.method.split('.');
    let methodName = methodParts.length && methodParts[methodParts.length - 1];
    if (route.http && route.http.errorStatus) {
      var errorStatus = route.http.errorStatus;
      if (!responseMessages[errorStatus]) {
        responseMessages[errorStatus] = {
          description: 'Unknown error',
          // TODO - headers, examples
        };
      }
    }

    debug('route %j', route);

    var path = routeHelper.convertPathFragments(route.path);
    var verb = routeHelper.convertVerb(route.verb);

    var tags = [];
    var swaggerSettings = classDef && classDef.ctor && classDef.ctor.settings &&
      classDef.ctor.settings.swagger || {};

    if (swaggerSettings.tag && swaggerSettings.tag.name) {
      tags.push(swaggerSettings.tag.name);
    } else if (classDef && classDef.name) {
      tags.push(classDef.name);
    }

    var id = route.method.replace('.prototype.', '_').replace('.', '_');
    var operationId = createUniqueOperationId(id, verb, path,
      operationIdRegistry);
    var entry = {
      path: path,
      method: verb,
      operation: {
        tags: tags,
        summary: typeConverter.convertText(route.description),
        description: typeConverter.convertText(route.notes),
        operationId: operationId,
        // [bajtos] we are omitting consumes and produces, as they are same
        // for all methods and they are already specified in top-level fields
        parameters: accepts,
        responses: responseMessages,
        deprecated: !!route.deprecated,
      },
    };
    const isPublic = (acls.length === 0) || methodName && acls.some(acl => acl.permission === acl.constructor.ALLOW && acl.principalId === '$everyone' && acl.property === methodName);
    if (!isPublic) {
      entry.operation.security = [{
        bearer: []
      }];
    }
    var hasFormData = accepts.some(function (parameter) {
      return parameter.in === 'formData';
    });
    if (hasFormData) {
      entry.operation.consumes = ['application/x-www-form-urlencoded'];
    }

    operationIdRegistry[operationId] = entry;

    return entry;
  },

  convertPathFragments: function convertPathFragments(path) {
    return path.split('/').map(function(fragment) {
      if (fragment.charAt(0) === ':') {
        return '{' + fragment.slice(1) + '}';
      }
      return fragment;
    }).join('/');
  },

  convertVerb: function convertVerb(verb) {
    if (verb.toLowerCase() === 'all') {
      return 'post';
    }

    if (verb.toLowerCase() === 'del') {
      return 'delete';
    }

    return verb.toLowerCase();
  },

  /**
   * A generator to convert from an sl-remoting-formatted "Accepts" description
   * to a Swagger-formatted "Parameter" description.
   */
  acceptToParameter: function acceptToParameter(route, classDef, typeRegistry, opts) {
    var DEFAULT_TYPE =
      route.verb.toLowerCase() === 'get' ? 'query' : 'formData';

    return function(accepts) {
      var name = accepts.name || accepts.arg;
      if (name === 'options') {
        name = 'optionsData';
      }
      var paramType = DEFAULT_TYPE;

      // TODO: Regex. This is leaky.
      if (route.path.indexOf(':' + name) !== -1) {
        paramType = 'path';
      }

      // Check the http settings for the argument
      if (accepts.http && accepts.http.source) {
        paramType = accepts.http.source === 'form' ?
          'formData' :
          accepts.http.source;
      }

      // TODO: ensure that paramType has a valid value
      //  path, query, header, body, formData
      // See swagger-spec/2.0.md#parameterObject

      var paramObject = {
        name: name,
        in: paramType,
        description: typeConverter.convertText(accepts.description),
        // For path parameters, required must be true
        required: paramType === 'path' ? true : !!accepts.required,
      };

      var schema = schemaBuilder.buildFromLoopBackType(accepts, typeRegistry, opts);
      if (paramType === 'body') {
        // HACK: Derive the type from model
        if (paramObject.name === 'data') {
          if (schema.type === 'object') {
            paramObject.schema = {$ref: typeRegistry.reference(classDef.name)};
          } else {
            paramObject.schema = schema;
          }
          // HACK: to make sure different definitions of the same thing are not duplicated just because the description changes slightly
          if (paramObject.description === 'Model instance data') {
            paramObject.description = 'An object of model property name/value pairs';
          }

        } else {
          paramObject.schema = schema;
        }
      } else if (schema.type === 'file') {
        paramObject.type = 'file';
        paramObject.in = 'formData';
        paramObject.allowMultiple = false;
        paramObject.description = 'File to upload';
      } else {
        var isComplexType = schema.type === 'object' ||
                            schema.$ref;
        if (isComplexType) {
          // paramObject.schema = schema;
          // theoretically, the param could be solely the schema object directly. However, the client doesn't support making the param a rich type yet
          // for inline parameters as it currently becomes an object anyway. It does handle inline responses well though. Not using schema at the moment
          // to reduce changes.
          paramObject.type = schema.type;
          paramObject.properties = schema.properties;
          paramObject.format = 'JSON';
          // TODO support array of primitive types
          // and map them to Swagger array of primitive types
        } else if (schema.type === 'array') {
          paramObject.type = 'array';
          paramObject.items = schema.items || {
            type: 'object'
          }

        }else {
          _assign(paramObject, schema);
        }
      }
      if (paramObject.description && paramObject.description.match(idSuffix) && paramObject.name === 'id' && paramObject.in === 'path' && paramObject.type === 'object' && paramObject.format === 'JSON') {
        delete paramObject.format;
        paramObject.type = 'string';

      }

      return paramObject;
    };
  },
};

function createUniqueOperationId(methodName, verb, path, operationIdRegistry) {
  // [bajtos] We used to remove leading model name from the operation
  // name for Swagger Spec 1.2. Swagger Spec 2.0 requires
  // operation ids to be unique, thus we have to include the model name.
  var id = methodName;

  if (!(id in operationIdRegistry)) {
    // The id is already unique
    return id;
  }
  var baseId = id;
  id = generateUniqueId(id, baseId, verb, path, operationIdRegistry);

  // Rename the first operation so that all operation ids of
  // a multi-endpoint method are consistently using the long form
  if (operationIdRegistry[baseId]) {
    var oldEntry = operationIdRegistry[baseId];
    var newId = generateUniqueId(oldEntry.method, baseId, oldEntry.method, oldEntry.path, operationIdRegistry);
    oldEntry.operation.operationId = newId;
    operationIdRegistry[newId] = oldEntry;
    operationIdRegistry[baseId] = null;
  }

  return id;
}

function generateUniqueId(id, baseId, verb, path, operationIdRegistry) {
  id = createLongOperationId(baseId, verb, path);
  if (id in operationIdRegistry) {
    id = `${id}_${path.replace(/[\/:]+/g, '_')}`;
    if (id in operationIdRegistry) {
      g.warn('Warning: detected multiple remote methods ' +
        'at the same HTTP endpoint. ' +
        '{{Swagger operation ids}} will NOT be unique.');
    }
  }
  return id;
}

function createLongOperationId(baseId, verb, path) {
  return baseId + '__' + verb;
}

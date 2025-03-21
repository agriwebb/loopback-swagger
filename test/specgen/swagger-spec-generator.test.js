// Copyright IBM Corp. 2015,2019. All Rights Reserved.
// Node module: loopback-swagger
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

var _ = require('lodash');
var url = require('url');
var loopback = require('loopback');
var createSwaggerObject = require('../..').generateSwaggerSpec;

var expect = require('chai').expect;

describe('swagger definition', function() {
  describe('defaults', function() {
    var swaggerResource;
    before(function() {
      var app = createLoopbackAppWithModel();
      swaggerResource = createSwaggerObject(app);
    });

    it('advertises Swagger Spec version 2.0', function() {
      expect(swaggerResource).to.have.property('swagger', '2.0');
    });

    it('has "basePath" set to "/api"', function() {
      expect(swaggerResource).to.have.property('basePath', '/api');
    });

    it('uses the "host" serving the documentation', function() {
      // see swagger-spec/2.0.md#fixed-fields
      // If the host is not included, the host serving the documentation is to
      // be used (including the port).
      expect(swaggerResource).to.have.property('host', undefined);
    });

    it('uses the "schemes" serving the documentation', function() {
      // see swagger-spec/2.0.md#fixed-fields
      // If the schemes is not included, the default scheme to be used is the
      // one used to access the Swagger definition itself.
      expect(swaggerResource).to.have.property('schemes', undefined);
    });

    it('provides info.title', function() {
      expect(swaggerResource.info)
        .to.have.property('title', 'loopback-swagger');
    });

    it('provides info.description', function() {
      expect(swaggerResource.info).to.have.property(
        'description',
        'Integration between LoopBack and Swagger API specs'
      );
    });
  });

  describe('basePath', function() {
    it('is "{basePath}" when basePath is a path', function() {
      var app = createLoopbackAppWithModel();
      var swaggerResource = createSwaggerObject(app, {
        basePath: '/api-root',
      });
      expect(swaggerResource.basePath).to.equal('/api-root');
    });

    it('has custom config', function() {
      var swaggerSpec = {customConfig: 'myCustomConfig'};
      var app = createLoopbackAppWithModel();
      app.set('swagger', swaggerSpec);
      var swaggerResource = createSwaggerObject(app);
      expect(swaggerResource.customConfig).to.eql('myCustomConfig');
    });

    it('overrides config in sequence', function() {
      var swaggerSpec = {
        swagger: 'invalid-swagger-version',
        host: '127.0.0.1',
      };
      var options = {host: 'invalid-host'};
      var app = createLoopbackAppWithModel();
      app.set('swagger', swaggerSpec);
      var swaggerResource = createSwaggerObject(app, options);
      expect(swaggerResource.swagger).eql('2.0');
      expect(swaggerResource.host).eql('127.0.0.1');
    });

    it('is inferred from app.get("apiRoot")', function() {
      var app = createLoopbackAppWithModel();
      app.set('restApiRoot', '/custom-api-root');
      var swaggerResource = createSwaggerObject(app);
      expect(swaggerResource.basePath).to.equal('/custom-api-root');
    });

    it('respects a hardcoded protocol (behind SSL terminator)', function() {
      var app = createLoopbackAppWithModel();
      var swaggerResource = createSwaggerObject(app, {
        protocol: 'https',
      });
      expect(swaggerResource.schemes).to.eql(['https']);
    });

    it('supports opts.host', function() {
      var app = createLoopbackAppWithModel();
      var swaggerResource = createSwaggerObject(app, {
        host: 'example.com:8080',
      });
      expect(swaggerResource.host).to.equal('example.com:8080');
    });
  });

  it('has global "consumes"', function() {
    var app = createLoopbackAppWithModel();
    var swaggerResource = createSwaggerObject(app);
    expect(swaggerResource.consumes).to.have.members([
      'application/json',
      'application/x-www-form-urlencoded',
      'application/xml', 'text/xml',
    ]);
  });

  it('has global "produces"', function() {
    var app = createLoopbackAppWithModel();
    var swaggerResource = createSwaggerObject(app);
    expect(swaggerResource.produces).to.have.members([
      'application/json',
      'application/xml', 'text/xml',
      // JSONP content types
      'application/javascript', 'text/javascript',
    ]);
  });

  describe('tags', function() {
    it('has one tag for each model', function() {
      var app = createLoopbackAppWithModel();
      var swaggerResource = createSwaggerObject(app);
      expect(swaggerResource.tags).to.eql([
        {name: 'Product', description: 'a-description\nline2', externalDocs: undefined},
      ]);
    });
  });

  describe('definitions node', function() {
    it('properly defines basic attributes', function() {
      var app = createLoopbackAppWithModel();
      var swaggerResource = createSwaggerObject(app);
      var data = swaggerResource.definitions.Product;
      expect(data.required.sort()).to.eql(['aNum', 'foo'].sort());
      expect(data.properties.foo.type).to.equal('string');
      expect(data.properties.bar.type).to.equal('string');
      expect(data.properties.aNum.type).to.equal('number');
      // These will be Numbers for Swagger 2.0
      expect(data.properties.aNum.minimum).to.equal(1);
      expect(data.properties.aNum.maximum).to.equal(10);
      // Should be Number even in 1.2
      expect(data.properties.aNum.default).to.equal(5);
    });

    it('includes models from "accepts" args', function() {
      var app = createLoopbackAppWithModel();
      givenPrivateAppModel(app, 'Image');
      givenSharedMethod(app.models.Product, 'setImage', {
        accepts: {name: 'image', type: 'Image'},
      });

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions)).to.include('Image');
    });

    it('includes models from "returns" args', function() {
      var app = createLoopbackAppWithModel();
      givenPrivateAppModel(app, 'Image');
      givenSharedMethod(app.models.Product, 'getImage', {
        returns: {name: 'image', type: 'Image', root: true},
      });

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions)).to.include('Image');
    });

    it('includes "accepts" models not attached to the app', function() {
      var app = createLoopbackAppWithModel();
      loopback.createModel('Image');
      givenSharedMethod(app.models.Product, 'setImage', {
        accepts: {name: 'image', type: 'Image'},
      });

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions)).to.include('Image');
    });

    it('includes "responseMessages" models', function() {
      var app = createLoopbackAppWithModel();
      loopback.createModel('ValidationError');
      givenSharedMethod(app.models.Product, 'setImage', {
        errors: [{
          code: '422',
          message: 'Validation failed',
          responseModel: 'ValidationError',
        }],
      });

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions))
        .to.include('ValidationError');
    });

    it('includes nested model references in properties', function() {
      var app = createLoopbackAppWithModel();
      givenWarehouseWithAddressModels(app);

      app.models.Product.defineProperty('location', {type: 'Warehouse'});

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['Address', 'Warehouse']);
    });

    it('includes nested array model references in properties', function() {
      var app = createLoopbackAppWithModel();
      givenWarehouseWithAddressModels(app);

      app.models.Product.defineProperty('location', {type: ['Warehouse']});

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['Address', 'Warehouse']);
    });

    it('includes nested model references in modelTo relation', function() {
      var app = createLoopbackAppWithModel();
      givenWarehouseWithAddressModels(app);

      app.models.Product.belongsTo(app.models.Warehouse);

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['Address', 'Warehouse']);
    });

    it('includes nested model references in modelThrough relation', function() {
      var app = createLoopbackAppWithModel();
      givenWarehouseWithAddressModels(app);
      givenPrivateAppModel(app, 'ProductLocations');

      app.models.Product.hasMany(app.models.Warehouse,
        {through: app.models.ProductLocations});

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['Address', 'Warehouse', 'ProductLocations']);
    });

    it('includes nested model references in accept args', function() {
      var app = createLoopbackAppWithModel();
      givenWarehouseWithAddressModels(app);

      givenSharedMethod(app.models.Product, 'aMethod', {
        accepts: {arg: 'w', type: 'Warehouse'},
      });

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['Address', 'Warehouse']);
    });

    it('includes nested array model references in accept args', function() {
      var app = createLoopbackAppWithModel();
      givenWarehouseWithAddressModels(app);

      givenSharedMethod(app.models.Product, 'aMethod', {
        accepts: {arg: 'w', type: ['Warehouse']},
      });

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['Address', 'Warehouse']);
    });

    it('includes nested model references in return args', function() {
      var app = createLoopbackAppWithModel();
      givenWarehouseWithAddressModels(app);

      givenSharedMethod(app.models.Product, 'aMethod', {
        returns: {arg: 'w', type: 'Warehouse', root: true},
      });

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['Address', 'Warehouse']);
    });

    it('includes nested array model references in return args', function() {
      var app = createLoopbackAppWithModel();
      givenWarehouseWithAddressModels(app);

      givenSharedMethod(app.models.Product, 'aMethod', {
        returns: {arg: 'w', type: ['Warehouse'], root: true},
      });

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['Address', 'Warehouse']);
    });

    it('includes nested model references in error responses', function() {
      var app = createLoopbackAppWithModel();
      givenWarehouseWithAddressModels(app);

      givenSharedMethod(app.models.Product, 'aMethod', {
        errors: {
          code: '222',
          message: 'Warehouse',
          responseModel: 'Warehouse',
        },
      });

      var swaggerResource = createSwaggerObject(app);
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['Address', 'Warehouse']);
    });

    it('includes hidden models referenced by public models', function() {
      var app = loopback({localRegistry: true, loadBuiltinModels: true});
      app.dataSource('db', {connector: 'memory'});
      app.model(app.registry.AccessToken, {public: false, dataSource: 'db'});
      app.model(app.registry.User, {public: true, dataSource: 'db'});

      var swaggerResource = createSwaggerObject(app);

      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['AccessToken']);
    });

    it('excludes hidden models referenced by hidden models only', function() {
      var app = loopback({localRegistry: true, loadBuiltinModels: true});
      app.dataSource('db', {connector: 'memory'});
      app.model(app.registry.RoleMapping, {public: false, dataSource: 'db'});
      app.model(app.registry.Role, {public: false, dataSource: 'db'});

      var swaggerResource = createSwaggerObject(app);

      expect(Object.keys(swaggerResource.definitions))
        .to.not.include.members(['Role', 'RoleMapping']);
    });

    it('excludes definitions referenced by hidden models', function() {
      var app = loopback({localRegistry: true});
      var MyModel = app.registry.createModel({
        name: 'MyModel',
        base: 'Model',
        properties: {
          data: {type: 'any'},
        },
      });
      app.model(MyModel, {public: false, dataSource: null});

      var swaggerResource = createSwaggerObject(app);

      // the app does not have any public models,
      // therefore there should be no definitions
      expect(Object.keys(swaggerResource.definitions))
        .to.have.length(0);
    });
  });

  describe('prototype.patchAttributes', function() {
    it('has parameters in the correct order', function() {
      var app = createLoopbackAppWithModel();
      var swaggerResource = createSwaggerObject(app);
      var operation = getAllOperations(swaggerResource).
        find(_.matchesProperty('operationId', 'Product_prototype.patchAttributes'));

      var parameters = _(operation.parameters)
        .map(_.property('name'))
        .value();

      expect(parameters).eql(['id', 'data']);
    });
  });

  describe('paths node', function() {
    it('contains model routes for static methods', function() {
      var app = createLoopbackAppWithModel();
      var swaggerResource = createSwaggerObject(app);
      expect(swaggerResource.paths).to.have.property('/Products');
      var products = swaggerResource.paths['/Products'];
      var verbs = Object.keys(products);
      verbs.sort();
      expect(verbs).to.contain('get', 'patch', 'post', 'put');
    });

    it('has unique operation ids', function() {
      var app = createLoopbackAppWithModel();
      app.models.Product.remoteMethod('multipath', {
        isStatic: true,
        http: [
          {verb: 'get', path: '/multipath'},
          {verb: 'post', path: '/multipath'},
        ],
      });

      var swaggerResource = createSwaggerObject(app);
      // extract swaggerResource.{path}.{verb}.operationId
      var ids = getAllOperations(swaggerResource).map(_.property('operationId')).value();

      var conflicts = _(ids).countBy().reduce(function(result, value, key) {
        return value > 1 ? result.concat([key]) : result;
      }, []);

      expect(conflicts, 'duplicate ids').to.be.have.length(0);
      expect(swaggerResource.paths['/Products/multipath'].get.operationId)
        .to.contain('Product_multipath');
    });
  });

  describe('updateOnly', function() {
    it('should generate two swagger model definitions when forceId is undefined',
      function() {
        // forceId is undefined since forceId is not passed into the model
        var app = createLoopbackAppWithModel();
        var swaggerResource = createSwaggerObject(app, {
          generateOperationScopedModels: true,
        });
          // Additional swagger object - $new_Product is generated since Product
          // model has generated ID and forceId is not set to false. This object
          // is used for create operation where it excludes 'id' property
        expect(Object.keys(swaggerResource.definitions))
          .to.include.members(['$new_Product', 'Product']);
      });

    it('should generate two swagger model definitions when forceId is true', function() {
      const options = {
        forceId: true,
      };
      var app = createLoopbackAppWithModel(options);
      var swaggerResource = createSwaggerObject(app, {
        generateOperationScopedModels: true,
      });
      // Additional swagger object - $new_Product is generated since Product
      // model has generated ID and forceId is not set to false. This object
      // is used for create operation where it excludes 'id' property
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['$new_Product', 'Product']);
    });

    it('should generate one swagger model definition when forceId is false', function() {
      const options = {
        forceId: false,
      };
      var app = createLoopbackAppWithModel(options);
      var swaggerResource = createSwaggerObject(app, {
        generateOperationScopedModels: true,
      });
      expect(Object.keys(swaggerResource.definitions))
        .to.not.include(['$new_Product']);
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['Product']);
    });

    it('should use $new_Product definition for post/create operation when ' +
        'forceId is in effect', function() {
      var app = createLoopbackAppWithModel();
      var swaggerResource = createSwaggerObject(app, {
        generateOperationScopedModels: true,
      });
      // Post(create) operation should reference $new_Product
      expect(swaggerResource.paths['/Products'].post.parameters[0].schema.$ref)
        .to.equal('#/definitions/$new_Product');
      // patch or any other operation should reference Product
      expect(swaggerResource.paths['/Products'].patch.parameters[0].schema.$ref)
        .to.equal('#/definitions/Product');
    });

    it('should use Product swagger definition for all operations when ' +
        'forceId is false', function() {
      const options = {
        forceId: false,
      };
      var app = createLoopbackAppWithModel(options);
      var swaggerResource = createSwaggerObject(app, {
        generateOperationScopedModels: true,
      });
      // post(create), patch or any other operation should reference Product
      expect(swaggerResource.paths['/Products'].post.parameters[0].schema.$ref)
        .to.equal('#/definitions/Product');
      expect(swaggerResource.paths['/Products'].patch.parameters[0].schema.$ref)
        .to.equal('#/definitions/Product');
    });

    it('should generate one swagger model definitions when ' +
        'generateOperationScopedModels is false',
    function() {
      var app = createLoopbackAppWithModel();
      var swaggerResource = createSwaggerObject(app, {
        generateOperationScopedModels: false,
      });
      // when generateOperationScopedModels is false, then even if forceId is true and
      // generated id is true there will be only one model (Product) generated.
      expect(Object.keys(swaggerResource.definitions))
        .to.not.include(['$new_Product']);
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['Product']);
    });

    it('should generate one swagger model definitions when ' +
        'generateOperationScopedModels is undefined(false)',
    function() {
      var app = createLoopbackAppWithModel();
      var swaggerResource = createSwaggerObject(app);
      // when generateOperationScopedModels is undefined the value defaults to false. Then even if
      // forceId is true and generated id is true there will be only one model (Product) generated.
      expect(Object.keys(swaggerResource.definitions))
        .to.not.include(['$new_Product']);
      expect(Object.keys(swaggerResource.definitions))
        .to.include.members(['Product']);
    });
  });

  describe('model with relations', function() {
    it('define custom model with relation property', function() {
      var app = createConversationAndMessageModelsWithRelations();
      var swaggerResource = createSwaggerObject(app, {
        generateRelationProperties: true,
      });

      var definitions = swaggerResource.definitions;

      expect(Object.keys(definitions))
        .to.include.members([
          'UserWithRelations',
          'ConversationWithRelations',
          'MessageWithRelations',
        ]);

      var userWithRelationsModelDefinition = definitions
        .UserWithRelations;
      expect(Object.keys(userWithRelationsModelDefinition.properties))
        .to.include.members(['conversations']);

      expect(userWithRelationsModelDefinition.properties.conversations).to.be.eql({
        type: 'array',
        items: {
          $ref: '#/definitions/ConversationWithRelations',
        },
      });

      var conversationWithRelationsModelDefinition = definitions
        .ConversationWithRelations;
      expect(Object.keys(conversationWithRelationsModelDefinition.properties))
        .to.include.members(['messages', 'user']);

      // Message hasMany relation
      expect(conversationWithRelationsModelDefinition.properties.messages).to.be.eql({
        type: 'array',
        items: {
          $ref: '#/definitions/MessageWithRelations',
        },
      });

      // User belongsTo relation
      expect(conversationWithRelationsModelDefinition.properties.user).to.be.eql({
        $ref: '#/definitions/UserWithRelations',
      });

      var messageWithRelationsModelDefinition = definitions
        .MessageWithRelations;
      expect(Object.keys(messageWithRelationsModelDefinition.properties))
        .to.include.members(['conversation']);

      // Conversation belongsTo relation
      expect(conversationWithRelationsModelDefinition.properties.user).to.be.eql({
        $ref: '#/definitions/UserWithRelations',
      });
    });

    it('includes model with relation property only for `find*` and ' +
      '`__(get|findById)__*` methods', function() {
      var app = createConversationAndMessageModelsWithRelations();
      var swaggerResource = createSwaggerObject(app, {
        generateRelationProperties: true,
      });

      // Model with relations
      verifyResponseWithRelations(swaggerResource, 'get', [
        '/Users'], 'UserWithRelations', true);

      verifyResponseWithRelations(swaggerResource, 'get', [
        '/Users/{id}',
        '/Users/findOne',
        '/Conversations/{id}/user',
        '/Users/{id}/conversations/{nk}/user',
      ], 'UserWithRelations', false);

      verifyResponseWithRelations(swaggerResource, 'get', [
        '/Users/{id}/conversations',
        '/Conversations',
      ], 'ConversationWithRelations', true);

      verifyResponseWithRelations(swaggerResource, 'get', [
        '/Users/{id}/conversations/{fk}',
        '/Conversations/{id}',
        '/Conversations/findOne',
        '/Messages/{id}/conversation',
      ], 'ConversationWithRelations', false);

      verifyResponseWithRelations(swaggerResource, 'get', [
        '/Conversations/{id}/messages',
        '/Messages',
        '/Users/{id}/conversations/{nk}/messages',
      ], 'MessageWithRelations', true);

      verifyResponseWithRelations(swaggerResource, 'get', [
        '/Messages/{id}',
        '/Conversations/{id}/messages/{fk}',
        '/Users/{id}/conversations/{nk}/messages/{fk}',
      ], 'MessageWithRelations', false);

      // Model without relations
      verifyResponseWithRelations(swaggerResource, 'post', [
        '/Users',
        '/Users/replaceOrCreate',
        '/Users/upsertWithWhere',
        '/Users/{id}/replace',
      ], 'User', false);

      verifyResponseWithRelations(swaggerResource, 'put', ['/Users'], 'User', false);

      verifyResponseWithRelations(swaggerResource, 'patch', ['/Users'], 'User', false);

      verifyResponseWithRelations(swaggerResource, 'post', [
        '/Conversations',
        '/Conversations/replaceOrCreate',
        '/Conversations/upsertWithWhere',
        '/Conversations/{id}/replace',
      ], 'Conversation', false);

      verifyResponseWithRelations(swaggerResource, 'put', [
        '/Users/{id}/conversations/{fk}',
      ], 'Conversation', false);

      verifyResponseWithRelations(swaggerResource, 'post', [
        '/Users/{id}/conversations',
      ], 'Conversation', false);

      verifyResponseWithRelations(swaggerResource, 'post', [
        '/Messages',
        '/Messages/replaceOrCreate',
        '/Messages/upsertWithWhere',
        '/Messages/{id}/replace',
        '/Users/{id}/conversations/{nk}/messages',
      ], 'Message', false);

      verifyResponseWithRelations(swaggerResource, 'post', [
        '/Conversations/{id}/messages',
      ], 'Message', false);

      verifyResponseWithRelations(swaggerResource, 'put', [
        '/Conversations/{id}/messages/{fk}',
        '/Users/{id}/conversations/{nk}/messages/{fk}',
      ], 'Message', false);
    });

    it('honors model relation setting "disableInclude"', function() {
      var app = createConversationAndMessageModelsWithRelations();
      var swaggerResource = createSwaggerObject(app, {
        generateRelationProperties: true,
      });

      var definitions = swaggerResource.definitions;

      expect(Object.keys(definitions))
        .to.include.members(['UserWithRelations']);

      var userModelDefinition = definitions
        .UserWithRelations;

      expect(Object.keys(userModelDefinition.properties))
        .to.not.include.members(['accessTokens']);
    });

    it('should enable generateRelationProperties from application config', function() {
      var app = createConversationAndMessageModelsWithRelations();
      app.set('swagger', {
        generateRelationProperties: true,
      });

      var swaggerResource = createSwaggerObject(app);

      var definitions = swaggerResource.definitions;

      expect(Object.keys(definitions))
        .to.include.members([
          'UserWithRelations',
          'ConversationWithRelations',
          'MessageWithRelations',
        ]);
    });

    it('honor generateRelationProperties method config', function() {
      var app = createConversationAndMessageModelsWithRelations();
      app.set('swagger', {
        generateRelationProperties: true,
      });

      var swaggerResource = createSwaggerObject(app, {
        generateRelationProperties: false,
      });

      var definitions = swaggerResource.definitions;

      expect(Object.keys(definitions))
        .to.not.include.members([
          'UserWithRelations',
          'ConversationWithRelations',
          'MessageWithRelations',
        ]);
    });
  });

  function createLoopbackAppWithModel(options) {
    var app = loopback();

    app.dataSource('db', {connector: 'memory'});

    const modelSettings = {description: ['a-description', 'line2']};
    if (options && options.forceId !== undefined) {
      modelSettings.forceId = options.forceId;
    }

    var Product = loopback.createModel('Product', {
      foo: {type: 'string', required: true},
      bar: 'string',
      aNum: {type: 'number', min: 1, max: 10, required: true, default: 5},
    }, modelSettings);
    app.model(Product, {dataSource: 'db'});

    // Simulate a restApiRoot set in config
    app.set('restApiRoot', options && options.apiRoot || '/api');
    app.use(app.get('restApiRoot'), loopback.rest());

    return app;
  }

  function verifyResponseWithRelations(swaggerResource, verb, paths,
    modelWithRelations, isArray) {
    const definition = '#/definitions/' + modelWithRelations;

    const refs = Object.keys(swaggerResource.paths)
      .filter(key => paths.includes(key))
      .map(key => {
        const path = swaggerResource.paths[key];
        const schema = path[verb].responses[200].schema;
        return isArray ? schema.items.$ref : schema.$ref;
      });

    expect(refs).to.have.lengthOf(paths.length);
    const wrongDefinitions = refs.filter(ref => ref !== definition);
    expect(wrongDefinitions).to.have.lengthOf(0);
  }

  function givenSharedMethod(model, name, metadata) {
    model[name] = function() {};
    loopback.remoteMethod(model[name], metadata);
  }

  function givenPrivateAppModel(app, name, properties) {
    var model = loopback.createModel(name, properties);
    app.model(model, {dataSource: 'db', public: false});
  }

  function givenWarehouseWithAddressModels(app) {
    givenPrivateAppModel(app, 'Address');
    givenPrivateAppModel(app, 'Warehouse', {
      shippingAddress: {type: 'Address'},
    });
  }

  function createConversationAndMessageModelsWithRelations() {
    var app = loopback({localRegistry: true, loadBuiltinModels: true});
    var User = app.registry.User;
    var AccessToken = app.registry.AccessToken;

    var Message = loopback.createModel('Message', {
      text: 'string',
      created: 'date',
    });

    var Conversation = loopback.createModel('Conversation', {
      created: 'date',
    });

    app.dataSource('db', {connector: 'memory'});

    app.model(AccessToken, {public: false, dataSource: 'db'});
    app.model(User, {public: true, dataSource: 'db'});
    app.model(Conversation, {dataSource: 'db'});
    app.model(Message, {dataSource: 'db'});

    User.hasMany(Conversation);
    Conversation.hasMany(Message);

    Message.belongsTo(Conversation);
    Conversation.belongsTo(User);

    User.nestRemoting('conversations');
    Conversation.nestRemoting('user');
    Conversation.nestRemoting('messages');
    Message.nestRemoting('conversation');

    return app;
  }

  // Simple url joiner. Ensure we don't have to care about whether or not
  // we are fed paths with leading/trailing slashes.
  function urlJoin() {
    var args = Array.prototype.slice.call(arguments);
    return args.join('/').replace(/\/+/g, '/');
  }

  // Returns a lodash wrapper
  function getAllOperations(swagger) {
    // flatten swaggerResource.paths.{path}.{verb} into a single array
    return _(swagger.paths)
      .values()
      .map(_.values)
      .flatten();
  }
});

var traceguide = Npm.require('api-javascript');
var Fiber = Npm.require('fibers');
var statusMonitor = null;

Meteor.startup(function() {
    // Initialize the reporting configuration
    traceguide.options({
        access_token   : "{your_access_token}",
        group_name     : "meteor/simple",
    });

    // Instrument the code to capture spans and monitoring information
    statusMonitor = new StatusMonitor();
    var rollback = [];
    try {
        instrumentMeteorMethods(rollback, Meteor.default_server.method_handlers);
        instrumentCollection(rollback, Mongo.Collection.prototype);
        statusMonitor.start();
    } catch (e) {
        console.error('Instrumentation failed. Rolling back.');
        _.each(rollback, function(arr) {
            arr[0][arr[1]] = arr[2];
        });
        statusMonitor.stop();
    }
});

function instrumentCollection(rollback, proto) {
    var methods = [
        'find',
        'insert',
        'update',
        'remove',
    ];
    _.each(methods, function(name) {
        wrapCollectionFunc(rollback, proto, name, "meteor/Mongo");
    });
    traceguide.infof("Mongo instrumentation complete");
}

function wrapCollectionFunc(rollback, proto, name, prefix) {
    var baseImp = proto[name];
    rollback.push(proto, name, baseImp);

    if (!baseImp || typeof baseImp !== 'function') {
        throw new Error("Prototype does not have a function named:", name);
    }
    proto[name] = function() {
        var span = traceguide.span(prefix + "/" + name);
        var fiber = Fiber ? Fiber.current : null;
        if (fiber && fiber._traceguide_current_user_id) {
            span.endUserID(fiber._traceguide_current_user_id);
        }

        var ret;
        try {
            ret = baseImp.apply(this, arguments);
        } finally {
            span.infof("Call to method '%s' with arguments '%j' returned '%j'", name, arguments, ret);
            span.end();
        }
        return ret;
    };
}

function instrumentMeteorMethods(rollback, list) {
    _.each(_.keys(list), function (name) {
        wrapMeteorMethod(rollback, list, name, "meteor/methods");
    });
    traceguide.infof('Method instrumentation complete');
};

function wrapMeteorMethod(rollback, proto, name, prefix) {
    var baseImp = proto[name];
    rollback.push(proto, name, baseImp);

    if (!baseImp || typeof baseImp !== 'function') {
        throw new Error('Prototype does not have a function named:', name);
    }
    proto[name] = function() {
        var span = traceguide.span(prefix + "/" + name);
        var userId = this.userId || "unknown_user";
        span.endUserID(userId);
        span.infof("Process status: %j", statusMonitor.status());

        var fiber = Fiber ? Fiber.current : null;
        if (fiber) {
            fiber._traceguide_current_user_id = userId;
        }

        var ret;
        try {
            ret = baseImp.apply(this, arguments);
        } finally {
            span.infof("Call to method '%s' with arguments '%j' returned '%j'", name, arguments, ret);
            span.end();
        }
        return ret;
    };
}

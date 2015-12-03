var traceguide = Npm.require('api-javascript/dist/traceguide-node-debug.js');

Meteor.startup(function() {

    if (!Meteor.isServer) {
        return;
    }
    if (!Mongo) {
        return;
    }

    traceguide.options({
        access_token   : "{your_access_token}",
        group_name     : "meteor/simple",

        /*service_host   : "localhost",
        debug          : true,
        log_to_console : true,
        certificate_verification : false,*/
    });

    var rollback = [];
    var failed = false;
    try {
        instrumentMethods(rollback, Meteor.default_server.method_handlers);
    } catch (e) {
        failed = true;
    }

    if (failed) {
        console.log('Instrumentation failed. Rolling back.');
        _.each(rollback, function(arr) {
            arr[0][arr[1]] = arr[2];
        });
    }
});

function instrumentMethods(rollback, list) {
    _.each(_.keys(list), function (name) {
        wrapPassThrough(rollback, list, name, "meteor/methods");
    });
    console.log('Method instrumentation complete');
};

function wrapPassThrough(rollback, proto, name, prefix) {
    var baseImp = proto[name];
    rollback.push(proto, name, baseImp);

    if (!baseImp || typeof baseImp !== 'function') {
        throw new Error('Prototype does not have a function named:', name);
    }
    proto[name] = function() {
        var span = traceguide.span(prefix + "/" + name);
        span.endUserID(this.userId || "unknown_user");

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

var util = require('util');

// If cond is provided, we only log if its value is true-ish.
function tap(msg, cond){
    msg = msg || '';
    cond = arguments.length < 2 || cond;
    return function(obj){
        if (cond){
            console.log(msg + util.inspect(obj));
        }
        return obj;
    }
}
exports.tap = tap;

// As tap(), but run the object through fn() instead of printing it.
function tapf(fn, cond){
    fn = fn || function(){};
    cond = arguments.length < 2 || cond;
    return function(obj){
        if (cond){
            fn(obj);
        }
        return obj;
    };
}
exports.tapf = tapf;

// The arguments are in this order so that you can bind(field) and use the result with kew.
function grab(field, obj){
    return obj[field];
}
exports.grab = grab;

function die(m, r){
    r = r || 1;
    console.error(m);
    process.exit(r);
}
exports.die = die;

function bind(fn /*, ...*/){
    var bound_args = Array.prototype.slice.call(arguments, 1);
    return function(){
        var args = bound_args.concat(Array.prototype.slice.call(arguments, 0));
        return fn.apply(this, args);
    };
}
exports.bind = bind;



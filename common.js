
function maybe_log(msg){
    console.info(msg);
}

function tap(msg){
    return function(obj){
        maybe_log(msg + JSON.stringify(obj));
        maybe_log('---');
        return obj;
    }
}

function die(m, r){
    r = r || 1;
    console.error(m);
    process.exit(r);
}

function bind(fn /*, ...*/){
    var bound_args = Array.prototype.slice.call(arguments, 1);
    return function(){
        var args = bound_args.concat(Array.prototype.slice.call(arguments, 0));
        return fn.apply(this, args);
    };
}

exports.tap = tap;
exports.bind = bind;
exports.die = die;



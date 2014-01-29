var bind = require('./common.js').bind,
    _    = require('underscore')._;

var tests = {};

exports.mark_start = function(n){ tests[n] = true; }

exports.mark_end = function(n){ tests[n] = false; }

function start_test_after(list, fn){
    var ok = true;
    _.each(list, function(n){
        ok = ok && tests[n] !== true;
    });
    if (ok){
        fn();
    }else{
        setTimeout(bind(start_test_after, list, fn), 100);
    }
}

exports.start_after = start_test_after;



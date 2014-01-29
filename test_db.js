var q       = require('kew'),
    jf      = require('jsonfile');

exports.config = {};

exports.init = function(overrides){
    return q.resolve(true);
};

var answers = {};

exports.load_answers = function(filename){
    answers = jf.readFileSync(filename);
};

exports.close = function(){};

function query(type){
    var list = answers[type];
    if (list && list.length){
        return q.resolve(list.shift());
    }
    return q.reject('test_db.js:query - No data');
}

exports.fetch_timesheets = function(){
    return query('fetch_timesheets');
};

exports.fetch_children = function(request_id, sort_by){
    return query('fetch_children');
};

exports.load_child = function(request_id){
    return query('load_child');
};

exports.load_child_quotes = function(request_id){
    return query('load_child_quotes');
};

exports.load_child_timesheets = function(request_id){
    return query('load_child_timesheets');
};



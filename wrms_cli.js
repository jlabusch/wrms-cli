var q       = require('kew'),
    _       = require('underscore')._,
    assert  = require('assert'),
    moment  = require('moment'),
    bind    = require('./common.js').bind,
    die     = require('./common.js').die,
    tap     = require('./common.js').tap;


var env = {
    config: null,
    db: null
};

function init(e){
    _.extend(env, e);
}

function fetch_children(wr){
    return env.db.fetch_children(wr, env.config.sort_by)
                 .then(tap('fetch_children:\n'))
                 .then(bind(grab, 'rows')).fail(die)
                 ;
}

function iterate_over_children(depth, parent_wr, child_wrs, on_completion){
    if (typeof(on_completion) !== 'function'){
        on_completion = function(){};
    }
    var next = child_wrs.shift();
    if (!next){
        on_completion();
        return;
    }
    next = next.wr || next;
    if (wr_cache[next]){
        return load_child(depth, next)
                .then(bind(iterate_over_children, depth, parent_wr, child_wrs, on_completion)).fail(die)
                ;
    }
    return load_child(depth, next)
            .then(bind(fetch_children, next)).fail(die)
            .then(bind(iterate_over_children, depth+1, next)).fail(die)
            .then(bind(iterate_over_children, depth, parent_wr, child_wrs, on_completion)).fail(die)
            ;
}

function run(wrs){
    var after = function(){
        function fetch_timesheets(){
            return env.db.fetch_timesheets(_.keys(wr_cache))
                        .then(tap('fetch_timesheets:\n'))
                        .then(function(result){
                            print_wrs(merge_timesheets(squash_timesheets(result)));
                        })
                        .fail(die);
        };
        // TODO: Maybe need totals by month and by week? How carve up month border in week-view?
        function is_same_date(a, b){
            return true;
            //var as = ('' + a).substr(0, 10);
            //var bs = ('' + b).substr(0, 10);
            //return as === bs;
        }
        function squash_timesheets(ts){
            var result = [];
            var obj = null;
            _.each(ts.rows, function(t){
                if (!obj || t.request_id !== obj.request_id || !is_same_date(t.date, obj.date)){
                    if (obj){
                        result.push(obj);
                    }
                    obj = t;
                    obj.fullname = [t.fullname];
                    return;
                }
                obj.sum += t.sum;
                if (_.contains(obj.fullname, t.fullname) === false){
                    obj.fullname.push(t.fullname);
                }
            });
            if (obj){
                result.push(obj);
            }
            return result;
        }
        function merge_timesheets(ts){
            _.each(ts, function(t){
                wr_cache[t.request_id].timesheet_hours = t.sum;
                wr_cache[t.request_id].timesheet_names = t.fullname;
            });
            return wr_cache;
        }
        function print_wrs(){
            wr_tree.forEach(function(n){
                print_wr(n[1])(wr_cache[n[0]]);
            });
            process.exit(0);
        }
        fetch_timesheets();
        function exit(){
            process.exit(0);
        }
    };

    return iterate_over_children(0, null, wrs, after).fail(die);
}

var wr_cache = {}; // WR objects keyed on request_id

function cache(wr){
    // TODO: extend
    wr.timesheet_hours = 0;
    wr.timesheet_names = [];
    wr_cache[wr.wr] = wr;
    return wr;
}

var wr_tree = []; // A flattened tree of request_id/depth pairs

function add_tree_node(depth){
    return function(wr){
        wr_tree.push([wr.wr, depth]);
    };
}

function squash(rows){
    assert(rows.length !== undefined);
    var r = rows[0];
    r.fullname = [r.fullname || 'Nobody'];
    rows.slice(1).forEach(function(i){
        r.fullname.push(i.fullname);
    });
    return r;
}

function load_child(depth, wr){
    return (function(){
        if (wr_cache[wr]){
            wr_cache[wr].from_cache = true;
            return q.resolve(wr_cache[wr]);
        }else{
            return env.db.load_child(wr)
                        .then(tap('load_child:\n'))
                        .then(bind(grab, 'rows')).fail(die)
                        .then(squash)
                        .then(bind(load_child_quotes, wr))
                        //.then(bind(load_child_timesheets, wr))
                        //.then(tap('result of timesheets: '))
                        .then(cache);
                        ;
        }
    })().then(add_tree_node(depth))
        ;
}

function load_child_quotes(wr, obj){
    return env.db.load_child_quotes(wr)
                .then(tap('load_child_quotes:\n'))
                .then(bind(function(n, o, rows){ o.quotes = rows.rows; return o; }, wr, obj));
}

function load_child_timesheets(wr, obj){
    function grab_hours(n, o, rows){
        o.timesheet_hours = 0;
        if (rows.rows.length > 0 && rows.rows[0].sum){
            o.timesheet_hours = rows.rows[0].sum;
        }
        return o;
    }
    return env.db.load_child_timesheets(wr)
                .then(tap('load_child_timesheets:\n'))
                .then(bind(grab_hours, wr, obj));
}

var closed_statuses = ['Finished', 'Cancelled', 'Reviewed', 'Production Ready', 'Testing/Signoff', 'QA Approved'],
    new_statuses= ['New Request', 'Allocated'],
    blocked_statuses= ['Blocked', 'On Hold', 'Quoted', 'Need Info'];

var need_to_print_header = true;

function print_wr(depth){
    function any_match(re, list){
        var m = false;
        _.each(list, function(i){
            if (i.match(re)){
                m = true;
            }
        });
        return m;
    }
    return function(o){
        if (need_to_print_header){
            need_to_print_header = false;
            if (env.config.output === 'csv'){
                console.log('WR#,Brief,Status,Allocated to,Timesheet hours,Quoted ($ approved),Quoted ($ unapproved),Quoted (hours approved),Quoted (hours unapproved),Detail,Due date,Depth');
            }
        }

        var indent = '';
        var origdepth = depth;
        while (depth > 0){
            indent += '    ';
            --depth;
        }
        if (env.config.allocated_to){
            if (!any_match(new RegExp(env.config.allocated_to, "i"), o.fullname)){
                return o;
            }
        }
        if (env.config.output === 'pretty'){
            var color = {
                wr: '\033[37;1m',
                brief: '\033[0m',
                status: _.contains(closed_statuses, o.status) ? '\033[32m' :
                        _.contains(new_statuses,    o.status) ? '\033[33m' :
                        _.contains(blocked_statuses,o.status) ? '\033[36m' : '\033[33m'
            };
            if (wr_cache[o.wr].from_cache){
                color.wr = color.brief = color.status = '\033[30m';
            }
            console.log(
                indent +
                color.wr + '#' + o.wr + ': ' +
                color.brief + o.brief +
                color.status + ' [' + o.status + ']\033[0m'
            );
            if (env.config.verbose && !wr_cache[o.wr].from_cache){
                var quote_str = _.map(o.quotes, function(q){ return q.sum + ' ' + q.quote_units + ' (' + (q.approved ? 'approved' : 'unapproved') + ')';}).join(',');
                quote_str = quote_str || 'nothing';
                console.log(
                    indent + '\033[30m' + '             ' +
                    'Allocated to ' + o.fullname.join('/') +
                    ', worked ' + o.timesheet_hours + 'h, quoted ' + quote_str +
                    '\033[0m'
                );
            }
        }else{
            if (wr_cache[o.wr].from_cache){
                // Don't print it
            }else{
                var quotes = {
                    u: {
                        dollars: 0,
                        hours: 0
                    },
                    a: {
                        dollars: 0,
                        hours: 0
                    }
                };
                _.each(o.quotes, function(q){
                    var type = q.approved ? quotes.a : quotes.u;
                    switch (q.quote_units){
                        case 'aud':
                        case 'dollars':
                        case 'usd':
                        case 'pounds':
                        case 'amount':
                            type.dollars += q.sum;
                            break;
                        case 'days':
                            type.hours += q.sum*8;
                            break;
                        case 'hours':
                            type.hours += q.sum;
                            break;
                    }
                });
                var brief = o.brief.replace(/,/g, '.');
                var detail = env.config.verbose ? o.detailed.replace(/,/g, '.').replace(/\n/g, '') : '';
                var due = o.agreed_due_date || o.requested_by_date;
                console.log([o.wr, brief, o.status, o.fullname.join('/'), o.timesheet_hours, quotes.a.dollars, quotes.u.dollars, quotes.a.hours, quotes.u.hours, detail, due, origdepth].join(','));
            }
        }
        return o;
    };
}

function grab(field, obj){
    return obj[field];
}

function any_values_exist(obj){
    var result = false;
    _.each(obj, function(val){
        if (val){
            result = true;
        }
    });
    return result;
}

exports.init = init;
exports.run = run;


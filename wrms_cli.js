var q       = require('kew'),
    _       = require('underscore')._,
    assert  = require('assert'),
    moment  = require('moment'),
    bind    = require('./common.js').bind,
    die     = require('./common.js').die,
    tap     = require('./common.js').tap,
    tapf    = require('./common.js').tapf;


var env = {
    config: null,
    db: null,
    wr_view: print_wr_view,
    timesheet_view: print_timesheet_view,
    // testing hooks
    __iterate_over_children: {
        entry: null,
        pre_exit_new: null,
        pre_exit_cached: null,
        pre_exit_complete: null,
    },
    __fetch_children: {
        entry: null,
        after_fetch: null,
    },
    __load_child: {
        entry: null,
        after_fetch: null,
        pre_exit_new: null,
        pre_exit_cached: null,
    },
    __load_child_quotes: {
        entry: null,
        after_fetch: null,
    },
};

function init(e){
    _.extend(env, e);
}

function fetch_children(wr){
    tapf(env.__fetch_children.entry)(wr);
    return env.db.fetch_children(wr, env.config.sort_by)
                .then(tapf(env.__fetch_children.after_fetch))
                .then(tap('fetch_children:\n', env.config.debug));
}

function iterate_over_children(depth, parent_wr, child_wrs, on_completion){
    tapf(env.__iterate_over_children.entry)(depth, parent_wr, child_wrs);
    if (typeof(on_completion) !== 'function'){
        on_completion = function(){};
    }
    var next = child_wrs.shift();
    if (!next){
        tapf(env.__iterate_over_children.pre_exit_complete)();
        return on_completion(wr_cache);
    }
    next = next.wr || next;
    if (wr_cache[next]){
        tapf(env.__iterate_over_children.pre_exit_cached)();
        return load_child(depth, next)
                .then(bind(iterate_over_children, depth, parent_wr, child_wrs, on_completion)).fail(die)
                ;
    }
    tapf(env.__iterate_over_children.pre_exit_new)();
    return load_child(depth, next)
            .then(bind(fetch_children, next)).fail(die)
            .then(bind(iterate_over_children, depth+1, next)).fail(die)
            .then(bind(iterate_over_children, depth, parent_wr, child_wrs, on_completion)).fail(die)
            ;
}

function print_wr_view(wr_data){
    function ignore_date(){
        return 1;
    }
    function merge_timesheets(ts){
        _.each(ts, function(t){
            wr_cache[t.request_id].timesheet_hours = t.sum;
            wr_cache[t.request_id].timesheet_names = t.fullname;
        });
        return wr_cache;
    }
    return env.db.fetch_timesheets(_.keys(wr_cache))
                .then(tap('fetch_timesheets:\n', env.config.debug))
                .then(function(result){
                    return print_wrs(merge_timesheets(squash_timesheets(ignore_date, result)));
                })
                .fail(die)
                ;
}

function print_timesheet_view(wr_data){
    function by_week(a){
        var m = moment(a);
        return m.weekYear()*100 + m.week();
    }
    return env.config.verbose ?
           env.db.fetch_timesheets_detail(_.keys(wr_cache))
                 .then(tap('fetch_timesheets_detail:\n', env.config.debug))
                 .then(function(result){
                     return print_timesheets_detail(result);
                 })
                 .fail(die)
           :
           env.db.fetch_timesheets(_.keys(wr_cache))
                 .then(tap('fetch_timesheets:\n', env.config.debug))
                 .then(function(result){
                     return print_timesheets(squash_timesheets(by_week, result));
                 })
                 .fail(die)
           ;
}

function run(wrs){
    wr_cache = {};
    var after = null;
    try{
        after = env[env.config.on_completion];
    }catch(ex){}
    if (typeof(after) !== 'function'){
        after = print_wr_view;
    }

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
        tapf(env.__load_child.entry)(depth, wr);
        if (wr_cache[wr]){
            wr_cache[wr].from_cache = true;
            tapf(env.__load_child.pre_exit_cached)(wr_cache[wr]);
            return q.resolve(wr_cache[wr]);
        }else{
            return env.db.load_child(wr)
                        .then(tapf(env.__load_child.after_fetch))
                        .then(tap('load_child:\n', env.config.debug))
                        .then(squash)
                        .then(bind(load_child_quotes, wr))
                        .then(cache)
                        .then(tapf(env.__load_child.pre_exit_new))
                        ;
        }
    })().then(add_tree_node(depth))
        ;
}

function load_child_quotes(wr, obj){
    tapf(env.__load_child_quotes.entry)(wr, obj);
    return env.db.load_child_quotes(wr)
                .then(tapf(env.__load_child_quotes.after_fetch))
                .then(tap('load_child_quotes:\n', env.config.debug))
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
                .then(tap('load_child_timesheets:\n', env.config.debug))
                .then(bind(grab_hours, wr, obj));
}

function squash_timesheets(date_id_fn, ts){
    var result = [];
    var obj = null;
    _.each(ts.rows, function(t){
        var date_id_t = date_id_fn(t.date);
        if (!obj || t.request_id !== obj.request_id || date_id_t !== obj.date_id){
            if (obj){
                result.push(obj);
            }
            obj = t;
            obj.fullname = [t.fullname];
            obj.date_id = date_id_t;
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
                    indent + '\033[34m' +
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

function print_wrs(){
    wr_tree.forEach(function(n){
        print_wr(n[1])(wr_cache[n[0]]);
    });
    return q.resolve(true);
}

function print_timesheets_detail(ts){
    ts.rows.forEach(function(t){
        console.log(t.request_id + '\t' +
                    t.brief + '\t' +
                    moment(t.date).format("YYYY/MM/DD") + '\t' +
                    t.hours + '\t' +
                    t.note + '\t' +
                    t.fullname);
    });
    return q.resolve(true);
}

function print_timesheets(ts){
    if (ts.length < 1){
        return {};
    }
    function min(a, b){ return a < b ? a : b; };
    function max(a, b){ return a > b ? a : b; };
    function yr(x){ return Math.floor(x/100); };
    function wk(x){ return x%100; };
    function to_id(y, w){ return y*100 + w; };
    function clamp_str(str){
        var n = 45;
        return str.length > n ? (str.substr(0, n-3) + '...') : (str + Array(n-str.length).join(' '));
    }
    var date_ranges = {};
    var grid = {};
    ts.forEach(function(t){
        var y = yr(t.date_id);
        date_ranges[y] = date_ranges[y] || {min: 999, max: -999};
        date_ranges[y].min = min(wk(t.date_id), date_ranges[y].min);
        date_ranges[y].max = max(wk(t.date_id), date_ranges[y].max);
        grid[t.request_id] = grid[t.request_id] || {};
        grid[t.request_id][t.date_id] = t.sum;
    });
    var head_month = [' ', clamp_str(' ')];
    var head_week = ['WR', clamp_str('Brief')];
    _.each(_.keys(grid), function(request_id){
        grid[request_id] = grid[request_id] || {};
        var line = [request_id, clamp_str(wr_cache[request_id].brief)];
        _.each(_.keys(date_ranges), function(y){
            _.range(date_ranges[y].min, date_ranges[y].max+1).forEach(function(w){
                if (head_month){
                    head_month.push(moment().years(y).weeks(w).format('MMM'));
                }
                if (head_week){
                    head_week.push('wk ' + w);
                }
                var cell = grid[request_id][to_id(y, w)];
                line.push(cell === undefined ? '0' : cell.toFixed(2));
            });
        });
        if (head_week){
            console.log(head_month.join('\t'));
            console.log(head_week.join('\t'));
            head_month = null;
            head_week = null;
        }
        console.log(line.join('\t'));
    });
     return q.resolve(true);
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



var pg      = require('pg'),
    q       = require('kew'),
    die     = require('./common.js').die,
    bind    = require('./common.js').bind,
    tap     = require('./common.js').tap,
    grab    = require('./common.js').grab,
    util    = require('util'),
    _       = require('underscore')._;

var config = {
    user: 'wrms_readonly',
    password: '',
    database: 'wrms',
    host: 'catwgtn-prod-pg92.db.catalyst.net.nz',
    port: 5432
};

var test_template = {};

function add_to_template(k){
    return function(v){
        if (!test_template[k]){
            test_template[k] = [];
        }
        // Make sure we don't get bitten by references...
        test_template[k].push(JSON.parse(JSON.stringify(v)));
        return v;
    }
}

exports.config = config;

var db = null;

exports.init = function(overrides){
    overrides = overrides || {};
    _.extend(config, overrides);
    db = new pg.Client(config);
    var p = q.defer();
    db.connect(p.makeNodeResolver());
    return p.promise.fail(die);
};

exports.close = function(){
    // Uncomment this to create JSON dumps you can replay from test_db.js in testing.
    //console.log(JSON.stringify(test_template));
};

function query(sql, args){
    var p = q.defer();
    if (args){
        db.query(sql, args, p.makeNodeResolver());
    }else{
        db.query(sql, p.makeNodeResolver());
    }
    return p.promise;
}

exports.fetch_timesheets = function(request_ids){
    return query(
        "select ra.request_id,ra.date,u.fullname,SUM(ra.hours) " +
        "from request_activity ra, usr u " +
        "where ra.source='timesheet' and " +
        "      u.user_no=ra.worker_id and " +
        "      request_id in (" + request_ids.join(',') + ") " +
        "group by ra.request_id,ra.date,u.fullname " +
        "order by ra.request_id,ra.date asc"
    );
};

exports.fetch_timesheets_detail = function(request_ids){
    return query(
        "select ra.request_id,r.brief,ra.date,u.fullname,ra.note,ra.hours " +
        "from request_activity ra, usr u, request r " +
        "where ra.source='timesheet' and " +
        "      u.user_no=ra.worker_id and " +
        "      ra.request_id=r.request_id and " +
        "      r.request_id in (" + request_ids.join(',') + ") " +
        "order by ra.request_id,ra.date,ra.note asc"
    );
};

exports.fetch_children = function(request_id, sort_by){
    var order = sort_by === 'wr'      ? 'rr.to_request_id' :
                sort_by === 'brief'   ? 'r.brief'
                                      : 'lc.lookup_seq,lc.lookup_desc';
    return query(
        'select rr.to_request_id as wr, ' +
               'r.brief, ' +
               'lc.lookup_desc ' +
        'from request_request rr ' +
        'join request r on r.request_id=rr.to_request_id ' +
        'left join lookup_code lc on lc.source_table=\'request\' and ' +
                                    'lc.source_field=\'status_code\' and ' +
                                    'lc.lookup_code=r.last_status ' +
        'where rr.request_id=$1 and ' +
              'rr.link_type=\'I\' ' +
        'order by ' + order,
        [request_id]
    ).fail(die)
     .then(bind(grab, 'rows'))
     .then(add_to_template('fetch_children'))
     ;
};

exports.load_child = function(request_id){
    return query(
        'select r.request_id as wr,' +
               'r.brief,' +
               'lc.lookup_desc as status,' +
               '(select usr.fullname from usr where usr.user_no=rall.allocated_to_id) as fullname, ' +
               'r.detailed, ' +
               'r.requested_by_date, ' +
               'r.agreed_due_date ' +
        'from request r ' +
        'left join request_allocated rall on rall.request_id=r.request_id ' +
        'left join lookup_code lc on lc.source_table=\'request\' and ' +
                                    'lc.lookup_code=r.last_status ' +
        'where r.request_id=$1',
        [request_id]
    ).fail(die)
     .then(bind(grab, 'rows'))
     .then(add_to_template('load_child'))
     ;
};

exports.load_child_quotes = function(request_id){
    return query(
        'select sum(quote_amount),quote_units,bool(approved_by_id) as approved ' +
        'from request_quote ' +
        'where request_id=$1 ' +
        'group by quote_units,approved',
        [request_id]
    )
    .then(add_to_template('load_child_quotes'))
    ;
};

exports.load_child_timesheets = function(request_id){
    return query(
        "select sum(hours) from request_activity where request_id=$1 and source='timesheet'",
        [request_id]
    )
    .then(add_to_template('load_child_timesheets'))
    ;
};



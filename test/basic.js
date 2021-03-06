var _       = require('underscore')._,
    should  = require('should'),
    test    = require('../test.js'),
    bind    = require('../common.js').bind,
    die     = require('../common.js').die,
    db      = require('../test_db.js'),
    wrms_cli= require('../wrms_cli.js');

var default_test_f = function(data){};
var test_f = default_test_f;

var child_counters = {
    loaded: 0,
    cached: 0
};

var env = {
    config: {
        on_completion: 'test_completion',
        sort_by: 'wr',
        allocated_to: null,
        output: 'pretty',
        verbose: false,
        debug: false
    },
    db: db,
    __load_child: {
        entry: null,
        after_fetch: null,
        pre_exit_new: function(){ child_counters.loaded++; },
        pre_exit_cached: function(w){ child_counters.cached++; }
    },
    test_completion: function(d){ test_f(d); }
};

describe('hello world', function(){
    wrms_cli.init(env);
    // Answers created by ./wr -s wr 94701 | tail -n 1 | python -mjson.tool > test/basic.json
    describe('basic execution', function(){
        it('should complete', function(done){
            db.load_answers('./test/basic.json');
            test_f = function(wrs){
                child_counters.loaded.should.equal(17);
                child_counters.cached.should.equal(1);
                test.mark_end(1);
            };
            test.mark_start(1);
            child_counters.loaded = 0;
            child_counters.cached = 0;
            db.init().then(bind(wrms_cli.run, [94701])).fin(done);
        });
        it('should find WR 94701', function(done){
            db.load_answers('./test/basic.json');
            test_f = function(wrs){
                wrs[94701].brief.should.equal('Iteration Zoolander');
                wrs[94701].status.should.equal('Finished');
                child_counters.loaded.should.equal(17);
                child_counters.cached.should.equal(1);
                test.mark_end(2);
            };
            test.mark_start(2);
            child_counters.loaded = 0;
            child_counters.cached = 0;
            test.start_after([1], function(){
                db.init().then(bind(wrms_cli.run, [94701])).fin(done);
            });
        });
    });
});


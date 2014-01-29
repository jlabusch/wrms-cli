var _       = require('underscore')._,
    should  = require('should'),
    test    = require('../test.js'),
    bind    = require('../common.js').bind,
    die     = require('../common.js').die,
    db      = require('../db.js'),
    wrms_cli= require('../wrms_cli.js');

var default_test_f = function(data){};
var test_f = default_test_f;
function test_completion(data){
    test_f(data);
}

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
    test_completion: test_completion
};

wrms_cli.init(env);

describe('hello world', function(){
    describe('basic execution', function(){
        it('should complete', function(done){
            test_f = function(wrs){
                child_counters.loaded.should.equal(17);
                child_counters.cached.should.equal(1);
                test.mark_end(1);
                done();
            };
            test.mark_start(1);
            child_counters.loaded = 0;
            child_counters.cached = 0;
            db.init().then(bind(wrms_cli.run, [94701])).fail(die);
        });
        it('should find WR 94701', function(done){
            test_f = function(wrs){
                wrs[94701].brief.should.equal('Iteration Zoolander');
                wrs[94701].status.should.equal('Finished');
                child_counters.loaded.should.equal(17);
                child_counters.cached.should.equal(1);
                test.mark_end(2);
                done();
            };
            test.mark_start(2);
            child_counters.loaded = 0;
            child_counters.cached = 0;
            test.start_after([1], function(){
                db.init().then(bind(wrms_cli.run, [94701])).fail(die);
            });
        });
    });
});

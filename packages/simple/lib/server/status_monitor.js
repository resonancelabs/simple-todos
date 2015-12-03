var eventLoopMonitor = Npm.require('event-loop-monitor');

StatusMonitor = function StatusMonitor() {
    this._status = {
        up_time : "",
        memory : {
            resident_set_size : 0,
        },
        event_loop : {
            percentiles : {},
        },
    };

    this._eventLoopMonitor = eventLoopMonitor;
    this._eventLoopMonitor.on('data', (function(latency) {
        if (!latency) {
            return;
        }
        this._status.event_loop.percentiles = {
            lag_percentiles : {
                p99 : latency.p99 + "µs",
                p95 : latency.p99 + "µs",
                p90 : latency.p99 + "µs",
                p50 : latency.p99 + "µs",
            }
        };
    }).bind(this));

    var timer = setInterval((function() {
        this._status.up_time = process.uptime() + "s";
        this._status.memory.resident_set_size =  (process.memoryUsage().rss / (1024*1024)).toPrecision(3) + "MB";
    }).bind(this), 250);
};

StatusMonitor.prototype.start = function() {
    var ret = this._eventLoopMonitor.resume();

    // Do *not* allow the monitor's internval counters to keep the process
    // running
    this._eventLoopMonitor._loopMonitor.unref();
    this._eventLoopMonitor._counter.unref();

    return ret;
};

StatusMonitor.prototype.stop = function() {
    return this._eventLoopMonitor.stop();
};

StatusMonitor.prototype.status = function() {
    return this._status;
};

var Q = require('q');

const STATUS_STOPPED = 0;
const STATUS_RUN = 1;
const STATUS_STOP = 2;

/**
 * @property {int} requestPeriod
 * @property {Array} query
 * @property {int} status
 *
 * @constructor
 */
function Scheduler () {
    this.requestPeriod = 1; // in s
    this.query = [];
    this.status = STATUS_STOPPED;
}

/**
 * Adds task in scheduler
 *
 * @param {function} task
 * @param {int} period in seconds
 * @param {function} [callback]
 * @returns {Scheduler}
 */
Scheduler.prototype.add = function (task, period, callback) {
    var self = this;

    if (typeof task !== 'function' || (typeof callback !== 'undefined' && typeof callback !== 'function')) {
        return self;
    }

    self.query.push({
        task:       task,
        period:     parseInt(period),
        callback:   callback,
        lastRun:    0,
        successful: false
    });

    return self;
};

Scheduler.prototype.run = function () {
    var deferred = Q.defer(),
        self = this,
        now = Date.now(),
        promises = [];

    if (self.status === STATUS_STOPPED) {
        self.status = STATUS_RUN;
    } else if (self.status === STATUS_STOP) {
        self.status = STATUS_STOPPED;
        return deferred.resolve();
    }

    for (var i = 0; i < self.query.length; ++i) {
        var task = self.query[i];

        if (!task.successful || task.lastRun + task.period * 1000 <= now) {
            self.query[i].lastRun = now;
            self.query[i].successful = true;

            // run task
            promises.push(
                Q
                    .fcall(task.task)
                    .then((function (task) {
                        return function (data) {
                            process.nextTick(function () {
                                task.successful = true;
                                return task.callback(data);
                            });
                        };
                    })(task))
                    .fail((function (task) {
                        return function (err) {
                            task.successful = false;
                            throw err;
                        };
                    })(task))
            );
        }
    }

    // when all task have been completed
    Q
        .allSettled(promises)
        .then(function (results) {
            results.forEach(function (item) {
                if (item.state === 'rejected') {
                    if (item.reason && item.reason.stack) {
                        console.log('Schedule ERROR STACK:', item.reason.stack);
                    } else {
                        console.log('Schedule ERROR:', item.reason);
                    }
                }
            });

            // wait and repeat run
            return Q
                .delay(self.requestPeriod * 1000)
                .then(function () {
                    process.nextTick(function () {
                        deferred.resolve(self.run.apply(self));
                    });
                });
        });

    return deferred.promise;
};

Scheduler.prototype.stop = function () {
    var self = this;

    self.status = STATUS_STOP;
};

module.exports = new Scheduler();
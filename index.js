'use strict';

var childProcess = require('child_process');
var spawn = childProcess.spawn;
var exec = childProcess.exec;

module.exports = function (pid, signal, callback) {
    if (typeof signal === 'function' && callback === undefined) {
        callback = signal;
        signal = undefined;
    }
   //初始pid
    pid = parseInt(pid);
    if (Number.isNaN(pid)) {
        if (callback) {
            return callback(new Error("pid must be a number"));
        } else {
            throw new Error("pid must be a number");
        }
    }
   
    //tree是一个对象数组，记录了父子节点关系
    var tree = {};
    var pidsToProcess = {};
    tree[pid] = [];
    //待处理的pid节点
    pidsToProcess[pid] = 1;

    switch (process.platform) {
    case 'win32':
        exec('taskkill /pid ' + pid + ' /T /F', callback);
        break;
    case 'darwin':
        buildProcessTree(pid, tree, pidsToProcess, function (parentPid) {
          return spawn('pgrep', ['-P', parentPid]);
        }, function () {
            killAll(tree, signal, callback);
        });
        break;
    // case 'sunos':
    //     buildProcessTreeSunOS(pid, tree, pidsToProcess, function () {
    //         killAll(tree, signal, callback);
    //     });
    //     break;
    default: // Linux
        buildProcessTree(pid, tree, pidsToProcess, function (parentPid) {
          return spawn('ps', ['-o', 'pid', '--no-headers', '--ppid', parentPid]);
        }, function () {
            killAll(tree, signal, callback);
        });
        break;
    }
};

function killAll (tree, signal, callback) {
    var killed = {};
    try {
        
        Object.keys(tree).forEach(function (pid) {
            //杀死tree[pid]下的子孙
            //tree[pid]是个pid数组
            tree[pid].forEach(function (pidpid) {
                if (!killed[pidpid]) {
                    killPid(pidpid, signal);
                    killed[pidpid] = 1;
                }
            });
            
            //杀死pid本身
            if (!killed[pid]) {
                killPid(pid, signal);
                killed[pid] = 1;
            }
        });
    } catch (err) {
        if (callback) {
            return callback(err);
        } else {
            throw err;
        }
    }
    if (callback) {
        return callback();
    }
}

function killPid(pid, signal) {
    try {
        //杀死某个pid
        process.kill(parseInt(pid, 10), signal);
    }
    catch (err) {
        if (err.code !== 'ESRCH') throw err;
    }
}

//处理parentPid下的节点
//tree传递了历史节点数据
//pidsToProcess是待处理节点列表
//spawnChild是获取子节点的方法
function buildProcessTree (parentPid, tree, pidsToProcess, spawnChildProcessesList, cb) {
    //获取当前pid的节点
    var ps = spawnChildProcessesList(parentPid);
    var allData = '';
    ps.stdout.on('data', function (data) {
        var data = data.toString('ascii');
        allData += data;
    });

    var onClose = function (code) {
        //pid已经处理过删除掉
        delete pidsToProcess[parentPid];

        if (code != 0) {
            // no more parent processes
            if (Object.keys(pidsToProcess).length == 0) {
                cb();
            }
            return;
        }

        allData.match(/\d+/g).forEach(function (pid) {
            
          pid = parseInt(pid, 10);
            //记录父子节点关系
          tree[parentPid].push(pid);
          //初始化新的tree节点
          tree[pid] = [];
           //添加待处理节点
          pidsToProcess[pid] = 1;
          buildProcessTree(pid, tree, pidsToProcess, spawnChildProcessesList, cb);
        });
    };

    ps.on('close', onClose);
}

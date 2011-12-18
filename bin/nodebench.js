/*
NodeBench : An apache bench like web bench marking tool using nodejs.
*/

var cluster = require('cluster');
var http = require('http');
var url = require('url');
var program = require('commander');

var benchmrk_opts = {
	num_requests : 1,
	num_concur : 1
};

var url_options = {
	host : 'www.google.co.in',
	port : 80,
	path : '/',
	method : 'GET',
	agent : false
};

//Parse the command line arguments
program
  .version('0.0.1')
  .usage('[options] <url>')
  .option('-n, --numreqs <n>', 'Number of requests', parseInt)
  .option('-c, --concurrent <n>', 'Number of concurrent request', parseInt)
  .option('-U, --url <url>', 'URL to run bench mark')
  .option('-A, --authentication <credentials>', 'Basic Authentication credentials colon separated')
  .option('-P, --proxycred <credentials>', 'Proxy authentication credentials colon separated')
  .option('-X, --proxy <proxy:port>', 'Proxy server and port <proxy:port>')
  .parse(process.argv);

if(program.numreqs) benchmrk_opts.num_requests=program.numreqs;
if(program.concurrent) benchmrk_opts.num_concur = program.concurrent;
if(program.url) {

	console.log(program.url + "\n");
	var parsedurl = url.parse(program.url);

	url_options.host = parsedurl.hostname;
	url_options.port = parsedurl.port;
	url_options.path = parsedurl.path;
}else{
	console.log('Missing arguments');
	process.exit(1);
}

/// Master Node
if (cluster.isMaster) {
	var spawned_reqs=0;
	var num_forked = 0;
	var num_died = 0;
	var current_req=0;
	var results = [];

	//console.log('n: ' + benchmrk_opts.num_requests + ' c: ' + benchmrk_opts.num_concur + ' ' + JSON.stringify(url_options));
	//process.exit(0);

	var timerid = setInterval(spawnWorker, 500);
    
    function onMessage(msg) {
        if (msg.cmd && msg.cmd == 'onworkdone') {
            if (benchmrk_opts.num_requests == spawned_reqs) {
                console.log('Clearing Timer');
                clearInterval(timerid);
                console.log('Results : \n ' + JSON.stringify(results));
            }
            console.log('STATUS     : ' + msg.status);
            //console.log('\nHEADERS    : ' + JSON.stringify(msg.headers));
            console.log('DataLength : ' + msg.datalength);
            console.log('Time Taken : ' + msg.time + '\n');
            results[current_req] = msg;
            console.log('Current Req ' + current_req);
            current_req = current_req + 1;
        }
    }

	function spawnWorker() {
		console.log('\n++++++++setInterval++++++\n');
		if (num_forked == num_died && spawned_reqs <benchmrk_opts.num_requests) {
			num_forked = 0;
			num_died = 0;
			var numtofork = ((benchmrk_opts.num_requests-spawned_reqs)>=benchmrk_opts.num_concur)?benchmrk_opts.num_concur:(benchmrk_opts.num_requests-spawned_reqs);
			console.log("num to fork: " + numtofork + "\n");
			for (var i = 0; i < numtofork; i++) {

				var worker = cluster.fork();
				num_forked++;
				spawned_reqs=spawned_reqs+1;
				console.log('Worker PID : ' + worker.pid);
				worker.on('message', onMessage );
			}
		}

	}

	cluster.on('death', function (worker) {
		num_died = num_died + 1;
		//console.log('worker ' + worker.pid + ' died.');
		console.log('Number of died : ' + num_died);
	});

} else {

	/// Worker Process.
	var timetook;
	var datalen = 0;
	//console.time('http-request-time-' + process.pid);
	var startTime = (new Date()).getTime();
	var req = http.request(url_options, function (res) {
			// var req = http.get(url_options, function(res) {
			res.setEncoding('utf8');

			res.on('close', function (err) {
				process.send({
					cmd : 'onworkdone',
					status : 'closed',
					headers : res.headers,
					datalength : datalen,
					time : timetook
				});
			});

			res.on('end', function () {
				//console.timeEnd('http-request-time-' + process.pid);
				timetook = (new Date()).getTime() - startTime;
				process.send({
					cmd : 'onworkdone',
					status : res.statusCode,
					headers : res.headers,
					datalength : datalen,
					time : timetook
				});
				process.exit(0);
			});

			res.on('data', function (chunk) {
				//console.log('BODY: ' + chunk);
				//console.log('Data Length:' + chunk.length);
				datalen = datalen + chunk.length;
			});
		});

	req.on('error', function (e) {
		console.log('problem with request: ' + e.message);

	});

	req.end();
}

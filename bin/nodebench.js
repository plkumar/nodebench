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
	hostname : '127.0.0.1',
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
//.option('-P, --proxycred <credentials>', 'Proxy authentication credentials colon separated')
//.option('-X, --proxy <proxy:port>', 'Proxy server and port <proxy:port>')
.parse(process.argv);

if (program.numreqs)
	benchmrk_opts.num_requests = program.numreqs;
if (program.concurrent)
	benchmrk_opts.num_concur = program.concurrent;
if (program.authentication)
	url_options.auth = program.authentication;

if (program.url) {
	//console.log(program.url + "\n");
	var parsedurl = url.parse(program.url);
	//console.log(JSON.stringify(parsedurl));
	url_options.hostname = parsedurl.hostname;
	url_options.port = parsedurl.port;
	url_options.path = parsedurl.path;
} else {
	console.log('Missing arguments');
	process.exit(1);
}

/// Master Node
if (cluster.isMaster) {
	var spawned_reqs = 0;
	var num_forked = 0;
	var num_died = 0;
	var totaldied = 0;
	var current_req = 0;
	var results = [];
	
	//console.log('n: ' + benchmrk_opts.num_requests + ' c: ' + benchmrk_opts.num_concur + ' ' + JSON.stringify(url_options));
	//process.exit(0);
	
	var timerid = setInterval(spawnWorkers, 100);
	
	var timer2 = setInterval(function () {
			if (benchmrk_opts.num_requests == totaldied) {
				console.log("All workers died");
				clearInterval(timer2);
				var avgtime = 0;
				var totaldata = 0;
				
				for (var i = 0; i < results.length; i++) {
					avgtime += results[i].time;
					totaldata += results[i].datalength;
				}
				
				avgtime = avgtime / results.length;
				
				console.log("\nResults : ");
				console.log("results.length : " + results.length + ' Bytes');
				console.log("Avg Time : " + avgtime + 'ms');
				console.log("Total Data : " + totaldata + "\n");
			}
		}, 200);
	
	function onMessage(msg) {
		if (msg.cmd && msg.cmd == 'onworkdone') {
			
			console.log(msg.pid + '-Result for Req.No : #' + (current_req + 1));
			console.log(msg.pid + '-STATUS     : ' + msg.status);
			console.log(msg.pid + '-DataLength : ' + msg.datalength + ' Bytes');
			console.log(msg.pid + '-Time Taken : ' + msg.time + 'ms\n');
			
			results[current_req] = msg;
			current_req = current_req + 1;
			
			if (benchmrk_opts.num_requests == spawned_reqs) {
				clearInterval(timerid);
				
				// var avgtime=0;
				// var totaldata=0;
				
				// for(var i=0; i < results.length; i++)
				// {
				// avgtime+=results[i].time;
				// totaldata+= results[i].datalength;
				// }
				// avgtime=avgtime/results.length;
				// console.log("\nResults : ");
				// console.log('Num died'+ totaldied);
				// console.log('results.length : ' + results.length);
				// console.log("Avg Time : " + avgtime);
				// console.log("Total Data : " + totaldata + "\n");
			}
		}
	}
	
	function spawnWorkers() {
		//console.log('\n++++++++setInterval++++++\n');
		if (num_forked == num_died && spawned_reqs < benchmrk_opts.num_requests) {
			num_forked = 0;
			num_died = 0;
			//Check how many more to spawn.
			var numtofork = ((benchmrk_opts.num_requests - spawned_reqs) >= benchmrk_opts.num_concur) ? benchmrk_opts.num_concur : (benchmrk_opts.num_requests - spawned_reqs);
			//console.log("num to fork: " + numtofork + "\n");
			
			for (var i = 0; i < numtofork; i++) {
				var worker = cluster.fork();
				num_forked++;
				spawned_reqs++;
				worker.on('message', onMessage);
			}
		}
	}
	
	cluster.on('death', function (worker) {
		num_died++;
		totaldied++;
		//console.log('worker ' + worker.pid + ' died.');
		//console.log('Number of died : ' + num_died);
	});
	
} else {
	
	// Worker Process.
	var timetook;
	var datalen = 0;
	var startTime = (new Date()).getTime();
	//console.log(JSON.stringify(url_options));
	// console.time(process.pid + '-http-request-time');
	var req = http.request(url_options, function (res) {
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
				// console.timeEnd(process.pid + '-http-request-time' );
				timetook = (new Date()).getTime() - startTime;
				process.send({
					cmd : 'onworkdone',
					pid : process.pid,
					status : res.statusCode,
					headers : res.headers,
					datalength : datalen,
					time : timetook
				});
				process.exit(0);
			});
			
			res.on('data', function (chunk) {
				//Sum the data received.
				datalen = datalen + chunk.length;
			});
		});
	
	req.on('error', function (e) {
		console.log('problem with request: ' + e.message);
	});
	
	req.end();
}

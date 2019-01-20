/* Copyright KI-AG 2013-2019, Project KIPUS */


// $Id: backend.js 3660 2019-01-20 15:42:50Z rko $

var rootDir = ".";
var cmdTable = {};
var mods = {};
var clusterSize = 0;
global.projects = [];

var LOGLEVEL = {
  "ALL": 0,
  "TRACE": 1,
  "DEBUG": 2,
  "INFO": 3,
  "WARN": 4,
  "ERROR": 5,
  "FATAL": 6,
  "OFF": 7
};
global.LOGLEVEL = LOGLEVEL;

///////////////////////////////
// "static" modules
global.cfg   = require(rootDir+'/config');
global.fs    = require('fs');
var connect  = require('connect');
var logger   = require('morgan');
var compress = require('compression');
var serveStatic  = require('serve-static');
global.bodyParser= require('body-parser');
var http     = require('http');
var https    = require('https');
global.mysql = require('mysql');
var util     = require('util');
var stream   = require('stream');
global.xml2js= require('xml2js');
global.httpStatus = require('http-status-codes');
global.clone      = require('lodash/clone');
global.cloneDeep  = require('lodash/cloneDeep');

var nodemailer=require('nodemailer');

Date.prototype.kps = function() // toISOString is UTC, this is local
{
  function pad(n) { return (n < 10 ? '0'+n : n) };
  return             this.getFullYear()
         + '-' + pad(this.getMonth() + 1 )
         + '-' + pad(this.getDate() )
         + ' ' + pad(this.getHours() )
         + ':' + pad(this.getMinutes() )
         + ':' + pad(this.getSeconds() )
         + '.' + String((this.getMilliseconds()/1000).toFixed(3)).slice(2,5)
         ;
};

////////////////////////////////////////////
// Logging
function
getLogLevelName(level)
{
  var lvl = Object.keys(LOGLEVEL);
  for (var i=0; i<lvl.length; i++)
  {
    if (LOGLEVEL[lvl[i]] == level)
      return lvl[i];
  }
}

function
log(txt, level)
{
  if(typeof txt == "object")
    txt = util.inspect(txt);
  if (level == undefined)
    // defaulting to INFO
    level = LOGLEVEL.INFO;
  console.log(cfg.prefix+("      "+process.pid).slice(-6)+" "
              +(new Date()).kps()+" "+getLogLevelName(level) +": " + txt);
}

function
serverError(par, txt)
{
  if (par.level == undefined)
    // defaulting to ERROR
    par.level = LOGLEVEL.ERROR;
  var user = par.username;
  if (!user && par.req && par.req.body)
    user = par.req.body.username;
  if (!user)
    // user not given, defaulting to system
    user = "system";
  par.username = user;
  if (cfg.mail && par.level >= cfg.mail.notifyLevel) {
    sendMail(par, txt);
  }
  log(txt, par.level);
  var now = (new Date()).toISOString().substring(0,19).replace("T", " ");
  pool.getConnection(function(err, conn) {
    conn.query(
      "INSERT INTO kipus_serverErrors (data,modified,modifiedby) VALUES(?,?,?)",
      [txt, now, par.username],
      function(err, insRes){
        if(err)
          return log("insert serverError "+err);
      });
    conn.release();
  });
}
global.serverError = serverError;


// Used by the HTML stack, see below
var re = new RegExp("URL .+/bc");
var logFilter = new stream.Transform( { objectMode: true } );
logFilter._transform = function(chunk, encoding, done) {
  chunk = chunk.replace(/[\r\n]*/gm,"");
  if (!re.test(chunk))
    log(chunk);
  done();
}
global.log = log;

function
sendMail(par, txt, callbackfn)
{
  var subject = "KIPUS"+cfg.prefix;
  var b = ((par.req && par.req.body) ? par.req.body : {});
  var os = require('os');
  var fn = (par.fn ? par.fn : b.function);
  var user = (par.username ? par.username : (b.username ? b.username:"system"));
  par.username = user;
  subject += (fn ? (": " +fn) : "");
  subject += " ("+par.username+")";
  var text = "";
  if(fn)
    text += "User " + par.username + " called function " +
              fn + " in project " + cfg.prefix + " on " + os.hostname();
  else
    text += "User:"+par.username+", "+cfg.prefix+", host:"+os.hostname();

  if (par.level)
    text += " (Level="+getLogLevelName(par.level)+")";
  if (fn == "uploadDebugInfo")
    text += "\r\n\r\n" + par.req.body.rows.join("\r\n");
  if(txt)
    text += "\r\n\r\n" + txt;
  log("Sending mail:"+subject+"\n"+text);
  if (!cfg.mail) {
    log("mail is not configured in config, unable to send mail");
    return;
  }

  doSendMail(cfg.mail.from, cfg.mail.to, subject, text, callbackfn);
}
global.sendMail = sendMail;

function
doSendMail(from, to, subject, text, callbackfn)
{
  var ca = [];
  global.fs.readdirSync(cfg.certDir).forEach(file => {
    if (file.indexOf(".pem")>-1)
      ca.push(global.fs.readFileSync(cfg.certDir+"/"+file));
  });
  cfg.mail.tls = { ca :  ca,
                   checkServerIdentity: function (host, cert) {
                          return undefined;
                   }
  };
  var transporter = nodemailer.createTransport(cfg.mail);
  transporter.sendMail(
    { from: from, to: to, subject: subject, text: text },
    function(error, info){
      if (error)
        log("mail error: " +error);
      if (callbackfn)
        callbackfn();
    });
}
global.doSendMail = doSendMail;

global.execModFnList =
function(fnName, par, nextFn)
{
  if(par.emFnIdx == undefined) {
    par.emFnList=[]; par.emFnIdx=0;
    for(var file in mods)
      if(mods[file][fnName])
        par.emFnList.push(file);
    par.emFnList.sort();
    return execModFnList(fnName, par, nextFn);
  }

  if(par.emFnIdx == par.emFnList.length) {
    delete(par.emFnIdx); delete(par.emFnList);
    return nextFn();
  }

  var mod = par.emFnList[par.emFnIdx++];
  mods[mod][fnName](par, function() {
    execModFnList(fnName, par, nextFn);
  });
}

////////////////////////////////////////////
// DB
// set multipleStatements to true
cfg.db.multipleStatements = true;
global.pool = mysql.createPool(cfg.db);
pool.oldGetConnection = pool.getConnection;
// override pool.getConnection to add stack trace to connection object,
// needed to debug connection limit exceed error
pool.getConnection = function(fn) {
  var mystack = new Error().stack.split("\n");
  mystack.shift();
  mystack.shift();
  mystack = mystack.join("\n");
  return pool.oldGetConnection(function(err, connection) {
     if (connection)
       connection.trace = mystack;
     if(fn)
       fn(err, connection);
  });
}
var connectionLimitExceededTimer = null;
pool.on('release', function (connection) {
  //log('Connection '+connection.threadId+' released');
  if (connectionLimitExceededTimer != null) {
    clearTimeout(connectionLimitExceededTimer);
    connectionLimitExceededTimer = null;
  }
});

pool.on('enqueue', function () {
  if (connectionLimitExceededTimer != null)
    // timer already running
    return;
  connectionLimitExceededTimer = setTimeout(function() {
    var txt = [];
    txt.push("limit reached after waiting 60 secs, exit process");
    for (var i=0; i<pool._allConnections.length; i++) {
      txt.push("connection " + pool._allConnections[i].threadId+" allocated at:");
      txt.push(pool._allConnections[i].trace);
    }
    for (var i=0;i<txt.length; i++) {
      log(txt[i]);
    }
    sendMail({fn: "connectionLimitExceeded"},txt.join("\n"), function() {
      process.exit();
    });
  }, 60000);
});

///////////////////////////////
// dynamic modules. log & connection must be available.
var modFiles = fs.readdirSync(rootDir+'/modules');
if(cfg.backendModules)
  cfg.backendModules.split(",").forEach(function(file){ modFiles.push(file)});
modFiles.sort();

modFiles.forEach(function(file){
  if(!/\.js$/.test(file))
    return;
  var path = (cfg.backendModules && cfg.backendModules.indexOf(file) >= 0 ?
                    cfg.projectDir : rootDir+"/modules");
  file = file.substring(0, file.length-3);
  var fa = (path+"/"+file).match(/(.*)\/([^\/]*)$/);
  path = fa[1];
  file = fa[2];

  log("Loading "+path+"/"+file);
  mods[file] = require(path+"/"+file);
  for(var fn in mods[file].cmd)
    cmdTable[fn] = mods[file].cmd[fn];
});
global.mods = mods;

//////////////////////////////////
// DEBUGGING
cmdTable.eval = function(req, res, next) {
  var b = req.body;
  var par = {req:req, res:res, next:next};
  if(!b.username.match(/^(rko|dba|sdl)/)) {
    par.level = LOGLEVEL.INFO;
    return htmlError(par, "Permission denied");
  }
  log("EVAL:"+b.command);
  var ret = eval(b.command);
  if(ret === undefined)
    ret = "";
  return res.end(JSON.stringify(ret));
};


function
htmlError(par, txt)
{
  serverError(par, txt);
  if (par.res)
    return par.res.end(JSON.stringify({error:""+ txt }));
}
global.htmlError = htmlError;

//////////////////////////////////
function
apiHandler(req, res, next)
{
  log("apiHandler: '"+req.url+"'");

  if (!mods.apiRest)
    return next();
   
  if(req.url === "/discovery/apis" || req.url === "/discovery/apis/" ) {
    return mods.apiRest.getDiscoveryApis(req, res, next);
  }

  return mods.apiRest.getApiResponse(req, res, next);
}

//////////////////////////////////
function
bcHandler(req, res, next)
{
  var b = req.body;
  if(req.url.indexOf("/bc") < 0 || !b || !b.function)
    return next();
  var p = {req:req, res:res, next:next};
  mods.auth.checkPw(req, res, next, bcHandler2);
}

function
bcHandler2(req, res, next, pwErr)
{
  var p = {req:req, res:res, next:next};
  if(pwErr) {
    // invalid logins generate an error
    p.level = LOGLEVEL.INFO;
    return htmlError(p, pwErr);
  }

  var b = req.body;
  var start = new Date();
  if(!cmdTable[b.function])
    return htmlError(p, "Unknown function "+b.function);
  var addInfo = (b.tableName ? b.tableName :
                (b.imgName   ? b.imgName :
                (b.sql && b.sql.indexOf("ALTER") == 0 ? b.sql : "")));
  if(addInfo)
    addInfo = " "+addInfo;
  return cmdTable[b.function](req, { end:function(par){
    res.end(par);
    var len = (par?"result length "+par.length+" bytes":"returning undefined");
    if(b.function != "getImage")
      log(b.function+addInfo+" ("+b.username+", " +
        (req.headers['x-forwarded-for'] ?
         req.headers['x-forwarded-for']:res.connection.remoteAddress) +
        ") took "+((new Date())-start)+" ms, "+len);
  } }, next);
}

/////////////////////////////////////////////////////////
// connectHooks: replaces the "old" tracking, to be able to have more than one hook
var connectFnArr = [];
for(var mod in mods) {
  if(mods[mod].connectHook) {
    connectFnArr.push(mods[mod].connectHook);
  }
}
if(connectFnArr.length)
  log("Number of connect hooks:"+connectFnArr.length);
function
connectHooks(req, res, next)
{
  if(req.connecHookIdx == undefined)
    req.connecHookIdx = 0;
  if(req.connecHookIdx >= connectFnArr.length)
    return next();
  connectFnArr[req.connecHookIdx](req, res, function(){ 
    req.connecHookIdx++;
    connectHooks(req, res, next);
  });
}
//////////////////////////////////
function
loadProjects(nextFn)
{ 
  global.projects = [];
  // look for projects in db and serve static for each project
  pool.getConnection(function(err, conn) {
    conn.query(
      "SELECT name from kipus_projects where name != 'ADMIN'", null,
      function(err, rows){
        if(err)
          return log("loadProjects"+err);
        for (var i=0; i<rows.length; i++) {
          global.projects.push(rows[i].name);
        }
        if(nextFn)
          return nextFn();
      });
    conn.release();
  });
}
global.loadProjects = loadProjects;

//////////////////////////////////
function
createServer()
{
  // create a web server(HTTP+HTTPS)
  if(cfg.httpPort) {
    http.createServer(app).listen(cfg.httpPort, cfg.httpHost);
    log("HTTP server started on "+cfg.httpPort+", serving "+cfg.htmlDir);
  }

  if(cfg.httpsPort) {
    var httpsOptions = {
      key: fs.readFileSync(cfg.certDir+'/key.pem'),
      cert:fs.readFileSync(cfg.certDir+'/cert.pem')
    };
    https.createServer(httpsOptions, app).listen(cfg.httpsPort, cfg.httpHost);
    log("HTTPS server started on "+cfg.httpsPort+", serving "+cfg.htmlDir);
  }
}

///////////////////////////////
// configure the connect modules, and call "our" functions
var app = connect()
  .use(logger('URL :url (:status) in :response-time ms', {stream:logFilter }))
  .use(compress())
  .use(connectHooks)
  .use(mods.offline.offlineHandler)
  .use(mods.image.dbImageHandler)
  .use(mods.image.dbFileHandler)
  .use(mods.projects.dbFileHandler)
  .use(mods.projects.htmlReplace)
  .use(mods.offline.projectsHandler)
  .use(bodyParser.json({strict:false, limit:'100000kb'}))
  .use(bcHandler)
  .use(apiHandler);

global.serve = serveStatic(cfg.htmlDir, {lastModified:true, etag:true} );
app.use(global.serve);


//if (cfg.html2Dir)
  //app.use(serveStatic(cfg.html2Dir, {lastModified:true, etag:true} ))

if (cfg.hasOwnProperty('clusterNodes')) {
  var cluster = require('cluster');
  clusterSize = cfg.clusterNodes == 0 ? require('os').cpus().length
                                      : cfg.clusterNodes;
}

if (clusterSize != 0 && cluster.isMaster) {
  for (var i=0; i < clusterSize; i++) {
    // create a node process as a cluster member (worker).
    cluster.fork();
  }

  // Replace processes that die
  cluster.on('exit', function (worker, code, signal) {
    log("Node process "+worker.process.pid+" died");
    cluster.fork();
  });
}
else {
  loadProjects();
  createServer();
  log("Node process "+process.pid+" started");

  // debug uncaught exception
  process.on('uncaughtException', function (err) {
    console.log(err);
  });
}


/* Copyright KI-AG 2013-2019, Project KIPUS */

// $Id: createuserbookids.js 3660 2019-01-20 15:42:50Z rko $

// go through all projects an write rootbookid in every pagedefinition-table
// if rootbookid-column does not exist, add column rootbookid

global.log = console.log;
var argv = process.argv;
var mods = {};

if(argv.length != 2) {
  log("Usage:");
  log("% export NODE_PATH=../node/node_modules");
  log("% ../node/bin/node helper/test.js");
  process.exit(1);
}
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

global.execModFnList = 
function(fnName, par, nextFn)
{
  if(par.fnIdx == undefined) {
    par.fnList=[]; par.fnIdx=0;
    for(var file in mods)
      if(mods[file][fnName])
        par.fnList.push(file);
    par.fnList.sort();
    return execModFnList(fnName, par, nextFn);
  }

  if(par.fnIdx == par.fnList.length) {
    delete(par.fnIdx); delete(par.fnList);
    return nextFn();
  }

  var mod = par.fnList[par.fnIdx++];
  //log("DEBUG execModFnList: "+fnName+" in "+mod);
  mods[mod][fnName](par, function() {
    execModFnList(fnName, par, nextFn);
  });
}


var cfg = require('../config');
var fs = require('fs');
var mysql = require('mysql');
log("Using database: " + cfg.db.database + " on host: " + cfg.db.host);
global.pool = mysql.createPool(cfg.db);
var db  = mysql.createConnection(cfg.db);
var myuserdata  = require('../modules/myuserdata.js');
var bookDefinitions  = require('../modules/bookDefinitions.js');

mods.bookDefinitions= bookDefinitions;
global.mods = mods;
global.cfg = cfg;

global.htmlError = function(p, err)
{
  log("ERROR:"+err);
  process.exit(1);
}

myuserdata.createUserBookIdsTable(
  { body:{} },
  { end:function(){ log("createuserbookids completed"); process.exit(0) } });


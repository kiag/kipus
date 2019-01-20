/* Copyright KI-AG 2013-2019, Project KIPUS */

// $Id: refreshlookuphierarchypath.js 3660 2019-01-20 15:42:50Z rko $

// go through all LOOKUP tables having a PARENT and a HIERARCHYPATH column 
// and compute and set HIERARCHYPATH (e.g., 1,3,5,6)

global.log = console.log;
var argv = process.argv;

if(argv.length != 2) {
  log("Usage:");
  log("% export NODE_PATH=../node/node_modules");
  log("% ../node/bin/node helper/refreshlookuphierarchypath.js");
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

var cfg = require('../config');
var fs = require('fs');
var mysql = require('mysql');
log("Using database: " + cfg.db.database + " on host: " + cfg.db.host);
global.pool = mysql.createPool(cfg.db);
var db  = mysql.createConnection(cfg.db);
var setlookuphierarchypath  = require('../modules/setlookuphierarchypath.js');
var req = { body: { username: "nodeUser" } }; 

setlookuphierarchypath.setLookupHierarchyPath(req, function() {
  //log("refreshlookuphierarchy finished");
  process.exit(0);
});

/* Copyright KI-AG 2013-2019, Project KIPUS */

// as in send data from the client to the server
function
upload(req, res, next)
{
  var par = { req:req, res:res, next:next, status:0 };

  if(!par.req.body.structVersion) // Needed for clients before 2015-09-09
    return htmlError(par, "Request denied, please update the program first.");

  pool.getConnection(function(err, connection) {
    if(err)
      return myHtmlError(par, "getConnection: "+err);
    par.connection = connection;
    par.connection.beginTransaction(function(err) {
      if(err)
        return myHtmlError(par, ""+err);
      par.inTransaction = true;
      doUpload(par, 0);
    });
  });
}

function
doUpload(par, status, callbackFn)
{
  var cStatus = 0;
  var b = par.req.body;

  if(status == cStatus) {  // user -> booklist
    return par.connection.query(
      "SELECT * "+
      "FROM kipus_userprojects up, kipus_projectbooks pb, "+
           "kipus_bookpages bp, kipus_pagedefinition pd "+
      "WHERE up.login=? AND up.projectid=pb.projectid AND "+
           "pb.bookdefid=bp.bookdefid AND "+
           "(pd.pagetype='HEADER' OR pd.pagetype='BODY') AND "+
           "pd.id=bp.pagedefid",
      [b.username], function(err, rows) {
        if(err)
          return myHtmlError(par, "get bookDef: "+err);
        par.pn2d={}; par.pi2d={}, par.pageDefIdArr=[];
        for(var i1=0; i1<rows.length; i1++) {
          var r = rows[i1];
          par.pn2d[r.tablename] = r;
          par.pi2d[r.id] = r;
          par.pageDefIdArr.push(r.pagedefid);
        }
        return doUpload(par, status+1, callbackFn);
      });
  }


  if(status == ++cStatus) {  //check if each table is part of users project list
    if(!b.rows || !b.rows.length)
      return myHtmlError(par, "No data to upload");

    for(var i1=0; i1<b.rows.length; i1++) {       // each row
      var r = b.rows[i1];
      for(var tblName in r) {                     // each table
        if(tblName.indexOf("_") == 0)
          continue;

        if(!par.pn2d[tblName]) {
          fs.writeFile(cfg.htmlDir+"/"+b.username+"_uploadContent.json",
                       JSON.stringify(b), function(){});
          return myHtmlError(par,
             b.username+" is not authorized to write table "+tblName);
        }
      }
    }
    return doUpload(par, status+1, callbackFn);
  }

  if(status == ++cStatus) {  // check rowid, to avoid writing data again
    var nRowsDone = 0;
    b.synced = {};
    b.updateRow = {};
    b.duplicatesFound = 0;
    b.rowsInserted = 0;
    b.rowsUpdated = 0;

    for(var i1=0; i1<b.rows.length; i1++) {       // each row
      var r = b.rows[i1];
      var str = [r._bookid,r._bDefId,r._rowid].join("/");

      (function(str){
      par.connection.query("SELECT id,foreignSyncId FROM kipus_rows WHERE "+
        "bookid=? AND bookdefid=? AND foreignRowId=?",
        [r._bookid,r._bDefId,r._rowid],
        function(err, rows){
          if(err)
            return myHtmlError(par, "get old rows: "+err);

          if(rows.length != 0) {
            if(rows[0].foreignSyncId == r._firstSync) {
              b.duplicatesFound++;
              b.synced[str] = true;
            } else { //
              b.updateRow[str] = rows[0].id;    // modified row
            }
          }

          if(++nRowsDone == b.rows.length)
            return doUpload(par, status+1, callbackFn);
        });
      })(str);
    }
    return;
  }

  if(status == ++cStatus) {  // parent rowid part 1: get the header definitions
    var q = [];
    for(var i1=0; i1<par.pageDefIdArr.length; i1++)
      q.push('?');
    par.connection.query(
      "SELECT * FROM kipus_pageattributes WHERE pagedefid in ("+q.join(",")+")",
      par.pageDefIdArr,
      function(err, rows){
        par.pa={};
        for(var i1=0; i1<rows.length; i1++) {
          var r = rows[i1];
          par.pa[r.columnname] = r;
          if(r.constrainttype=="singleFromTable" && par.pn2d[r.constraintparam])
            par.pi2d[r.pagedefid].headerColumn = r.columnname;
        }
        return doUpload(par, status+1, callbackFn);
      });
    return;
  }

  if(status == ++cStatus) {  // parent rowid part 2: get kipus_rows for hdrs
    par.connection.query(
      "SELECT * FROM kipus_rows WHERE foreignRowId=0", [],
      function(err, rows){
        par.rootBookId={};
        for(var i1=0; i1<rows.length; i1++) {
          var r = rows[i1];
          par.rootBookId[r.bookid] = r.rootbookid;
        }

        for(var i1=0; i1<b.rows.length; i1++) { // append the current data
          var r = b.rows[i1];
          for(var tbl in r) {
            if(tbl.indexOf('_') == 0 ||
               !par.pn2d[tbl] ||
               par.pn2d[tbl].pagetype != 'HEADER')
              continue;
            var hc = par.pn2d[tbl].headerColumn;
            if(!hc) {
              par.rootBookId[r._bookid] = r._bookid;
            } else {
              if(!r[tbl] || !r[tbl][hc]) {
                log("ERROR: bogus upload data for "+tbl+": "+hc+" is missing");
                continue;
              }
              var pr = r[tbl][hc].replace(/.0$/,'');
              par.rootBookId[r._bookid] =
                par.rootBookId[pr] ? par.rootBookId[pr] : pr;
            }
          }
        }
        return doUpload(par, status+1, callbackFn);
      });
    return;
  }


  if(status == ++cStatus) {  // preprocessors
    execModFnList("uploadPreProcessor", par, function() {
      doUpload(par, status+1, callbackFn);
    });
    return;
  }

  if(status == ++cStatus) {  // write rowid
    var nRowsDone = 0;
    b.now = b.lastSync?b.lastSync:now(); // lastSync in request is set in getMyUserData
    for(var i1=0; i1<b.rows.length; i1++) {             // each row
      var r = b.rows[i1];
      var str = [r._bookid,r._bDefId,r._rowid].join("/");
      if(b.synced[str]) {
        if(++nRowsDone == b.rows.length)
          return doUpload(par, status+1, callbackFn);
        continue;
      }

      if(b.updateRow[str]) {
        b.rowsUpdated++;
        (function(r, str){
        par.connection.query("UPDATE kipus_rows "+
          "set foreignSyncId=?,modifiedby=?,modified=? WHERE id=?",
          [r._firstSync,b.username,b.now, b.updateRow[str]],
          function(err, insRes){
            if(err)
              return myHtmlError(par, "update metadata "+err);
            r._serverRowId = b.updateRow[str];
            if(++nRowsDone == b.rows.length)
              return doUpload(par, status+1, callbackFn);
          });
        })(r, str);

      } else {
        b.rowsInserted++;
        (function(r){
        var rbId = par.rootBookId[r._bookid];
        if(!rbId) {
          log("ERROR: skipping metaInsert due to missing rootbookid");
          if(++nRowsDone == b.rows.length)
            return doUpload(par, status+1, callbackFn);

        } else {
          par.connection.query("INSERT INTO kipus_rows "+
            "(bookid,rootbookid,bookdefid,foreignRowId,foreignSyncId,"+
             "foreignCreated,modifiedby,modified) VALUES (?,?,?,?,?,?,?,?)",
             [r._bookid,rbId,r._bDefId,r._rowid,r._firstSync,
              r._updated,b.username,b.now],
            function(err, insRes){
              if(err)
                return myHtmlError(par, "insert metadata "+err);
              r._serverRowId = insRes.insertId;
              if(++nRowsDone == b.rows.length)
                return doUpload(par, status+1, callbackFn);
            });
        }
        })(r);
      }
    }
    return;
  }

  if(status == ++cStatus) {  // write data
    var nInsertsToDo = 0;

    for(var i2=0; i2<2; i2++) {
      if(i2 == 1) {
        log("    inserts/updates to do:"+nInsertsToDo);
        par.totalInserts = nInsertsToDo;
        if(nInsertsToDo == 0)
          return doUpload(par, status+1, callbackFn);
      }
      for(var i1=0; i1<b.rows.length; i1++) {           // Second round: insert
        var r = b.rows[i1];
        var str = [r._bookid,r._bDefId,r._rowid].join("/");

        for(var tblName in r) {                           // each table
          if(tblName.indexOf("_") == 0)
            continue;
          if(b.synced[str])
            continue;
          if(i2==0) {
            nInsertsToDo++
            continue;
          }

          var tbl = r[tblName];
          var colNames=['bookid', 'rootbookid', 'modifiedby', 'modified'],
              colVals =[r._bookid,par.rootBookId[r._bookid], b.username, b.now],
              colPlaceHolder=['?', '?', '?', '?', '?'];
          for(var colName in tbl) {
            if(colName.indexOf('_') == 0) // update only
              continue;

            // ignore the icon coming back with an update
            if(!par.pa[colName])
              return myHtmlError(par, "Unknown column "+colName);
            var ct = par.pa[colName].constrainttype;
            if(ct == 'foto' && b.updateRow[str] && tbl[colName].length < 10240)
              continue;

            // mysql 5.7 is picky about dates, empty doubles, etc
            var d = tbl[colName];
            if(d === '')
              d = null;
            if(d !== null && (ct=='date' || ct=='dateTime')) {
              if(d.indexOf('0000-00-00') == 0)
                d = null;
              else if(ct=='date')
                d = d.substr(0,10);
              else if(ct=='dateTime')
                d = d.substr(0,19);
            }

            colNames.push(colName);
            colVals.push(d);
            colPlaceHolder.push("?");
          }

          colVals.push(r._serverRowId);

          if(b.updateRow[str]) {
            var sql = "UPDATE "+tblName+" set "+colNames.join("=?,")+
                                "=? WHERE rowid=?";
            (function(tbl, r, tblName, sql, colNames, colVals, colPlaceHolder){
              par.connection.query(sql, colVals,
                function(err, insRes){
                  if(err) {
                    log(sql);
                    return myHtmlError(par, "insert "+tblName+": "+err);
                  }
                  if(insRes.affectedRows == 0) {
                    log("ERROR: cannot update "+tblName+".rowid "+
                        r._serverRowId+", INSERTING");
                    colNames.push('rowid');
                    var sql = "INSERT INTO "+tblName+" ("+colNames.join(",")+
                              ") VALUES("+colPlaceHolder.join(",")+")";
                    par.connection.query(sql, colVals,
                      function(err, insRes){
                        if(err) {
                          log(sql);
                          return myHtmlError(par, "insert "+tblName+": "+err);
                        }
                        tbl._id = insRes.insertId;
                        if(--nInsertsToDo == 0)
                          return doUpload(par, status+1, callbackFn);
                      });
                  } else {
                    tbl._id = r._serverRowId;
                    if(--nInsertsToDo == 0)
                      return doUpload(par, status+1, callbackFn);
                  }
                });
             })(tbl, r, tblName, sql, colNames, colVals, colPlaceHolder);

          } else {
            colNames.push('rowid');
            if(!par.rootBookId[r._bookid]){
              serverError({level:LOGLEVEL.ERROR, username:b.username },
                    "ERROR: skipping dataInsert due to missing rootbookid.\n"+
                    "  TBL :"+tblName+"\n"+
                    "  FRID:"+r._rowid+"/"+r._firstSync+"\n"+
                    "  COLS:"+colNames.join(",")+"\n"+
                    "  DATA:"+colVals.join(",")+"\n");
              if(--nInsertsToDo == 0)
                return doUpload(par, status+1, callbackFn);

            } else {
              var sql = "INSERT INTO "+tblName+" ("+colNames.join(",")+
                                ") VALUES("+colPlaceHolder.join(",")+")";
              (function(tbl, tblName, sql, colNames, colVals, colPlaceHolder){
                par.connection.query(sql, colVals,
                  function(err, insRes){
                    if(err) {
                      log(sql);
                      return myHtmlError(par, "insert "+tblName+": "+err);
                    }
                    tbl._id = insRes.insertId;
                    if(--nInsertsToDo == 0)
                      return doUpload(par, status+1, callbackFn);
                  });
               })(tbl, tblName, sql, colNames, colVals, colPlaceHolder);
             }
          }
        }
      }
    }
    return;
  }

  if(status == ++cStatus) {  // postprocessors
    if(!par.fnNameArr) {
      par.fnNameArr = []; par.fnHash = {}; par.fnIdx  = 0;

      for(var file in mods) {
        if(mods[file].uploadPostProcessor) {
          par.fnNameArr.push(file);
          par.fnHash[file] = mods[file].uploadPostProcessor;
        }
      }
      par.fnNameArr.sort();
    }

    if(par.totalInserts == 0 || par.fnIdx == par.fnNameArr.length) {
      par.fnNameArr = undefined;
      return doUpload(par, status+1, callbackFn);
    }

    var mod = par.fnNameArr[par.fnIdx];
    par.fnHash[mod](par, function(res){
      if(res == 0)
        return myHtmlError(par, "Postprocessing failed in "+mod);
      par.fnIdx++;
      return doUpload(par, status, callbackFn);
    });
    return;
  }

  if(status == ++cStatus)
    return myHtmlOk(par);
//    return myHtmlError(par,"Sorry, update not possible, debugging is active");
}

function
myHtmlOk(par)
{
  var b = par.req.body;
  if(b.duplicatesFound)
    log("    DUPLICATES IN SYNC:"+b.duplicatesFound);
  if(b.rowsInserted || b.rowsUpdated)
    log("    rows inserted:"+b.rowsInserted+", updated:"+b.rowsUpdated);
  if(par.inTransaction) {
    par.connection.commit(function(err) {
      if(err)
        log(err);
      par.connection.release();
    });
  } else {
    par.connection.release();
  }
  return par.res.end(JSON.stringify({ sync:"ok", now:now(),
                                      syncAgain:par.syncAgain }));
}

function
myHtmlError(par, err)
{
  if(par.inTransaction)
    par.connection.rollback();
  par.connection.release();
  return htmlError(par, ""+err);
}


function
now()
{
  return (new Date()).toISOString().substring(0,19).replace("T", " ");
}


function
uploadDebugInfo(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next, status:0 };
  if(!b.rows || !b.rows.length)
    return htmlError(par, "No data received");

  pool.getConnection(function(err, connection) {
    if(err)
      return myHtmlError(par, ""+err);
    par.connection = connection;
    par.connection.beginTransaction(function(err) {
      if(err)
        return myHtmlError(par, ""+err);
      par.inTransaction = true;
      var n = now(), nRowsDone=0;
      for(var i1=0; i1<b.rows.length; i1++) {             // each row
        var d = b.rows[i1].length > 255 && !b.rows[i1].startsWith("Stacktrace")? b.rows[i1].substr(0,255) : b.rows[i1];
        par.connection.query(
          "INSERT INTO kipus_debugInfo (data, modified,modifiedby) "+
          "VALUES(?,?,?)", [d, n, b.username],
          function(err, insRes){
            if(err)
              return myHtmlError(par, ""+err);
            if(++nRowsDone == b.rows.length) {
              sendMail(par, (b.comment?"User comment:\r\n"+b.comment:""));
              return myHtmlOk(par);
            }
          });
      }
    });
  });
}

// for debugging purposes only
function
uploadClientDB(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next, status:0 };
  if(!b.sql)
    return htmlError(par, "No data received");
  var path = cfg.htmlDir + "/" + b.username + "_clientdb.sql";
  if (cfg.uploadClientDBName) {
    path = cfg.htmlDir + "/" + cfg.uploadClientDBName;
    path = path.replace("%u", b.username);
    path = path.replace("%t", Date.now());
  }
  log("write file " +path);
  fs.writeFile(path, b.sql,
    function(err) {
      if(err)
        return htmlError(par, "" + err);
      sendMail(par);
      return res.end(JSON.stringify({fileName:path}));
    });
}

module.exports.cmd = { upload:upload,
                       uploadDebugInfo:uploadDebugInfo,
                       uploadClientDB:uploadClientDB };

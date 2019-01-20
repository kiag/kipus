/* Copyright KI-AG 2013-2019, Project KIPUS */
//////////////////////////////////////////////////////
// DB functions
var useWebSql = true;
var kps_db; // db handle
var dbg, dbVers;

var dbCrTable = [
  "CREATE TABLE IF NOT EXISTS kps_book ("+
          "bookId INTEGER PRIMARY KEY,"+
          "bookDefId TEXT NOT NULL,"+
          "maxRow INTEGER NOT NULL,"+
          "updated TEXT)",
  "CREATE TABLE IF NOT EXISTS kps_row ("+
          "bookId INTEGER NOT NULL,"+
          "rowId INTEGER NOT NULL,"+
          "updated TEXT NOT NULL,"+
          "firstSync TEXT,"+
          "synced TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS kps_row_1 ON kps_row (bookId,rowid)",
  "CREATE TABLE IF NOT EXISTS kps_answer ("+
          "bookId INTEGER NOT NULL,"+
          "tableName TEXT NOT NULL,"+
          "rowId INTEGER NOT NULL,"+
          "data TEXT NOT NULL)",
  "CREATE UNIQUE INDEX IF NOT EXISTS kps_answer_1 ON kps_answer "+
          "(bookId,tableName,rowid)",
  "CREATE TABLE IF NOT EXISTS kps_longDataQ ("+
          "seqNum INTEGER PRIMARY KEY AUTOINCREMENT,"+
          "bookId INTEGER NOT NULL,"+
          "tableName TEXT NOT NULL,"+
          "rowId INTEGER NOT NULL,"+
          "columnName TEXT NOT NULL,"+
          "data TEXT NOT NULL,"+
          "tableCopyParam TEXT NOT NULL,"+
          "transferInProgress INTEGER)",
  "CREATE UNIQUE INDEX IF NOT EXISTS kps_longDataQ_1 ON kps_longDataQ "+
          "(bookId,tableName,rowid,columnName,tableCopyParam)",
  "CREATE TABLE IF NOT EXISTS kps_images ("+
          "name TEXT PRIMARY KEY,"+
          "data TEXT,"+
          "modified TEXT NOT NULL)",
];
var dbTableList = [ "kps_book", "kps_row", "kps_answer",
                    "kps_longDataQ", "kps_images" ];


function
db_errFn(tx,err)
{
  msg("DbError:"+(err ? err.code+" "+err.message : "unknown"));
  kps_setSyncFlag(false);
}

function
db_sqlExecList(a)
{
  if(!a.sNo)
    a.sNo = 0;
  if(a.sNo == a.sqlList.length) {
    if(a.nextFn)
      a.nextFn();
    return;
  }

  if(!a.tx) {
    kps_db.transaction(function(tx) { a.tx = tx; db_sqlExecList(a); });

  } else {
    var sql = a.sqlList[a.sNo];
    a.tx.executeSql(sql, [],
        function(tx, data) { a.sNo++; db_sqlExecList(a); }, db_errFn);

  }
}

function
db_upgrade(par)
{

  log("opened DB with version "+par.vers);
  if(par.vers == '' || par.vers == '0.0') {
    par.fromScratch = true;
    log("Creating database");
    db_sqlExecList({ sqlList:dbCrTable, nextFn:function() { 
      kps_db.changeVersion(par.vers, '1.4', function(tx){
        par.vers = '1.4';
        db_updateAnswer(0, "structVersion", 0, {version:version}, function() {
          db_upgrade(par);
        });
      });
    }});
    return;
  }

  if(par.vers == '1.2') {
    var sl = ["ALTER TABLE kps_longDataQ ADD COLUMN data TEXT NULL",
              "ALTER TABLE kps_longDataQ ADD COLUMN tableCopyParam TEXT NULL"];
    db_sqlExecList({ sqlList:sl, nextFn:function() {
      kps_db.changeVersion(par.vers, '1.3', function(tx){
        par.vers = '1.3';
        db_upgrade(par);
      });
    }});
    return;
  }
 
  if(par.vers == '1.3') {
    var sl = [
      "DROP INDEX kps_longDataQ_1",
      "CREATE UNIQUE INDEX IF NOT EXISTS kps_longDataQ_1 ON kps_longDataQ "+
          "(bookId,tableName,rowid,columnName,tableCopyParam)" ];
    db_sqlExecList({ sqlList:sl, nextFn:function() {
      kps_db.changeVersion(par.vers, '1.4', function(tx){
        par.vers = '1.4';
        db_upgrade(par);
      });
    }});
    return;
  }
  
  dbVers = '1.4';       // current version
  var sqlList = [
     "UPDATE kps_longDataQ SET transferInProgress = 0 ",
     "UPDATE kps_row SET firstSync=NULL,synced=NULL "+
              "where firstSync='undefined'", // BUGFIX
     "UPDATE kps_row SET firstSync=synced where synced IS NOT NULL" // BUGFIX
  ];
  db_sqlExecList({ sqlList:sqlList, nextFn:function() {
    par.nextFn(par.fnParam);
  }});
}

function
db_open(nextFn, param)
{
  if(kps_db)
    return nextFn(param)

  if(!window.openDatabase) {
    okDialog(
        "WEBSQL is NOT supported by your browser.<br>"+
        "Try another browser.");
    return;
  }

  dbName = backendPrefix.replace(/[^A-Z0-9_]/gi,"");
  if(projectName)
    dbName += "_"+projectName;

  kps_db = openDatabase(dbName,'',dbName, (isiOS ? 5 : 50)*1024*1024);
  db_upgrade({vers:kps_db.version, step:0, nextFn:nextFn, fnParam:param });
}

function
db_dropTables(nextFn)
{
  var a = { sqlList:[] };
  for(var i1=0; i1<dbTableList.length; i1++)
    a.sqlList.push("DROP TABLE "+dbTableList[i1]);
  bdef = {};
  a.nextFn = function() {
    kps_db.changeVersion(dbVers, '0.0', function(tx){
      kps_db = undefined; // make db_open recreate the tables
      setTimeout(nextFn, 10); // setTimeout to close the TX
    });
  }
  db_sqlExecList(a);
}

// Params: par.bookIds=[], par.oldest (YYYY-MM-DD), bodyTable, bodyCol
// used by sim_addition.js
function
db_deleteOldBody(par)
{
  if(!par.tx) {
    par.ol = par.oldest.length;
    par.bl = par.bodyCol.length+3;
    kps_db.transaction(function(tx) { par.tx = tx; db_deleteOldBody(par); });
    return;
  }

  if(!par.rows) {
    var sql = "SELECT bookId,rowId,data FROM kps_answer "+
        "WHERE tableName='"+par.bodyTable+"' and rowId > 0 and "+
              "bookId in ("+par.bookIds.join(",")+")";
    par.tx.executeSql(sql, [], function(tx,rs) {
      par.rows = rs.rows;
      log("db_deleteOldBody: checking "+par.rows.length+" rows");
      par.rowIdx = 0;
      par.del = 0;
      db_deleteOldBody(par);
    }, db_errFn);
    return;
  }

  while(par.rowIdx < par.rows.length) {
    var r = par.rows[par.rowIdx++];
    var d = r.data;
    var off = d.indexOf(par.bodyCol+'":"');
    if(off < 0)
      continue;
    var date = d.substr(off+par.bl, par.ol);
    if(date.localeCompare(par.oldest) > 0)
      continue;

    var sql = "SELECT firstSync FROM kps_row WHERE bookId=? and rowId=?";
    par.tx.executeSql(sql, [r.bookId, r.rowId], function(tx,rs) {
      if(rs.rows[0].firstSync == null)
        return db_deleteOldBody(par);

      sql = "DELETE FROM kps_row WHERE bookId=? and rowId=?";
      par.tx.executeSql(sql, [r.bookId, r.rowId], function(tx,rs) {
        var sql = "DELETE FROM kps_answer WHERE bookId=? and tableName=? and rowId=?";
        par.tx.executeSql(sql, [r.bookId, par.bodyTable, r.rowId], function(tx,rs) {
          par.del++;
          db_deleteOldBody(par);
        }, db_errFn);
      }, db_errFn);
    }, db_errFn);
  }
  log("db_deleteOldBody done, deleted "+par.del+" rows");
}

function
db_deleteBooks(par)
{
  if(!par.tx) {
    par.booksDeleted = 0;
    par.sqlList = [];
    kps_db.transaction(function(tx) { par.tx = tx; db_deleteBooks(par); });
    return;
  }

  if(!par.notSynced) {
    par.tx.executeSql("SELECT bookId FROM kps_row where synced is NULL", [],
    function(tx,rs) {
      par.notSynced={}
      for(var idx=0; idx<rs.rows.length; idx++)
        par.notSynced[rs.rows.item(idx).bookId] = 1;
      db_deleteBooks(par);
    }, db_errFn);
    return;
  }

  for(var bookid in par.have) {
    if(par.allowed[bookid] || par.notSynced[bookid])
      continue;
    log("Deleting book "+bookid);
    par.booksDeleted++;
    par.sqlList.push("DELETE FROM kps_answer WHERE bookId="+bookid);
    par.sqlList.push("DELETE FROM kps_book   WHERE bookId="+bookid);
    par.sqlList.push("DELETE FROM kps_row    WHERE bookId="+bookid);
  }
  log("books to delete: "+par.sqlList.length);
  if(par.sqlList.length)
    receivedData = true;
  db_sqlExecList(par);
}


function
db_getAnswer(bookId, tableName, rowId, nextFn)
{
  kps_db.transaction(function(tx) {
    tx.executeSql("SELECT data FROM kps_answer "+
                      "WHERE bookId=? AND tableName=? AND rowId=?",
    [bookId, tableName, rowId],
    function(tx,rs) {
      var res = {};
      if(rs.rows.length == 1)
        res = JSON.parse(rs.rows.item(0).data);
      nextFn(res);
    }, db_errFn);
  });
}

function
db_getAnswerRows(filter, nextFn)
{
  if(typeof filter == "object") {
    var where = [];
    for(var f in filter)
      where.push("kps_answer."+f+"='"+filter[f]+"'");
    filter = where.join(" AND ");
  }
  kps_db.transaction(function(tx) {
    tx.executeSql("SELECT kps_row.rowId, kps_row.bookId, "+
        "updated, firstSync, data FROM kps_row,kps_answer "+
        "WHERE kps_row.rowId  = kps_answer.rowId AND "+
               "kps_row.bookId = kps_answer.bookId AND "+ filter + 
        " ORDER BY kps_row.bookId,kps_row.rowId", [],
    function(tx, rs) {
      var res = [], oldRowId = -1, oldBookId = -1, curObj;
      for(var idx=0; idx<rs.rows.length; idx++) {
        var r = rs.rows.item(idx)
        if(oldRowId != r.rowId || oldBookId != r.bookId) {
          curObj = JSON.parse(r.data);
          curObj._rowId     = r.rowId;
          curObj._bookId    = r.bookId;
          curObj._updated   = r.updated;
          curObj._firstSync = r.firstSync;
          res.push(curObj);
          oldRowId = r.rowId;
          oldBookId = r.bookId;
        } else {
          var nO = JSON.parse(r.data);
          for(var o in nO)
            curObj[o] = nO[o];
        }
      }
      nextFn(res);
    }, db_errFn);
  });
}

function
db_getLookupTables(nextFn)
{
  kps_db.transaction(function(tx) {
    tx.executeSql(
      "SELECT tableName,data FROM kps_answer "+
        "WHERE bookId=0 AND rowId=0 and tableName LIKE 'table.%'",[],
      function(tx, rs) {
        var res = {};
        for(var idx=0; idx<rs.rows.length; idx++) {
          var r = rs.rows.item(idx);
          res[r.tableName.substr(6)] = JSON.parse(r.data);
        }
        nextFn(res);
      }, db_errFn);
  });
}

function
db_updateAnswer(book, tableName, rowId, toSave, nextFn, noLog, par, noDelete)
{
  var tName = (typeof tableName == "string" ? tableName : "MULTI-TABLE");
  if(!noLog) {
    var out = JSON.stringify(toSave);
    if(out.length > 80)
      out = out.substr(0,130)+" ...";
    log("update "+tName+", book:"+book+" row:"+rowId+" "+out);
  }

  var bookId = book;

  if(par && par.tx && !par.tx.inUse)
    doCheck(par.tx)
  else
    kps_db.transaction(doCheck);

  function
  doCheck(tx)
  {
    if(par && !par.tx)
      par.tx = tx;
    tx.inUse = true;
    if(typeof book == "object") {
      saveBook(tx);
    } else {
      saveRows(tx);
    }
  }

  function
  saveBook(tx)
  {
    bookId = book.bookId;
    var mr = parseInt(book.maxRow);
    var ri = parseInt(rowId);
    var n = book.updated ? book.updated : nowUTC();
    book.maxRow = (mr < ri ? ri : mr);
    tx.executeSql("INSERT OR REPLACE INTO kps_book "+
      "(bookId,bookDefId,maxRow,updated) VALUES(?,?,?,?)", 
      [bookId,""+book.bookDefId,book.maxRow,n],
      function(tx,rs) {
        if(book.firstSync == undefined) book.firstSync = null;
        if(book.synced    == undefined) book.synced    = null;
        tx.executeSql("INSERT OR REPLACE INTO kps_row "+
          "(bookId,rowId,updated,firstSync,synced) VALUES(?,?,?,?,?)",
          [bookId,rowId,n,book.firstSync,book.synced], 
          saveRows, db_errFn);
      }, db_errFn);
  }

  function
  doSaveRows(tx)
  {
    var tHash = {}, tArr = [], tTname = [];
    if(typeof tableName=="string") {
      tArr.push(toSave);
      tTname.push(tableName);

    } else {
      for(var colName in toSave) {    // split into tables
        if(colName.indexOf("_") == 0 && colName != "_complexData")
          continue;
        var tName = (typeof tableName == "string" ?
                     tableName : tableName[colName].tablename);
        if(!tHash[tName]) {
          tHash[tName] = {};
          tArr.push(tHash[tName]);
          tTname.push(tName);
        }
        tHash[tName][colName] = toSave[colName];
      }
    }
    var tsLength = tArr.length;
    if (tsLength == 0 && nextFn) {
      delete tx.inUse;
      if(toSave._nextRow)
        return db_updateAnswer(book, tableName, rowId+1, toSave._nextRow,
                                nextFn, noLog, par, noDelete);
      else
        return nextFn();
    }

    var updated = [];
    for(var i1 = 0; i1< tArr.length; i1++) {
      var tName = tTname[i1];
      updated.push({ bookId:bookId, tName:tName, rowId:rowId });
      tx.executeSql("INSERT OR REPLACE INTO kps_answer "+
              "(bookId,tableName,rowid,data) VALUES(?,?,?,?)", 
        [bookId, tName, rowId, JSON.stringify(tArr[i1])],
        function() {
          if(--tsLength == 0 && nextFn) {
            delete tx.inUse;
            if(toSave._nextRow) {
              return db_updateAnswer(book, tableName, rowId+1, toSave._nextRow,
                                      nextFn, noLog, par, noDelete);
            } else {
              if(!noLog && syncDebug)
                db_checkUpdate(updated);
              return nextFn();
            }
          }
        },
        db_errFn);
    }
  }

  function
  saveRows(tx)
  {
    var lBookId = (bookId==0 ? -1 : bookId); // Do not delete bookId=0
    if(noDelete) {
      doSaveRows(tx);
    } else {
      tx.executeSql(
        "DELETE FROM kps_answer WHERE bookId=? AND rowId=? AND tableName=?",
        [lBookId, rowId, tName], doSaveRows, db_errFn);
    }
  }
}

// The togo stuff
function
db_checkUpdate(updated)
{
  kps_db.transaction(function(tx) {
    for(var i1=0; i1<updated.length; i1++) {
      (function(u){
        tx.executeSql(
          "SELECT count(*) cnt from kps_answer "+
                "WHERE tableName=? AND bookId=? AND rowId=?",
          [u.tName, u.bookId, u.rowId],
          function(tx, rs){
            var r = rs.rows[0];
            var msg ="checkUpdate "+u.tName+","+u.bookId+","+u.rowId+": "+r.cnt;
            log(msg);
            if(r.cnt != 1) {
              var errMsg = "ERROR: "+msg+"<br>Please send a screenshot to Alex";
              okDialog(errMsg);
              backendCall("uploadDebugInfo",
                { rows:[msg], comment:"db_checkUpdate" },
                undefined, undefined, function(){});    // ignore errors
            }
          }, db_errFn);
      })(updated[i1]);
    }
  });
}


// This is needed for conditional tables
function
db_deleteAnswer(bookId, rowId, nextFn)
{
  kps_db.transaction(function(tx){
    tx.executeSql(
      "DELETE FROM kps_answer WHERE bookId=? and rowId=?",
      [bookId, rowId],
      function(tx, rs){
        nextFn();
      });
  });
}

function
db_getBooks(nextFn)
{
  kps_db.transaction(function(tx) {
    tx.executeSql("SELECT * FROM kps_book", [],
      function(tx,rs) {
        var res = []
        for(var idx=0; idx<rs.rows.length; idx++) {
          var n = {}, o = rs.rows.item(idx); // copy it, as the orig is R/O
          for(m in o)
            n[m] = o[m];
          res.push(n);
        }
        nextFn(res);
      }, db_errFn);
  });
}

function
db_updateBook(p, nextFn, par)
{
  function
  execInsert(tx)
  {
    tx.executeSql("INSERT OR REPLACE INTO kps_book "+
      "(bookId,bookDefId,maxRow,updated) VALUES (?,?,?,?)",
      [p.bookId,""+p.bookDefId,p.maxRow,p.updated],
      function(tx,rs) { if(nextFn) nextFn() },
      db_errFn);
  }

  if(par && par.tx)
    execInsert(par.tx);
  else
    kps_db.transaction(execInsert);
}

function
db_delAnswer(book, row, nextFn)
{
  var a = {};
  a.sqlList = [
    "DELETE FROM kps_row    WHERE bookId="+book.bookId+" AND rowId="+row._rowId,
    "DELETE FROM kps_answer WHERE bookId="+book.bookId+" AND rowId="+row._rowId,
    ];
  a.nextFn = nextFn;
  db_sqlExecList(a);
} 

function
db_getUnsynced(nextFn, param)
{
  if(typeof param == "undefined") {
    return kps_db.transaction(function(tx) {
             db_getUnsynced(nextFn, { state:1, tx:tx });
           });
  }

  if(param.state == 1) {        // Get the rows to sync
    param.tx.executeSql(
      "SELECT * FROM kps_row WHERE synced is NULL", [],
      function(tx,rs) {
        param.state = 2;
        param.rowData = [];
        for(var idx=0; idx<rs.rows.length; idx++) {
          var r = rs.rows.item(idx);
          var fs = r.firstSync;
          if(!fs) {
            fs = nowUTC()+"."+(new Date()).getMilliseconds();
            param.tx.executeSql(
              "UPDATE kps_row set firstSync=? WHERE bookId=? and rowId=?",
              [fs, r.bookId, r.rowId], undefined, db_errFn);
          }
          var bdefid="";
          for(var i1=0; i1<books.length; i1++)
            if(books[i1].bookId == r.bookId)
              bdefid = books[i1].bookDefId;
          param.rowData.push({_bookid:r.bookId, _rowid:r.rowId, _bDefId:bdefid,
            _updated:r.updated, _firstSync:fs });
        }
        param.nextRow = 0;
        db_getUnsynced(nextFn, param);
      }, db_errFn);
    return;
  };

  if(param.state == 2) {        // get Rowdata
    if(param.nextRow >= param.rowData.length)
      return nextFn(param.rowData);
    var row = param.rowData[param.nextRow++];
    param.tx.executeSql(
      "SELECT tableName,data FROM kps_answer "+
      "WHERE bookId=? AND rowId=?", [row._bookid, row._rowid],
      function(tx,rs) {
        for(var idx=0; idx<rs.rows.length; idx++) {
          var r = rs.rows.item(idx);
          row[r.tableName] = JSON.parse(r.data);
        }
        db_getUnsynced(nextFn, param);
      }, db_errFn);
    return;
  }
}

function
db_setSynced(res)
{
  log("Set synced to "+res.now);
  kps_db.transaction(function(tx) {
      tx.executeSql(
        // firstsync must be set, as it is used for timestamp for updated rows.
        "UPDATE kps_row SET firstSync=?,synced=? WHERE synced is NULL",
        [res.now,res.now],
        function(tx,rs){}, db_errFn);
      });
}

function
db_getLastSync(nextFn)
{
  kps_db.transaction(function(tx) {
    tx.executeSql(
    "SELECT max(synced) lastSync from kps_row", [],
    function(tx,rs){ 
      var ls1 = rs.rows.length ? rs.rows.item(0).lastSync : undefined;

      tx.executeSql(
      "SELECT max(firstSync) lastSync from kps_row", [],
      function(tx,rs){ 
        var ls2 = rs.rows.length ? rs.rows.item(0).lastSync : undefined;
        if(ls1 && ls2 && ls1 < ls2)
          ls1 = ls2;
        nextFn(ls2);
      }, db_errFn);

    }, db_errFn);
  });
}

function
db_getImageMetadata(nextFn, nextParam, filter)
{
  kps_db.transaction(function(tx) {
    var arg = [], where = "";
    if(filter) {
      arg = [filter];
      where = " WHERE name=?";
    }
    tx.executeSql(
      "SELECT name,modified FROM kps_images"+where, arg,
      function(tx,rs){
        var res = {};
        for(var idx=0; idx<rs.rows.length; idx++) {
          var r = rs.rows.item(idx);
          res[r.name] = r.modified;
        }
        if(nextFn)
          nextFn(res, nextParam);
      }, db_errFn
    );
  });
}

function
db_saveImage(name, modified, data, nextFn, nextParam)
{
  kps_db.transaction(function(tx) {
    tx.executeSql(
      "INSERT OR REPLACE INTO kps_images (name,modified,data) VALUES(?,?,?)",
      [name, modified, data],
      function(tx,rs){
        if(nextFn)
          nextFn(nextParam);
      }, db_errFn
    );
  });
}

function
db_getImage(imgName, nextFn)
{
  kps_db.transaction(function(tx) {
    tx.executeSql(
      "SELECT data FROM kps_images where name=?", [imgName],
      function(tx,rs){
        var r = (rs.rows.length > 0 ? rs.rows.item(0) : "");
        nextFn(r);
      }, db_errFn
    );
  });
}

function
db_sqlExportList(a)
{
  if(!a.sNo)
    a.sNo = 0;
  log("db_sqlExportList " + a.sNo);
  log("sqlList.length " + a.sqlList.length);
  if(a.sNo == a.sqlList.length) {
    if(a.nextFn)
      a.nextFn();
    return;
  }
  if(a.tx === undefined) {
    kps_db.transaction(function(tx) { a.tx = tx; db_sqlExportList(a); });

  } else {
    var query = a.sqlList[a.sNo];
    var table = a.tableList[a.sNo];
    a.tx.executeSql(query, [],
      function(tx, rs) { 
      log("result");
      a.sNo++; 
      if(rs.rows) {
        for (var i=0;i<rs.rows.length;i++) {
          var r = rs.rows.item(i);
          var _fields = [];
          var _values = [];
          for(col in r) {
            var val = r[col];
            var column = col.replace(/[\(\)]/g,"");
            column = column.replace(/quote/g,"");
            _fields.push(column);
            if (col == column)
              if (val == null)
                val = "null";
              else
                val = '"'+val+'"';
            _values.push(val);
          }
          a.sqlExport.push("INSERT INTO "+table+
                "("+_fields.join(",")+") VALUES ("+_values.join(",")+")");
        }
      }   
      db_sqlExportList(a); }, db_errFn);
  }
}

function
db_uploadClientDB(callbackFn)
{
  var tbl_names = [];
  log("db_export"); 
  var a = {};
  a.sqlList = [
   "SELECT bookId, bookDefId, maxRow, updated from kps_book",
   "SELECT bookId, rowId, updated,firstSync,synced from kps_row",
   "SELECT bookId, tableName,rowId,quote(data) from kps_answer",
   "SELECT seqNum,bookId,tableName,rowId,columnName,transferInProgress,"+
           "quote(data),tableCopyParam from kps_longDataQ",
   "SELECT name,quote(data),modified from kps_images"
  ];
  a.tableList = dbTableList;
  a.sqlExport = dbCrTable.slice();
  a.nextFn = function() { 
    backendCall("uploadClientDB", { sql:a.sqlExport.join(";\n")+";" },
    function(res) {
      if (callbackFn)
        return callbackFn(res.fileName);
    });
  };
  db_sqlExportList(a);
}

function
doImportClientDB(sql)
{
 
   kps_db.transaction(function(tx) {
   var _lines = sql.split('\n');
   var lines = [];
   for (var i=0; i<_lines.length; i++) {
     if(_lines[i])
       lines.push(_lines[i]);
   }
   var error=false;
   for (var i=0; i<lines.length; i++) {
      (function(idx){
      tx.executeSql(
        lines[idx], null ,
        function(tx,rs){
           if (idx == lines.length - 1)
           {
              if(!error)
                msg(tr.importClientDBReady);
           }
        }, db_err);
        function
        db_err(p1,p2)
        { 
            msg("DbError:"+p2.code+" at line "+(idx+1)+":"+p2.message+
                        " in query: "+lines[idx]);
            error = true;
        }
      })(i);
   }
   });
}

function
db_importClientDB(file)
{
  $.get(file, function( sql ) {
     if (!sql)
       return "no sql found";
     msg("Clearing tables...");
     var a = {};
     a.sqlList = [ "DROP TABLE kps_book",
                   "DROP TABLE kps_row",
                   "DROP TABLE kps_images",
                   "DROP TABLE kps_longDataQ",
                   "DROP TABLE kps_answer" ];
     bdef = {};
     a.nextFn = function() { doImportClientDB(sql) }
     db_sqlExecList(a);
  }); 
}

function
db_getRowUpdates(nextFn)
{
  kps_db.transaction(function(tx) {
    tx.executeSql("SELECT bookid,rowid,updated FROM kps_row", [],
      function(tx,rs){
        log("db_getRowUpdates: total # kps_rows: "+rs.rows.length);
        var res = {}
        for (var i=0;i<rs.rows.length;i++) {
          var r = rs.rows.item(i);
          res[r.bookId+"/"+r.rowId] = r.updated;
        }
        nextFn(res);
      }, db_errFn
    );
  });
  
}

function
db_select(sql, param, nextFn)
{
  kps_db.transaction(function(tx) {
    tx.executeSql(
      sql, param,
      function(tx,rs){
        nextFn(rs.rows);
      }, db_errFn
    );
  });
}

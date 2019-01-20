/* Copyright KI-AG 2013-2019, Project KIPUS */
// $Id: tableOps.js 3660 2019-01-20 15:42:50Z rko $
// Contains:
// - tableBatch
// - tableCmd
// - tableCols
// - tableCsvExport
// - tableCsvImport
// - tableDelete
// - tableDownload
// - tableInsert
// - tableList
// - tableSelect
// - tableUpdate

var path = require('path');

//////////////////////////////////////////
// logStructChanges parameters:
// - action (optional)
// - context (optional)
function
logStructChanges(req, res, next)
{
  var par = { req:req, res:res, next:next};
  var b = req.body;

  pool.getConnection(function(err, connection) {
    par.connection = connection;
    var sql= "INSERT INTO kipus_adminStructChanges (action,context,modified,modifiedby) VALUES (?,?,?,?) ";
    connection.query(sql, [ b.action, b.context, now(), par.req.body.username ],
    function(err, rows){
      if(err)  {
        par.err = err;
        return myHtmlError(par, ""+err);
      }
      return myHtmlOk(par, JSON.stringify({}));
    });
  });
}

//////////////////////////////////////////
// tableDownload parameters:
// - tableName (mandatory)
// - filterCol (optional)
// - filterVal (optional)
// Returns: downloads file with list of rows, each row as an object with
// colnames.
function
tableDownload(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next };

  if(!mods.auth.isAdmin(b.username) &&
     !mods.auth.isViewer(b.username))
    return htmlError(par, "Permission denied (" + b.username +
                                " is not admin/viewer) for tableDownload");

  if(!b.tableName)
    return htmlError(par, "tableName parameter missing");

  var sql = "SELECT * FROM "+_escapeString(b.tableName);
  var colVals = [];
  if(b.filterCol && b.filterVal)
    sql += createWhere(b, colVals);
  if(b.orderBy)
    sql += " ORDER BY " + b.orderBy;

  pool.getConnection(function(err, connection) {
  connection.query(sql, colVals, function(err, rows){
    par.connection = connection;
    if(err)
      return myHtmlError(par, "download: "+err);
    par.connection.release();
    if(!b.asFile)
      return;
    var name = b.tableName;
    name = name.replace(/[^A-Za-z\.0-9]/g, "_");
    res.filename = "/export/"+name+".kipus";
    fs.writeFile(cfg.htmlDir+res.filename, JSON.stringify({tablename:b.tableName, rows:rows}),
      function(err) {
        if(err)
          return log(err);
        log("  Export: saved "+ cfg.htmlDir + res.filename);
        res.end(JSON.stringify({fileName:res.filename}));
      });
  });
  });
}

//////////////////////////////////////////
// tableCsvImport parameters:
// - tableName (mandatory)
// - csv (mandatory)
// - datadump (optional)
// Returns: imports data from csv into table
function
tableCsvImport(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next};

  if(!mods.auth.isAdmin(b.username))
    return htmlError(par, "Permission denied (" + b.username + " is not admin) for tableCsvImport");
  if(typeof b.tableName == "undefined")
    return htmlError(par, "tableName parameter missing");
  if(typeof b.csv == "undefined")
    return htmlError(par, "csv parameter missing");
  par.csv = {};
  par.csv[b.tableName] = b.csv;
  par.tableCols = {};
  if (typeof b.datadump != "undefined")
    par.datadump = b.datadump;



  pool.getConnection(function(err, connection) {
    par.connection = connection;
    if(err)
      return myHtmlError(par, "csvImport: "+err);
    if(!b.csv)
      return myHtmlError(par, ""+"csv in body is undefined, possibly wrong format.");
    par.connection.beginTransaction(function(err) {
      if(err)
        return myHtmlError(par, ""+err);
      par.inTransaction=true;
      return importCsv(par, 0, function() {
        if(par.inTransaction) {
          par.connection.commit(function(err) {
            if(err)
              return myHtmlError(par, "commit " + err);
            par.connection.release();
            return myHtmlOk(par, JSON.stringify({}));
          });
        }
       });
    });

  });
}


function
use_csv_line(line, sep, filterstr)
{
  if (line == "" || line == undefined)
    return false;
  if (filterstr == undefined || filterstr == "")
    return true;
  filterstr = filterstr.toLowerCase();
  var parts = filterstr.split(" ");
  var tds = line.split(sep);
  var textfound = 0;
  for (var i=0; i<parts.length; i++)
  {
    if (parts[i] == "") {
      textfound++;
      continue;
    }
    for (var j=0; j<tds.length; j++) {
        var text = tds[j].toLowerCase();
        if (text.indexOf(parts[i]) > -1) {
          textfound++;
        }
    }
  }
  return (textfound==i);
}

//////////////////////////////////////////
// tableCsvExport parameters:
// - tableName (mandatory)
// - columns (optional, string or array)
// - filterCol (optional)
// - filterVal (optional)
// - orderBy (optional)
// - filter (optional)
// Returns: downloads file as CSV with list of rows, each row as an object with colnames.
function
tableCsvExport(req, res, next)
{
  var par = { req:req, res:res, next:next};
  var b = req.body;

  if(!mods.auth.isAdmin(b.username) &&
     !mods.auth.isViewer(b.username))
    return htmlError(par, "Permission denied (" + b.username + " is not admin/viewer) for tableCsvExport");

  if(!b.tableName)
    return htmlError(par, "tableName parameter missing");

  pool.getConnection(function(err, connection) {
  par.connection = connection;
  par.tableNames = {}
  par.tableNames[b.tableName] = 1;
  par.columns = {};
  if(b.columns && typeof b.columns == 'object')
    par.columns[b.tableName] = b.columns.join(",");
  else if(b.columns && typeof b.columns == 'string')
    par.columns[b.tableName] = b.columns;
  par.csv = {};
  par.bigdata = {};
  par.datadump = "";
  return doTableCsvExport(par, 0, function() {
    var name = b.tableName;
    name = name.replace(/[^A-Za-z\.0-9]/g, "_");
    var filename = "/export/"+name+".kipus";
    if (par.datadump != "") {
      var zip = new require('node-zip')();
      zip.folder(b.tableName);
      zip.file(b.tableName+filename+".csv", par.csv[b.tableName]);
      zip.file(b.tableName+filename+".datadump.csv", par.datadump);
      var data = zip.generate({type:'string',base64:false,compression:'DEFLATE'});
      fs.writeFileSync(cfg.htmlDir+filename+".zip", data, 'binary');
      res.end(JSON.stringify({fileName:filename+".zip"}));
    } else {
      fs.writeFile(cfg.htmlDir+filename+".csv", par.csv[b.tableName],
        function(err) {
          if(err)
            return log(err);
          res.end(JSON.stringify({fileName:filename+".csv"}));
        });
     }
    });
  });
}

function
doTableCsvExport(par, status, callbackFn)
{
  log("      doTableCsvExport " + status);

  if (status == 0) { // tabledata
    var tableNames = Object.keys(par.tableNames);
    if (par.tableNamesu)
      tableNames = tableNames.concat(Object.keys(par.tableNamesu));
    if(tableNames.length == 0 && callbackFn)
      return callbackFn();
    for (var rIdx=0; rIdx<tableNames.length; rIdx++) {
      (function(rIdx){
      var tableName = tableNames[rIdx];
      var cols = "*";
      if (par.columns[tableName])
        cols = par.columns[tableName];
      var sql = "SELECT "+cols+" FROM "+_escapeString(tableName);
      if(par.req.body.filterCol && par.req.body.filterVal)
        sql += createWhere(par.req.body,par);
      var imgRe = new RegExp("^\\[deferred:([A-Z0-9_]+/[0-9]+/[A-Z0-9_]+)\\]$");
      par.bigdata[tableName] = {};
      var reRes;
      par.connection.query(sql, par, function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        if(!par.req.body.asFile) {
          if (rIdx == tableNames.length -1)
            return doTableCsvExport(par, status+1, callbackFn);
          return;
        }
        var line = "";
        var sep = ";";
        var header = "";
        var csv = "";
        var isUserdata = (par.tableNames[tableName] != 1);
        // header
        if (rows.length > 0) {
          for (var key in rows[0]) {
             if(par.deleteCols && par.deleteCols[key])
               continue;
             var val = rows[0][key];
             if (typeof(val) != "function")
                 header += key + sep;
          }
          csv += header.substring(0, header.length - 1) + "\n";
        }
        for (var i=0; i<rows.length; i++) {
           line = "";
           for (var key in rows[i]) {
             if(par.deleteCols && par.deleteCols[key])
               continue;
             var val = rows[i][key];
             if (typeof(val) != "function") {
               if(typeof val == "string" &&
                  (reRes = imgRe.exec(val)) != null) {
                    par.bigdata[tableName][reRes[1]] = 1;
               }
               line += _escapeCsvString(JSON.stringify(val)) + sep;
             }
           }
           // remove last separator
           if (use_csv_line(line, sep, par.req.body.filter))
             csv += line.substring(0, line.length - 1) + "\n";
        }
        if (isUserdata)
           par.csvu[tableName] = csv;
        else
           par.csv[tableName] = csv;
        if (rIdx == tableNames.length -1)
          return doTableCsvExport(par, status+1, callbackFn);
      });
      })(rIdx);
    }
  }

  if (status == 1) { // bigdata
    par.bigDataCnt = 0;
    var tableNames = Object.keys(par.tableNames);
    if (par.tableNamesu)
      tableNames = tableNames.concat(Object.keys(par.tableNamesu));
    for (var i=0; i<tableNames.length; i++) {
      var tableName = tableNames[i];
      par.bigDataCnt += Object.keys(par.bigdata[tableName]).length;
    }
    par.bdDumped = {};
    for (var rIdx=0; rIdx<tableNames.length; rIdx++) {
        var images = Object.keys(par.bigdata[tableNames[rIdx]]);
        var sep = ";";
        for (var i=0; i<images.length; i++) {
          var sql = "SELECT dataid,comment,importOverwrite,icon,bigdata "+
                    "FROM kipus_bigdata WHERE dataid=?";
          (function(images,rIdx,i){
          par.connection.query(sql,
            [ images[i] ],
            function(err, res) {
              if(res.length && !par.bdDumped[res[0].dataid]) {
                par.bdDumped[res[0].dataid] = 1;
                var tableName = tableNames[rIdx];
                var isUserdata = (par.tableNames[tableNames[rIdx]] != 1);
                var line = res[0].dataid + sep +
                           res[0].comment + sep +
                           res[0].importOverwrite + sep +
                           res[0].icon.toString("base64") + sep +
                           res[0].bigdata.toString("base64") + "\n";

                if (isUserdata)
                   par.datadumpu += line;
                else
                   par.datadump += line;
              }
              if(--par.bigDataCnt == 0) {
                return doTableCsvExport(par, status+1, callbackFn);
              }
              if(err)
                log("ERR:"+err);
            });
          })(images,rIdx,i);
        }
    }
    if (par.bigDataCnt == 0)
      return doTableCsvExport(par, status+1, callbackFn);
  }

  if (status == 2) {
     if (!par.keepConnectionAlive)
       par.connection.release();
     if(callbackFn)
       callbackFn();
  }
}

//////////////////////////////////////////
// tableSelect parameters:
// - tableName (mandatory)
// - filterCol/filterVal (optional, string or array)
// - columns (optional, string or array)
// - where (optional, string)
// - orderBy (optional, string)
// - limit (optional, int)
// - filterFulltext (option, string)
// Returns: list of rows, each row as an object with colnames.
function
tableSelect(req, res, next)
{
  var par = { req:req, res:res, next:next};
  var b = req.body;
  if(!mods.auth.isAdmin(b.username) &&
     !mods.auth.isViewer(b.username))
    return htmlError(par, "Permission denied (" + b.username +
                          " is not admin/viewer) for tableSelect");

  if(!b.tableName)
    return htmlError(par, "tableName parameter missing");

  var tpar = [];

  var cols = "*";
  if(b.columns && typeof b.columns == 'object')
    cols = b.columns.join(",");
  else if(b.columns && typeof b.columns == 'string')
    cols = b.columns;
  var sql = "SELECT "+cols+" FROM "+_escapeString(b.tableName);

  if(b.filterCol && b.filterVal)
    sql += createWhere(b,tpar);
  else if(b.where)
    sql += " WHERE "+b.where;
  if(b.orderBy)
    sql += " ORDER BY " + b.orderBy;
  if(b.limit != null && !b.filterFulltext) // limiting of fulltext search is done post sql
    sql += " LIMIT " + b.limit;

  function
  tcConvert(field,next)
  {
    if(field.type == 'DATE') {
      var r = field.string();
      if(r != null && r.length == 19)
        r = r.substr(0, 10);      // YYYY-MM-DD
      return r;
    }
    if (field.type == 'DATETIME') {
      var r = field.string();
      if(r != null && r.length == 19)
        return r;                 // YYYY-MM-DD hh:mm:ss
    }
    return next();
  }

  //log("SQL:"+sql);
  pool.getConnection(function(err, connection) {
    connection.query({sql:sql, values:tpar, typeCast:tcConvert},
    function(err, rows){
      par.connection = connection;
      if(err) {
        log("tableSelect:"+sql);
        return myHtmlError(par, ""+err);
      }
      if (b.filterFulltext) {
        function
        show_filter_row(row, filterstr)
        {
          if (filterstr == undefined || filterstr == "")
            return true;
          if (row == undefined)
            return false;
          filterstr = filterstr.toLowerCase();
          var parts = filterstr.split(" ");
          var textfound = 0;
          for (var i=0; i<parts.length; i++)
          {
            if (parts[i] == "") {
              textfound++;
              continue;
            }
            for (var col in row) {
              var text = row[col];
              if (text == null)
                text = "";
              if (typeof text == "number")
                text = text.toString();
              if (typeof text == "string")
                text = text.toLowerCase();
              var fltr = parts[i];
              if (fltr.indexOf("/") > -1) {
                // escape slash for match
                fltr = fltr.replace(/\//g, "\\/");
              }
              try {
                if (text.toLowerCase().match(fltr)) {
                  textfound++;
                  return true;
                }
              } catch (e) {
                //Do nothing
              }
            }
          }
          return (textfound==i);
        }
        var f = [];
        for (var i=0; i<rows.length; i++) {
          if (show_filter_row(rows[i], b.filterFulltext))
            f.push(rows[i]);
        }
        var start = 0;
        var end = f.length;
        if (b.limit) {
          start = Math.max(start, parseInt(b.limit.split(",")[0]));
          end = Math.min(end, start + parseInt(b.limit.split(",")[1]));
        } 
        var rows = [];
        for (var i=start; i<end; i++) {
          rows.push(f[i]);
        }
      }
      myHtmlOk(par, rows);
    });
  });
}

function
tableList(req, res, next)
{
  var b = req.body;
  b.tableName = "information_schema.tables";
  b.filterCol = "table_schema";
  b.filterVal = cfg.db.database;
  return tableSelect(req, res, next);
}

function
tableCols(req, res, next)
{
  var b = req.body;
  b.filterCol =  ["table_schema", "table_name"];
  b.filterVal =  [cfg.db.database, b.tableName ];
  b.tableName = "information_schema.columns";
  b.orderBy = "ORDINAL_POSITION";
  return tableSelect(req, res, next);
}


//////////////////////////////////////////
// tableBatch parameters:
function
tableBatch(req, res, next)
{
  var par = { req:req, res:res, next:next, retData:[] };
  if(!req.body.commands)
    return htmlError(par, "commands parameter missing");
  log("tableBatch: "+req.body.commands.length+" commands")
  pool.getConnection(function(err, connection) {
    par.connection = connection;
    if(err)
      return myHtmlError(par, "tableBatch: "+err);
    par.connection.beginTransaction(function(err) {
      if(err)
        return myHtmlError(par, ""+err);
      par.inTransaction=true;
      return doBatch(par, 0, function (par) {
        if(par.inTransaction) {
          par.connection.commit(function(err) {
            if(err)
              return myHtmlError(par, "commit " + err);
            par.connection.release();
            return myHtmlOk(par, par.retData);
          });
        }
       });
    });
  });
}

function
doBatch(par, rowIdx, callbackFn)
{
  var commands = par.req.body.commands;
  if(rowIdx == commands.length) {
    if (callbackFn)
      return callbackFn(par);
    else
      return myHtmlOk(par, {});
  }

  var knownFns = {
    tableDelete:tableDelete,
    tableInsert:tableInsert,
    tableUpdate:tableUpdate,
    tableCmd:tableCmd,
  };
  var obj = commands[rowIdx];
  obj.username = par.req.body.username;
  var subReq = { body:obj,
                 nextFn:nextFn,
                 batchConnection:par.connection, 
                 inTransaction:true };
  function
  nextFn(err, ret)
  {
    if(err)
      return myHtmlError(par, obj.fn+": "+err);
    par.retData.push({fn:obj.fn, ret:ret});
    return doBatch(par, rowIdx+1, callbackFn);
  }

  if(!obj.fn || !knownFns[obj.fn])
    return myHtmlError(par, "Unknown function:"+obj.fn);
  log("  "+obj.fn+" "+(obj.tableName ? obj.tableName : (obj.sql ? obj.sql:"")));
  return knownFns[obj.fn](subReq, par.res, par.next);
}

//////////////////////////////////////////
// tableInsert parameters:
// - tableName (mandatory)
// - columns (mandatory), hash with name/values of the data to be inserted.
// Returns: insertId, value of the autoincremented key (if present)
function
tableInsert(req, res, next, callbackFn)
{
  var par = { req:req, res:res, next:next, 
              connection:req.batchConnection, callbackFn:callbackFn };
  var b = req.body;
  if(!mods.auth.isAdmin(b.username))
    return htmlError(par, "Permission denied (" + 
                     b.username + " is not admin) for tableInsert");

  if(!b.tableName || !b.columns || typeof b.columns != "object")
    return htmlError(par, "parameters are missing");

  mods.image.prepareBigDataCols(par, doTableInsert);
}

function
doTableInsert(par)
{
  var b = par.req.body;
  b.columns.modifiedby = b.username;
  b.columns.modified = now();
  var cols=[], placeHolder=[], colVals=[];
  var sql = "INSERT INTO "+_escapeString(b.tableName);
  for(var colName in b.columns) {
    cols.push(_escapeString(colName));
    placeHolder.push('?');
    colVals.push(b.columns[colName]);
  }
  sql += "("+cols.join(",")+") VALUES("+placeHolder.join(",")+")";

  function
  doFn()
  {
    if (par.constraintTypes == null) {
      if (b.tableName.startsWith("kipus")) {
        // skip constraintTypes-Select for kipus tables
        par.constraintTypes = {};
        return doFn();
      }
      var colTypeSql = "SELECT columnname, constrainttype from kipus_pageattributes pa " + 
                       "INNER JOIN kipus_pagedefinition pd on pa.pagedefid = pd.id " +
                       "WHERE pd.tablename = '"+b.tableName+"'";
      par.connection.query({sql:colTypeSql}, function(err, rows){
        par.constraintTypes = {};
        for (var i=0; i<rows.length; i++) {
          par.constraintTypes[rows[i].columnname] = rows[i].constrainttype; 
        }
        return doFn();
      });
      return;
    }
    fixVals(cols, colVals, par.constraintTypes);
    par.connection.query(sql, colVals, function(err, insRes){
      if(err) {
        log("doTableInsert: error in sql "+sql);
        return myHtmlError(par, ""+err);
      }
      if(par.callbackFn)
        par.callbackFn();
        myHtmlOk(par, {insertId:insRes.insertId}); 
        par.insertId = insRes.insertId;

        pool.getConnection(function(err, connection) { // batch closed the conn
          if(!connection)
            return log("no db connection available");
          par.connection = connection;
          mods.image.finishBigDataCols(par);
        });

    });
  }

  if(par.connection) {
    doFn();

  } else {
    pool.getConnection(function(err, connection) {
      if(!connection)
        return myHtmlError(par, "no db connection available");
      par.connection = connection;
      doFn();
    });
  }
}

//////////////////////////////////////////
// tableUpdate parameters:
// - tableName (mandatory)
// - columns   (mandatory), hash with name/values of the data to be updated.
// - filterCol (mandatory)
// - filterVal (mandatory)
function
tableUpdate(req, res, next, callbackFn)
{
  var par = { req:req, res:res, next:next, 
              connection:req.batchConnection, callbackFn:callbackFn };
  var b = req.body;

  if(!mods.auth.isAdmin(b.username))
    return htmlError(par, "Permission denied (" + b.username +
                " is not admin) for tableUpdate");

  if(!b.tableName || !b.columns || typeof b.columns != "object" || !b.filterCol)
    return htmlError(par, "parameters are missing");
  mods.image.prepareBigDataCols(par, doTableUpdate);
}

// mysql strict_mode wont accept '' for double or date
function
fixVals(cols, colVals, constraintTypes)
{
  if(!cols || !colVals)
    return;
  for(var i1=0; i1<cols.length; i1++)
  {
    if (!constraintTypes[cols[i1]])
      continue;
    if (colVals[i1] === '' && (constraintTypes[cols[i1]] == "date" || constraintTypes[cols[i1]] == "num"))
      colVals[i1] = null;
  }
}

function
doTableUpdate(par)
{
  var b = par.req.body;
  b.columns.modifiedby = b.username;
  b.columns.modified = now();
  var cols=[], colVals=[];
  for(var colName in b.columns) {
    cols.push(_escapeString(colName)+"=?");
    if (colName == b.nullCol && b.columns[colName] == "NULL")
      colVals.push(null);
    else
      colVals.push(b.columns[colName]);

  }
  var sql = "UPDATE "+_escapeString(b.tableName)+
            " SET "+cols.join(",")+createWhere(b, colVals);
  function
  doFn()
  {
    if (par.constraintTypes == null) {
      if (b.tableName.startsWith("kipus")) {
        // skip constraintTypes-Select for kipus tables
        par.constraintTypes = {};
        return doFn();
      }
      var colTypeSql = "SELECT columnname, constrainttype from kipus_pageattributes pa " + 
                       "INNER JOIN kipus_pagedefinition pd on pa.pagedefid = pd.id " +
                       "WHERE pd.tablename = '"+b.tableName+"'";
      par.connection.query({sql:colTypeSql}, function(err, rows){
        par.constraintTypes = {};
        for (var i=0; i<rows.length; i++) {
          par.constraintTypes[rows[i].columnname+"=?"] = rows[i].constrainttype; 
        }
        return doFn();
      });
      return;
    }
    fixVals(cols, colVals, par.constraintTypes);
    par.connection.query(sql, colVals, function(err, insRes){
      if(err) {
        log("doTableUpdate: error in sql "+sql);
        return myHtmlError(par, err);
      }
      if(par.callbackFn)
        par.callbackFn();
      myHtmlOk(par, {});

      pool.getConnection(function(err, connection) { // batch closed the conn
        if(!connection)
          return log("no db connection available");
        par.connection = connection;
        mods.image.finishBigDataCols(par);
      });

    });
  }

  if(par.connection) {
    doFn();

  } else {
    pool.getConnection(function(err, connection) {
      if(!connection)
        return myHtmlError(par, "no db connection available");
      par.connection = connection;
      doFn();
    });
  }
}


//////////////////////////////////////////
// tableDelete parameters:
// - tableName (mandatory)
// - filterCol/filterVal (optional)
// - where (optional)
function
tableDelete(req, res, next)
{
  var par = { req:req, res:res, next:next, connection:req.batchConnection };
  var b = req.body;

  if(!mods.auth.isAdmin(b.username))
    return myHtmlError(par, "Permission denied (" +
                       b.username + " is not admin) for tableDelete");

  if(!b.tableName || !(b.where || (b.filterCol && b.filterVal)))
    return myHtmlError(par, "parameters are missing");

  var colVals=[];
  var sql = "DELETE FROM "+_escapeString(b.tableName);
  if(b.filterCol && b.filterVal)
    sql += createWhere(b,colVals);
  else if(b.where)
    sql += " WHERE "+b.where;

  function
  doFn()
  {
    par.connection.query(sql, colVals, function(err, delRes){
      if(err) {
        log("tableDelete: error in sql="+sql);
        return myHtmlError(par, "delete "+err);
      }
      log('  number of deleted rows: '+delRes.affectedRows);
      myHtmlOk(par, {}); 
    });
  }

  if(par.connection) {
    doFn();

  } else {
    pool.getConnection(function(err, connection) {
      if(!connection)
        return myHtmlError(par, "no db connection available");
      par.connection = connection;
      doFn();
    });
  }
}


//////////////////////////////////////////
// tableCmd parameters:
// - sql (mandatory)
// - ignoreError (optional)
function
tableCmd(req, res, next)
{
  var par = { req:req, res:res, next:next, connection:req.batchConnection };
  var b = req.body;
  var report_data = [];
  if(!mods.auth.isAdmin(b.username) && (mods.auth.isReportReader(b.username) && b.sql.trim().toUpperCase().indexOf("SELECT") != 0))
    return htmlError(par, "Permission denied ("+
                     b.username + " is not admin) for tableCmd");

  if(!b.sql)
    return myHtmlError(par, "parameters are missing");

  function
  doFn()
  {
    par.connection.query(b.sql, function(err, res){
      if(err) {
        log("tableCmd: error in sql="+b.sql);
        if (b.ignoreError) {
          log("ignoreError " + err);
          return myHtmlOk(par, {});
        }
        return myHtmlError(par, ""+err);
      }
      myHtmlOk(par, res);
    });
  }

  if(par.connection) {
    doFn();

  } else {
    pool.getConnection(function(err, connection) {
      if(!connection)
        return myHtmlError(par, "no db connection available");
      par.connection = connection;
      doFn();
    });
  }
}



function
ensureDirectoryExistence(filePath) {
  var dirname = path.dirname(filePath);
  if (directoryExists(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

function
directoryExists(path) {
  try {
    return fs.statSync(path).isDirectory();
  }
  catch (err) {
    return false;
  }
}

function
importCsv(par, status, callbackFn)
{
  var sTxt = {
    0:"get table columns",
    1:"get rows for compare",
    2:"digest csv",
    3:"truncate tables",
    4:"prepare sql commands",
    5:"insert row into database",
    6:"report"
  };
  log("    importCsv "+status+" ("+sTxt[status]+")");

  if(status == 0) {                                   // get table columns
    var tableNames = Object.keys(par.csv);
    if (par.req.body.replaceUserdata && par.csvu)
      tableNames = tableNames.concat(Object.keys(par.csvu));

    if(par.newDef) {                     // Import project
      var pdhById = {}, pah={}, pdhByName={},
          pd=par.newDef.pagedefinition; pa=par.newDef.pageattributes;
      for(var i1=0; i1<pd.length; i1++) {
        var nId = par.page2id[pd[i1].id];
        pdhById[nId] = pd[i1];
        pdhByName[pd[i1].tablename] = pd[i1];
        pah[pd[i1].tablename] = {};
      }
      for(var i1=0; i1<pa.length; i1++)
        pah[pdhById[pa[i1].pagedefid].tablename][pa[i1].columnname] = 1;

      var loaded = 0;
      for(var rIdx=0; rIdx<tableNames.length; rIdx++) {
        var tableName = tableNames[rIdx];

        if(par.skipTables && par.skipTables[tableName]) {
          if(++loaded == tableNames.length)
            return importCsv(par, status+1, callbackFn);
          continue;
        }

        par.tableCols[tableName] = pah[tableName];
        par.tableCols[tableName].id          = 1;
        par.tableCols[tableName].modified    = 1;
        par.tableCols[tableName].modifiedby = 1;
        if(pdhByName[tableName].pagetype == 'LOOKUP')
          par.tableCols[tableName].deleted = 1;
        if(!(pdhByName[tableName].pagetype == 'LOOKUP' ||
             pdhByName[tableName].pagetype == 'CP_LOOKUP' ||
             pdhByName[tableName].pagetype == 'EXTERNAL')) {
          par.tableCols[tableName].bookid = 1;
          par.tableCols[tableName].rowid = 1;
        }
      }
      return importCsv(par, status+1, callbackFn);

    } else {                            // Import single CSV
      var tableNames = Object.keys(par.csv);
      if (par.req.body.replaceUserdata && par.csvu)
        tableNames = tableNames.concat(Object.keys(par.csvu));

      var loaded = 0;
      for(var rIdx=0; rIdx<tableNames.length; rIdx++) {
        (function(rIdx){
        var tableName = tableNames[rIdx];
        var sql = "SELECT table_name, column_name FROM "+
            "information_schema.columns where table_name=? and table_schema=?";
        par.connection.query(sql, [tableName,cfg.db.database],
        function(err, rows){
          if(err)
            return myHtmlError(par, ""+err);
          if(rows.length > 0)
            par.tableCols[tableName] = {};
          for(var i=0; i<rows.length;i++)
            par.tableCols[tableName][rows[i].column_name] = 1;
          if(++loaded == tableNames.length)
            return importCsv(par, status+1, callbackFn);
        });
        })(rIdx);
      }
      return;

    }
  }
  if(status == 1) {                                          // get rows for compare
    var tables = Object.keys(par.csv);
    if (par.req.body.replaceUserdata && par.csvu)
      tables = tables.concat(Object.keys(par.csvu));
    if(tables.length == 0)
      return importCsv(par, status+1, callbackFn);
    par.compareHash = {};
    for (var rIdx=0; rIdx<tables.length;rIdx++) {
      (function(rIdx){
        if(par.skipTables && par.skipTables[tables[rIdx]]) {
          if(rIdx == tables.length -1)
            return importCsv(par, status+1, callbackFn);
          return;
        }
        var sql = "select * from " + tables[rIdx];
        par.connection.query(sql , function(err, rows) {
          if(err)
            return myHtmlError(par, ""+err);
          par.compareHash[tables[rIdx]] = {};
          for (var i=0; i<rows.length; i++) {
            var id = rows[i].id;
            par.compareHash[tables[rIdx]][id] = rows[i];
          }
          if (rIdx == tables.length -1)
            return importCsv(par, status+1, callbackFn);
        });
      })(rIdx);
    }
    return;
  }

  if(status == 2) {                                          // digest csv
    par.rows = {};
    var tables = Object.keys(par.csv);
    if (par.req.body.replaceUserdata && par.csvu)
      tables = tables.concat(Object.keys(par.csvu));
    for (var idx=0; idx<tables.length; idx++) {
      var tableName = tables[idx];

      if (par.csv[tableName])
        var lines = par.csv[tableName].split("\n");
      else
        var lines = par.csvu[tableName].split("\n");
      var sep = ";";
      for (var i=0; i< lines.length; i++) {
          // remove empty lines
          if (lines[i] == "") {
            lines.splice(i,1);
          }
      }
      // check if first line starts with first column + seperator
      var cols = lines[0].split(sep);
      lines.splice(0,1);
      var rows = [];
      for (var i=0; i<lines.length; i++) {
        rows[i] = {};
        var vals = lines[i].split(sep);
        // search for escaped columns
        var vals2 = [];
        var temp = "";
        for (var x=0; x<vals.length; x++) {
           var val = vals[x];
           val = val.replace(/[\r\n]*/gm,""); // remove line breaks
           val = val.replace(/[\t]*/gm,"");   // remove tabs
           // remove \t (probably produced by joining two excel-columns)
           val = val.replace('\t','');
           if (val.indexOf("\"") == 0) {
             if (val.length > 1) {
               if (val.lastIndexOf("\"") == val.length-1) {
                 // remove double quotes at begin and end of value
                 vals2.push(val.substring(1, val.length-1));
               } else if (val.indexOf("\"", 1) != 1) {
                 temp = val.substring(1,val.length);
               }
             } else {
               //special treatment for having only one single seperator in value
               if (temp == "")
                 // begin doublequote delimiter
                 temp = sep;
               else {
                 // end doublequote delimiter
                 vals2.push(temp);
                 temp = "";
               }
             }
           } else {
             if (temp == "") {
               vals2.push(val);
             } else {
               if (val.indexOf("\"", val.length -1) == val.length-1 &&
                   val.indexOf("\"", val.length -2) != val.length-2) {
                 temp += ";" + val.substring(0, val.length-1);
                 temp = temp.replace(/\"\"/g, "\"");
                 vals2.push(temp);
                 temp = "";
               } else {
                 temp += ";"+val;
               }
             }
           }
           if(par.skipTables && par.skipTables[tableName] &&
              val.indexOf("[deferred:") == 0) {
             par.skipBigData[val.substr(10).slice(0,-1)] = 1;
           }
        }
        vals = vals2;
        if (cols.length != vals.length)
          return myHtmlError(par, "line "+(i+2)+" "+tableName+
            " does not match cols number: " + cols.length + "!=" + vals.length);
        for (var j=0; j<cols.length; j++) {
           if (vals[j] == "null")
             rows[i][cols[j]] = null;
           else
             rows[i][cols[j]] = vals[j];
        }
      }
      if (rows.length == 0) {
        return myHtmlError(par, ""+"no rows found in csv");
      }
      par.rows[tables[idx]] = rows;
    }
    return importCsv(par, status+1, callbackFn);
  }

  if(status == 3) {                                     // table truncate
    var tables = Object.keys(par.csv);
    if (par.req.body.replaceUserdata && par.csvu)
      tables = tables.concat(Object.keys(par.csvu));
    if(tables.length == 0)
      return importCsv(par, status+1, callbackFn);
    for (var rIdx=0; rIdx<tables.length;rIdx++) {
      (function(rIdx){
        if(par.skipTables && par.skipTables[tables[rIdx]]) {
          log("      truncate SKIPS local "+tables[rIdx]);
          if(rIdx == tables.length -1)
            return importCsv(par, status+1, callbackFn);
          return;
        }
        var sql = "delete from " + tables[rIdx]
        par.connection.query(sql , function(err, rows) {
          if(err)
            return myHtmlError(par, ""+err);
          if (rIdx == tables.length -1)
            return importCsv(par, status+1, callbackFn);
        });
      })(rIdx);
    }
    return;
  }


  if(status == 4) {                                     // table insert row
    function rowsDiffer(row1, row2) {
      function replacer(key,value)
      {
        if (key=="modifiedby" || key == "modified") return undefined; // ignore modified and modifiedby
        else if (typeof value == "number") return value.toString(); // csv treats numbers as strings, needed for compare
        else return value;
      }
      if (!row2 || row1.length != row2.length)
        return true;
      return !(JSON.stringify(row1, replacer) === JSON.stringify(row2, replacer));
    }
    var tables = Object.keys(par.rows);
    var toinsert = 0;
    for (var i=0; i<tables.length; i++) {
      if(par.skipTables && par.skipTables[tables[i]])
        continue;
      toinsert+=par.rows[tables[i]].length;
    }
    par.rowsInsertCount = 0;
    par.sqlCmds = [];
    par.sqlColVals = [];
    par.insertIdx = 0;
    if (toinsert == 0)
      return importCsv(par, status+1, callbackFn);
    log("      rows to insert="+toinsert);
    for (var idx=0; idx<tables.length;idx++) {
      var tableName = tables[idx];
      if (tableName == "kipus_rows") // skip, not handled with csv anymore
         continue;
      if(par.skipTables && par.skipTables[tableName]) {
        log("      insert SKIPS local "+tableName);
        continue;
      }
      var rows = par.rows[tableName];
      for (var rIdx=0; rIdx<rows.length;rIdx++) {
        if (!rows[rIdx].modifiedby) {
          //log(tableName+" set modifiedby to " + par.req.body.username);
          rows[rIdx].modifiedby = par.req.body.username;
        }
        if (!rows[rIdx].modified)
          rows[rIdx].modified = now();
        else if (par.compareHash[tableName] && par.compareHash[tableName][rows[rIdx].id]) {
          if (rowsDiffer(rows[rIdx], par.compareHash[tableName][rows[rIdx].id])) {
            //log("rows differ: table " + tableName + " id: " + rows[rIdx].id + ", update modified to now()");
            rows[rIdx].modified = now();                                          // change, update modified to now
          } else
            rows[rIdx].modified = par.compareHash[tableName][rows[rIdx].id].modified; // no change, keep original modified
        }
        var rowid = rows[rIdx].rowid;

        if (rowid && par.row2id && par.row2id[rowid]) {
          rows[rIdx].rowid = par.row2id[rowid];
          //log("replace rowid " + rowid + " -> " + rows[rIdx].rowid);
        }
        var cols=[], placeHolder=[], colVals=[];
        var sql = "INSERT INTO "+_escapeString(tableName);
        for(var colName in rows[rIdx]) {
          // remove newline
          colName = colName.replace(/\r?\n|\r/,"");
          if (!par.tableCols[tableName][colName]) {
            log("skip column "+colName+", does not exist in "+tableName);
            continue;
          }
          cols.push(_escapeString(colName));
          placeHolder.push('?');
          colVals.push(rows[rIdx][colName]);
        }
        sql += "("+cols.join(",")+") VALUES("+placeHolder.join(",")+")";
        par.sqlCmds.push(sql);
        par.sqlColVals.push(colVals);
      }
    }
    return importCsv(par, status+1, callbackFn);
  }
  
  if(status == 5) {
    if (par.sqlCmds.length == par.insertIdx)
      return importCsv(par, status+1, callbackFn);
    par.connection.query(par.sqlCmds[par.insertIdx], par.sqlColVals[par.insertIdx], function(err, insRes){
        if(err)
          return myHtmlError(par, "importCsv(5) "+err+"("+par.sqlCmds[par.insertIdx]+")");
        par.insertIdx++;
        if (par.insertIdx < par.sqlCmds.length)
          return importCsv(par, status, callbackFn);
        return importCsv(par, status+1, callbackFn);
      });
  }
  if(status == 6) {        // table insert datadump -> kipus_bigdata
    if(!par.datadump) {
      return importCsv(par, status+1, callbackFn);

    } else {
      var lines = par.datadump.split("\n");
      if (par.req.body.replaceUserdata && par.datadumpu)
        lines = lines.concat(par.datadumpu.split("\n"));
      par.bdCount = lines.length-1;
      var bd2update = par.bdCount;
      var ts = now();
      for (var i=0; i<lines.length;i++) {
        if (par.err)
          return myHtmlError(par, ""+err);

        var line = lines[i];
        if (line == "") {
          bd2update--;
          continue;

        } else {
          var cols = line.split(";");
          if (cols.length != 5)
            return myHtmlError(par, "line "+(i+1)+" does not match "+
                            "cols number (datadump): " + cols.length + "!=5");
          if(par.skipBigData && par.skipBigData[cols[0]]) {
            log("      SKIP local bigData:"+cols[0]);
            if (--bd2update == 0)
              return importCsv(par, status+1, callbackFn);
            continue;
          }
        }

        (function(cols){
          var sql =
            "INSERT INTO kipus_bigdata (dataid,comment,importOverwrite,"+
              "icon,bigdata,modified,modifiedby) VALUES (?,?,?,?,?,?,?) "+
            "ON DUPLICATE KEY UPDATE comment=?,"+
                "importOverwrite=?,icon=?,bigdata=?,modified=?,modifiedby=?";
          var iconBuf = new Buffer(cols[3], "base64");
          var dataBuf = new Buffer(cols[4], "base64");
          var u = par.req.body.username;
          par.connection.query(sql,
          [ cols[0], cols[1], cols[2], iconBuf, dataBuf, ts, u,
                     cols[1], cols[2], iconBuf, dataBuf, ts, u ],
          function(err, insRes){
            if(err)  {
              par.err = err;
              return myHtmlError(par, ""+err);
            }
            if (--bd2update == 0)
              return importCsv(par, status+1, callbackFn);
          });
        })(cols);
      }
    }
  }

  if(status == 7) {                                     // report
    log('    importCsv number of inserted rows: '+par.rowsInsertCount);
    if (par.bdCount)
      log('    importCsv number of inserted rows (datadump): '+par.bdCount);
    if(callbackFn)
      callbackFn();
  }
}

function
_escapeString(val) {
  val += "";
  val.replace(/[\0\n\r\b\t\\\'\"\x1a]/g, function (s) {
    switch (s) {
      case "\0":
        return "\\0";
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case "\b":
        return "\\b";
      case "\t":
        return "\\t";
      case "\x1a":
        return "\\Z";
      default:
        return "\\" + s;
    }
  });
  return val;
};

function
_escapeCsvString(val) {
  if (!val)
    return val;
  if (val.indexOf("\"") == 0 && val.length > 1 && val.lastIndexOf("\"") == val.length-1)
    val = val.substring(1, val.length - 1);
  if (val.match(";")) {
    val = val.replace(/\\\"/g, "\"\"");
    val = "\"" + val + "\"";
  } else {
    val = val.replace(/\\\"/g, "\"");
  }
  return val;
}

function
createWhere(b, colVals)
{
  if(b.whereStmt)       // Hack for the last resort
    return b.whereStmt;

  if(typeof b.filterCol == "string") {

    if (typeof b.filterVal == "string" && b.filterVal.indexOf("%") >= 0) {
      colVals.push(b.filterVal);
      return " WHERE "+_escapeString(b.filterCol)+" LIKE ?";

    } else if(typeof b.filterVal == "object") { // id in (1,2,3)
      var q = [];
      for(var i1=0; i1<b.filterVal.length; i1++) {
        colVals.push(b.filterVal[i1]);
        q.push('?');
      }
      return " WHERE "+_escapeString(b.filterCol)+" in ("+q.join(",")+")";
    } else {
      colVals.push(b.filterVal);
      return " WHERE "+_escapeString(b.filterCol)+
                (b.filterVal == undefined ? " is ?" : "=?");
    }
  }

  var colNames = [];
  for(var i1=0; i1<b.filterVal.length; i1++) {
    colVals.push(b.filterVal[i1]);
    colNames.push(_escapeString(b.filterCol[i1]));
  }
  return " WHERE "+colNames.join("=? AND ")+"=?";
}

// Writes the content to the local file with an arbitrary name, and returns it.
// Used to download CSV created by the browser
function
writeFile(req, res, next)
{
  var par = { req:req, res:res, next:next};
  var b = req.body;

  if(!mods.auth.isAdmin(b.username) &&
     !mods.auth.isViewer(b.username))
    return htmlError(par, "Permission denied (" + b.username + 
                        " is not admin/viewer) for writeFile");

  if(!b.content || !b.suffix || !b.prefix)
    return htmlError(par, "content/suffix parameter missing");
  if(b.suffix.indexOf("/") >= 0 || b.prefix.indexOf("/") >= 0) {
    log("alert: writeFile with:"+p.prefix+"/"+b.suffix);
    return htmlError(par, "no");
  }
  var filename = "/export/"+b.prefix+(new Date()).getTime()+b.suffix;
  fs.writeFileSync(cfg.htmlDir+"/"+filename, b.content, b.encoding?b.encoding:'binary');
  setTimeout(function(){ fs.unlink(cfg.htmlDir+"/"+filename)}, 10000);
  res.end(JSON.stringify({fileName:filename}));
}

function
now()
{
  return (new Date()).toISOString().substring(0,19).replace("T", " ");
}

function
myHtmlError(par, err)
{
  if(par.req.nextFn)
    return par.req.nextFn(err, undefined);

  if(par.inTransaction) {
    log("transaction rollback");
    delete(par.inTransaction);
    par.connection.rollback();
  }
  if(par.connection) {
    par.connection.release();
    delete(par.connection);
  }
  return htmlError(par, ""+err);
}

function
myHtmlOk(par, ret)
{
  if(par.req.nextFn)
    return par.req.nextFn(undefined, ret);
  if(par.connection && !par.inTransaction)
    par.connection.release();
  return par.res.end(JSON.stringify(ret));
}


module.exports.importCsv = importCsv;
module.exports.doTableCsvExport = doTableCsvExport;
module.exports.cmd = { 
  tableBatch,
  tableCmd,
  tableCols,
  tableCsvExport,
  tableCsvImport,
  tableDelete,
  tableDownload,
  tableInsert,
  tableList,
  tableSelect,
  tableUpdate,
  writeFile,
  logStructChanges
};

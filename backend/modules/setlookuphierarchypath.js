/* Copyright KI-AG 2013-2019, Project KIPUS */
// Contains:
// - setLookupHierarchyPath

var lookupTables = [];

//////////////////////////////////////////
// setLookupHierarchyPath parameters:
//////////////////////////////////////////
function
setLookupHierarchyPath(req, next)
{
  var b = req.body;
  var par = { req:req, next:next };

  pool.getConnection(function(err, connection) {
    par.connection = connection;
    if(err) 
      myError(par, err);
    par.pathColName = "HIERARCHYPATH";
    var sql =  "SELECT tablename "
              +"FROM kipus_pagedefinition pd "
              +"INNER JOIN kipus_pageattributes pa on pd.id = pa.pagedefid "
              +"WHERE id in (SELECT id FROM kipus_pagedefinition pd "
                           +"INNER JOIN kipus_pageattributes pa on pd.id = pa.pagedefid "
                           +"WHERE pd.pagetype = 'LOOKUP' "
                           +"AND pa.columnname = 'PARENT')"
              +"AND columnname = '" + par.pathColName + "'";
    par.connection.query(sql, function(err, rows) {
      if(err) 
        myError(par, err);
      lookupTables = rows;
      doSetLookupHierarchyTable(par, 0, next);      
    });
  });
}

function
myError(par, err)
{
  log("ERR:"+err);
  par.connection.release();
  process.exit(1);
}

function
doSetLookupHierarchyTable(par, index)
{
  if(index >= lookupTables.length) {
    par.connection.release();
  var next = par.next;
  if (next)
    next();
  }
  
  doSetLookupHierarchyPath(par, lookupTables[index].tablename, function() { doSetLookupHierarchyTable(par, index+1); })
}

function
doSetLookupHierarchyPath(par, tablename, next)
{
  var sqlcmds = [];
  sql = "SELECT id, PARENT FROM " + tablename;
  par.connection.query(sql, function (err, rows) {
    if(err) 
      myError(par, err);
    sqlcmds = updateHierarchyCmds(rows, tablename, par.pathColName); 
    function serialCall(sqlQuery)
    {
      if (sqlQuery) {
        par.connection.query(sqlQuery, function(err, result) {
          if(err) 
            myError(par, err);
          return serialCall(sqlcmds.shift());
        });
      }
      else {
        //log("serialCall completed");
        if (next)
          next();
      }
    }
    serialCall(sqlcmds.shift());
  });
}

function
updateHierarchyCmds(tableValues, tableName, pathColumnName, sqlConnection)
{
  var h={}, lastfnd='', sqlcmds=[];
  var sqlupdate = "UPDATE " + tableName + " SET " + pathColumnName + " = '";
  var sqlwhere = "' WHERE id = ";
  for(;;) {
    var fnd = 0;
    for(var i1 = 0; i1<tableValues.length; i1++) {
      var r=tableValues[i1], p=r.PARENT;
      if(h[r.id]) {
        fnd++; continue;
      }
      if(!p) {
        h[r.id]=""+r.id; fnd++; 
        sqlcmds.push(sqlupdate + h[r.id] + sqlwhere + r.id);
        continue;
      }
      if(!h[p])
        continue;
      h[r.id]=h[p]+","+r.id; fnd++;
      sqlcmds.push(sqlupdate + h[r.id] + sqlwhere + r.id); 
    }
    if(fnd == tableValues.length || fnd == lastfnd)
      break;
    lastfnd = fnd;
  }
  return sqlcmds;
}

module.exports.setLookupHierarchyPath = setLookupHierarchyPath;
module.exports.cmd = { setLookupHierarchyPath:setLookupHierarchyPath };

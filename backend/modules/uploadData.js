/* Copyright KI-AG 2013-2019, Project KIPUS */

// upload images

// body parameters: function,username,password
//                  bookId,rowId,tableName,columnName,data,tableCopyParam
function
uploadData(req, res, next)
{
  var par = { req:req, res:res, next:next };
  pool.getConnection(function(err, connection) {
    if(err) 
      return myHtmlError(par, "getConnection: "+err);
    par.connection = connection;
    par.connection.beginTransaction(function(err) {
      if(err)
        return myHtmlError(par, ""+err);
      par.inTransaction = true;
      doUploadData(par);
    });
  });
}

function
doUploadData(par)
{
  var b = par.req.body;
  log("uploadData: bookId:"+b.bookId+" rowId:"+b.rowId+
                " tCP:"+b.tableCopyParam+
                " tableName:"+b.tableName+" columnName:"+b.columnName);

  var vals, sql;
  if(b.tableCopyParam) {
    var tca = b.tableCopyParam.split(","); // prefix,targetid,index
    sql = "SELECT t.id id FROM "+b.tableName+" t WHERE "+
              tca[0]+"TARGETID=? AND "+tca[0]+"INDEX=?";
    vals = [tca[1], tca[2]];

  } else {
    sql = "SELECT t.id id FROM "+b.tableName+" t, kipus_rows r "+
                "WHERE r.bookid=? AND r.foreignRowId=? AND "+
                      "r.modifiedby=? AND t.rowid=r.id";
    vals = [b.bookId, b.rowId, b.username];
  }

  par.connection.query(sql, vals,
    function(err, rows) {
      if(err) 
        return myHtmlError(par, sql+" FAILED: "+err);
      if(rows.affectedRows === 0)
        return myHtmlError(par, sql+" FAILED: Row not found.");
      if(rows.length == 0) {
        par.insertId = "ERROR/"+(new Date()).getMilliseconds();
        serverError(par, 
          "No row found for image, storing it as "+par.insertId+
          ". username:"    +b.username+
          ", bookId:"      +b.bookId+
          ", tableName:"   +b.tableName+
          ", columnName:"  +b.columnName+
          ", foreignRowId:"+b.rowId);
      } else {
        par.insertId = rows[0].id;
      }

      par.colTypes = {};
      par.colTypes[b.columnName] = 
        (b.colType ? b.colType :
        (b.data ? (b.data.match(/^[^;]*;data:image/) ? "foto":"file") :"foto"));
      par.bigDataCnt = 1;
      par.bigData = {};
      par.bigData[b.columnName] = b.data;
      par.finishFn = function(par, err) {
        if(err)
          return myHtmlError(par, err);
        return myHtmlOk(par);
      };
      mods.image.finishBigDataCols(par);

    });
}

function
myHtmlOk(par)
{
  if(par.inTransaction)
    par.connection.commit(function(err) { if(err) log(err); });
  par.connection.release();
  return par.res.end(JSON.stringify({ sync:"ok", dataids:par.dataids }));
}

function
myHtmlError(par, err)
{
  if(par.inTransaction)
    par.connection.rollback();
  par.connection.release();
  return htmlError(par, ""+err);
}

module.exports.cmd = { uploadData:uploadData };

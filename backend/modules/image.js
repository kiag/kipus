/* Copyright KI-AG 2013-2019, Project KIPUS */

var gm = require('gm');

// code found in https://github.com/akras14/validate-http-headers/blob/master/rules.js
// remove invalid characters from attachent filename to prevent
// "TypeError: The header content contains invalid characters"
function cleanFilename(val){
  if(!val) 
    return;

  var cleanName = '';
  val = String(val);


  for (var i = 0, len = val.length; i < len; i++) {
    var ch = val.charCodeAt(i);

    if (ch >= 65 && ch <= 90) // A-Z
      cleanName += val[i];

    if (ch >= 97 && ch <= 122) // a-z
      cleanName += val[i];

    // ^ => 94
    // _ => 95
    // ` => 96
    // | => 124
    // ~ => 126
    if (ch === 94 || ch === 95 || ch === 96 || ch === 124 || ch === 126)
      cleanName += val[i];

    if (ch >= 48 && ch <= 57) // 0-9
      cleanName += val[i];

    // ! => 33
    // # => 35
    // $ => 36
    // % => 37
    // & => 38
    // ' => 39
    // * => 42
    // + => 43
    // - => 45
    // . => 46
    if (ch >= 33 && ch <= 46) {
      if (ch === 34 || ch === 40 || ch === 41 || ch === 44){
        continue;
      } else {
        cleanName += val[i];
      }
    }
  }
  return cleanName;
}

///////////////
// return base64-encoded image or its icon as JSON
function
getImage(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next };

  if(!b.imgName)
    return htmlError(par, "imgName parameter is missing");
  var col = b.imgName.split("/");
  if(col.length != 3)
    return htmlError(par, "imgName parameter is malformed");

  pool.getConnection(function(err, connection) {
    if(err) 
      return htmlError(par, "getConnection: "+err);
    connection.query(
      "SELECT comment,"+(b.bigdata?"bigdata":"icon")+
        " from kipus_bigdata where dataid=?", [b.imgName],
      function(err, r) {
        connection.release();
        if(err || r.length != 1)
          return htmlError(par,
                "getImage "+b.imgName+": "+(r.length ? err : "no data found"));
        var d = "";
        var data = (b.bigdata ? r[0].bigdata.toString('base64') :
                                r[0].icon.toString('base64'));
        if(data.length)
          d = r[0].comment+";data:image/jpeg;base64,"+
                (b.bigdata?r[0].bigdata.toString('base64') :
                r[0].icon.toString('base64'));
        res.end(JSON.stringify(d));
      });
  });
}

///////////////
// return base64-encoded data (image, word, excel, etc) as JSON
function
getBigdata(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next };

  if(!b.fileName)
    return htmlError(par, "fileName parameter is missing");
  var col = b.fileName.split("/");
  if(col.length != 3)
    return htmlError(par, "fileName parameter is malformed");
  pool.getConnection(function(err, connection) {
    if(err) 
      return htmlError(par, "getConnection: "+err);
    connection.query(
      "SELECT comment"+(b.allowDownload?",bigdata":"")+
        " from kipus_bigdata where dataid=?", [b.fileName],
      function(err, r) {
        connection.release();
        if(err || r.length != 1)
          return htmlError(par,
              "getBigdata "+b.fileName+": "+(r.length ? err : "no data found"));
        var mime = require('mime-types');
        var d = r[0].comment+";";
        if (b.allowDownload) {
          d += "data:"+mime.lookup(r[0].comment)+";base64,"+
                r[0].bigdata.toString("base64");
        } else {
          d += "[file:"+b.fileName+"]";
        }
        res.end(JSON.stringify(d));
      });
  });
}

///////////////
// called manually to fix earlier bugs
function
rotateIcon(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next };

  if(!b.dataid || !b.angle)
    return htmlError(par, "dataid or angle parameter is missing");
  var col = (b.bigdata ? "bigdata":"icon");

  pool.getConnection(function(err, connection) {
    if(err) 
      return htmlError(par, "getConnection: "+err);
    connection.query(
      "SELECT "+col+" from kipus_bigdata where dataid=?", [b.dataid],
      function(err, r) {
        if(err) {
          connection.release();
          return htmlError(par, "rotateIcon:"+ err);
        }
        gm(b.bigdata ? r[0].bigdata : r[0].icon)
        .rotate("black", parseInt(b.angle))
        .stream(function(err, stdout, stderr) {
          var icBuf = new Buffer('');
          stdout.on('data',function(data){icBuf=Buffer.concat([icBuf,data])});
          stdout.on('end', function(data) {
            if(data)
              icBuf = Buffer.concat([icBuf,data]);
            connection.query(
              "update kipus_bigdata set "+col+"=? where dataid=?",
              [icBuf, b.dataid],
              function(err, r) {
                connection.release();
                if(err)
                  return htmlError(par, "rotateIcon:"+ err);
                res.end(JSON.stringify({result:"ok"}));
              });
          });
        });
      });
  });
}

///////////////
function
getExifData(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next };

  if(!b.dataidArr)
    return htmlError(par, "dataid parameter is missing");
  var col = (b.bigdata ? "bigdata":"icon");

  pool.getConnection(function(err, connection) {
    if(err) 
      return htmlError(par, "getConnection: "+err);

    var ret=[], q=[];
    for(var i1=0; i1<b.dataidArr.length; i1++)
      q.push("?");

    connection.query(
      "SELECT dataid,bigdata from kipus_bigdata where dataid in ("+
                q.join(",")+")", b.dataidArr,
      function(err, r) {
        connection.release();
        if(err)
          return htmlError(par, "getExifData:"+ err);
        for(var i1=0; i1<r.length; i1++) {
          var exif = mods.EXIF.readFromBinaryFile(
                 new mods.EXIF.BinaryFile(r[i1].bigdata));
          var date = exif.DateTimeOriginal ? exif.DateTimeOriginal :
                    (exif.DateTimeDigitized ? exif.DateTimeDigitized :
                    exif.DateTime ? exif.DateTime : "N/A");
          date = date.replace(":","-").replace(":","-");
          ret.push({dataid:r[i1].dataid, date:date, model:exif.Model});
        }
        res.end(JSON.stringify({result:ret}));
      });
  });
}

// Used from the client: convert bookid/rowid into deferred stuff.
function
dbBookImageHandler(req, res, next)
{
  var u = req.url;
  var off = u.indexOf("bookImageId=");
  var p = u.substr(off+12).split("/");
  if(p.length != 4)
    return next();
  pool.getConnection(function(err, connection) {
    if(err) 
      return htmlError({req:req, res:res}, "getConnection: "+err);
    connection.query(
      "SELECT "+p[3]+" x FROM "+p[0]+" n, kipus_rows k "+
      "WHERE n.rowid=k.id AND k.bookid=? AND k.foreignRowId=?", [p[1], p[2]],
      function(err, rows) {
        connection.release();
        if(err || rows.length != 1) {
          log(""+err);
          res.statusCode = 404;
          return res.end();
        }
        var x = rows[0].x.replace(/^\[deferred:/,"").replace(/\]$/,"");
        req.url = req.url.replace(/bookImageId=.*/, "imageid="+x);
        return dbImageHandler(req, res, next);
      });
  });
}

////////////////////////////////
// direct link, as dbImageIcon&imageid=XXX, returns raw image data
function
dbImageHandler(req, res, next)
{
  var u = req.url;
  if(u.indexOf("/dbImage") != 0)
    return next();
  var colName = (u.indexOf("/dbImageIcon") == 0 ? "icon" : "bigdata");
  var off = u.indexOf("imageid=");
  if(off < 0) {
    if(u.indexOf("bookImageId=") >= 0)
      return dbBookImageHandler(req, res, next);
    return next();
  }
  var dataid = u.substr(off+8);
  off = dataid.indexOf("&");
  if(off > 0)
    dataid = dataid.substr(0, off);

  pool.getConnection(function(err, connection) {
    if(err) 
      return htmlError({req:req, res:res}, "getConnection: "+err);
    connection.query(
      "SELECT "+colName+",comment FROM kipus_bigdata WHERE dataid=?", [dataid],
      function(err, rows) {
        connection.release();
        if(err || rows.length != 1) {
          res.statusCode = 404;
          return res.end();
        }
        var r = rows[0];
        res.setHeader('Content-Disposition', 'attachment; filename='+cleanFilename(r.comment));
        var mime = require('mime-types');
        res.setHeader('Content-Type', mime.lookup(r.comment));
        return res.end(r[colName]);
      });
  });
}

////////////////////////////////
// direct link, as dbFile&fileid=XXX, returns file
function
dbFileHandler(req, res, next)
{
  var u = req.url;
  if(u.indexOf("/dbFile") != 0)
    return next();
  var colName = "bigdata";
  var off = u.indexOf("fileid=");
  if(off < 0)
    return next;
  var dataid = u.substr(off+7);
  off = dataid.indexOf("&");
  if(off > 0)
    dataid = dataid.substr(0, off);
  pool.getConnection(function(err, connection) {
    if(err) 
      return htmlError({req:req, res:res}, "getConnection: "+err);
    connection.query(
      "SELECT "+colName+",comment FROM kipus_bigdata WHERE dataid=?", [dataid],
      function(err, rows) {
        connection.release();
        if(err || rows.length != 1) {
          res.statusCode = 404;
          return res.end();
        }
        var r = rows[0];
        res.setHeader('Content-Disposition', 'attachment; filename='+cleanFilename(r.comment));
        var mime = require('mime-types');
        res.setHeader('Content-Type', mime.lookup(r.comment));
        log("mime-type detected for file "+r.comment+":"+res['content-type']);
        return res.end(r[colName]);
      });
  });
}

var cachedTableDesc = {};

//////////////////////////////
// First step: extract the big data. 
// It is more or less defunct since implemented longData on the client
function
prepareBigDataCols(par, nextFn)
{
  var b = par.req.body;
  if(b.tableName.indexOf("kipus_") == 0) {
    cachedTableDesc = {};
    return nextFn(par);
  }

  var cols = cachedTableDesc[b.tableName];
  if(!cols && par.tdChecked)
    return nextFn(par);

  if(!cols) {
    pool.getConnection(function(err, connection) {
      var sql = "SELECT columnname,constrainttype "+
                "FROM kipus_pageattributes a,kipus_pagedefinition d "+
                "WHERE a.pagedefid=d.id and d.tablename=?";
      connection.query(sql, [b.tableName],
        function(err, rows) {
          if(err)
            log(sql+":"+err);
          connection.release();
          par.tdChecked = true;
          cachedTableDesc[b.tableName] = rows;
          prepareBigDataCols(par, nextFn);
        });
    });
    return;
  }

  par.bigData = {};
  par.colTypes = {};
  par.bigDataCnt = 0;
  var prdc = b.columns;
  if (!prdc) { // hack for uploadData
    prdc = {};
    prdc[b.columnName] = b.data;
  }
  for(var i1=0; i1<cols.length; i1++) {
    if(cols[i1].constrainttype == "foto" ||
       cols[i1].constrainttype == "signature") {
      var cname = cols[i1].columnname;
      log("pBDC fnd:"+cname+"/"+(prdc[cname] ? prdc[cname].substr(0,30):"N/A"));
      par.colTypes[cname] = cols[i1].constrainttype;
      if(prdc[cname] && prdc[cname].indexOf("base64,") > 10) {
        par.bigData[cname] = prdc[cname];
        //par.colTypes[cname] = "foto";
        par.bigDataCnt++;
        prdc[cname] = "inserting";
      }
    } else if(cols[i1].constrainttype == "file") {
      var cname = cols[i1].columnname;
      if(prdc[cname] && prdc[cname].indexOf(";data:") > 0) {
        par.bigData[cname] = prdc[cname];
        par.bigDataCnt++;
        prdc[cname] = "inserting";
      }
    }
  }
  nextFn(par);
}

//////////////////////////////////
// Secnd step: write the bigdata and update the columns
function
finishBigDataCols(par)
{
  if(!par.bigDataCnt) {
    if(!par.dontRelease)
      par.connection.release();
    if(par.finishFn)
      par.finishFn(par);
    return;
  }

  function
  transformAndSave(par, colName)
  {
    var type = par.colTypes[colName];
    var dStr = ((type=="foto"||type=="signature") ? "[deferred:" : "[file:");
    var newVal = dStr+b.tableName+"/"+par.id+"/"+colName+"]"
    var sql = "UPDATE "+b.tableName+" "+
        "SET "+colName+"='"+newVal+"' WHERE id='"+par.id+"'";
    par.connection.query(sql,
    function(err, res) {
      if(err) {
        if(par.finishFn)
          return par.finishFn(par, err);
        log(sql+":"+err);
        if(!par.dontRelease)
          par.connection.release();
        return;
      }

      var d = par.bigData[colName];
      if(!d) {
        if(par.finishFn)
          return par.finishFn(par, err);
        log("*** finishBigDataCols: no data");
        if(!par.dontRelease)
          par.connection.release();
        return;
      }

      var off = d.indexOf(';');
      var dataName = d.substr(0,off);
      var data = d.substr(off+1);
      var isImg = (data.indexOf("data:image") >= 0 && 
                  (type == "foto" || type == "signature"));

      var off2 = data.indexOf("base64,");
      var dataBuf = new Buffer(data.substr(off2+7),'base64');
      if(!isImg) {
        saveBigData(par, colName, dataName, "", dataBuf);
        return;
      }

      var exif =mods.EXIF.readFromBinaryFile(new mods.EXIF.BinaryFile(dataBuf));
      log("   "+newVal+": saving image with orientation "+exif.Orientation);

      gm(dataBuf)        // Icon.
      .resize(192,192)
      .noProfile()  // remove EXIF
      .stream(function(err, stdout, stderr) {
        var iconBuf = new Buffer('');
        stdout.on('data',function(data){iconBuf=Buffer.concat([iconBuf,data])});
        stdout.on('end', function(data) {
          if(data)
            iconBuf = Buffer.concat([iconBuf,data]);
          saveBigData(par, colName, dataName, iconBuf, dataBuf);
        });
      });
    });
  }

  var b = par.req.body;
  par.id = (par.insertId ? par.insertId : b.filterVal);
  for(var colName in par.bigData)
    transformAndSave(par, colName);
}

function
saveBigData(par, colName, dataName, iconBuf, dataBuf)
{
  var b = par.req.body;
  if(!par.dataids)
    par.dataids = [];
  var dataid = b.tableName+"/"+par.id+"/"+colName;
  par.dataids.push(dataid);
  
  var sql = "INSERT INTO kipus_bigdata "+ 
              "(dataid,comment,icon,bigdata,modified,modifiedby) "+
              "VALUES (?,?,?,?,?,?) "+
            "ON DUPLICATE KEY UPDATE "+
              "comment=?,icon=?,bigdata=?,modified=?,modifiedby=?";
  par.connection.query(sql,
    [ dataid,
      dataName, iconBuf, dataBuf, now(), b.username,
      dataName, iconBuf, dataBuf, now(), b.username ], 
    function(err, r) {
      if(--par.bigDataCnt == 0) {
        if(par.finishFn)
          return par.finishFn(par, err);
        if(!par.dontRelease)
          par.connection.release();
      }
      if(err)
        log("ERR:"+err);
    });
}

function
recalcIcons(req, res, next)
{
  var par = { req:req, res:res, next:next };
  pool.getConnection(function(err, connection) {
    if(err)
      return htmlError(par, err);
    par.connection = connection;
    doRecalcIcons(par);
  });
}

function
doRecalcIcons(par)
{
  if(!par.imCols) {
    var sql = "SELECT tablename,columnname "+
        "FROM kipus_pageattributes pa, kipus_pagedefinition pd "+
        "WHERE pa.pagedefid=pd.id AND "+
              "(pa.constrainttype='foto' or pa.constrainttype='signature')";
    par.connection.query(sql, function(err, rows) {
      if(err)
        return myHtmlError(par, err);
      par.imCols = {};
      for(var i1=0; i1<rows.length; i1++)
        par.imCols[rows[i1].tablename+"/"+rows[i1].columnname] = 1;
      doRecalcIcons(par);
    });
    return;
  }

  if(!par.imData) {
    var sql = "SELECT dataid,bigdata FROM kipus_bigdata "+
              "WHERE dataid NOT LIKE '/projects%' and length(bigdata) > 0";
    par.connection.query(sql, function(err, rows) {
      if(err)
        return myHtmlError(par, err);
      par.imData = [];
      for(var i1=0; i1<rows.length; i1++) {
        var s = rows[i1].dataid.split("/");
        if(!par.imCols[s[0]+"/"+s[2]])
          continue;
        par.imData.push(rows[i1]);
      }
      par.imIdx = 0;
      doRecalcIcons(par);
    });
    return;
  }

  if(par.imIdx == par.imData.length)
    return par.res.end(JSON.stringify({result:"ok"}));


  var r = par.imData[par.imIdx++];
  var d = "comment;data:image/jpeg;base64,"+r.bigdata.toString('base64');
  var data = d.substr(d.indexOf(';')+1);
  var off2 = data.indexOf("base64,");
  var dataBuf = new Buffer(data.substr(off2+7),'base64');
  var exif = mods.EXIF.readFromBinaryFile(new mods.EXIF.BinaryFile(dataBuf));
  log("  "+par.imIdx+" "+r.dataid);

  gm(dataBuf)        // Icon.
  .resize(192,192)
  .noProfile()  // remove EXIF
  .stream(function(err, stdout, stderr) {
    var iconBuf = new Buffer('');
    stdout.on('data',function(data) { iconBuf = Buffer.concat([iconBuf,data])});
    stdout.on('end', function(data) {
      if(data)
        iconBuf = Buffer.concat([iconBuf,data]);
      par.connection.query(
        "UPDATE kipus_bigdata set icon=? where dataid=?", [iconBuf,r.dataid],
        function(err, r) {
          if(err)
            myHtmlError(par, err);
          doRecalcIcons(par);
        });
    });
  });
}

function
myHtmlError(par, err)
{
  if(par.connection)
    par.connection.release();
  return htmlError(par, ""+err);
}

function
now()
{
  return (new Date()).toISOString().substring(0,19).replace("T", " ");
}

/////////////
// to be used with install/import_img.pl
function
updateImage(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next };
  if(!b.dataid || !b.image || !b.icon)
    return htmlError(par, "dataid, image or icon parameter is missing");

  var par = { req:req, res:res, next:next};
  b.image = new Buffer(b.image, 'base64');
  b.icon  = new Buffer(b.icon, 'base64');
  log("   dataid:"+b.dataid+", image:"+b.image.length+", icon:"+b.icon.length);

  var sql = "UPDATE kipus_bigdata set bigdata=?,icon=? where dataid=?";
  pool.getConnection(function(err, connection) {
  connection.query(sql, [b.image, b.icon, b.dataid], function(err, rows){
    connection.release();
    if(err)
      return htmlError(par, err);
    res.end(JSON.stringify({"RET":"ok"}));
  })
  });
}

module.exports.cmd = { 
  getImage:getImage,
  getBigdata:getBigdata,
  rotateIcon:rotateIcon,
  updateImage:updateImage,
  recalcIcons:recalcIcons,
  getExifData:getExifData,
};
module.exports.dbImageHandler = dbImageHandler;
module.exports.dbFileHandler = dbFileHandler;
module.exports.prepareBigDataCols = prepareBigDataCols;
module.exports.finishBigDataCols = finishBigDataCols;

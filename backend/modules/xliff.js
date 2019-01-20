/* Copyright KI-AG 2013-2019, Project KIPUS */
var tuRegex = /^<trans-unit[ \t]+id=["'](.*)["']>[\s\S]?<source>([\s\S]*)<\/source>[\s\S]?(<target[ \t]+xml:lang=["']..["']>([\s\S]*)<\/target>)?[\s\S]?<\/trans-unit>/;

function 
_encodeHTML(val) {
    if (val)
    return val.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&apos;');
    else
     return val;
}

function 
_encodeDBVal(val) {
    if (val)
    return val.replace(/"/g, '&quot;')
               .replace(/'/g, '&apos;');
    else
     return val;
}

function
myHtmlError(par, err)
{
  if(par.errReturned)   // if there are multiple parallel calls with error.
    return;
  par.errReturned = true;
  if(par.inTransaction)
    par.connection.rollback();
  par.connection.release();
  return htmlError(par, ""+err);
}

//////////////////////////////////////////
// open existing xliff, write file to xliffpath and return xliffedit url
// openXliff parameters:
// - dataid (mandatory)
// - projectName (mandatory)
// - projectId (mandatory)
function
openXliff(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next };

  if(!mods.auth.isAdmin(b.username) &&
     !mods.auth.isViewer(b.username))
    return htmlError(par, "Permission denied (" + b.username + " is not admin/viewer) for openXliff");
  if(typeof b.dataid == "undefined")
    return htmlError(par, "dataid parameter missing");
  if(typeof b.projectName == "undefined")
    return htmlError(par, "projectName parameter missing");
  if(typeof b.projectId == "undefined")
    return htmlError(par, "projectId parameter missing");
  if(typeof b.language == "undefined")
    return htmlError(par, "language parameter missing");
  log("openXliff " + b.dataid);

  var sql = "SELECT comment,bigdata "+
                "FROM kipus_bigdata WHERE dataid=?";
  pool.getConnection(function(err, connection) {
  connection.query(sql, 
      [ b.dataid ], function(err, rows){
      if(err)  {
        return htmlError(par, "" + err);
      }
      if (rows.length != 1)
        return htmlError(par, "file " + b.dataid + " not found in database");
      if (!rows[0].comment || rows[0].comment == "")
        return htmlError(par, "comment(=filename) not set for " + b.dataid);
      var filename = rows[0].comment;
      if (filename.match(/project_..\.xml/)) {
        var par = { req:req, res:res, next:next, withLookupData: 1, 
                    fileName: filename, connection: connection, 
                    keepConnectionAlive: 1, dbdata: rows[0].bigdata };
        return doGenXliff(par, 0);
      } else {
        var par = { req:req, res:res, next:next, connection: connection ,
                    data:rows[0].bigdata, fileName: filename};
        if (b.projectName == "ADMIN" || filename.match(/_en\.xml/)) {
          return doOpenXliff(par);
        } else {
          // read english and merge source
          var sql = "SELECT comment,bigdata "+
                        "FROM kipus_bigdata WHERE dataid=?";
          var enDataid=b.dataid.replace(/_..\.xml/g, "_en.xml");
          par.connection.query(sql , [enDataid],function(err, rows1) {
              if(err) 
                return htmlError(par, ""+err);
              if(rows1.length != 0)
                par.data = createMergedXliff(par, rows1[0].bigdata, rows[0].bigdata);
              return doOpenXliff(par);
          });
        }
        
        function createMergedXliff(par, en_data, xx_data) {
            log("create merged xliff");
            function get_hash(base64str) {
              var xliff = new Buffer(base64str, 'base64').toString();
              var i = 0;
              var sh = {}; // source hash
              var th = {}; // target hash
              var matches = {};
              while (i < xliff.length)
              {
                  var j = xliff.indexOf("<trans-unit ", i);
                  if (j == -1) j = xliff.length;
                  var tu = xliff.substr(i-1, j-i);
                  var m = tu.match(tuRegex);
                  if (m && m.length > 1)
                  {
                     var id = m[1];
                     matches[id] = m;
                     if (m[2]) {
                       // source
                       sh[id] = _encodeDBVal(m[2]);
                     }
                     if (m[4]) {
                       // target 
                       th[id] = _encodeDBVal(m[4]);
                     }
                  }
                  i = j+1;
              } 
              return { sh:sh,th:th, matches: matches}; 
            }
            var enHash = get_hash(en_data);
            var xxHash = get_hash(xx_data);
            var data = '<?xml version="1.0"?>\n' + 
                        '<!DOCTYPE xliff PUBLIC "-//XLIFF//DTD XLIFF//EN" "http://www.oasis-open.org/committees/xliff/documents/xliff.dtd">\n' +
                        '<xliff version="1.0">\n' + 
                        '<file original="' + par.fileName + '" source-language="en-US" target-language="'+par.req.body.language+'" datatype="plaintext">\n' +
                        '<header/>\n<body>\n';
            for (var id in enHash.sh) {
              var source = enHash.sh[id];
              var target = enHash.th[id];
              if (xxHash.th[id] && target != xxHash.th[id]) {
                target = xxHash.th[id];
              }
              data += '<trans-unit id="'+id+'"><source>'+source+'</source>'+
                           (target?'<target xml:lang="'+par.req.body.language+'">'+target+'</target>':'')
                           +'</trans-unit>\n';   
            }
            for (var id in xxHash.sh) {
              if (enHash.sh[id])
                continue; // already handled
              data += '<trans-unit id="'+id+'"><source>'+xxHash.sh[id]+'</source>'+
                           (xxHash.th[id]?'<target xml:lang="'+par.req.body.language+'">'+xxHash.th[id]+'</target>':'')
                           +'</trans-unit>\n';   
            }
            data += "</body>\n</file>\n</xliff>";
            return data;
        }

        function doOpenXliff(par) {
          var filePath = cfg.xliffedit.filePath+'/'+b.projectName+"_"+filename;
          fs.writeFile(filePath, par.data,
            function(err) {
              if(err)
                return myHtmlError(par, ""+err);
              log("  Export: saved(2) "+filePath+" ("+par.data.length+")");
            }); 
          var ts = Date.now();
          var out = JSON.stringify(
             {projectName: b.projectName,
              as_user: b.username,
              sourcePort: cfg.httpPort,
              source: filename,
              skipLengthCheck: true,
              ts: ts,
              header: "<img src='css/images/kipus_logo.png'> Translation file "+filename+"</div>",
              title: b.projectName+" Translation Editor",
              help: "all your changes will be directly going live on save",
              language: b.language
             }
            );
          fs.writeFile(cfg.xliffedit.filePath+'/'+ts+".tmp", out, function(err) {
              if(err)
                return myHtmlError(par, ""+err);
              log("  Export: saved(3) "+ts+".tmp"+" ("+out.length+")");
            }); 
          connection.release();
          return res.end(JSON.stringify({xliff_url:cfg.xliffedit.url+"?cfg="+ts }));
        }
      }

    });
  });

}

//////////////////////////////////////////
// generate xliff from project, write file to xliffpath and return xliffedit url
// genXliff parameters:
// - projectId (mandatory)
// - projectName (mandatory)
// - fileName (mandatory)
function
genXliff(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next, withLookupData: 1, fileName: b.fileName };

  if(!mods.auth.isAdmin(b.username) &&
     !mods.auth.isViewer(b.username))
    return htmlError(par, "Permission denied (" + b.username + " is not admin/viewer) for genXliff");
  if(typeof b.projectId == "undefined")
    return htmlError(par, "projectId parameter missing");
  if(typeof b.projectName == "undefined")
    return htmlError(par, "projectName parameter missing");
  if(typeof b.fileName == "undefined")
    return htmlError(par, "fileName parameter missing");
  // set parameter to keep connection alive, 
  // otherwise function createBookDefinition releases par.connection
  par.keepConnectionAlive = 1;
  // check if already data exists to merge with
  var sql = "SELECT comment,bigdata "+
                "FROM kipus_bigdata WHERE dataid=?";
  var dataid = "/projects/"+b.projectName+"/"+b.fileName;
  pool.getConnection(function(err, connection) {
    connection.query(sql, 
        [ dataid ], function(err, rows){
        if(err)  {
          return htmlError(par, "" + err);
        }
        par.connection = connection;
        if (rows.length == 1) 
          par.dbdata = rows[0].bigdata;
        return doGenXliff(par, 0);
    });
  });
}

function
doGenXliff(par, status, callbackFn)
{
  log("doGenXliff " + status);
  if(status == 0) { // projectbooks
    var sql = "select * from kipus_projectbooks where projectid=?";
    par.connection.query(sql , [par.req.body.projectId],function(err, rows) {
        if(err) 
          return myHtmlError(par, ""+err);
        log("rows = " + rows.length);
        par.bdefList = rows;
        return mods.bookDefinitions.createBookDefinition(par, 1, function () {
          return doGenXliff(par, status+1, callbackFn);
        });
      });
  }
  if (status == 1) { // xliff
      par.tableCols = {};
      var tableNames = Object.keys(par.ret.tables);
      var loaded = 0;
      for(var rIdx=0; rIdx<tableNames.length; rIdx++) {
        (function(rIdx){
        var tableName = tableNames[rIdx];
        var sql = "SELECT table_name, column_name from information_schema.columns "+
                "where table_name=? and table_schema=?";
        par.connection.query(sql, [tableName,cfg.db.database], function(err, rows){
          if(err)
            return myHtmlError(par, ""+err);
          if(rows.length > 0)
            par.tableCols[tableName] = {};
          for(var i=0; i<rows.length;i++)
            par.tableCols[tableName][rows[i].column_name] = 1;
          if(++loaded == tableNames.length)
            return doGenXliff(par, status+1, callbackFn);
        });
        })(rIdx);
      }
      if (tableNames.length == 0)
        return doGenXliff(par, status+1, callbackFn);
  }
  if (status == 2) { // xliff
      par.db_sh = {}; // db source hash
      par.db_th = {}; // db target hash
      par.matches = {};
      if (par.dbdata) {
        var xliff = new Buffer(par.dbdata, 'base64').toString();
        var i = 0;
        while (i < xliff.length)
        {
            var j = xliff.indexOf("<trans-unit ", i);
            if (j == -1) j = xliff.length;
            var tu = xliff.substr(i-1, j-i);
            var m = tu.match(tuRegex);
            if (m && m.length > 1)
            {
               var id = m[1];
               par.matches[id] = m;
               if (m[2]) {
                 // source
                 par.db_sh[id] = _encodeDBVal(m[2]);
               }
               if (m[4]) {
                 // target 
                 par.db_th[id] = _encodeDBVal(m[4]);
               }
            }
            i = j+1;
        } 
      }
      par.sh = {}; // source hash
      var name = par.req.body.projectName;
      name = name.replace(/[^A-Za-z\.0-9]/g, "_");
      par.sh["project.name"] =  _encodeHTML(par.req.body.projectName);
      for (var i=0; i<par.ret.bookdefinition.length; i++) {
        var bd = par.ret.bookdefinition[i];
        par.sh['bookdef.'+bd.id+'.name'] = _encodeHTML(bd.name);
        if (bd.title != undefined && bd.title != "")
          par.sh['bookdef.'+bd.id+'.title'] = _encodeHTML(bd.title);
        if (bd.helptext != undefined && bd.helptext != "")
          par.sh['bookdef.'+bd.id+'.helptext'] = _encodeHTML(bd.helptext);
      }
      for (var i=0; i<par.ret.pagedefinition.length; i++) {
        var pagedef = par.ret.pagedefinition[i];
        par.sh[pagedef.tablename+".displayname"] = _encodeHTML(pagedef.displayname);
        if (pagedef.pagetype != "HEADER" && pagedef.pagetype != "BODY")
          continue;
        if (pagedef.shorttitle != undefined && pagedef.shorttitle != "")
          par.sh[pagedef.tablename+".shorttitle"] = _encodeHTML(pagedef.shorttitle);
        if (pagedef.longtitle != undefined && pagedef.longtitle != "")
          par.sh[pagedef.tablename+".longtitle"] = _encodeHTML(pagedef.longtitle);
        for (var j=0; j<par.ret.pageattributes.length; j++) {
          var pageattr = par.ret.pageattributes[j];
          if (pageattr.pagedefid != pagedef.id)
            continue;
          var tc =  pagedef.tablename+"."+pageattr.columnname;
          if (pageattr.displayname != undefined)
            par.sh[tc + ".displayname"] = _encodeHTML(pageattr.displayname);
          if (pageattr.suffix != undefined)
            par.sh[tc + ".suffix"] = _encodeHTML(pageattr.suffix);
          if (pageattr.helptext != undefined)
            par.sh[tc + ".helptext"] = _encodeHTML(pageattr.helptext);
          if (pageattr.longhelp != undefined)
            par.sh[tc + ".longhelp"] = _encodeHTML(pageattr.longhelp);
          if (pageattr.placeholder != undefined)
            par.sh[tc + ".placeholder"] = _encodeHTML(pageattr.placeholder);
          if (pageattr.constrainttype == "singleFromArg" ||
              pageattr.constrainttype == "multiFromArg") {
             var params = pageattr.constraintparam.split(",");
             for (var x=0; x < params.length; x++) {
                if (params[x] != undefined)
                  par.sh[tc + "." + x] = _encodeHTML(params[x]);
             }
          }
        }
      }
      var lh = {};
      for (var i=0; i<par.ret.pagedefinition.length; i++) {
        var pagedef = par.ret.pagedefinition[i];
        if(pagedef.pagetype != "LOOKUP")
          continue;
        for (var j=0; j<par.ret.pageattributes.length; j++) {
          var pageattr = par.ret.pageattributes[j];
          if (pageattr.pagedefid != pagedef.id)
            continue;
          if (pageattr.i18n != "YES")
            continue;
          lh[pagedef.tablename+"."+pageattr.columnname] = 1;
        }
      }
      var lookup = {};
      for (var k in lh) {
        var arr = k.split(".");
        var t = arr[0];
        var c = arr[1];
        if (!lookup[t])
          lookup[t] = [];
        lookup[t].push(c);
      }
      var todo = Object.keys(lookup).length;
      for(var tableName in lookup) {
        (function(tableName){
          // lookupTables
          var sql = "SELECT id,";
          sql += lookup[tableName].join(",")
          sql += " FROM " + tableName;
          par.connection.query(sql, [par.req.body.username], function(err, rows) {
            if(err) {
              log("sql="+sql);
              return myHtmlError(par, ""+err);
            }
            for (var y=0; y<rows.length; y++) {
              for (var i=0; i<lookup[tableName].length; i++) {
                var c = lookup[tableName][i];  
                if (rows[y][c] != undefined)
                  par.sh[tableName + "." + rows[y].id + "." + c.toLowerCase()] = _encodeHTML(rows[y][c]);
              }
            }
            if(--todo == 0) {
              return doGenXliff(par, status+1, callbackFn);
            }
          });
        })(tableName);
      }
      if (todo == 0) {
        return doGenXliff(par, status+1, callbackFn);
      }
  }
  if (status == 3) { // merge
    par.changed = [];
    par.xliff = '<?xml version="1.0"?>\n' + 
                '<!DOCTYPE xliff PUBLIC "-//XLIFF//DTD XLIFF//EN" "http://www.oasis-open.org/committees/xliff/documents/xliff.dtd">\n' +
                '<xliff version="1.0">\n' + 
                '<file original="' + par.fileName + '" source-language="en-US" target-language="'+par.req.body.language+'" datatype="plaintext">\n' +
                '<header/>\n<body>\n';
    for (var id in par.db_sh) {
      var source = par.db_sh[id];
      if (par.sh[id] && source != par.sh[id]) {
        //par.changed.push(id);
        source = par.sh[id];
      }
      if (source == undefined || source == "")
        continue;
      par.xliff += '<trans-unit id="'+id+'"><source>'+source+'</source>'+
                   (par.db_th[id]?'<target xml:lang="'+par.req.body.language+'">'+par.db_th[id]+'</target>':'')
                   +'</trans-unit>\n';   
      if (!par.db_th[id])
        par.changed.push(id);
    }
    for (var id in par.sh) {
      if (par.db_sh[id])
        continue; // already handled
      if (par.sh[id] == undefined || par.sh[id] == "")
        continue;
      par.changed.push(id);
      par.xliff += '<trans-unit id="'+id+'"><source>'+par.sh[id]+'</source></trans-unit>\n';   
    }
    par.xliff += "</body>\n</file>\n</xliff>";
    return doGenXliff(par, status+1, callbackFn);
  }
  if (status == 4) {                                     // callback & return
    par.connection.release();
    var filePath = cfg.xliffedit.filePath+'/'+par.req.body.projectName+"_"+par.fileName;
    fs.writeFile(filePath, par.xliff,
      function(err) {
        if(err)
          return myHtmlError(par, ""+err);
        log("  Export: saved(0) "+par.fileName+" ("+par.xliff.length+")");
      }); 
    if(callbackFn)
      callbackFn();
    var ts = Date.now();
    var out = JSON.stringify(
       {projectName: par.req.body.projectName,
        as_user: par.req.body.username,
        sourcePort: cfg.httpPort,
        source: par.fileName,
        skipLengthCheck: true,
        changed: par.changed,
        ts: ts,
        matches: par.matches,
        language: par.req.body.language,
        header: "<img src='css/images/kipus_logo.png'> Project Translation</div>",
        title: par.req.body.projectName+" Translation Editor",
        help: "all your changes will be directly going live on save"
       }
      );
    fs.writeFile(cfg.xliffedit.filePath+'/'+ts+".tmp", out,
      function(err) {
        if(err)
          return myHtmlError(par, ""+err);
        log("  Export: saved(1) "+ts+".tmp"+" ("+out.length+")");
      }); 
    var path = cfg.xliffedit.url+"?cfg="+ts;
    return par.res.end(JSON.stringify({xliff_url:path}));
  }
}

//////////////////////////////////////////
// formerly in deletexliff.php
// deleteCfg parameters:
// - xmlFile (optional)
// - tmpFile (optional)
function
deleteCfg(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next };

  if(b.username != 'xliffedit')
    return htmlError(par, "Permission denied for user " + b.username);
  if(b.xmlFile)
    fs.unlink(cfg.xliffedit.filePath+'/'+b.xmlFile);
  if(b.tmpFile)
    fs.unlink(cfg.xliffedit.filePath+'/'+b.tmpFile);
  return par.res.end(JSON.stringify({}));
}

module.exports.cmd = { genXliff:genXliff, openXliff:openXliff, deleteCfg:deleteCfg
                     };

/* Copyright KI-AG 2013-2019, Project KIPUS */
var iCallHash = {};
//////////////////////////////////////////
function
getFiles(req, res, next)
{
  var b = req.body;

  var par = { req:req, res:res, next:next };
  if(!mods.auth.isAdmin(b.username) &&
     !mods.auth.isViewer(b.username))
    return htmlError(par, "Permission denied (" + b.username +" is not admin/viewer) for getFiles");
  if(!b.projectName)
    return htmlError(par, "projectName parameter missing");
  var dataid = "/projects/"+b.projectName+"/%";

  var sql = "SELECT dataid,comment,octet_length(bigdata) as size_in_bytes,importOverwrite,modified,modifiedby "+
                "FROM kipus_bigdata WHERE dataid LIKE ?";
  pool.getConnection(function(err, connection) {
  connection.query(sql, 
      [ dataid ], function(err, rows){
      if(err)  {
        return htmlError(par, "" + err);
      }
      connection.release();
      return res.end(JSON.stringify({files:rows}));
    });
  });
}

//////////////////////////////////////////
// - fileName (mandatory)
function
deleteFile(req, res, next)
{
  log("deleteFileFromDB");
  var b = req.body;
  var par = { req:req, res:res, next:next };

  if(!mods.auth.isAdmin(b.username))
    return htmlError(par, "Permission denied (" + b.username +" is not admin) for deleteFile");
  if(!b.fileName)
    return htmlError(par, "fileName parameter missing");
  if(b.fileName.indexOf("/projects/") != 0)
    return htmlError(par, "fileName wrong format (/projects/ missing)");
  var sql = "DELETE FROM kipus_bigdata WHERE dataid=?";
  pool.getConnection(function(err, connection) {
  connection.query(sql, 
      [ b.fileName ], function(err, delRes){
      if(err)  {
        return htmlError(par, "" + err);
      }
      connection.release();
      return res.end(JSON.stringify({}));
    });
  });
}

//////////////////////////////////////////
// uploadFile parameters:
// - fileName (mandatory)
// - projectName (mandatory)
// - data as bas64 encoded string (mandatory)
// - icon as bas64 encoded string (optional)
// - as_user overwrite modifiedby, used by xliffedit (optional)
function
uploadFile(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next };
  if(!mods.auth.isAdmin(b.username))
    return htmlError(par, "Permission denied (" + b.username +" is not admin) for uploadFile");
  if(!b.fileName)
    return htmlError(par, "fileName parameter missing");
  if(!b.projectName)
    return htmlError(par, "projectName parameter missing");
  if(!b.data)
    return htmlError(par, "data parameter missing");
  var name = b.fileName;
  name = name.replace(/[^A-Za-z\.0-9]/g, "_");
  b.data = b.data.replace(/^data:.*;base64,/, "");
  b.data = b.data.replace(/ /g, '+');

  var dataBuf = new Buffer(b.data, 'base64');
  var iconBuf = null;
  if (b.icon) {
    b.icon = b.icon.replace(/^data:.*;base64,/, "");
    b.icon = b.icon.replace(/ /g, '+');
    iconBuf = new Buffer(b.icon, 'base64');
  }
  var dataid = "/projects/"+b.projectName+"/"+name;
  var sql = "INSERT INTO kipus_bigdata "+ 
              "(dataid,comment,icon,bigdata,modified,modifiedby) "+
              "VALUES (?,?,?,?,?,?) "+
            "ON DUPLICATE KEY UPDATE "+
              "comment=?,icon=?,bigdata=?,modified=?,modifiedby=?";
  pool.getConnection(function(err, connection) {
  connection.query(sql, 
    [ dataid, name, iconBuf, dataBuf, now(),
      (b.as_user ? b.as_user : req.body.username),
      name, iconBuf, dataBuf, now(),
      (b.as_user ? b.as_user : req.body.username) ],
    function(err, insRes){
      if(err)  {
        return htmlError(par, "" + err);
      }
      connection.release();
      return res.end(JSON.stringify({fileName:name}));
    });
  });
}

//////////////////////////////////////////
// - projectId (mandatory)
function
checkProject(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next, withLookupData:1,
              withProject:1, project:b.projectName };
  if(!mods.auth.isAdmin(b.username) &&
     !mods.auth.isViewer(b.username))
    return htmlError(par, "Permission denied (" + b.username +
        " is not admin/viewer) for checkProject");
  if(!b.projectId)
    return htmlError(par, "projectId parameter missing");
  if(!b.projectName)
    return htmlError(par, "projectName parameter missing");
  if (b.checkOnlyColumn)
    par.checkOnlyColumn = b.checkOnlyColumn;
  pool.getConnection(function(err, connection) {
    // set parameter to keep connection alive, 
    // otherwise function createBookDefinition releases par.connection
    par.keepConnectionAlive = 1;
    par.connection = connection;
    if(err) 
      return myHtmlError(par, "checkProject: "+err);
    doCheckProject(par, 0);
  });
}

function
kps_tableCopyParseParam(cDef)
{
  if(!cDef.constraintparam)
    return {};
  var cp = cDef.constraintparam.split(" "), ch={};
  for(var i1=0; i1<cp.length; i1++) {
    var o = cp[i1].indexOf(':');
    if(o > 0)
      ch[cp[i1].substr(0,o)] = cp[i1].substr(o+1);
  }
  return ch;
}

function
doCheckProject(par, status)
{
  var sTxt = { 
    0:"getDefinitions",
    1:"checkSingleFromTable/MultiFromTable",
    2:"checkTranslation Files",
    3:"checkEmptyValues",
    4:"checkColumns",
    5:"returnReport"
  };

  log("    step "+status+" ("+sTxt[status]+")");
  var b = par.req.body;

  if(status == 0) { // getOldDefinitions
    par.report=[];

    var sql = "select * from kipus_projectbooks where projectid in "+
                "(select id from kipus_projects where name=?)";
    par.connection.query(sql , [par.project],
    function(err, rows) {
      if(err) 
        return myHtmlError(par, ""+err);
      par.bdefList = rows;
      return mods.bookDefinitions.createBookDefinition(par, 1, function () {
        par.oldDef = par.ret;
        mods.bookDefinitions.kps_digestBookdef(par.ret);
        if (par.checkOnlyColumn)
          return doCheckProject(par, 4);
        else
          return doCheckProject(par, status+1);
      });
    });
    return;
  }

  if(status == 1) { // check singleFromTable/multiFromTable
    var tables = par.ret.tables;
    var projectName = par.ret.projects[0].name;
    for (var i=0; i<par.ret.pagedefinition.length; i++) {
      // add BODY and HEADER tables to tables to check
      var pd = par.ret.pagedefinition[i];
      tables[pd.tablename] = 1; 
    }
    for (var i=0; i<par.ret.pageattributes.length; i++) {
      var attr = par.ret.pageattributes[i];
      if (attr.constrainttype != "singleFromTable" &&
          attr.constrainttype != "multiFromTable")
        continue;
      if(!attr.constraintparam) {
        par.report.push("constraintparam is empty in " + projectName +
                        "-> " + booktitle + " -> " + pagetitle + " -> " + 
                        attr.columnname);
        continue;
      }

      var table = attr.constraintparam.split(" ")[0];
      if (!tables[table]) {
        var booktitle = "";
        var pagetitle = "";
        var bookid = null;
        for (var j=0; j<par.ret.pagedefinition.length; j++) {
          var pd = par.ret.pagedefinition[j];
          if (pd.id != attr.pagedefid)
            continue;
          pagetitle = pd.displayname;
          break;
        }
        for (var j=0; j<par.ret.bookpages.length; j++) {
          var bp = par.ret.bookpages[j];
          if (bp.pagedefid != attr.pagedefid)
            continue;
          bookid = bp.bookdefid;
          break;
        } 
        if (bookid)
        for (var j=0; j<par.ret.bookdefinition.length; j++) {
           var book = par.ret.bookdefinition[j];
           if (book.id != bookid)
             continue;
           booktitle = book.title;
           break;
        }
        par.report.push("referenced table does not exist in " + projectName +
                        "-> " + booktitle + " -> " + pagetitle + " -> " + 
                        attr.columnname + " ("+attr.constraintparam+")");
      }
    }
    return doCheckProject(par, status+1);
  }

  if(status == 2) { // check translation files
    var projectName = par.ret.projects[0].name;
    var regexp = "^/projects/"+projectName+"/.*_..\.xml$";
    var sql = "SELECT dataid FROM kipus_bigdata WHERE dataid REGEXP ?";
    par.connection.query(sql , [regexp],
    function(err, rows) {
      if(err) 
        return myHtmlError(par, ""+err);
      var trans = {};
      var customExists = false;
      for (var i=0; i<rows.length; i++) {
        var dataid = rows[i].dataid;
        if (!dataid.match(/_..\.xml/))
           continue;
        var lang = dataid.substring(dataid.lastIndexOf("_")+1,
                   dataid.lastIndexOf("."));
        if (!trans[lang])
          trans[lang] = {};
        if (dataid.match(/project_..\.xml/)) {
          trans[lang].project = 1; 
        }
        if (dataid.match(/kipus_..\.xml/)) {
         trans[lang].kipus = 1; 
        }
        if (dataid.match(/custom_..\.xml/)) {
         trans[lang].custom = 1; 
         customExists = true;
        }
      }
      for (var lang in trans) {
        if (!trans[lang].project)
          continue;
        if (!trans[lang].kipus && lang != "en")
          par.report.push("kipus_"+lang+".xml does not exist in " +projectName);
        if (customExists && !trans[lang].custom)
          par.report.push("custom_"+lang+".xml does not exist in "+projectName);
      }
      return doCheckProject(par, status+1);
    });
  }
  if(status == 3) { // check mandatory and singleFromTable/singleFromValue, if data is not null
    var cols2Check = {};
    var projectName = par.ret.projects[0].name;
    var columns = {};
    var todo = 0;
    for (var i=0; i<par.ret.pagedefinition.length; i++) {
      var pd = par.ret.pagedefinition[i];
      for (var j=0; j<par.ret.pageattributes.length; j++) {
        var pa = par.ret.pageattributes[j];
        if (pa.pagedefid != pd.id)
          continue;
        if (pa.constrainttype != "singleFromTable" &&
            pa.constrainttype != "singeFromValue" &&
            pa.inputtype.indexOf("mandatory") < 0)
          continue;

        if(pa.inputtype.indexOf("mandatory") < 0 &&
          pa.showif != undefined) // ignore showif
          continue;
        if (!cols2Check[pd.tablename])
          cols2Check[pd.tablename] = {};
        cols2Check[pd.tablename][pa.columnname] = pa.inputtype == "mandatory"? pa.inputtype:pa.constrainttype;
        todo++;
      }
    }

    if(Object.keys(cols2Check).length == 0)
      return doCheckProject(par, status+1);
    for(var tablename in cols2Check) {
      for(var colname in cols2Check[tablename]) {
        var sql = "SELECT count(*) as count FROM " + tablename + " WHERE "+colname + " is NULL";
         (function(tablename, colname){
           par.connection.query(sql, function(err, rows){
               if(err)
                 return myHtmlError(par, ""+err);
/* RKO: Disabled, as too many reported problems
               if (rows[0].count > 0)
                 par.report.push(rows[0].count + (rows[0].count==1?" row with null value":" rows with null values") +
                                 " found in "+projectName+ ", table " + tablename+", column " + colname+ 
                                 " ("+cols2Check[tablename][colname]+")");
*/
               if (--todo == 0)
                 return doCheckProject(par, status+1);
           });
         })(tablename, colname);
      }
    }
  }

  if(status == 4) { // check same column names over project
    var projectName = par.ret.projects[0].name;
    var columns = {};
    for (var i=0; i<par.ret.pagedefinition.length; i++) {
      var booktitle = "";
      var bookid = null;
      var pd = par.ret.pagedefinition[i];
      if (pd.pagetype != "HEADER" && pd.pagetype != "BODY")
        continue;
      for (var j=0; j<par.ret.bookpages.length; j++) {
        var bp = par.ret.bookpages[j];
        if (bp.pagedefid != pd.id)
          continue;
        bookid = bp.bookdefid;
        break;
      } 
      if(bookid) {
        for (var j=0; j<par.ret.bookdefinition.length; j++) {
           var book = par.ret.bookdefinition[j];
           if (book.id != bookid)
             continue;
           booktitle = book.title;
           break;
        }
      }

      var paHash = {}, paArr = par.ret.pageattributes;
      for(var j=0; j<paArr.length; j++)
        paHash[paArr[j].columnname] = paArr[j];
        
      for(var j=0; j<paArr.length; j++) {
        var pa = paArr[j];
        if (pa.pagedefid != pd.id)
          continue;
        var dest = projectName+" -> "+booktitle+
                   " -> "+pd.displayname+" -> "+pa.columnname;

        if (par.checkOnlyColumn) {
          if (par.checkOnlyColumn == pa.columnname) 
            par.report.push("column already exists in " +dest);
          continue;
        } else {
          if (!columns[pa.columnname])
            columns[pa.columnname] = [];
          columns[pa.columnname].push("duplicate column exists in "+dest);
        }

        if((pa.constrainttype == 'singleFromArg' ||
            pa.constrainttype == 'multiFromArg') &&
            !pa.constraintparam) {
          par.report.push("Constraint parameter empty in "+dest);
        }

        if(pa.constrainttype=='tableRows' || pa.constrainttype=='tableCopy') {
          var ch = kps_tableCopyParseParam(pa);
          if(!ch.prefix)
            par.report.push("prefix parameter missing in "+dest);
          if(!ch.target)
            par.report.push("target parameter missing in "+dest);
    
          if(ch.target && !par.ret.tables[ch.target])
            par.report.push("nonexisting target "+ch.target+" in "+dest);

          if(ch.prefix && !paHash[ch.prefix+"TARGETID"])
            par.report.push(ch.prefix+
                "TARGETID column missing, referenced in "+dest);
          if(ch.prefix && !paHash[ch.prefix+"INDEX"])
            par.report.push(ch.prefix+
                "INDEX column missing, referenced in "+dest);
        }


        if(pa.showif) {
          var si = pa.showif.split(/[:=!]/, 3);
          var sc = par.ret.cols[si[0]];
          if(sc) {
            if(si.length == 3) {
              if(sc.constrainttype != 'singleFromTable') {
                par.report.push("Showif destination is not of type "+
                                "singleFromTable in  "+dest);
              } else if(sc.constraintparam) {
                var t = sc.constraintparam.split(" ");
                var tbl = par.ret.tbldef[t[0]];
                if(!tbl) {
                  par.report.push(
                        "Showif destination table does not exist in "+dest);
                } else {
                  if(tbl.pagetype != "CP_LOOKUP") { // cols is not filled 
                    var fnd=0;
                    for(var i1=0; i1<tbl.cols.length; i1++)
                      if(tbl.cols[i1].columnname == si[1])
                        fnd++;
                    if(!fnd) {
                      par.report.push("Showif destination table "+tbl.tablename+
                          +" has no column "+si[1]+" in "+dest);
                    }
                  }
                }
              }
            }
          } else {
            par.report.push("Showif references unknown column in "+dest);
          }
        }
      }
    }
    if(par.checkOnlyColumn)
      return doCheckProject(par, status+1);

    for (var column in columns) {
      if (columns[column].length > 1)
        par.report.push(columns[column].join("<br>"));
    }
    return doCheckProject(par, status+1);
  }

  if(status == 5) { // return report
    par.connection.release();
    return par.res.end(JSON.stringify(par.report));
  }
}

//////////////////////////////////////////
// - projectId (mandatory)
function
deleteProject(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next, withLookupData:1, withProject:1, project:b.projectName };
  if(!mods.auth.isAdmin(b.username) &&
     !mods.auth.isViewer(b.username))
    return htmlError(par, "Permission denied (" + b.username +
                        " is not admin/viewer) for deleteProject");
  if(!b.projectId)
    return htmlError(par, "projectId parameter missing");
  if(!b.projectName)
    return htmlError(par, "projectName parameter missing");
  log("projectId="+b.projectId);
  log("projectName="+b.projectName);
  pool.getConnection(function(err, connection) {
    par.connection = connection;
    if(err) 
      return myHtmlError(par, "deleteProject: "+err);
    // set parameter to keep connection alive, 
    // otherwise function createBookDefinition releases par.connection
    par.keepConnectionAlive = 1;
    par.connection.beginTransaction(function(err) {
      if(err)
        return myHtmlError(par, ""+err);
      par.inTransaction = true;
      return doDeleteProject(par, 0);
    });
  });
}

function
doDeleteProject(par, status)
{
  if(status == 0) { // projectbooks
    var sql = "select * from kipus_projectbooks where projectid=?";
    par.connection.query(sql , [par.req.body.projectId],function(err, rows) {
        if(err) 
          return myHtmlError(par, ""+err);
        par.bdefList = rows;
        par.includeRows = true;
        return mods.bookDefinitions.createBookDefinition(par, 1, function () {
          return doDeleteProject(par, status+1);
        });
      });
  } 
  if (status == 1) { // delete projectbooks
    var sql = "DELETE FROM kipus_projectbooks WHERE projectid = ?";
    par.connection.query(sql, [par.req.body.projectId], function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 2) { // retrieve userrights
    var sql = "SELECT U.login,rights FROM kipus_user U,kipus_userprojects UP WHERE U.login = UP.login and UP.projectid = ?";
    par.connection.query(sql, [par.req.body.projectId], function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        par.urights = rows;
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 3) { // retrieve roles to delete and remove from user permissions
    var sql = "SELECT id FROM kipus_roles WHERE projectid = ?";
    par.connection.query(sql, [par.req.body.projectId], function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        par.roles = [];
        for (var i=0; i<rows.length; i++) {
          par.roles.push(rows[i].id.toString());    
        }
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 4) { // update userrights
    if (par.urights.length == 0 || par.roles.length == 0)
      return doDeleteProject(par, status+1);
    for(var rIdx=0; rIdx<par.urights.length; rIdx++) {
      (function(rIdx){
          var login = par.urights[rIdx].login;
          var rights = par.urights[rIdx].rights.split(" ");
          var nrights = [];
          for (var i=0; i<rights.length; i++) {
            var roleid = rights[i].split(":")[0];
            if (par.roles.indexOf(roleid) >= 0)
              continue; 
            nrights.push(rights[i]);
          } 
          if (rights.length != nrights.length) {
            var sql = "UPDATE kipus_user SET rights=? WHERE login=?";
            par.connection.query(sql,[nrights.join(" "),login], function(err, rows){
                if(err)
                  return myHtmlError(par, ""+err);
                if (rIdx == par.urights.length -1)
                  return doDeleteProject(par, status+1);
            });
          } else {
            if (rIdx == par.urights.length -1)
              return doDeleteProject(par, status+1);
          }
      })(rIdx);
    }

  }
  if (status == 5) { // delete userprojects
    var sql = "DELETE FROM kipus_userprojects WHERE projectid = ?";
    par.connection.query(sql, [par.req.body.projectId], function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 6) { // bigdata (projectFiles)
    if (!par.ret.projectFiles || par.ret.projectFiles.length == 0)
      return doDeleteProject(par, status+1);
    var sql = "DELETE FROM kipus_bigdata WHERE dataid IN (";
    for (var i=0; i<par.ret.projectFiles.length;i++) {
       sql += par.connection.escape("/"+par.ret.projectFiles[i]);
       if (i < par.ret.projectFiles.length-1)
         sql += ",";
       else
         sql += ")";
    }
    par.connection.query(sql, function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 7) { // bigdata (table images)
    if (par.ret.pagedefinition.length == 0)
      return doDeleteProject(par, status+1);
    for(var rIdx=0; rIdx<par.ret.pagedefinition.length; rIdx++) {
      (function(rIdx){
          var dataid = par.ret.pagedefinition[rIdx].tablename+"/%";
          var sql = "DELETE FROM kipus_bigdata WHERE dataid LIKE ?";
          par.connection.query(sql,[dataid], function(err, rows){
              if(err)
                return myHtmlError(par, ""+err);
              if (rIdx == par.ret.pagedefinition.length -1)
                return doDeleteProject(par, status+1);
          });
      })(rIdx);
    }
  }
  if (status == 8) { // kipus_rows
    if (par.ret.bookdefinition.length == 0)
      return doDeleteProject(par, status+1);
    var sql = "DELETE FROM kipus_rows WHERE bookdefid IN (";
    for (var i=0; i<par.ret.bookdefinition.length;i++) {
       sql += par.connection.escape(par.ret.bookdefinition[i].id);
       if (i < par.ret.bookdefinition.length-1)
         sql += ",";
       else
         sql += ")";
    }
    par.connection.query(sql, function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 9) { // pageattributes
    if (par.ret.pagedefinition.length == 0)
      return doDeleteProject(par, status+1);
    var sql = "DELETE FROM kipus_pageattributes WHERE pagedefid IN (";
    for (var i=0; i<par.ret.pagedefinition.length;i++) {
       sql += par.connection.escape(par.ret.pagedefinition[i].id);
       if (i < par.ret.pagedefinition.length-1)
         sql += ",";
       else
         sql += ")";
    }
    par.connection.query(sql, function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 10) { // bookpages
    if (par.ret.bookdefinition.length == 0)
      return doDeleteProject(par, status+1);
    var sql = "DELETE FROM kipus_bookpages WHERE bookdefid IN (";
    for (var i=0; i<par.ret.bookdefinition.length;i++) {
       sql += par.connection.escape(par.ret.bookdefinition[i].id);
       if (i < par.ret.bookdefinition.length-1)
         sql += ",";
       else
         sql += ")";
    }
    par.connection.query(sql, function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 11) { // pagedefinition
    if (par.ret.pagedefinition.length == 0)
      return doDeleteProject(par, status+1);
    var sql = "DELETE FROM kipus_pagedefinition WHERE id IN (";
    var pd = par.ret.pagedefinition;
    for (var i=0; i<pd.length;i++) {
       sql += par.connection.escape(pd[i].id);
       if (i < pd.length-1)
         sql += ",";
       else
         sql += ")";
    }
    par.connection.query(sql, function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 12) { // bookdefinition parentbookid (set null to remove fk)
    if (par.ret.bookdefinition.length == 0)
      return doDeleteProject(par, status+1);
    var sql = "UPDATE kipus_bookdefinition SET parentbookid=NULL WHERE id IN (";
    for (var i=0; i<par.ret.bookdefinition.length;i++) {
       sql += par.connection.escape(par.ret.bookdefinition[i].id);
       if (i < par.ret.bookdefinition.length-1)
         sql += ",";
       else
         sql += ")";
    }
    par.connection.query(sql, function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 13) { // bookdefinition
    if (par.ret.bookdefinition.length == 0)
      return doDeleteProject(par, status+1);
    var sql = "DELETE FROM kipus_bookdefinition WHERE id IN (";
    for (var i=0; i<par.ret.bookdefinition.length;i++) {
       sql += par.connection.escape(par.ret.bookdefinition[i].id);
       if (i < par.ret.bookdefinition.length-1)
         sql += ",";
       else
         sql += ")";
    }
    par.connection.query(sql, function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 14) { // delete external tables
    var sql = "DELETE FROM kipus_external WHERE projectid = ?";
    par.connection.query(sql, [par.req.body.projectId], function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 15) { // delete roles
    var sql = "DELETE FROM kipus_roles WHERE projectid = ?";
    par.connection.query(sql, [par.req.body.projectId], function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 16) { // delete projects
    var sql = "DELETE FROM kipus_projects WHERE id = ?";
    par.connection.query(sql, [par.req.body.projectId], function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        return doDeleteProject(par, status+1);
    });
  }
  if (status == 17) { // tables
    var pd = par.ret.pagedefinition;
    if (pd.length == 0)
      return doDeleteProject(par, status+1);
    var tHash = {};
    for (var i=0; i<pd.length;i++)
      if(pd[i].pagetype != 'CP_LOOKUP')
        tHash[pd[i].tablename] = 1;
    var sql = "DROP TABLE IF EXISTS "+Object.keys(tHash).join(",");
    par.connection.query(sql, function(err, rows){
        if(err)
          return myHtmlError(par, ""+err+", SQL:"+sql);
        return doDeleteProject(par, status+1);
    });
  }
  if(status == 18) {                                     // callback & return
    par.connection.commit(function(err) { 
      if(err) {
        log("WARNING: commit error " + err); 
      } else {
        log("transaction committed");
      }
      par.connection.release();
      return par.res.end(JSON.stringify({}));
    });
  }
}

//////////////////////////////////////////
// uploadFile parameters:
// - projectId (mandatory)
// - projectName (mandatory)
function
downloadProject(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next };

  if(!mods.auth.isAdmin(b.username) &&
     !mods.auth.isViewer(b.username)) {
    return htmlError(par, "Permission denied (" + b.username +
                          " is not admin/viewer) for downloadProject");
  }

  if(!b.projectId)
    return htmlError(par, "projectId parameter missing");
  if(!b.projectName)
    return htmlError(par, "projectName parameter missing");
  var userFolderName = "user";
  par.datadump = "";
  par.datadumpu = "";
  pool.getConnection(function(err, connection) {
    par.connection = connection;
    if(err) 
      return myHtmlError(par, "downloadProject: "+err);
    // set parameter to keep connection alive, 
    // otherwise function createBookDefinition releases par.connection
    par.keepConnectionAlive = 1;
    par.deleteCols = b.deleteCols;
    par.project = b.projectName; 
    if(b.asExcel)
      return dataAsExcel(par);
    return doDownloadProject(par, 0, function() {
      var projectName = par.req.body.projectName;
      log("zipping project "+projectName);
      var zip = new require('node-zip')();
      zip.folder(projectName);
      if (b.includeUserdata) {
        zip.folder(projectName+"/"+userFolderName);
        if (par.datadumpu)
            zip.file(projectName+"/"+userFolderName+"/"+
                     projectName+".datadump.csv", par.datadumpu);
        if (par.csvu) {
           var files = Object.keys(par.csvu);
           for (var i=0; i<files.length; i++) {
              if (par.csvu[files[i]].length > 0)
              zip.file(projectName+"/"+userFolderName+"/"+
                       files[i]+".csv", par.csvu[files[i]]);
           }
        }
      }
      if (par.ret) {
        zip.file(projectName+"/"+projectName+".kipus", 
                 JSON.stringify(par.ret, null, 2)); // spacing level = 2
        try {
          var readme = fs.readFileSync("../doc/README.projectexport.txt");
          zip.file(projectName+"/README.projectexport.txt", readme);
        } catch(e) {
          log("Error:"+e);
        }
      }

      if (par.datadump)
          zip.file(projectName+"/"+projectName+".datadump.csv", par.datadump);
      if (par.csv) {
         var files = Object.keys(par.csv);
         for (var i=0; i<files.length; i++) {
            if (par.csv[files[i]].length > 0)
            zip.file(projectName+"/"+files[i]+".csv", par.csv[files[i]]);
         }
      }
      var fileName = "/export/"+projectName+".zip";
      var data = zip.generate({ type:'string',
                                base64:false,
                                compression:'DEFLATE'});
      fs.writeFileSync(cfg.htmlDir+fileName, data, 'binary');
      par.res.end(JSON.stringify({fileName:fileName}));
    });
  });
}

function
dataAsExcel(par)
{
  var b = par.req.body;

  function
  kps_tableCopyParseParam(cDef)
  {
    if(!cDef.constraintparam)
      return {};
    var cp = cDef.constraintparam.split(" "), ch={};
    for(var i1=0; i1<cp.length; i1++) {
      var o = cp[i1].indexOf(':');
      if(o > 0)
        ch[cp[i1].substr(0,o)] = cp[i1].substr(o+1);
    }
    return ch;
  }

  if(!par.tblDef) {
    par.connection.query("select * from kipus_pagedefinition",[],
    function(err, rows) {
      if(err) 
        return myHtmlError(par, ""+err);
      par.tblDef = {};
      par.colsPerTable = {};
      for(var i1=0; i1<rows.length; i1++) {
        par.tblDef[rows[i1].tablename] = rows[i1];
        par.colsPerTable[rows[i1].id] = [];
      }
      return dataAsExcel(par);
    });
    return;
  }

  var retStr='\ufeff', separator='\t';
  function
  appendRow(row)
  {
    for(var i=0; i<row.length; i++)
      retStr += escapeCSV(row[i]) + (i<row.length-1 ? separator : '\r\n');
  }

  function
  escapeCSV(value)
  {
    var s = (value == undefined ? "" : String(value));
    if(s.indexOf(separator) != -1 || 
       s.indexOf('\n') != -1 ||
       s.indexOf('"') != -1) {
        s = '"'+s.replace(/\\\"/g, '\"\"')+'"';
    }
    return s;
  }

  if(!par.colDef) {
    par.connection.query(
    "select * from kipus_pageattributes order by columnorder",[],
    function(err, rows) {
      if(err) 
        return myHtmlError(par, ""+err);
      par.colDef = {};
      for(var i1=0; i1<rows.length; i1++) {
        par.colDef[rows[i1].columnname] = rows[i1];
        par.colsPerTable[rows[i1].pagedefid].push(rows[i1]);
      }
      return dataAsExcel(par);
    });
    return;
  }

  if(!par.tblToRead) {
    par.tblIdx = 0;
    par.tblToRead = [ b.excelTable ];
    par.tblContent = {};
    par.tblRowsData = {};
    par.tblRowsMax = {};

    par.mainTblCols = par.colsPerTable[par.tblDef[b.excelTable].id];
    for(var i1=0; i1<par.mainTblCols.length; i1++) {
      if(par.mainTblCols[i1].constrainttype == 'tableRows') {
        var ch = kps_tableCopyParseParam(par.mainTblCols[i1]);
        par.tblToRead.push(ch.target);
        par.tblDef[ch.target].ch = ch;
      }
    }

    if(b.lookupCol) {   // lookup-Tables
      par.luTbls={};
      par.luTblData = {};
      for(var i1=0; i1<par.tblToRead.length; i1++) {
        var tbl = par.tblToRead[i1];
        var tblCols = par.colsPerTable[par.tblDef[tbl].id];
        for(var i2=0; i2<tblCols.length; i2++) {
          var cDef = tblCols[i2];
          if(cDef.constrainttype != "singleFromTable" &&
             cDef.constrainttype != "multiFromTable")
            continue;
          par.luTbls[cDef.constraintparam.split(" ")[0]] = 1;
        }
      }
      for(var key in par.luTbls)
        par.tblToRead.push(key);
    }
    return dataAsExcel(par);
  }

  if(par.tblIdx < par.tblToRead.length) {
    var tbl = par.tblToRead[par.tblIdx++];
    var tgtName, idxName, orderBy = "modified";
    if(par.tblDef[tbl].ch) {
      tgtName = par.tblDef[tbl].ch.prefix+"TARGETID";
      idxName = par.tblDef[tbl].ch.prefix+"INDEX";
      orderBy = tgtName+","+idxName;
    }
    par.connection.query(
    "select * from "+tbl+" order by "+orderBy,[],
    function(err, rows) {
      if(err) 
        return myHtmlError(par, ""+err);
      par.tblContent[tbl] = rows;

      if(par.tblDef[tbl].ch) {  // tableRows
        var mh = {};
        for(var i1=0; i1<rows.length; i1++) {
          var r = rows[i1];
          var idx = r[idxName];
          if(idx == null)
            idx = 0;
          if(!mh[r[tgtName]])
            mh[r[tgtName]] = [];
          mh[r[tgtName]].push(r);
        }
        par.tblRowsData[tbl] = mh;

        var max = 0;
        for(key in mh)
          if(mh[key].length > max)
            max = mh[key].length;
        par.tblRowsMax[tbl] = max;
      }

      if(b.lookupCol && par.luTbls[tbl]) {
        par.luTblData[tbl] = {}
        for(var i1=0; i1<rows.length; i1++)
          par.luTblData[tbl][rows[i1].id] = rows[i1];
      }

      return dataAsExcel(par);
    });
    return;
  }

  var ignoreTypes = { foto:1, signature:1, groupheader:1, groupend:1 };

  // Header
  function
  pushHeader(hdrName, cDef)
  {
    if(par.deleteCols[cDef.columnname] || ignoreTypes[cDef.constrainttype])
      return;
    if(cDef.constrainttype != "multiFromTable" || !b.expandMulti)
      return out.push(hdrName);

    var luTbl = par.tblContent[cDef.constraintparam.split(" ")[0]];
    for(var i1=0; i1<luTbl.length; i1++)
      out.push(hdrName+"_"+luTbl[i1].DISPLAYNAME);
  }

  var retStr = '\ufeff'; // bom utf16le
  var out = [];
  for(var i2=0; i2<par.mainTblCols.length; i2++) {
    var cDef = par.mainTblCols[i2], cName = cDef.columnname;
    if(cDef.constrainttype == 'tableRows') {
      var ch = kps_tableCopyParseParam(cDef);
      var max = par.tblRowsMax[ch.target];
      var tblCols = par.colsPerTable[par.tblDef[ch.target].id];
      for(var i3=0; i3<max; i3++) {   // each subtable row
        for(var i4=0; i4<tblCols.length; i4++) {
          var scName = tblCols[i4].columnname;
          if(scName == ch.prefix+"TARGETID" ||
             scName == ch.prefix+"INDEX")
            continue;
          pushHeader(cName+"_"+(i3+1)+"_"+scName, tblCols[i4]);
        }
      }
    } else {
      pushHeader(cName, cDef);
    }
  }
  var colNum = out.length;
  appendRow(out);

  // Content
  function
  pushVal(r, name, cDef)
  {
    if(par.deleteCols[name] || ignoreTypes[cDef.constrainttype])
      return;

    if((!r || r[name] == undefined) &&
       !(cDef.constrainttype == "multiFromTable" && b.expandMulti))
      return out.push("");

    if(!b.lookupCol || cDef.constrainttype.indexOf("FromTable") < 0)
      return out.push(r[name]);

    var luTbl = par.luTblData[cDef.constraintparam.split(" ")[0]];
    if(cDef.constrainttype == "singleFromTable") {
      if(luTbl[r[name]] == undefined)
        return out.push("DELETED:"+r[name]);
        
      var val = luTbl[r[name]][b.lookupCol];
      if(val == undefined)
        log("UNDEFINED "+name+" "+cDef.constraintparam+" "+
            r[name]+" "+b.lookupCol);
      return out.push(val);
    }

    // multiFromTable
    var val = (r ? r[name] : "");
    if(val == undefined)
      val = "";
    var ma = val.split(","); 
    if(b.expandMulti) {
      var maLu = {};
      for(var i1=0; i1<ma.length; i1++)
        maLu[ma[i1]] = 1;
      luTbl = par.tblContent[cDef.constraintparam.split(" ")[0]];
      for(var i1=0; i1<luTbl.length; i1++)
        out.push(maLu[luTbl[i1].id] ? "1" : "");
      
    } else {
      var ret=[];
      for(var i1=0; i1<ma.length; i1++) {
        var val = luTbl[ma[i1]][b.lookupCol];
        if(val == undefined)
          log("UNDEFINED "+name+" "+cDef.constraintparam+" "+
              ma[i1]+" "+b.lookupCol);
        ret.push(val);
      }
      out.push(ret.join(","));
    }
  }

  var tbl = par.tblContent[b.excelTable];
  for(var i1=0; i1<tbl.length; i1++) {
    var r=tbl[i1]; out=[];

    for(var i2=0; i2<par.mainTblCols.length; i2++) {
      var cDef = par.mainTblCols[i2], cName = cDef.columnname;

      if(cDef.constrainttype == 'tableRows') {
        var ch = kps_tableCopyParseParam(cDef);
        var max = par.tblRowsMax[ch.target];
        var tblCols = par.colsPerTable[par.tblDef[ch.target].id];
        var mh = par.tblRowsData[ch.target][r[cName]];
        for(var i3=0; i3<max; i3++) {         // each subtable row
          var r2 = (mh ? mh[i3] : undefined); // mh[i3] may also be empty
          for(var i4=0; i4<tblCols.length; i4++) {
            var scName = tblCols[i4].columnname;
            if(scName == ch.prefix+"TARGETID" ||
               scName == ch.prefix+"INDEX")
              continue;
            pushVal(r2, scName, tblCols[i4]);
          }
        }
      } else {
        pushVal(r, cName, cDef);

      }
    }
    appendRow(out);
  }

  var fileName = "/export/"+b.projectName+".csv";
  log("dataAsExcel: "+fileName+", "+retStr.length+" chars, "+colNum+" cols");
  fs.writeFileSync(cfg.htmlDir+fileName, retStr, 'utf16le');
  par.connection.release();
  par.res.end(JSON.stringify({fileName:fileName}));
}

function
doDownloadProject(par, status, callbackFn)
{
  var sTxt = { 
    0:"retrieveBookdefinition",
    1:"retrieveBigdata",
    2:"retrieveCsvTables",
    3:"commit",
  };

  log("    step "+status+" ("+sTxt[status]+")");
  if(status == 0) { // projectbooks
    var sql = "select * from kipus_projectbooks where projectid=?";
    par.connection.query(sql , [par.req.body.projectId],function(err, rows) {
        if(err) 
          return myHtmlError(par, ""+err);
        par.bdefList = rows;
        par.includeRows = true;
        par.includeEmpty = true;
        return mods.bookDefinitions.createBookDefinition(par, 1, function () {
          if(!par.req.body.includeUserdata)
            delete par.ret.kipus_rows;
          return doDownloadProject(par, status+1, callbackFn);
        });
      });
  } 
  if (status == 1) { // datadump
    var dataid = "/projects/"+par.req.body.projectName+"/%";
    var sql = "SELECT * FROM kipus_bigdata WHERE dataid LIKE ?";
    par.connection.query(sql, [dataid], function(err, rows){
        if(err)
          return myHtmlError(par, ""+err);
        var sep=";";
        for (var i=0; i<rows.length;i++) {
          par.datadump += rows[i].dataid + sep +
                        rows[i].comment + sep +
                        rows[i].importOverwrite + sep;
          if (rows[i].icon)
            par.datadump += rows[i].icon.toString("base64");
          par.datadump += sep;
          if (rows[i].bigdata)
            par.datadump += rows[i].bigdata.toString("base64");
          par.datadump  += "\n";
        }
        return doDownloadProject(par, status+1, callbackFn);
    });
  }
  if (status == 2) { // csv tables
    par.csv = {};
    par.csvu = {};
    par.bigdata = {};
    par.tableNames =  {}
    par.tableNamesu =  {}
    for (var i=0; i<par.ret.pagedefinition.length; i++) {
       var pd = par.ret.pagedefinition[i];
       if(pd.pagetype == "CP_LOOKUP")
         continue;
        if (!par.req.body.includeUserdata &&
            !(pd.pagetype == "LOOKUP" || pd.pagetype == "EXTERNAL"))
          continue;
       var tablename = pd.tablename;
       if(pd.pagetype == "LOOKUP" || pd.pagetype == "EXTERNAL")
         par.tableNames[tablename] = 1;
       else
         par.tableNamesu[tablename] = 1;
    }
    return mods.tableOps.doTableCsvExport(par, 0, function() {
      return doDownloadProject(par, status+1, callbackFn);
    });
  }

  if (status == 3) {                                     // callback & return
    par.connection.release();
    if(callbackFn)
      callbackFn();
    else
      return par.res.end(JSON.stringify({}));
  }
}

//////////////////////////////////////////
// importProject parameters:
// - data (mandatory)
function
importProject(req, res, next)
{
  var b = req.body;
  var ts =  req.url.split("?")[1];
  log("importProject " + ts);
  if (iCallHash[ts]) {
    iCallHash[ts] = res;
    log("import already pending");
    return;
  }
  var par= { req:req, res:res, next:next };
  if(!mods.auth.isAdmin(b.username))
    return htmlError(par, "Permission denied (" + b.username
                +" is not admin) for importProject");

  if(!b.data)
    return htmlError(par, "data parameter missing");
  b.data = b.data.replace(/^data:.*;base64,/, "");
  b.data = b.data.replace(/ /g, '+');
  var zip = null;
  try {
    var dataBuf = new Buffer(b.data, 'base64');
    zip = new require('node-zip')(dataBuf,
                          {type:'string', base64: false , checkCRC32:true});
  } catch (e) {
    return htmlError(par, "Error reading zip file");
  }
  var files = Object.keys(zip.files);
  var projectName = "";
  var userFolderName = "user";
  for (var i=0; i<files.length; i++) {
    if (files[i].lastIndexOf("/") == files[i].length - 1)
      projectName = files[i].substring(0, files[i].length -1);
  }

  if(projectName.indexOf(userFolderName) > 0)
    projectName = projectName.substring(0,
                        projectName.indexOf(userFolderName) -1);

  if(projectName == "")
    return htmlError(par, "could not retrieve projectName from zip file");


  var kipusFile = projectName + "/" + projectName+".kipus";
  if(!zip.files[kipusFile])
    return htmlError(par, "could not retrieve kipus file from zip file");
  var encoding = "binary";
  var decoding = "utf8";
  if(b.changeNameTo)
    log("CHANGING "+projectName+" TO "+b.changeNameTo+".");
  par.project = b.changeNameTo ? b.changeNameTo : projectName;

  try {
    var s = new Buffer(zip.files[kipusFile]._data, encoding).toString(decoding);
    if(b.changeNameTo) {
      var r = new RegExp("\\b"+projectName+"\\b","g");
      s = s.replace(r, b.changeNameTo);
    }
    par.newDef = JSON.parse(s);
    par.projectInfo = Object.assign({}, par.newDef.projects[0]);
  } catch (e) {
    return htmlError(par, "could not parse kipus file inside zip file");
  }

  var datadumpFile = projectName + "/" + projectName+".datadump.csv";
  if(zip.files[datadumpFile]) {
    par.datadump = new Buffer(zip.files[datadumpFile]._data, encoding).toString(decoding);
    if(b.changeNameTo) {
      var r = new RegExp("\\b"+projectName+"\\b","g");
      par.datadump = par.datadump.replace(r, b.changeNameTo);
    }
  }

  if(b.overwriteProject && b.replaceUserdata)
    return htmlError(par, "Overwriting project with userdata is not supported");
  if(b.replaceUserdata) {
    datadumpFile = projectName+"/"+userFolderName+"/"+projectName+".datadump.csv";
    if(zip.files[datadumpFile]) 
      par.datadumpu = new Buffer(zip.files[datadumpFile]._data, encoding).toString(decoding);
  }

  par.csv={}; par.csvu={}; par.tableCols={};

  for(var i=0; i<files.length; i++) {
    if(files[i].lastIndexOf(".csv") == files[i].length - 4) {
      if(files[i].lastIndexOf("datadump.csv") > 0)
        continue;
      if(files[i].lastIndexOf("kipus_rows.csv") > 0)
        // skip kipus_rows, not handled with csv anymore
        continue;

      var tablename = files[i];
      tablename = tablename.replace(projectName+"/"+userFolderName+"/", "");
      tablename = tablename.replace(projectName + "/", "");
      tablename = tablename.replace(".csv", "");

      var isUserdata = (files[i].indexOf(projectName+"/"+userFolderName+"/")
                        == 0);
      if(!isUserdata) {
        par.csv[tablename] = new Buffer(zip.files[files[i]]._data, encoding).toString(decoding);

      } else {
        if(!b.replaceUserdata)
          continue;
        else {
          par.csvu[tablename] = new Buffer(zip.files[files[i]]._data, encoding).toString(decoding);
        }
      }
    }
  }

  pool.getConnection(function(err, connection) {
    par.connection = connection;
    if(err) 
      return myHtmlError(par, "importProject: "+err);
    // set parameter to keep connection alive, 
    // otherwise function createBookDefinition releases par.connection
    par.keepConnectionAlive = 1;
    par.connection.beginTransaction(function(err) {
      if(err)
        return myHtmlError(par, ""+err);
      iCallHash[ts] = res;
      par.inTransaction = true;
      doImportProject(par, 0);
    });
  });
}

function
createDiffArr(par, oH,nH,itemName,colName, op,np, sId,sCn)
{
  var n2i ={}, del={}, add={};
  for(var i1=0; i1<oH.length; i1++) {
    var n = oH[i1][colName];
    if(op)
      n = op[oH[i1][sId]][sCn]+":"+n;
    del[n] = oH[i1];
    n2i[n] = oH[i1];
  }

  for(var i1=0; i1<nH.length; i1++) {
    var n = nH[i1][colName];
    if(np)
      n = np[nH[i1][sId]][sCn]+":"+n;
    if(!n2i[n])
      add[n] = nH[i1];
    delete del[n];
  }
  
  var aa = hashKeysAsArray(add);
  par.report.push(itemName+"s to add: "+aa.join(" "));

  var da = hashKeysAsArray(del);
  par.report.push(itemName+"s to delete: "+da.join(" "));

  var r = {};
  r[itemName+"2addHash"] = add; r[itemName+"2addArray"] = aa;
  r[itemName+"2delHash"] = del; r[itemName+"2delArray"] = da;
  r[colName+"2"+itemName] = n2i;
  return r;
}

function
colSqlType(n)
{
  var t = n.constrainttype;
  if(t == "foto")      return "LONGTEXT";
  if(t == "signature") return "LONGTEXT";
  if(t == "date")      return "DATE";
  if(t == "num")       return "DOUBLE";
  if(t == "multiLine") return "LONGTEXT";
  return "VARCHAR(255)";
}

function
modifyTable(gpar, par, callback)
{
  if(par.newIdx == undefined) {
    par.newIdx = par.oldIdx = 0; par.oldArr=[];
    for(var n in par.oldHash)
      par.oldArr.push(par.oldHash[n]);
  }

  var tbl = par.tbl;
  if(par.newIdx < par.newArr.length) {
    var n = par.newArr[par.newIdx++];
    var idx = n[par.mapCol], page;
    if(tbl == "kipus_pageattributes") {          // hack nr.1
      page = par.nPageHash[n.pagedefid];
      idx = page.tablename+":"+idx;
    }
    var data=[], cls=[], q=[], oid=par.map[idx];
    for(var c in n) {
      if(c == "id")
        continue;
      if(c == "parentbookid" && n[c])             // hack nr.2
        n[c] = par.idmap[n[c]];
      if(c == "pagedefid")                        // hack nr.3
        n[c] = par.page2id[n[c]];
      if(c == "rightdef" && n[c]) {               // hack nr.4
        var a = n[c].split(",");
        for(var i1=0; i1<a.length; i1++)
          if(gpar.book2id[a[i1]])
            a[i1] = gpar.book2id[a[i1]];
        n[c] = a.join(",");
      }
      if(c == "projectid")                        // hack nr.5
        n[c] = gpar.pr2id[gpar.newDef.projects[0].id];
      if(c == "bookdef_rights") {                 // hack nr.6
        var a = n[c].split(" ");
        for(var i1=0; i1<a.length; i1++) {
          var b = a[i1].split("=");
          if(gpar.book2id[b[0]])
            a[i1] = gpar.book2id[b[0]]+"="+b[1];
        }
        n[c] = a.join(" ");
      }
      if(tbl == "kipus_projects") { // hack nr.7
        if (c == "title")
          n[c] = "Import is still in progress, refresh site to see if import is finished"
        gpar.importPending = true;
      }
      data.push(n[c]);
      q.push(oid == undefined ? "?" : c+"=?");
      cls.push(c);
    }

    var where;
    if(oid != undefined) {
      if(tbl == "kipus_pageattributes") {
        par.idmap[n.id] = oid.id;
        where = "columnname=? and pagedefid=?"
        data.push(n.columnname);
        data.push(n.pagedefid);

      } else {
        par.idmap[n.id] = oid.id;
        data.push(oid.id);
        where="id=?";
      }
    }

    var sql = (oid == undefined ? 
            "insert into "+tbl+" ("+cls.join(",")+") values ("+q.join(",")+")" :
            "update "+tbl+" set "+q.join(",")+" where "+where);
    log("      "+tbl+(oid==undefined ? " insert ":" update ")+
                n[par.mapCol]+"/"+data.length);
    //log("      "+sql+" => "+data.join(", "));
    gpar.connection.query(sql , data ,function(err, insRes) {
      if(err)
        return myHtmlError(gpar, ""+err);
      if(oid == undefined)
        par.idmap[n.id] = insRes.insertId;
      var s2;
      if(oid == undefined && tbl == "kipus_pageattributes")
        s2 ="alter table "+page.tablename+
               " add column "+n.columnname+" "+colSqlType(n);
      if(oid == undefined && tbl == "kipus_pagedefinition" &&
         n.pagetype != "CP_LOOKUP") {

        s2 = "create table "+n.tablename+" ("+
                "id int primary key auto_increment,";
        if(n.pagetype == "LOOKUP")
          s2 += "deleted enum('YES','NO') DEFAULT 'NO' NOT NULL,";

        if(n.pagetype != "LOOKUP" && n.pagetype != "EXTERNAL")
          s2 += "rowid      varchar(255) NOT NULL,"+
                "bookid     varchar(255) NOT NULL,"+
                "rootbookid varchar(255) NOT NULL,";

        s2+= "modified   char(19),"+
             "modifiedby varchar(255))";
      }
      if(s2) {
        //log("      "+s2);
        gpar.connection.query(s2 , [] ,function(err, insRes) {
          if(err)
            return myHtmlError(gpar, ""+err);
          return modifyTable(gpar, par, callback);
        });

      } else {
        return modifyTable(gpar, par, callback);

      }
    });
    return;
  }

  if(par.oldIdx < par.oldArr.length) {
    var o = par.oldArr[par.oldIdx++], data=[], where;

    if(tbl == "kipus_pageattributes") {
      where = "columnname=? and pagedefid=?"
      data.push(o.columnname);
      data.push(o.pagedefid);

    } else {
      where = "id=?";
      data.push(o.id);
    }

    var sql = "delete from "+tbl+" where "+where;
    log("      "+sql+" => "+data.join(", "));
    gpar.connection.query(sql, data, function(err, ret) {
      if(err)
        return myHtmlError(gpar, ""+err);

      var s2;
      if(tbl == "kipus_pageattributes")
        s2 = "alter table "+par.oPageHash[o.pagedefid].tablename+
                  " drop column "+o.columnname;
      if(tbl == "kipus_pagedefinition")
        s2 = "drop table "+o.tablename;
      if(s2) {
        //log("      "+sql);
        gpar.connection.query(s2, [], function(err, ret) {
          if(err)
            return myHtmlError(gpar, ""+err);
          return modifyTable(gpar, par, callback);
        });

      } else {
        return modifyTable(gpar, par, callback);

      }
    });
    return;
  }
  callback();
}

function
doImportProject(par, status)
{
  var sTxt = { 
    0:"getOldDefinitions",
    1:"compare",
    2:"delProjectBook",
    3:"delBookPages",
    4:"book data",
    5:"project data",
    6:"page data",
    7:"pageattribute data",
    8:"addProjectBook",
    9:"addBookPages",
   10:"externalPages",
   11:"kipus_rows",
   12:"data content",
   13:"roles",
   14:"reset project name",
   15:"commit",
  };

  log("    step "+status+" ("+sTxt[status]+")");
  var b = par.req.body;

  if(status == 0) { // getOldDefinitions
    par.report=["project name: "+par.project];

    var sql = "select * from kipus_projectbooks where projectid in "+
                "(select id from kipus_projects where name=?)";
    par.connection.query(sql , [par.project],
    function(err, rows) {
      if(err) 
        return myHtmlError(par, ""+err);
      par.bdefList = rows;
      par.includeRows = true;
      return mods.bookDefinitions.createBookDefinition(par, 1, function () {
        par.oldDef = par.ret;
        function getRolesForProject(roles, projectid) {
          var result = [];
          // only import roles for project
          for (var i = 0; i<roles.length; i++) {
            var role = roles[i];
            if (role.projectid == projectid)
             result.push(role);
          } 
          return result;
        }
        par.oldDef.roles = (rows.length == 0?[]:getRolesForProject(par.oldDef.roles, par.oldDef.projects[0].id));
        par.newDef.roles = getRolesForProject(par.newDef.roles, par.newDef.projects[0].id);
        return doImportProject(par, status+1);
      });
    });
    return;
  }

  if(status == 1) { // create lookups, compare
    var po = par.oldDef, pn = par.newDef;
    par.bookDiff = createDiffArr(par, 
                    po.bookdefinition, pn.bookdefinition, "book", "name");
    par.pageDiff = createDiffArr(par,
                    po.pagedefinition, pn.pagedefinition, "page", "tablename");
    par.roleDiff = createDiffArr(par,
                    po.roles, pn.roles, "role", "name");

    par.opgHash = hashFromArray(po.pagedefinition, "id");
    par.npgHash = hashFromArray(pn.pagedefinition, "id");

    var opa=[], npa=[], pa=po.pageattributes;
    for(var i1=0; i1<pa.length; i1++)
      if(!par.pageDiff.page2delHash[par.opgHash[pa[i1].pagedefid].tablename])
        opa.push(pa[i1]);
    pa=pn.pageattributes;
    for(var i1=0; i1<pa.length; i1++)
      if(!par.pageDiff.page2addHash[par.npgHash[pa[i1].pagedefid].tablename])
        npa.push(pa[i1]);
    par.attrDiff = createDiffArr(par, opa, npa, "attr", "columnname",
                    par.opgHash,par.npgHash, "pagedefid","tablename");
    if(b.checkOnly)
      return par.res.end(JSON.stringify(par.report));
    return doImportProject(par, status+1);
  }

  if(status == 2) { // delProjectBooks
    if(par.oldDef.projects.length == 0)
      return doImportProject(par, status+1);
    var sql = "delete from kipus_projectbooks where projectid="+
                        par.oldDef.projects[0].id;
    par.connection.query(sql, [],
    function(err, rows) {
      if(err) 
        return myHtmlError(par, ""+err);
      doImportProject(par, status+1);
    });
    return;
  }

  if(status == 3) { // delBookPages
    var bd = par.oldDef.bookdefinition;
    if(bd.length == 0)
      return doImportProject(par, status+1);

    var ida=[];
    for(var i1=0;i1<bd.length;i1++)
      ida.push(bd[i1].id);
    var sql = "delete from kipus_bookpages where bookdefid in ("+
                        ida.join(",")+")";
    par.connection.query(sql, [],
    function(err, rows) {
      if(err) 
        return myHtmlError(par, ""+err);
      doImportProject(par, status+1);
    });
    return;
  }

  if(status == 4) { // modify books
    par.newDef.bookdefinition.sort(function(a,b) {
      if(!a.parentbookid) return -1;
      if(!b.parentbookid) return 1;
      return 0;
    });
    par.book2id = {};
    modifyTable(par,
      { tbl:"kipus_bookdefinition",
        newArr:par.newDef.bookdefinition,
        oldHash:par.bookDiff.book2delHash,
        map:par.bookDiff.name2book,
        mapCol:"name",
        idmap:par.book2id },
      function(){
        doImportProject(par, status+1);
      });
    return;
  }

  if(status == 5) { // project
    par.npr2name = hashFromArray(par.oldDef.projects, "name");
    par.pr2id = {};
    modifyTable(par,
      { tbl:"kipus_projects",
        newArr:par.newDef.projects,
        oldHash:{},
        map:par.npr2name, mapCol:"name",
        idmap:par.pr2id },
      function(){
        doImportProject(par, status+1);
      });
    return;
  }

  if(status == 6) { // modify page
    par.page2id = {};
    if(!b.overwrite) {
      var h={};
      var lt = par.pageDiff.tablename2page;
      for(var tn in lt) {
        if(lt[tn].importOverwrite == 'NO') {
          var pnp = par.newDef.pagedefinition;
          for(var i1=0; i1<pnp.length; i1++)
            if(pnp[i1].tablename == tn)
              pnp[i1].importOverwrite='NO';
          h[tn] = 1;
        }
      }
      par.skipTables = h;
    }
    modifyTable(par,
      { tbl:"kipus_pagedefinition",
        newArr:par.newDef.pagedefinition,
        oldHash:par.pageDiff.page2delHash,
        map:par.pageDiff.tablename2page,
        mapCol:"tablename",
        idmap:par.page2id },
      function(){
        doImportProject(par, status+1);
      });
    return;
  }

  if(status == 7) { // modify pageattributes
    var nPageHash={}, oPageHash={},
        npd=par.newDef.pagedefinition,
        opd=par.oldDef.pagedefinition;
    for(var i1=0; i1<npd.length; i1++)
      nPageHash[npd[i1].id] = npd[i1];
    for(var i1=0; i1<opd.length; i1++)
      oPageHash[opd[i1].id] = opd[i1];

    par.attr2id = {};
    modifyTable(par,
      { tbl:"kipus_pageattributes",
        newArr:par.newDef.pageattributes,
        oldHash:par.attrDiff.attr2delHash,
        map:par.attrDiff.columnname2attr,
        mapCol:"columnname",
        page2id:par.page2id,
        nPageHash:nPageHash,
        oPageHash:oPageHash,
        tablename2page:par.pageDiff.tablename2page,
        idmap:par.attr2id },
      function(){
        doImportProject(par, status+1);
      });
    return;
  }

  if(status == 8) {             // add project books
    var pd = par.newDef.bookdefinition, inserted=0;
    if(pd.length == 0)
      return doImportProject(par, status+1);
    for(var i1=0; i1<pd.length; i1++) {
      (function(i1){
        var sql = "insert into kipus_projectbooks "+
                  "(projectid,bookdefid,modifiedby,modified) values (?,?,?,?)";
        var prid = par.pr2id[par.newDef.projects[0].id];
        par.connection.query(sql,
        [prid, par.book2id[pd[i1].id], b.username, now()],
        function(err, rows) {
          if(err) 
            return myHtmlError(par, ""+err);
          if(++inserted == pd.length)
            doImportProject(par, status+1);
        });
      })(i1);
    }
    return;
  }

  if(status == 9) {             // add book pages
    var bpA = par.newDef.bookpages, inserted=0;
    if(bpA.length == 0)
      return doImportProject(par, status+1);
    for(var i1=0; i1<bpA.length; i1++) {
      (function(i1){
        var bp = bpA[i1];
        var sql = "insert into kipus_bookpages "+
                  "(bookdefid,pagedefid,modifiedby,modified) values (?,?,?,?)";
        par.connection.query(sql,
        [par.book2id[bp.bookdefid], par.page2id[bp.pagedefid],
           b.username, now()],
        function(err, rows) {
          if(err) 
            return myHtmlError(par, ""+err);
          if(++inserted == bpA.length)
            doImportProject(par, status+1);
        });
      })(i1);
    }
    return;
  }

  if(status == 10) {             // add kipus_external pages
    var external = par.newDef.external, inserted=0;
    if(!external.length)
      return doImportProject(par, status+1);
    for(var i1=0; i1<external.length; i1++) {
      (function(i1){
        var ext = external[i1];
        var sql = "insert into kipus_external "+
                  "(projectid,destination,direction,src_table,dst_table,"+
                        "columns,filter,modifiedby,modified) "+
                  "values (?,?,?,?,?,?,?,?,?)";
        var prid = par.pr2id[par.newDef.projects[0].id];
        par.connection.query(sql,
          [prid, ext.destination, ext.direction, ext.src_table,
           ext.dst_table, ext.columns, ext.filter, b.username, now()],
        function(err, insRes) {
          if(err) 
            return myHtmlError(par, ""+err);
          if(++inserted == external.length)
            doImportProject(par, status+1);
        });
      })(i1);
    }
    return;
  }

  if(status == 11) { // kipus_rows
    if(!b.replaceUserdata)
      return doImportProject(par, status+1);
    var sql = "delete from kipus_rows where bookdefid in (?)";
    var bdefids = [];
    for (var i in par.bdefList) {
      bdefids.push(par.bdefList[i]["bookdefid"]);
    }

    function insert_kipus_rows() {
      par.row2id = {};
      var krows = par.newDef.kipus_rows, inserted=0;
      if(!krows.length)
        return doImportProject(par, status+1);
      for(var i1=0; i1<krows.length; i1++) {
        (function(i1){
          var row = krows[i1];
          var sql = "insert into kipus_rows "+
                    "(bookid,bookdefid,foreignRowId,foreignSyncId,foreignCreated,modified,modifiedby) "+
                    "values (?,?,?,?,?,?,?)";
          par.connection.query(sql,
            [row.bookid, par.book2id[row.bookdefid], row.foreignRowId, row.foreignSyncId,
             row.foreignCreated, row.modified, row.modifiedby],
          function(err, insRes) {
            if(err) 
              return myHtmlError(par, ""+err);
            par.row2id[row.id] = insRes.insertId;
            if(++inserted == krows.length)
              doImportProject(par, status+1);
          });
        })(i1);
      }
    }

   if (bdefids.length == 0)
     return insert_kipus_rows();
   else
    par.connection.query(sql, bdefids, function(err, rows) {
      if(err) 
        return myHtmlError(par, ""+err);
      insert_kipus_rows();
    });
    return;
  }

  if(status == 12) {                                     // data content
    par.bookdefinition = par.newDef.bookdefinition;
    var bd = par.bookdefinition;
    for(var i1=0; i1<bd.length; i1++)
      bd[i1].insertId = par.book2id[bd[i1].id];

    var sql = "delete from kipus_bigdata where dataid like '/projects/"+
              par.project+"/%'";
    if(!b.overwrite)
      sql += " AND importOverwrite='YES'";
    par.connection.query(sql, [], function(err, rows) {
      if(err) 
        return myHtmlError(par, ""+err);

      par.connection.query(
        "SELECT dataid FROM kipus_bigdata "+
          "WHERE dataid LIKE '/projects/"+par.project+"/%' "+
          "AND importOverwrite='NO'", [], function(err, rows) {
        if(err) 
          return myHtmlError(par, ""+err);
        var h={};
        for(var i1=0; i1<rows.length; i1++)
          h[rows[i1].dataid] = 1;
        if(!b.overwrite)
          par.skipBigData = h;

        mods.tableOps.importCsv(par, 0, function() {
          doImportProject(par, status+1);
        });

      });
    });
    return;
  }


  if(status == 13) { // modify roles
    par.newDef.roles.sort(function(a,b) {
      if(!a.parentbookid) return -1;
      if(!b.parentbookid) return 1;
      return 0;
    });
    par.role2id = {};
    modifyTable(par,
      { tbl:"kipus_roles",
        newArr:par.newDef.roles,
        oldHash:par.roleDiff.role2delHash,
        map:par.roleDiff.name2role,
        mapCol:"name",
        idmap:par.role2id },
      function(){
        doImportProject(par, status+1);
      });
    return;
  }

  if(status == 14) {
    var sql = "update kipus_projects set name=?,title=?,created=? where id=?";
    var prid = par.pr2id[par.newDef.projects[0].id];
    par.connection.query(sql, 
    [ par.projectInfo.name, par.projectInfo.title, now(), prid ],
    function(err, insRes){
      if(err) 
        return myHtmlError(par, ""+err);
      doImportProject(par, status+1);
    });
    return;
  }

  if(status == 15) {                                     // commit & return
    par.connection.commit(function(err) { 
      if(err)
        return myHtmlError(par, ""+err);
      par.connection.release();
      var ts =  par.req.url.split("?")[1];
      var res = iCallHash[ts]? iCallHash[ts]:par.res;
      delete iCallHash[ts];
      return res.end(JSON.stringify(par.report));
    });
  }
}


////////////////////////////////
// handle links to /project/ with dbCalls
function
dbFileHandler(req, res, next)
{
  var u = req.url;
  var off = u.indexOf("/projects/");
  if(off < 0)
    return next();
  var dataid = u.substr(off);
  var ext = dataid.substr(dataid.lastIndexOf('.'));
  var ext2type = {
    '.mp4':'video/mp4',
    '.mpeg':'video/mpeg',
    '.jpg':'image/jpeg',
    '.png':'image/png',
    '.gif':'image/gif',
    '.css':'text/css',
    '.html':'text/html',
    '.js':'text/javascript'
  };
  var ct = (ext2type[ext] ? ext2type[ext] : "application/"+ext.substr(1));
  var par = { req:req, res:res, next:next };

  pool.getConnection(function(err, connection) {
    if(err) 
      return htmlError(par, "getConnection: "+err);
    connection.query(
      "SELECT bigdata, modified FROM kipus_bigdata WHERE dataid=?", [dataid],
      function(err, rows) {
        connection.release();
        if(err || rows.length != 1) {
          if(err)
            log("dbFileHandler "+dataid+":"+err);
          res.statusCode = 404;
          return res.end();
        }
        var r = rows[0];
        var m = r.modified.replace(" ","T");
        res.setHeader('Date',          m);
        res.setHeader('Last-Modified', m);
        res.setHeader('ETag',          r.bigdata.length+"/"+m);
        res.setHeader('Content-Type',  ct);

        if(req.headers["if-none-match"] == r.bigdata.length+"/"+m) {
          res.statusCode = 304;
          return res.end();
        }
        res.end(r.bigdata);
      });
  });
}

/*
Insert configured js & stuff. Example config.js entry:
  module.exports.htmlReplace = {
    "/admin.html":[
      { replace:"<!-- PROJECT_JS -->",
        with:"<script type='text/javascript'\
              src='adminMods/SIM/workflow.js'></script>" }
    ]
  };
*/
function
htmlReplace(req, res, next)
{
  if(!cfg.htmlReplace || !cfg.htmlReplace[req.url])
    return next();
  var ra = cfg.htmlReplace[req.url];
  var data = fs.readFileSync(cfg.htmlDir+req.url, {encoding:"utf-8"});
  for(var i1=0; i1<ra.length; i1++) {
    var re = new RegExp(ra[i1].replace, "g");
    data = data.replace(re, ra[i1].with);
  }
  res.end(data);
}

function
myHtmlError(par, err)
{
  if (par.importPending) {
    // set project name/title to abort
    var sql = "update kipus_projects set title=? where id=?";
    var prid = par.pr2id[par.newDef.projects[0].id];
    par.connection.query(sql, 
    [ "<span style='color:red'>Importing aborted, please check serverErrors log for details.</span>", prid ],
    function(err2, insRes){
      par.connection.release();
      return htmlError(par, ""+err);
     });
  } else {
    par.connection.release();
  }
  return htmlError(par, ""+err);
}

function
now()
{
  return (new Date()).toISOString().substring(0,19).replace("T", " ");
}

function
hashKeysAsArray(obj)
{
  var keys = [];
  for(var key in obj){
    keys.push(key);
  }
  return keys;
}

function
hashFromArray(arr, col)
{
  var h = {};
  for(var i1=0; i1<arr.length; i1++)
    h[arr[i1][col]] = arr[i1];
  return h;
}


function
setLock(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next };

  pool.getConnection(function(err, connection) {
    if(err)
      return htmlError(par, "" + err);

    function
    doErr(x) 
    {
      connection.release();
      return res.end(JSON.stringify({ error:x}));
    }

    if(b.lockVal == 1) {
      connection.query("SELECT * from kipus_lock where lockName=?",
      [ b.lockName ],
      function(err, rows){
        if(err)
          return doErr(''+err);
        if(rows.length != 0) {
          if (rows[0].modifiedby == b.as_user) {
            // own log, return ok
            connection.release();
            return res.end(JSON.stringify({ result:"ok" }));
          }  
          else
            return doErr("Already locked by "+
                          rows[0].modifiedby+" at "+rows[0].modified);
        }

      connection.query(
      "INSERT INTO kipus_lock (lockName,modified,modifiedby) VALUES (?,?,?)",
      [ b.lockName, now(), b.as_user ],
      function(err, rows){
        if(err)
          return doErr(''+err);
        connection.release();
        return res.end(JSON.stringify({ result:"ok" }));

      });
      });
    } else {
      connection.query("DELETE from kipus_lock where lockName=?",
      [ b.lockName ],
      function(err, rows){
        if(err)
          return doErr(""+err);
        connection.release();
        return res.end(JSON.stringify({ result:"ok" }));

      });
    }
  });
}


module.exports.cmd = { getFiles:getFiles, 
                   deleteFile:deleteFile, 
                   uploadFile:uploadFile,
                   importProject:importProject,
                   deleteProject:deleteProject,
                   downloadProject:downloadProject,
                   checkProject:checkProject,
                   setLock:setLock 
};
module.exports.dbFileHandler = dbFileHandler;
module.exports.htmlReplace = htmlReplace;

/* Copyright KI-AG 2013-2019, Project KIPUS */
// Contains:
// - getMyBookDefinitions
// - getBookDefinition
// - getBookTables
// - getPageDefinition
// - importBookDefinition

//////////////////////////////////////////
function
login(req, res, next)
{
  return res.end(JSON.stringify({"error":""}));
}

//////////////////////////////////////////
function
getMyBookDefinitions(req, res, next)
{
  var b = req.body;

  var par = { req:req, res:res, next:next,
              withLookupData:1, withProject:1, project:b.project };
  pool.getConnection(function(err, connection) {
    par.connection = connection;
    if(err) 
      return myHtmlError(par, ""+err);
    return createBookDefinition(par, 0, function(){

      // Check if something changed. As image is updated after the rest, 
      // cLI <= cLU
      var cLU = (b.lastUpdate ? b.lastUpdate : "2000-01-01");
      var cLI = (b.lastImage  ? b.lastImage  : "2000-01-01");

      var r=par.ret, sLU=cLU;
      sLU = lastUpdated(par.bdefList,     sLU);
      sLU = lastUpdated(r.bookdefinition, sLU);
      sLU = lastUpdated(r.bookpages,      sLU);
      sLU = lastUpdated(r.pagedefinition, sLU);
      sLU = lastUpdated(r.pageattributes, sLU);
      sLU = lastUpdated([r.user],         sLU);
      sLU = lastUpdated(r.roles,          sLU);
      sLU = lastUpdated(r.pushtopics,     sLU);

      // Collect changed images, delete unchanged lookup tables
      var tblNames = Object.keys(r.tables);
      var sLI = cLI;
      var imgRe = /\[deferred:([^\]]+\/[0-9]+\/[^\]]+)\]/g;
      var reRes;
      for(var i2=0; i2<tblNames.length; i2++) {
        var tbl = r.tables[tblNames[i2]];
        var lsLI = cLI;
        for(var i1=0; i1<tbl.length; i1++) {
          var t = tbl[i1];
          if(cLI.localeCompare(t.modified) < 0) {
            sLI = lsLI = t.modified;
            for(var pName in t) {
              if(typeof t[pName] == "string") {
                while((reRes = imgRe.exec(t[pName])) != null) {
                  if(reRes[1].indexOf(tblNames[i2]) != 0)
                    log("ERROR: wrong image reference in "+tblNames[i2]+
                        " to "+reRes[1]);
                  r.images[reRes[1]] = t.modified;
                }
              }
            }
          }
          delete(t.rowid);   // FIXME
          // delete(t.rootbookid);  // bookid,rootbookid used by GTVP additions
          delete(t.modifiedby);
          delete(t.modified);
        }
        if(lsLI == cLI)
          delete(r.tables[tblNames[i2]]);
      }
      if(sLU == cLU && sLI == cLI && r.bookdefinition.length == b.numBooks)
        par.ret = { noNewData:1 };
      else
        r.lastUpdate = now();

      par.connection.query("update kipus_user set lastSync=? where login=?",
        [now(), b.username], function(err, res){
        if(err)
          log("update lastSync: "+err);
      });

    });
  });
}

//////////////////////////////////////////
function
getBookDefinition(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next, bdefList:[{bookdefid:b.bookdefid}] };

  if(!mods.auth.isAdmin(b.username) && 
     !mods.auth.isViewer(b.username))
    return htmlError(par, "Permission denied (" + b.username 
                                +" is not admin/viewer) for getBookDefinition");
  if(typeof b.bookdefid == "undefined")
    return htmlError(par, "bookdefid parameter missing");

  pool.getConnection(function(err, connection) {
    par.connection = connection;
    if(err) 
      return myHtmlError(par, ""+err);
    return createBookDefinition(par, 1, function () {
      if(!b.asFile)
        return;
      var name = par.ret.bookdefinition[0].name;
      name = name.replace(/[^A-Za-z\.0-9]/g, "_");
      var filename = "/export/"+name+".kipus";
      fs.writeFile(cfg.htmlDir+filename, JSON.stringify(par.ret),
        function(err) {
          if(err)
            return log(err);
          log("  Export: saved "+filename);
        }); 
      par.ret = { fileName:filename };
    });
  });
}

/////////////////////
// used by:
// - getMyBookDefinitions(kipus.js)
// - getBookDefinition (admin.js/viewer.js: Download Book)
// Returns in par.ret:
// projects
// bookdefinition:    kipus_bookdefinition (all for kipus.project)
// bookpages:         kipus_bookpages
// pagedefinition:    kipus_pagedefinition
// pageattributes:    kipus_pageattributes
// tables:            lookup table data if par.withLookupData is set
// images:            empty hash
// projects:          kipus_projects (default or for par.projects)
// user:              user data
// roles:             kipus_roles
// external:          kipus_external
// topics:            kipus_pushtopics
function
createBookDefinition(par, status, callbackFn)
{
  if(status == 0) {                                     // user -> booklist
    var sql = "SELECT pb.bookdefid,pb.modified,id,name "+
                  (par.allUser?",up.login":"")+" FROM "+
        "kipus_projectbooks pb, kipus_userprojects up, kipus_projects p "+
        "WHERE pb.projectid=p.id AND up.projectid=p.id " +
                (!par.allUser?"AND up.login=? ":"")+
         (!par.allProjects ? "AND "+ (par.project ? "p.NAME=?" :
               "p.isDefault='YES'"):"AND p.id=pb.projectid");
    var sqlparams = [];
    if (!par.allUser)
      sqlparams.push(par.req.body.username);
    if(par.project)
      sqlparams.push(par.project.toUpperCase());
    par.connection.query(sql, sqlparams,
      function(err, rows) {
        if(err) 
          return myHtmlError(par, ""+err);
        if(rows.length == 0) {
          par.level = LOGLEVEL.INFO;
          return myHtmlError(par, "Project not authorized");
        }

        par.bdefList = rows;
        if (!par.allProjects)
          par.project = rows[0].name;
        return createBookDefinition(par, status+1, callbackFn);
      });
    return;
  }

  // Status 1 is used by deleteProject,downloadProject,importProject,addScore
  if(status == 1) {                                     // projects
    par.ret = { bookdefinition:[], bookpages:[],
                pagedefinition:[], pageattributes:[],
                tables:{}, images:{} , projects:[]};

    var rows = par.bdefList;
    par.ret.pdef2prjid = {};
    for(var i1=0; i1<rows.length; i1++)
      par.ret.pdef2prjid[rows[i1].bookdefid] = rows[i1].id;

    var sql="SELECT * FROM kipus_projects "+ (par.allProjects ? "" :
                "WHERE "+ (par.project ? "NAME=?":"isDefault='YES'"));
    var sqlparams = [];
    if(par.project)
      sqlparams.push(par.project.toUpperCase());

    par.connection.query(sql,sqlparams, function(err, rows) {
        if(err) 
          return myHtmlError(par, ""+err);
        par.ret.projects = rows;
        if (!par.allProjects && rows.length > 0)
          par.projectid = rows[0].id;
        return createBookDefinition(par, status+1, callbackFn);
      });
    return;
  }

  if(status == 2) {                                     // Project stuff
    if(!par.withProject)
      return createBookDefinition(par, status+1, callbackFn);
    par.ret.projectFiles = [];
    var dataid = "/projects/"+par.project+"/%";
    var sql = "SELECT dataid FROM kipus_bigdata WHERE dataid LIKE ?";
    par.connection.query(sql, [dataid], function(err,rows) {
          if(err) 
            return myHtmlError(par, ""+err);
          for (var i=0; i<rows.length; i++) {
            // skip leading /
            par.ret.projectFiles.push(rows[i].dataid.substr(1));
          }
          return createBookDefinition(par, status+1, callbackFn);
      });
  }

  if(status == 3) {                                     // bookdefinition
    if(par.bdefList.length == 0)
      return createBookDefinition(par, 8, callbackFn);

    for(var rIdx=0; rIdx<par.bdefList.length; rIdx++) {
      (function(rIdx){
      par.connection.query(
        "SELECT * FROM kipus_bookdefinition where id=?",
        [par.bdefList[rIdx].bookdefid], function(err, rows) {
          if(err) 
            return myHtmlError(par, ""+err);
          par.ret.bookdefinition.push(rows[0]);
          if(par.ret.bookdefinition.length == par.bdefList.length)
            return createBookDefinition(par, status+1, callbackFn);
        });
      })(rIdx);
    }
    return;
  }

  if(status == 4) {                                     // book -> pagelist
    par.pages = {};
    var nSel = 0;
    for(var rIdx=0; rIdx<par.bdefList.length; rIdx++) {
      (function(rIdx){
      par.connection.query(
        "SELECT * FROM kipus_bookpages where bookdefid=?",
        [par.bdefList[rIdx].bookdefid], function(err, rows) {
          if(err) 
            return myHtmlError(par, ""+err);
          for(var i1=0; i1<rows.length; i1++) {
            par.ret.bookpages.push(rows[i1]);
            par.pages[rows[i1].pagedefid] = 1;
          }
          if(++nSel == par.bdefList.length)
            return createBookDefinition(par, status+1, callbackFn);
        });
      })(rIdx);
    }
    if (par.bdefList.length == 0)
      return createBookDefinition(par, status+1, callbackFn);
    return;
  }

  if(status == 5) {                                     // pagedefinition
    par.luTbl = [];
    if(cfg.addLUTables)
      par.luTbl = cfg.addLUTables.split(",");
    var keys = Object.keys(par.pages);
    for(var rIdx=0; rIdx<keys.length; rIdx++) {
      (function(rIdx){
      par.connection.query(
        "SELECT * FROM kipus_pagedefinition where id=?",
        [keys[rIdx]], function(err, rows) {
          if(err) 
            return myHtmlError(par, ""+err);
          var r = rows[0];
          par.ret.pagedefinition.push(r);
          if(r.pagetype == "LOOKUP" ||
             r.pagetype == "EXTERNAL" ||
             r.pagetype == "CP_LOOKUP")
            par.luTbl.push(r.tablename);
          if(keys.length == par.ret.pagedefinition.length)
            return createBookDefinition(par, status+1, callbackFn);
        });
      })(rIdx);
    }
    if (keys.length == 0)
      return createBookDefinition(par, status+1, callbackFn);
    return;
  }

  if(status == 6) {                                     // pageattributes
    var keys = Object.keys(par.pages);
    var nSel = 0;
    for(var rIdx=0; rIdx<keys.length; rIdx++) {
      (function(rIdx){
      par.connection.query("SELECT * FROM kipus_pageattributes "+
                           "WHERE pagedefid=? ORDER BY columnorder",
        [keys[rIdx]], function(err, rows) {
          if(err) 
            return myHtmlError(par, ""+err);
          for(var i1=0; i1<rows.length; i1++) {
            for(var name in rows[i1]) {
              if(rows[i1][name] == null)
                delete(rows[i1][name]);
              if(rows[i1][name] == "" && !par.includeEmpty)
                delete(rows[i1][name]);
            }
            par.ret.pageattributes.push(rows[i1]);
          }
          if(++nSel == keys.length)
            return createBookDefinition(par, status+1, callbackFn);
        });
      })(rIdx);
    }
    if (keys.length == 0)
      return createBookDefinition(par, status+1, callbackFn);
    return;
  }

  if(status == 7) {                                     // Lookup-table-data
    if(!par.withLookupData || par.luTbl.length == 0)
      return createBookDefinition(par, status+1, callbackFn);
    var nLuLoaded = 0;
    for(var rIdx=0; rIdx<par.luTbl.length; rIdx++) {
      (function(rIdx){
      par.connection.query(
        "SELECT * FROM "+par.luTbl[rIdx], [], function(err, rows) {
          if(err) 
            return myHtmlError(par, ""+err);
          par.ret.tables[par.luTbl[rIdx]] = rows;
          if(++nLuLoaded == par.luTbl.length)
            return createBookDefinition(par, status+1, callbackFn);
        });
      })(rIdx);
    }
    return;
  }

  if(status == 8) {                                     // Rights 
    var user = (par.allUser?null:par.req.body.username);
    par.connection.query(
      "SELECT login,displayname,rights,email,usertype,alwaysLogin,modified,"+
        "status FROM kipus_user "+(par.allUser?"":"where login=?"),
      [user], function(err, rows) {
         if(err) 
           return myHtmlError(par, ""+err);
         if (par.allUser)
           par.ret.user = rows;
         else
           par.ret.user = rows[0];
         return createBookDefinition(par, status+1, callbackFn);
      });
    return;
  }

  if(status == 9) {                                     // roles 
    par.connection.query(
      "SELECT * FROM kipus_roles " +
        (par.projectid ? "where projectid=? OR projectid IS NULL" : ""),
      [par.projectid],
      function(err, rows) {
         if(err) 
           return myHtmlError(par, ""+err);
         par.ret.roles = rows;
         return createBookDefinition(par, status+1, callbackFn);
      });
    return;
  }

  if(status == 10) {                                     // external 
    var sql =
      "SELECT * FROM kipus_external WHERE projectid in "+
        "(SELECT id FROM kipus_projects WHERE "+
                (par.project ? "NAME=?":"isDefault='YES'")+")";
    var sqlparams = [];
    if(par.project)
      sqlparams.push(par.project.toUpperCase());
    par.connection.query(sql,sqlparams, function(err, rows) {
       if(err) 
         return myHtmlError(par, ""+err);
       par.ret.external = rows;
       return createBookDefinition(par, status+1, callbackFn);
    });
    return;
  }

  if(status == 11) {                                     // kipus_rows 
    var bdefids = [];
    var q = []; 
    for(var i in par.bdefList) {
      bdefids.push(par.bdefList[i]["bookdefid"]);
      q.push("?");
    }
    if(bdefids.length == 0 || !par.includeRows)
      return createBookDefinition(par, status+1, callbackFn);
    var sql = "SELECT * FROM kipus_rows WHERE bookdefid in (" + q.join(",")+ ")";
    par.connection.query(sql,bdefids, function(err, rows) {
      if(err) 
        return myHtmlError(par, ""+err);
      par.ret.kipus_rows = rows;
      return createBookDefinition(par, status+1, callbackFn);
    });
    return;
  }

  if(status == 12) {                                    // kipus_pushtopics
    par.connection.query(
      "SELECT * FROM kipus_pushtopics order by topic" , null ,
      function(err, rows) {
         if(err) 
           return myHtmlError(par, ""+err);
         par.ret.pushtopics = rows;
         if (par.allUser || !par.ret.user)
           return createBookDefinition(par, status+1, callbackFn);
         else
          par.connection.query(
            "SELECT topic from kipus_usertopics where login=?" , [par.ret.user.login] ,
            function(err, rows) {
               if(err) 
                 return myHtmlError(par, ""+err);
               var ut = {};
               for (var i=0; i<rows.length; i++)
                 ut[rows[i].topic] = 1;
               for (var i=0; i<par.ret.pushtopics.length; i++) {
                 var r=par.ret.pushtopics[i];
                 r.subscribed = typeof ut[r.topic] !== "undefined";
               }
               return createBookDefinition(par, status+1, callbackFn);
            });
      });
    return;

  }

  if(status == 13) {
    execModFnList("bookdefPostProcessor", par, function(){
      return createBookDefinition(par, status+1, callbackFn);
    });
  }


  if(status == 14) {                                     // callback & return
    if (!par.keepConnectionAlive)
      par.connection.release();
    if(callbackFn)
      callbackFn();
    if (!par.keepConnectionAlive)
      return par.res.end(JSON.stringify(par.ret));
  }
}


//////////////////////////////////////////
function
getPageDefinition(req, res, next)
{
  var b = req.body;

  var par = { req:req, res:res, next:next };
  if(!mods.auth.isAdmin(b.username) &&
     !mods.auth.isViewer(b.username))
    return htmlError(par, "Permission denied ("+
        b.username+" is not admin/viewer) for getPageDefinition");
  if(typeof b.pagedefid == "undefined")
    return htmlError(par, "pagedefid parameter missing");

  var par = { req:req, res:res, next:next, pdefList:[{pagedefid:b.pagedefid}] };
  pool.getConnection(function(err, connection) {
    par.connection = connection;
    if(err) 
      return myHtmlError(par, ""+err);
    return createPageDefinition(par, 1, function () {
      if(!b.asFile)
        return;
      var name = par.ret.pagedefinition[0].displayname;
      name = name.replace(/[^A-Za-z\.0-9]/g, "_");
      var filename = "/export/"+name+".kipus";
      fs.writeFile(cfg.htmlDir+filename, JSON.stringify(par.ret),
        function(err) {
          if(err)
            return log(err);
          log("  Export: saved "+par.filename);
        }); 
       par.ret = { fileName:filename };
    });
  });
}

function
createPageDefinition(par, status, callbackFn)
{
  // pagedefinition
  if(status == 1) {
    par.ret = { pagedefinition:[], pageattributes:[] };
    if(par.pdefList.length == 0)
      status = 3;
    for(var rIdx=0; rIdx<par.pdefList.length; rIdx++) {
      par.connection.query(
        "SELECT * FROM kipus_pagedefinition where id=?",
        [par.pdefList[rIdx].pagedefid], function(err, rows) {
          if(err) 
            return myHtmlError(par, ""+err);
          par.ret.pagedefinition.push(rows[0]);
          if(par.ret.pagedefinition.length == par.pdefList.length)
            return createPageDefinition(par, 2, callbackFn);
        });
    }
  }

  // pageattributes
  if(status == 2) {
    par.pages = {};
    var nSel = 0;
    for(var rIdx=0; rIdx<par.pdefList.length; rIdx++) {
      par.connection.query(
        "SELECT * FROM kipus_pageattributes where pagedefid=?",
        [par.pdefList[rIdx].pagedefid], function(err, rows) {
          if(err) 
            return myHtmlError(par, ""+err);
          for(var i1=0; i1<rows.length; i1++) {
            for(var name in rows[i1])
              if(rows[i1][name] == "")
                delete(rows[i1][name]);
            par.ret.pageattributes.push(rows[i1]);
          }
          if(++nSel == par.pdefList.length)
            return createPageDefinition(par, 3, callbackFn);
        });
    }
  }

  if(status == 3) {
    par.connection.release();
    if(callbackFn)
      callbackFn();
    return par.res.end(JSON.stringify(par.ret));
  }
}

//////////////////////////////////////////
function
importBookDefinition(req, res, next)
{
  var b = req.body;

  var par = { req:req, res:res, next:next };
  if(!mods.auth.isAdmin(b.username))
    return htmlError(par, "Permission denied (" + b.username +" is not admin) for importBookDefinition");
  if(typeof b.bookdefinition == "undefined")
    return htmlError(par, "bookdefinition parameter missing");

  var par = b.bookdefinition;
  par.req=req; par.res=res; par.next=next;
  par.reports=[];

  pool.getConnection(function(err, connection) {
    par.connection = connection;
    if(err) 
      return myHtmlError(par, ""+err);
    par.connection.beginTransaction(function(err) {
      if(err)
        return myHtmlError(par, ""+err);
      par.inTransaction = true;
      insertBookDefinition(par, 0);
    });
  });
}

//////////////////////////////////////////
function
insertBookDefinition(par, status, callbackFn)
{
  var sTxt = {
    0:"selectBooks",
    1:"updateBookdefinition",
    2:"insertBookdefinition",
    3:"deleteBookpages",
    4:"selectPages",
  };           

  log("    step "+status+(sTxt[status] ? (" "+sTxt[status]) : ""));
  var b = par.req.body;

  if(status == 0) {            ///////////////////////// select books to update
    par.books2Update=[], par.name2book={};
    for(var rIdx=0; rIdx<par.bookdefinition.length; rIdx++) {
      var bd = par.bookdefinition[rIdx];
      par.books2Update.push(bd.name);
      par.name2book[bd.name] = bd;
    }
    var sql = "SELECT id,name FROM kipus_bookdefinition "+
                 "WHERE name in ('"+par.books2Update.join("','")+"')";
    par.connection.query(sql, [],
      function(err,rows) {
        if(err) 
          return myHtmlError(par, ""+err);
        var upd=[];
        for(var rIdx=0; rIdx<rows.length; rIdx++)
          upd.push(rows[rIdx].name);
        par.books2Update = rows;
        return insertBookDefinition(par, status+1, callbackFn);
      });
    return;
  }


  if(status == 1) {            ////////////////////////// update bookdefinition
    par.bookHash = {};
    var updated = 0;
    var toupdate = par.books2Update.length;
    par.arg = [];

    for(var i=0; i<par.books2Update.length; i++) {
      (function(i){
        var bu = par.books2Update[i];
        var bd = par.name2book[bu.name];
        var id = bu.id;
        par.arg.push(bu.name);
        if(b.checkOnly)
          return;
        par.connection.query("UPDATE kipus_bookdefinition "+
          "set name=?,title=?,helptext=?,modifiedby=?,modified=? WHERE id=?", 
          [ bd.name,
            bd.title,
            bd.helptext,
            b.username,
            now() ,
            id],
          function(err, res){
            if(err) 
              return myHtmlError(par, "bookdef "+bd.name+": "+err);
            updated++;
            bd.insertId = id;
            for (var i=0;i<par.bookpages.length; i++) {
               if (bd.id == par.bookpages[i].bookdefid)
                  par.bookpages[i].newbookdefid = id;
            }
            par.bookHash[bd.id] = bd;
            if(updated == toupdate) {
              par.report.push("Updated book attributes for ".par.arg.join(","));
              return insertBookDefinition(par, status+1, callbackFn);
            }
          });
      })(i);
    }
    if(b.checkOnly && par.arg.length)
      par.report.push("Updated book attributes for "+par.arg.join(","));
    if(b.checkOnly || par.books2Update.length == 0)
      return insertBookDefinition(par, status+1, callbackFn);
    return;
  }


  if(status == 2) {                                     // insert bookdefinition
    if (!par.bookHash)
      par.bookHash = {};
    par.arg = [];
    var toinsert=par.bookdefinition.length - par.books2Update.length;
    var inserted=0;
    for(var i=0; i<par.bookdefinition.length; i++) {
        var found = 0;
        for (var j=0; j<par.books2Update.length; j++) {
          if (par.books2Update[j].name == par.bookdefinition[i])
            toinsert--;
        }
    }
    for(var rIdx=0; rIdx<par.bookdefinition.length; rIdx++) {
      (function(rIdx){
        var bd = par.bookdefinition[rIdx];
        var found = 0;
        for (var i=0; i<par.books2Update.length; i++) {
          if (par.books2Update[i].name == bd.name)
             found = 1; 
        }
        if(!found) {
          par.arg.push(bd.name);
          if(b.checkOnly)
            return;
          par.connection.query("INSERT INTO kipus_bookdefinition "+
            "(name,title,helptext,modifiedby,modified) VALUES (?,?,?,?)", 
            [ bd.name,
              bd.title,
              bd.helptext,
              b.username,
              now() ],
            function(err, insRes){
              if(err) 
                return myHtmlError(par, "bookDef "+bd.name+": "+err);
            inserted++;
            bd.insertId = insRes.insertId;
            for (var i=0;i<par.bookpages.length;i++)
            {
              if (par.bookpages[i].bookdefid == bd.id)
                  par.bookpages[i].newbookdefid = bd.insertId;
            }
            par.bookHash[bd.id] = bd;
            if(inserted == toinsert) {
              par.report.push("Create book attributes for "+par.arg.join(","));
              return insertBookDefinition(par, status+1, callbackFn);
            }
          });
        }
      })(rIdx);
    }
    if(b.checkOnly && par.arg.length)
      par.report.push("Create book attributes for "+par.arg.join(","));
    if(b.checkOnly || par.bookdefinition.length == 0)
      return insertBookDefinition(par, status+1, callbackFn);
    return;
  }

  if(status == 3) {                           // delete bookpages of updated
    par.arg=[];
    for(var rIdx=0; rIdx<par.books2Update.length; rIdx++) {
      (function(rIdx){
        var bu = par.books2Update[rIdx];
        par.arg.push(bu.name);
        if(b.checkOnly)
          return;
        par.connection.query(
          "DELETE FROM kipus_bookpages WHERE bookdefid=?", [bu.id],
          function(err, rows) {
            if(err) 
              return myHtmlError(par, ""+err);
            if(rIdx == par.books2Update.length-1) {
              par.report.push(
                "Deleted book pages for       "+par.arg.join(","));
              return insertBookDefinition(par, status+1, callbackFn);
            }
          });
      })(rIdx);
    }
    if(b.checkOnly && par.arg.length)
      par.report.push("Deleted book pages for       "+par.arg.join(","));
    if(b.checkOnly || par.books2Update.length == 0)
      return insertBookDefinition(par, status+1, callbackFn);
    return;
  }

  if(status == 4) {  // select pages to update
    par.pages2Update = [];
    for(var rIdx=0; rIdx<par.pagedefinition.length; rIdx++) {
      (function(rIdx){
        par.connection.query(
          "SELECT id,tablename FROM kipus_pagedefinition "+
             "WHERE tablename=?",
          [par.pagedefinition[rIdx].tablename], function(err, rows) {
            if(err) 
              return myHtmlError(par, ""+err);
            if (rows.length > 0) {
              rows[0].pdIdx = rIdx;
              par.pages2Update.push(rows[0]);
            }
            if (rIdx == par.pagedefinition.length-1)
              return insertBookDefinition(par, status+1, callbackFn);
          });
      })(rIdx);
    }
    if (par.pagedefinition.length == 0)
      return insertBookDefinition(par, status+1, callbackFn);
  }

  if(status == 5) {                                  // delete page attributes
    for (var i=0; i<par.pages2Update.length; i++) {
      (function(rIdx){
      par.connection.query(
        "DELETE FROM kipus_pageattributes "+
           "WHERE pagedefid=?",
        [par.pages2Update[rIdx].id], function(err, rows) {
          if(err) 
            return myHtmlError(par, ""+err);
          if (rIdx == par.pages2Update.length-1)
            return insertBookDefinition(par, status+1, callbackFn);
        });
      })(i);
    }
    if (par.pages2Update.length == 0)
      return insertBookDefinition(par, status+1, callbackFn);
    return;
  }

  if(status == 6) {                                  // update pagedefinition
    par.pageHash = {};
    var updated = 0;
    var toupdate = par.pages2Update.length;
    log("pages2Update="+toupdate);
    for (var i=0; i<par.pages2Update.length; i++) {
      (function(i){
        var pdIdx = par.pages2Update[i].pdIdx;
        var pd = par.pagedefinition[pdIdx];
        var id = par.pages2Update[i].id;
        par.connection.query("UPDATE kipus_pagedefinition "+
          "set tablename=?,displayname=?,helptext=?,pagetype=?,"+
               "subpageparam=?,uniquecols=?,longtitle=?,shorttitle=?,"+
               "modifiedby=?,modified=? WHERE id=?", 
          [ pd.tablename,
            pd.displayname,
            pd.helptext,
            pd.pagetype,
            pd.subpageparam,
            pd.uniquecols,
            pd.longtitle,
            pd.shorttitle,
            b.username,
            now() ,
            id],
          function(err, res){
            if(err) 
              return myHtmlError(par, "pageDef "+pd.tablename+": "+err);
            updated++;
            par.pagedefinition[pdIdx].insertId = id;
            par.pageHash[par.pagedefinition[pdIdx].id] = pd;
            for (var i=0;i<par.bookpages.length;i++)
            {
              if (par.bookpages[i].pagedefid == pd.id)
                  par.bookpages[i].newpagedefid = id;
            }
            if (updated == toupdate)
              return insertBookDefinition(par, status+1, callbackFn);
          });
      })(i);
    }
    if (updated == toupdate)
      return insertBookDefinition(par, status+1, callbackFn);
  }
   
  if(status == 7) {                                     // insert pagedefinition
    if (!par.pageHash)
      par.pageHash = {};
    var toinsert=par.pagedefinition.length - par.pages2Update.length;
    log("pages2Insert="+toinsert);
    if (toinsert == 0)
      return insertBookDefinition(par, status+1, callbackFn);
    var inserted=0;
    for(var i=0; i<par.pagedefinition.length; i++) {
        var found = 0;
        for (var j=0; j<par.pages2Update.length; j++) {
          if (par.pages2Update[j].tablename == par.pagedefinition[i])
            toinsert--;
        }
    }
    for(var rIdx=0; rIdx<par.pagedefinition.length; rIdx++) {
      (function(rIdx){
        var pd = par.pagedefinition[rIdx];
        var found = 0;
        for (var i=0; i<par.pages2Update.length; i++) {
          if (par.pages2Update[i].tablename == pd.tablename)
             found = 1; 
        }
        if (!found)
        par.connection.query("INSERT INTO kipus_pagedefinition "+
          "(tablename,displayname,helptext,pagetype,subpageparam,uniquecols,"+
            "longtitle,shorttitle,modifiedby,modified) "+
            "VALUES (?,?,?,?,?,?,?,?,?)", 
          [ pd.tablename,
            pd.displayname,
            pd.helptext,
            pd.pagetype,
            pd.subpageparam,
            pd.uniquecols,
            pd.longtitle,
            pd.shorttitle,
            b.username,
            now() ],
          function(err, insRes){
            if(err) 
              return myHtmlError(par, "pageDef "+pd.tablename+": "+err);
            inserted++;
            pd.insertId = insRes.insertId;
            par.pageHash[pd.id] = pd;
            for (var i=0;i<par.bookpages.length;i++)
            {
              if (par.bookpages[i].pagedefid == pd.id)
                  par.bookpages[i].newpagedefid = pd.insertId;
            }
            if (inserted == toinsert)
              return insertBookDefinition(par, status+1, callbackFn);
          });
      })(rIdx);
    }
    if (inserted == toinsert)
      return insertBookDefinition(par, status+1, callbackFn);
  }
  if(status == 8) {                                     // insert bookpages
    for(var rIdx=0; rIdx<par.bookpages.length; rIdx++) {
      (function(rIdx){
        var bp = par.bookpages[rIdx];
        var bookdefid = bp.bookdefid;
        var pagedefid = bp.pagedefid;
        if (bp.newbookdefid) {
           //log("new bookdefid " + bookdefid + "->" + bp.newbookdefid);
           bookdefid=bp.newbookdefid;
        }
        if (bp.newpagedefid) {
           //log("new pagedefid " + pagedefid + "->" + bp.newpagedefid);
           pagedefid=bp.newpagedefid;
        }
        //log("try to update " +bookdefid+","+pagedefid);
        par.connection.query("INSERT INTO kipus_bookpages "+
          "(bookdefid,pagedefid,modifiedby,modified) VALUES (?,?,?,?)"+
          " ON DUPLICATE KEY UPDATE modifiedby=?,modified=?",
          [bookdefid, pagedefid, b.username, now(),
           b.username, now()],
          function(err, insRes){
            if(err) 
              return myHtmlError(par, "bookPage "+bookdefid+","+pagedefid+": "+err);
            //log("inserted bookpage "+insRes.insertId);
            if (rIdx == par.bookpages.length-1)
              return insertBookDefinition(par, status+1, callbackFn);
          });
      })(rIdx);
    }
    if(par.bookpages.length==0)
      return insertBookDefinition(par, status+1, callbackFn);
  }

  if(status == 9) {                                     // insert pageattributes
    for(var rIdx=0; rIdx<par.pageattributes.length; rIdx++) {
      (function(rIdx){
        var pa = par.pageattributes[rIdx];
        par.connection.query("INSERT INTO kipus_pageattributes "+
          "(pagedefid, columnname, displayname, helptext, columnorder, "+
           "columnmaxlength, constrainttype, constraintparam, "+
           "inputtype, defaultvalue, javascriptonchange, javascriptonsave, "+
           "showif, gluewithnext, pagebreak, modifiedby, modified) "+
           "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"+
            "ON DUPLICATE KEY UPDATE columnname=?,displayname=?,helptext=?,columnorder=?, "+
           "columnmaxlength=?, constrainttype=?, constraintparam=?, "+
           "inputtype=?, defaultvalue=?, javascriptonchange=?, javascriptonsave=?, "+
           "showif=?, gluewithnext=?, pagebreak=?, modifiedby=?, modified=?",
          [ par.pageHash[pa.pagedefid].insertId,
            pa.columnname,
            pa.displayname,
            pa.helptext,
            pa.columnorder,
            pa.columnmaxlength,
            pa.constrainttype,
            pa.constraintparam,
            pa.inputtype,
            pa.defaultvalue,
            pa.javascriptonchange, 
            pa.javascriptonsave,
            pa.showif,
            pa.gluewithnext,
            pa.pagebreak,
            b.username,
            now(),
            pa.columnname,
            pa.displayname,
            pa.helptext,
            pa.columnorder,
            pa.columnmaxlength,
            pa.constrainttype,
            pa.constraintparam,
            pa.inputtype,
            pa.defaultvalue,
            pa.javascriptonchange, 
            pa.javascriptonsave,
            pa.showif,
            pa.gluewithnext,
            pa.pagebreak,
            b.username,
            now()],
          function(err, insRes){
            if(err) {
              if(par.errReturned)
                return;
              return myHtmlError(par, "pageAttr "+pa.columnname+": "+err);
            }
            pa.insertId = insRes.insertId;
            if(rIdx == par.pageattributes.length-1)
              return insertBookDefinition(par, status+1, callbackFn);
          });
      })(rIdx);
    }
    if(par.pageattributes.length==0)
      return insertBookDefinition(par, status+1, callbackFn);
  }

  if(status == 10) {                                     // create data tables
    for(var rIdx=0; rIdx<par.pagedefinition.length; rIdx++) {
      (function(rIdx){
        var sql = "CREATE TABLE IF NOT EXISTS " +
                          par.pagedefinition[rIdx].tablename + 
                  "(id INT PRIMARY KEY AUTO_INCREMENT, "+
                   "rowid  VARCHAR(255) NOT NULL,"+
                   "bookid VARCHAR(255) NOT NULL,"+
                   "modified CHAR(19),"+
                   "modifiedby VARCHAR(255));";
        par.connection.query(sql,
          function(err, insRes){
            if(err) 
              return myHtmlError(par, ""+err);
            if (rIdx == par.pagedefinition.length-1)
              return insertBookDefinition(par, status+1, callbackFn);
        });
      })(rIdx);
    }
    if(par.pagedefinition.length==0)
      return insertBookDefinition(par, status+1, callbackFn);
  }

  if(status == 11) {                             // data table attributes (alter retrieval)
    par.addHash = {};
    for(var rIdx=0; rIdx<par.pageattributes.length; rIdx++) {
      var pa = par.pageattributes[rIdx];
      var tablename = par.pageHash[pa.pagedefid].tablename;
      var columnname = pa.columnname;
      var constrainttype = pa.constrainttype;
      (function(rIdx, tablename, columnname, constrainttype){
        par.connection.query(
          "SELECT table_name, column_name from information_schema.columns "+
                "where table_name=? and column_name=? and table_schema=?",
          [tablename,columnname,cfg.db.database],
          function(err, rows) {
            if(err) 
              return myHtmlError(par, "colInfo "+columnname+": "+err);
            if (rows.length == 0) {
               if (par.addHash[tablename] == undefined)
                  par.addHash[tablename] = {};
               par.addHash[tablename][columnname] = constrainttype;
            }
            if (rIdx == par.pageattributes.length-1)
              return insertBookDefinition(par, status+1, callbackFn);
          });
      })(rIdx, tablename, columnname, constrainttype);
    }
    if(par.pageattributes.length==0)
      return insertBookDefinition(par, status+1, callbackFn);
  }

  if(status == 12) {       // data table attributes (drop retrieval)
    par.dropHash = {};
    for(var rIdx=0; rIdx<par.pageattributes.length; rIdx++) {
      var pa = par.pageattributes[rIdx];
      var tablename = par.pageHash[pa.pagedefid].tablename;
      var columnname = pa.columnname;
      (function(rIdx, tablename, columnname){
        par.connection.query(
          "SELECT table_name, column_name from information_schema.columns "+
                "where table_name=? and table_schema=?",
          [tablename, cfg.db.database],
          function(err, rows) {
            if(err) 
              return myHtmlError(par, "colInfo "+columnname+": "+err);
            if (par.dropHash[tablename] == undefined)
                par.dropHash[tablename] = {};
            for (var i=0; i<rows.length; i++) {
               par.dropHash[tablename][rows[i].column_name] = 1;
            }
            for(var i=0; i<par.pageattributes.length; i++) {
              var pa = par.pageattributes[i];
              if (tablename != par.pageHash[pa.pagedefid].tablename)
                 continue;
              delete par.dropHash[tablename][pa.columnname]; 
            }
            delete par.dropHash[tablename]["id"]; 
            delete par.dropHash[tablename]["rowid"]; 
            delete par.dropHash[tablename]["bookid"]; 
            delete par.dropHash[tablename]["modified"]; 
            delete par.dropHash[tablename]["modifiedby"]; 
            if (rIdx == par.pageattributes.length-1)
              return insertBookDefinition(par, status+1, callbackFn);
          });
      })(rIdx, tablename, columnname);
    }
    if(par.pageattributes.length==0)
      return insertBookDefinition(par, status+1, callbackFn);
  }

  if(status == 13) {                             // data table attributes (drop)
    var tables = Object.keys(par.dropHash);
    var todrop = 0;
    var dropped = 0;
    for(var i=0; i<tables.length;i++) {
      var columns = Object.keys(par.dropHash[tables[i]]);
      for (var j=0; j<columns.length;j++) {
        todrop++;
      }
    }
    for(var i=0; i<tables.length;i++) {
      var tablename = tables[i];
      var columns = Object.keys(par.dropHash[tablename]);
      for (var j=0; j<columns.length;j++) {
        var columnname = columns[j];
        (function(tablename, columnname){
          var sql = "alter table " + tablename +
                    " drop " + columnname;
          par.connection.query(sql, function(err, rows) {
            if(err) 
              return myHtmlError(par, "alter table "+tablename+" drop "+columnname+": "+err);
            dropped++;
            log("column " + columnname + " of table " + tablename + " dropped");
            if (todrop == dropped)
              return insertBookDefinition(par, status+1, callbackFn);
          });
        })(tablename, columnname);
      }
    }
    if (todrop == 0)
      return insertBookDefinition(par, status+1, callbackFn);
  }

  if(status == 14) {                             // data table attributes (add)
    var tables = Object.keys(par.addHash);
    var toadd = 0;
    var added = 0;
    for(var i=0; i<tables.length;i++) {
      var columns = Object.keys(par.addHash[tables[i]]);
      for (var j=0; j<columns.length;j++) {
        toadd++;
      }
    }
    for(var i=0; i<tables.length;i++) {
      var tablename = tables[i];
      var columns = Object.keys(par.addHash[tablename]);
      for (var j=0; j<columns.length;j++) {
        var columnname = columns[j];
        var constrainttype = par.addHash[tablename][columnname];
        var colType = (constrainttype == "foto" || constrainttype == "signature" ? "LONGTEXT" : "VARCHAR(255)");
        (function(tablename, columnname, colType){
          var sql = "alter table " + tablename +
                    " add " + columnname + " "+colType;
          par.connection.query(sql, function(err, rows) {
            if(err) 
              return myHtmlError(par, "alter table "+tablename+" add "+columnname+": "+err);
            added++;
            log("column " + columnname + " of table " + tablename + " added");
            if (toadd == added)
              return insertBookDefinition(par, 15, callbackFn);
          });
        })(tablename, columnname, colType);
      }
    }
    if (toadd == 0)
      return insertBookDefinition(par, 15, callbackFn);
  }

  if(status == 15) {                                     // callback & return
    par.connection.release();
    if(callbackFn)
      callbackFn();
    if(par.inTransaction)
      par.connection.commit(function(err) { 
        if (err)
          log("WARNING: commit error " + err); 
    });
    par.insertIds = [];
    for (var i=0; i<par.bookdefinition.length; i++) {
       par.insertIds.push(par.bookdefinition[i].insertId);
    }
    return par.res.end(JSON.stringify({insertIds:par.insertIds}));
  }
}

function
getBookTables(req, res, next)
{
  var par = { req:req, res:res, next:next};
  var b = req.body;

  pool.getConnection(function(err, connection) {
    connection.query(
    "SELECT PR.id as projectid, B.id as bookid, P.tablename,P.pagetype,P.importOverwrite,I.TABLE_ROWS,CONCAT(PR.name,': ', B.title) as projectbook "+
    "FROM kipus_pagedefinition P,information_schema.tables I,kipus_bookpages BP, kipus_bookdefinition B, kipus_projectbooks PB, kipus_projects PR "+
    "WHERE P.tablename = I.TABLE_NAME AND BP.pagedefid=P.id AND BP.bookdefid = B.id AND PB.bookdefid=B.id and PB.projectid = PR.id "+
    "AND I.TABLE_SCHEMA = ?  ORDER BY tablename,pagetype", cfg.db.database, function(err, res) {
      par.connection = connection;
      if(err) {
        log("error in sql="+b.sql);
        return myHtmlError(par, ""+err);
      }
      par.connection.release();
      par.res.end(JSON.stringify(res));
    });
  });
}

function
lastUpdated(arr, lu)
{
  for(var i1=0; i1<arr.length; i1++) {
    if(lu.localeCompare(arr[i1].modified) < 0)
      lu = arr[i1].modified;
    delete(arr[i1].modifiedby);
    delete(arr[i1].modified);
  }
  return lu;
}

function
now()
{
  return (new Date()).toISOString().substring(0,19).replace("T", " ");
}

function
_escapeString(val) {
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

// copied from kipus.js, last part commeted out
// used in addScore.
function
kps_digestBookdef(bdef)
{
  bdef.b2p={};  // bookId to pageArr
  bdef.p2b={};  // pageId to book
  bdef.cols={}; // columnName to column
  bdef.book={}; // bookId to book
  bdef.bookName={}; // bookName to book
  bdef.page={}; // pageId to page
  bdef.tbldef={}; // tablename to page
  bdef.spage={};// dependentColumnName to {filter/page}
  bdef.recCol={};// column in the header containing the pointer to the parent.

  for(var i1=0; i1<bdef.bookdefinition.length; i1++) {
    var b = bdef.bookdefinition[i1];
    b.trfname = b.name;
    b.trpref = "bookDef.";
    bdef.book[b.id] = b;
    bdef.bookName[b.name] = b;
  }

  for(var i1=0; i1<bdef.pagedefinition.length; i1++) {
    var pd = bdef.pagedefinition[i1];
    bdef.page[pd.id] = pd;
    bdef.tbldef[pd.tablename] = pd;
    pd.cols = [];
  }

  for(var i1=0; i1<bdef.bookpages.length; i1++) {
    var b = bdef.bookpages[i1];
    if(typeof bdef.b2p[b.bookdefid] == "undefined")
      bdef.b2p[b.bookdefid] = [];
    bdef.b2p[b.bookdefid].push(bdef.page[b.pagedefid]);
    bdef.p2b[b.pagedefid] = bdef.book[b.bookdefid];
  }

  for(var i1=0; i1<bdef.pagedefinition.length; i1++) {
    var pd = bdef.pagedefinition[i1];
    if(pd.pagetype == "HEADER")
      bdef.p2b[pd.id].headerPage = pd;
    else if(pd.pagetype == "BODY" && !pd.subpageparam)
      bdef.p2b[pd.id].bodyPage = pd;
    else if(pd.subpageparam) {
      var cv=pd.subpageparam.split(":");
      if(typeof bdef.spage[cv[0]] == "undefined")
        bdef.spage[cv[0]] = [];
      bdef.spage[cv[0]].push({flt:cv[1], pd:pd});
    }
  }

  for(var i1=0; i1<bdef.pageattributes.length; i1++) {
    var pa = bdef.pageattributes[i1];
    var pd = bdef.page[pa.pagedefid];
    pd.cols.push(pa);
    bdef.cols[pa.columnname] = pa;       // may overwrite...
    pa.trfname = bdef.p2b[pa.pagedefid].trfname;
    pa.trpref = pd.tablename+"."+pa.columnname+".";
  }
  for(var i1 in bdef.page)
    bdef.page[i1].cols.sort(function(a,b){return a.columnorder-b.columnorder;});

  for(var i1=0; i1<bdef.bookdefinition.length; i1++) {  // set parentHdrCol
    var b = bdef.bookdefinition[i1];
    var pb = bdef.book[b.parentbookid];
    if(!pb || !b.headerPage)
      continue;
    for(var i2=0; i2<b.headerPage.cols.length; i2++) {
      var c = b.headerPage.cols[i2];
      if(c.constraintparam == pb.headerPage.tablename &&
         c.constrainttype  == "singleFromTable")
        b.parentHdrCol = c.columnname;
    }
    if(b.parentHdrCol)
      pb.hasChildren = true;
//    else
//      okDialog(b.name+": parentHdrColumn is missing in the definition");
  }


  /*
  if(bdef.projectFiles)
    for(var i1=0; i1<bdef.projectFiles.length; i1++) {
      var fn = bdef.projectFiles[i1]; 
      if(fn.indexOf(".css", fn.length - 4) !== -1)
        loadLink(bdef.projectFiles[i1]);
      if(fn.indexOf(".js", fn.length - 3) !== -1)
        loadScript(bdef.projectFiles[i1]);
    }
  */

  if(bdef.roles) {
    bdef.roleHash = {};
    for(var i1=0; i1<bdef.roles.length; i1++)
      bdef.roleHash[bdef.roles[i1].id] = bdef.roles[i1].bookdef_rights;
  }
}

function
getStructChanges(req, res, next)
{
  var par = { req:req, res:res, next:next};
  var b = req.body;

  pool.getConnection(function(err, conn) {
    if(err) 
      return myHtmlError(par, ""+err);
    par.connection = conn;
    var where = "sc.projectid = p.id AND sc.version > ? AND "+
        (b.projectName ? "p.name=?" : "p.isDefault=?");
    var arg = (b.projectName ? b.projectName : 'YES');
    conn.query(
      "SELECT version, jscode"+
      " FROM kipus_mobileStructChanges sc,kipus_projects p WHERE "+where+
      " ORDER BY version",
      [b.version, arg],
      function(err, res) {
        if(err) {
          log("error in sql="+b.sql);
          return myHtmlError(par, ""+err);
        }
        par.res.end(JSON.stringify(res));

        if(b.platform) {
          conn.query("INSERT INTO kipus_clientinfo "+
            "(clientinfo,modified,modifiedby) VALUES (?,?,?)",
            [JSON.stringify(b.platform), now(), b.username],
            function(err, res) {
              par.connection.release();
          });
        } else {
          par.connection.release();
        }
    });
  });
}

module.exports.insertBookDefinition = insertBookDefinition;
module.exports.createBookDefinition = createBookDefinition;
module.exports.kps_digestBookdef = kps_digestBookdef;
module.exports.cmd = {
  login:login,
  getMyBookDefinitions:getMyBookDefinitions,
  getBookDefinition:getBookDefinition,
  getPageDefinition:getPageDefinition,
  importBookDefinition:importBookDefinition,
  getBookTables:getBookTables,
  getStructChanges:getStructChanges
};

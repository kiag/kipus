/* Copyright KI-AG 2013-2019, Project KIPUS */
var nonCache = {
  'avi':1,
  'm4p':1,
  'm4v':1,
  'mov':1,
  'mp3':1,
  'mp4':1,
  'mpeg':1,
  'oga':1,
  'ogg':1,
  'ogv':1,
  'wma':1,
  'wmv':1,
  'apk':1
};

//////////////////////////////////
// Handle the index.html and other project.html top level files by inserting
// the correct manifest file into the html header
function
offlineHandler(req, res, next)
{
  var u = req.url;
  var prName = '';
  for (var i=0; i<global.projects.length; i++) {
    var re = new RegExp("^/"+global.projects[i]);
    if (re.test(u)) {
      prName = global.projects[i];
      continue;
    }
  }
  // allowed  files: / /*.manifest /*.service-worker.js /*.client.json
  // and             /VIET01/ /VIET01/VIET01 /VIET01/*.manifest /VIET01/*.service-worker.js /VIET01/*.client.json
  var re = new RegExp("^/"+prName+"/.*(.manifest|.service-worker.js|client.json)");
  if (u == "/" || u == "/"+prName+"/" || u == "/"+prName+"/"+prName || re.test(u)) {
    var par = { req:req, res:res, next:next, 
                isIndex:(u.length<9 || u.indexOf(".manifest", u.length-9)<0) };
    if (u.indexOf(".service-worker.js") > 0 || u.indexOf(".client.json") > 0 || u.indexOf(".manifest") > 0)
      par.isIndex = false;
    //log("par.req.url="+u+" isIndex="+par.isIndex);
    pool.getConnection(function(err, connection) {
      if(err)
        return res.end("getConnection ERROR: "+err);
      par.connection = connection;
      doOfflineHandler(par, 0);
    });
  } else {
    return next();
  }
}

//////////////////////////////////
function
doOfflineHandler(par, state)
{
  if(state == 0) {      // Get Project info
    var where;
  if(par.req.url == "/") {
      where = " isDefault='YES'";
    } else {
      var u = par.req.url;
      var prName = '';
      for (var i=0; i<global.projects.length; i++) {
        var re = new RegExp("^/"+global.projects[i]);
        if (re.test(u)) {
          prName = global.projects[i];
          continue;
        }
      }
      //var prName = u.substr(u.indexOf('/')+1, u.lastIndexOf('/') - 1);
      where = " name='"+prName+"'";
    }
    //log("where="+where);
    par.connection.query("SELECT * from kipus_projects WHERE "+where, [],
    function(err, rows){
      if(err)
        return myHtmlError(par, ""+err);
      if(rows.length != 1) {
        par.res.statusCode = 404;               // NOT FOUND
        par.connection.release();
        return par.res.end();
      }
      par.project = rows[0];
      doOfflineHandler(par, 1);
    });
  }

  if(state == 1) {
    var p = par.project, dir=cfg.htmlDir;
    if (par.req.url == "/") {
      log("Redirect / to default project " + p.name);
      par.res.writeHead(302, { Location: p.name + "/" }); 
      par.connection.release();
      return par.res.end();
    }
    var indexFile = fs.readFileSync(dir+"/index.html", {encoding:"utf-8"});
    if(cfg.htmlReplace && cfg.htmlReplace["/index.html"]) {
      var ra = cfg.htmlReplace["/index.html"];
      for(var i1=0; i1<ra.length; i1++) {
        var re = new RegExp(ra[i1].replace, "g");
        indexFile = indexFile.replace(re, ra[i1].with);
      }
    }
    if(cfg.htmlProjectReplace &&
       cfg.htmlProjectReplace[p.name] && 
       cfg.htmlProjectReplace[p.name]["/index.html"]) {
      var ra = cfg.htmlProjectReplace[p.name]["/index.html"];
      for(var i1=0; i1<ra.length; i1++) {
        var re = new RegExp(ra[i1].replace, "g");
        indexFile = indexFile.replace(re, ra[i1].with);
      }
    }


    var manifFile = fs.readFileSync(dir+"/default.manifest",{encoding:"utf-8"});
    if(cfg.htmlReplace && cfg.htmlReplace["/default.manifest"]) {
      var ra = cfg.htmlReplace["/default.manifest"];
      for(var i1=0; i1<ra.length; i1++) {
        var re = new RegExp(ra[i1].replace, "g");
        manifFile = manifFile.replace(re, ra[i1].with);
      }
    }
    if(cfg.htmlProjectReplace &&
       cfg.htmlProjectReplace[p.name] && 
       cfg.htmlProjectReplace[p.name]["/default.manifest"]) {
      var ra = cfg.htmlProjectReplace[p.name]["/default.manifest"];
      for(var i1=0; i1<ra.length; i1++) {
        var re = new RegExp(ra[i1].replace, "g");
        manifFile = manifFile.replace(re, ra[i1].with);
      }
    }
    var swFile = fs.readFileSync(dir+"/client_service-worker.js", {encoding:"utf-8"});
    var clientManiFile = fs.readFileSync(dir+"/client.json", {encoding:"utf-8"});

    var prjFileMF="", prjFileDIV="", prjPath="/projects/"+p.name;
    var like = prjPath + "/%";
    var touchIcon;
    par.connection.query(
    "SELECT dataid,length(bigdata) len, modified from kipus_bigdata "+
    "WHERE dataid LIKE ?", [like],
    function(err, rows){
      if(err)
        return myHtmlError(par, ""+err);
      var modified = p.modified;
      for (var i=0; i<rows.length; i++) {
        var fName = rows[i].dataid.substr(1); // skip leading /
        prjFileDIV += fName+":"+rows[i].len+"\n";

        var mr = rows[i].dataid.match(/\.([^.]*)$/);
        if(mr && nonCache[mr[1]])
          continue;
        prjFileMF += fName+"\n";
        if(rows[i].modified.localeCompare(modified) > 0)
          modified = rows[i].modified;
        if(fName.indexOf("touch_icon.png") >= 0)
          touchIcon = fName
      }

      var ret;
      if(par.isIndex) {
        ret = indexFile.replace("<title></title>",
                                    "<title projectname='"+p.name+"'>"+p.title+"</title>");
        if(touchIcon)
          ret = ret.replace(/css.images.touch-icon.png/g, touchIcon);

        if(p.isOffline == "YES")
          ret = ret.replace("<html>",
                            //"<html manifest='"+p.name+".manifest'>");
                            "<html isOffline='YES'>");
        ret = ret.replace('<link rel="manifest" href="client.json">',
                          '<link rel="manifest" href="'+p.name+'.client.json">');
        ret = ret.replace('id="offlineFiles"></div>', 'id="offlineFiles"'+
                ' projectName="'+p.name+'"'+
                ' defaultLang="'+p.defaultlang+'"'+
                ' sourceLang="'+p.sourcelang+'">'+
                manifFile+prjFileDIV+'</div>');
        par.res.setHeader('content-type', 'text/html');
      } else {
        /*if(p.isOffline != "YES") {
          par.connection.release();
          return par.next();
        }*/
        if (par.req.url.indexOf(".manifest") > 0) {
          // .manifest file
          ret = "CACHE MANIFEST\n"+
                "# "+modified+"\n"+
                "\n"+
                "CACHE:\n"+
                manifFile+
                prjFileMF+
                "\n"+
                "NETWORK:\n"+
                "*\n";
          par.res.setHeader('content-type', 'text/cache-manifest');
        }
        if (par.req.url.indexOf(".service-worker.js") > 0) {
          prjFileDIV = prjFileDIV.replace(/:.*/g,''); // remove :size
          var offlineFilesArray = manifFile.split("\n").concat(prjFileDIV.split("\n"));
          offlineFilesArray = offlineFilesArray.filter(Boolean); // remove empty strings from array
          
          ret = swFile.replace(/var cacheModified .*/, "var cacheModified = '"+modified+"';")
                .replace(/var isOffline.*/, "var isOffline = '"+p.isOffline+"';")
                .replace(/var projectName .*/, "var projectName = '"+par.project.name+"';")
                .replace("var filesToCache = [",
                //"var filesToCache = [\n'./',\n'./"+offlineFilesArray.join("',\n'./")+"'");
                "var filesToCache = [\n'./"+par.project.name+"',\n'./"+offlineFilesArray.join("',\n'./")+"'");
          par.res.setHeader('content-type', 'application/javascript');
        }
        if (par.req.url.indexOf(".client.json") > 0) {
          ret = clientManiFile.replace(/"short_name".*/, '"short_name": "'+(par.project.short_name?par.project.short_name:par.project.title)+'",')
                 .replace(/"name".*/, '"name": "'+par.project.title+'",')
                 .replace(/"start_url".*/, '"start_url": "./'+par.project.name+'",')
                 .replace(/<project>/g, par.project.name);
          
          par.res.setHeader('content-type', 'application/json');
        } 
      }
      par.connection.release();

      ////par.res.setHeader('Access-Control-Allow-Origin', 'localhost:32323');
      return par.res.end(ret);
    });
  }
}

function
getOfflineTimestamps(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next, project: b.project};
  pool.getConnection(function(err, connection) {
    if(err)
      return res.end("getConnection ERROR: "+err);
    par.connection = connection;
    return doGetOfflineTimestamps(par, 0);
  });
}

function
doGetOfflineTimestamps(par, state)
{
  if(state == 0) {      // Get Project info
    var where;
    if (!par.project) {
      where = " isDefault='YES'";
    } else {
      where = " name='"+par.project+"'";
    }

    par.connection.query("SELECT * from kipus_projects WHERE "+where, [],
    function(err, rows){
      if(err)
        return myHtmlError(par, ""+err);
      if(rows.length != 1) {
        par.res.statusCode = 404;               // NOT FOUND
        return par.res.end();
      }
      par.project = rows[0];
      doGetOfflineTimestamps(par, 1);
    });
  }
  if(state == 1) { // read manifest timestamps
    par.offlineTimestamps = {};
    var dir=cfg.htmlDir;
    var manifFile = fs.readFileSync(dir+"/default.manifest",{encoding:"utf-8"});
    if(cfg.htmlReplace && cfg.htmlReplace["/default.manifest"]) {
      var ra = cfg.htmlReplace["/default.manifest"];
      for(var i1=0; i1<ra.length; i1++) {
        var re = new RegExp(ra[i1].replace, "g");
        manifFile = manifFile.replace(re, ra[i1].with);
      }
    }
    if(cfg.htmlProjectReplace &&
       cfg.htmlProjectReplace[par.project.name] && 
       cfg.htmlProjectReplace[par.project.name]["/default.manifest"]) {
      var ra = cfg.htmlProjectReplace[par.project.name]["/default.manifest"];
      for(var i1=0; i1<ra.length; i1++) {
        var re = new RegExp(ra[i1].replace, "g");
        manifFile = manifFile.replace(re, ra[i1].with);
      }
    }
    var offlineFilesArray = manifFile.split("\n");
    for (var i=0; i<offlineFilesArray.length; i++) {
      var fName = offlineFilesArray[i];
      if (fName.indexOf("#") == 0)
        continue;
      var stat = fs.statSync(dir+"/"+fName);
      // remove milliseconds because Last-Modified-Date in Response-Headers are without millies
      var modified = new Date(stat.mtime);
      modified.setMilliseconds(0);
      if (fName == "")
        fName = par.project.name;
      //fName = par.project.name+"/"+fName;
      par.offlineTimestamps[fName] = { fileName: par.project.namefName, length: stat.size, 
                                       modified: modified.toISOString() };
    }
    doGetOfflineTimestamps(par, 2);
  }
  if(state == 2) { // read offline files from db
    var p = par.project;
    var prjPath="/projects/"+p.name;
    var like = prjPath + "/%";
    par.connection.query(
    "SELECT dataid,length(bigdata) len, modified from kipus_bigdata "+
    "WHERE dataid LIKE ?", [like],
    function(err, rows){
      if(err)
        return myHtmlError(par, ""+err);
      var modified = p.modified;
      for (var i=0; i<rows.length; i++) {
        //var fName = par.project.name+"/"+rows[i].dataid.substr(1); // skip leading /
        var fName = rows[i].dataid.substr(1); // skip leading /
        par.offlineTimestamps[fName] = { fileName: fName, length: rows[i].len, modified: rows[i].modified };
      }
      return myHtmlOk(par, par.offlineTimestamps);
    });
  }
}

//////////////////////////////////
// If the request starts with /<project>/, serve request without /<project>
function
projectsHandler(req, res, next)
{
  var u = req.url;
  var found = false;
  for (var i=0; i<global.projects.length; i++) {
    var p = global.projects[i];
    // files starting with /<project>/
    var re = new RegExp("^/"+p+"/");
    if (re.test(u)) {
      found = true;
      // /<project>/.* -> /.*
      u = u.replace(re, "/");
      continue;
    }
  }
  if (!found)
    return next();
  req.url = u;
  return global.serve(req, res, next, {lastModified:true, etag:true} );
}

// reinit the global.projects array
function
reloadProjects(req, res, next)
{
  global.loadProjects(function() {
    log("projects reloaded");
    console.log(global.projects);
    return res.end(JSON.stringify({}));
  });
}

function
myHtmlError(par, err)
{
  if (par.connection)
    par.connection.release();
  return par.res.end("ERROR: "+err);
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

module.exports = { offlineHandler:offlineHandler, 
                   projectsHandler:projectsHandler };
module.exports.cmd = { getOfflineTimestamps:getOfflineTimestamps, 
                       reloadProjects:reloadProjects };


/* Copyright KI-AG 2013-2019, Project KIPUS */
// Contains:
// - getMyUserData

function
tcConvert(field,next)
{
  if(field.type == 'DATE') {
    var r = field.string();
    if(r != null && r.length == 19)
      r = r.substr(0, 10);      // YYYY-MM-DD
    return r;
  }
  return next();
}

/*
 * Create a temporary table of all rootbookids accessible to this user
 * rootbookid: bookid of a root-book, i.e. a book without parent.
 */
function
create_rootBookTempTable(par, callbackFn)
{
  if(!par.rbHdr) {
    par.rbHdr=[];
    for(var i1=0; i1<par.mypd.length; i1++) {
      var p = par.mypd[i1];
      if(!par.bdHash[par.p2b[p.id]].isRootBook || p.pagetype != "HEADER")
        continue;
      par.rbHdr.push(p);
    }
    par.rbIdx = 0;
  }

  if(!par.hierTblLoaded) { // load hierarchy tables referenced in user rightdef
    par.hierTblLoaded = true;
    var ur = par.ret2.user.rights.split(" "), hierTblHash={};
    for(var i1=0; i1<ur.length; i1++) {
      var ra = ur[i1].split(/[:,=]/);

      for(var i2=1; i2+1<ra.length; i2+=2) {
        if(ra[i2].match(/^\d+$/) ||
           ra[i2].indexOf("OWN.") == 0)
          continue;
        var ch = par.colHash[ra[i2]];
        var ct = (ch ? ch.constraintparam.split(" ")[0] : undefined);
        if(!ct || !par.tblHash[ct] || !par.tblHash[ct].isHierarchy)
          continue;
        hierTblHash[ct] = true;
      }
    }
    var hierTblArr = Object.keys(hierTblHash), hierTblIdx = 0;
    par.hierTbl = {};
    var loadNextTbl = function(){
      if(hierTblIdx >= hierTblArr.length)
        return create_rootBookTempTable(par, callbackFn);
      var tblName = hierTblArr[hierTblIdx++];
      par.hierTbl[tblName] = {};
      par.connection.query("SELECT id,HIERARCHYPATH from "+tblName,[],
      function(err, rows) {
        if(err) 
          return myHtmlError(par, "c_rBTT 1:"+err);
        if(!par.rootbookonly)
          log("  Loaded hierarchy table "+tblName+": "+rows.length+" rows");
        for(var i1=0; i1<rows.length; i1++)
          par.hierTbl[tblName][rows[i1].id] = rows[i1].HIERARCHYPATH;
        loadNextTbl();
      });

    };
    loadNextTbl();
    return;
  }

  if(!par.hasRootBookTempTable) {
    par.hasRootBookTempTable = true;
    par.connection.query("DROP TEMPORARY TABLE IF EXISTS tmp_rootbook",[],
    function(err, res) {
      if(err) 
        return myHtmlError(par, "c_rBTT 2 "+err);
      par.connection.query(
      "CREATE TEMPORARY TABLE tmp_rootbook (id varchar(32) primary key)", [],
      function(err, res) {
        if(err) 
          return myHtmlError(par, "c_rBTT 3 "+err);
        create_rootBookTempTable(par, callbackFn);
      });
    });
    return;
  }

  if(par.rbIdx >= par.rbHdr.length)
    return gMUD_collect(par, callbackFn);
  var p = par.rbHdr[par.rbIdx++];

  var whereOrs=[], whereAnds=[];
  var user = par.ret2.user;
  if(!user.rights)
    return gMUD_collect(par, callbackFn);
    
  // Build a WHERE statement based on the User rights
  var ur = user.rights.split(" "), joinTbl=[];
  for(var i1=0; i1<ur.length; i1++) {
    var ra = ur[i1].split(/[:,=]/), ands=[];

    var addColFilter = function(colName, colVal) {
      var ch = par.colHash[colName];
      if(!ch || ch.pagedefid != p.id)
        return;
      var ct = ch.constraintparam.split(" ")[0];
      if(!par.tblHash[ct])
        return;

      if(par.tblHash[ct].isHierarchy) {
        var hp = par.hierTbl[ct][colVal];
        if(!hp) {
          log("ERROR: user right for "+user.login+" is wrong:"+colVal+
              " is missing in the hierarchy table "+ct);
          return;
        }
        var jtn = "t"+joinTbl.length;
        joinTbl.push(ct+" "+jtn);
        ands.push("("+colName+"="+colVal+" OR "+
                     jtn+".HIERARCHYPATH like '"+hp+",%')");
        whereAnds.push(colName+"="+jtn+".id");
      } else {
        ands.push(colName+"="+colVal);
      }
    };

    for(var i2=1; i2+1<ra.length; i2+=2) {

      if(ra[i2].match(/^\d+$/)) {
        if(par.p2b[p.id] == ra[i2])
          ands.push("bookid='"+ra[i2+1]+"'");
        continue;
      }

      if(ra[i2].indexOf("OWN.") == 0) {
        if(par.colHash[ra[i2+1]] && par.colHash[ra[i2+1]].pagedefid == p.id)
          ands.push(ra[i2+1]+"='"+user.login+"'");
        continue;
      }

      addColFilter(ra[i2], ra[i2+1]);
    }

    if(ands.length == 0)
      continue;

    if(par.syncParam) {
      var sp = par.syncParam[p.tablename];
      if(sp)
        for(var colName in sp)
          addColFilter(colName, sp[colName]);
    }

    if(ands.length > 1)
      whereOrs.push("("+ands.join(" AND ")+")");
    else
      whereOrs.push(ands[0]);
  }
  if(!whereOrs)
    return create_rootBookTempTable(par, callbackFn);
    
  var where = whereOrs.join(" OR ");
  if(whereAnds.length)
    where = "("+where+") AND "+whereAnds.join(" AND ");
  if(!where)
    return create_rootBookTempTable(par, callbackFn);

  var sql = "INSERT INTO tmp_rootbook SELECT bookid"+
            " FROM "+p.tablename+(joinTbl.length ? ','+joinTbl.join(",") : '')+
            " WHERE "+where;
  par.connection.query(sql, [],
  function(err, res) {
    if(err) 
      return myHtmlError(par, "c_rBTT 4 "+sql+" => "+err);
    if(!par.rootbookonly)
      log("  rootbookids for "+p.tablename+": "+res.affectedRows+" rows");
    return create_rootBookTempTable(par, callbackFn);
  });
}

// par:
//  bdefList, projectid, pages{}, luTbl, roletype, lastSync, bookHash, cols[],
//  p2b,
//  hdrPage, parentHdrCol, bdHash, pdIdx, okBook, 
//  roleHash, lastBd, relevantRightsArray
//  ret2: bookdefinition, bookpages, pagedefinition[], pageattributes[],
//        tables?, images?, projects, pdef2prjid, user, roles, external
//  ret:  tabledata
function
gMUD_collect(par, callbackFn) // MUD: My User Data
{
  var pd = par.ret2.pagedefinition,
      b  = par.req.body;

  if(!par.cpTbls) { // togo: get CP_LOOKUP table columnNames for hierarchy check
    var pd = par.ret2.pagedefinition;
    par.cpTbls = [], par.cpTblIdx=0;
    for(var i1=0; i1<pd.length; i1++)
      if(pd[i1].pagetype ==  'CP_LOOKUP')
        par.cpTbls.push(pd[i1]);
  }

  if(par.cpTblIdx < par.cpTbls.length) {
    var cpTbl = par.cpTbls[par.cpTblIdx++];
    par.connection.query(
      "SELECT columnname FROM kipus_pageattributes WHERE pagedefid in "+
        "(SELECT id FROM kipus_pagedefinition WHERE pagetype != 'CP_LOOKUP' "+
        "AND tablename=?)", [cpTbl.tablename],
      function(err, rows) {
        if(err) 
          return myHtmlError(par, ""+err);
        for(var i1=0; i1<rows.length; i1++) {
          par.ret2.pageattributes.push({ 
            pagedefid:cpTbl.id,
            columnname:rows[i1].columnname
          });
        }
        return gMUD_collect(par, callbackFn);
      });
    return;
  }

  if(par.p2b == undefined) {                  // prepare the hashes
    par.cols={}, par.p2b={}, par.hdrPage={}, par.parentHdrCol={},
    par.colHash={}, par.pdHash={}, par.tblHash={};
    var pa = par.ret2.pageattributes,
        bp = par.ret2.bookpages,
        bd = par.ret2.bookdefinition;

    // populate the book definition hierarchy path
    var cnt=0, lastcnt=0, bdHier={};
    for(;;) {
      cnt = 0;
      for(var i1=0; i1<bd.length; i1++) {
        var b = bd[i1];
        if(bdHier[b.id]) {
          cnt++;

        } else if(!b.parentbookid) {
          b.isRootBook = true;
          bdHier[b.id] = b.id;
          cnt++;

        } else if(bdHier[b.parentbookid]) {
          bdHier[b.id] = bdHier[b.parentbookid]+"/"+b.id;
          cnt++;

        }
      }
      if(cnt == lastcnt || cnt == bd.length)
        break;
      lastcnt = cnt;
    }

    for(var i1=0; i1<bp.length; i1++)           // pageid to bookdefid
      par.p2b[bp[i1].pagedefid] = bp[i1].bookdefid;

    for(var i1=0; i1<pd.length; i1++) {          
      if(pd[i1].pagetype == "HEADER") 
        par.hdrPage[par.p2b[pd[i1].id]] = pd[i1];// bookdefid to headerpage
      par.pdHash[pd[i1].id] = pd[i1];
      par.tblHash[pd[i1].tablename] = pd[i1];
    }

    par.bdHash={};
    for(var i1=0; i1<bd.length; i1++)
      par.bdHash[bd[i1].id] = bd[i1];

    for(var i1=0; i1<pa.length; i1++) {
      var a = pa[i1];

      if(!par.cols[a.pagedefid])
        par.cols[a.pagedefid] = [];
      par.cols[a.pagedefid].push(a.columnname);
      if(par.pdHash[a.pagedefid].pagetype == 'HEADER')
        par.colHash[a.columnname] = a;

      if(a.columnname == "HIERARCHYPATH")
        par.pdHash[a.pagedefid].isHierarchy = true;
    }


    pd.sort(function(a,b) { // make sure top-level book-header comes first
      var abdid=par.p2b[a.id], bbdid=par.p2b[b.id];
      var astr = bdHier[abdid]+"#"+(a.pagetype=="HEADER" ? "A":"Z")+a.tablename;
      var bstr = bdHier[bbdid]+"#"+(b.pagetype=="HEADER" ? "A":"Z")+b.tablename;
      return (astr == bstr ? 0 : (astr < bstr ? -1 : 1));
    });

    par.ret = [], par.okBook={}, par.acceptedBook={}, par.skipTable={};

    // Fill the list of accepted books, i.e. books with some rights to it.
    var rh = {}, ra=par.ret2.roles;
    for(var i1=0; i1<ra.length; i1++)
      rh[ra[i1].id] = ra[i1];
    var ur = par.ret2.user.rights.split(" ");
    for(var i1=0; i1<ur.length; i1++) {
      var ra = ur[i1].split(":");
      if(!rh[ra[0]] || !rh[ra[0]].bookdef_rights)
        continue;
      var br = rh[ra[0]].bookdef_rights.split(/[ =]/);
      for(var i2=0; i2<br.length; i2+=2)
        if(br[i2+1] == "read" || br[i2+1] == "write")
          par.acceptedBook[br[i2]] = true;
    }
    return gMUD_collect(par, callbackFn);
  }

  if(!par.preProcFnDone) {
    par.preProcFnDone = true;
    par.mydataIgnoreTable = {};
    execModFnList("mydataPreProcessor", par,
        function() { gMUD_collect(par, callbackFn); });
    return;
  }

  if(!par.mypd) {
    par.mypd = [];
    par.pdIdx = -1;
    for(var i1=0; i1<pd.length; i1++) {          
      var p =pd[i1];
      var tn = p.tablename;
      if(!(p.pagetype=="BODY" || p.pagetype=="HEADER"))
        continue;
      if(par.mydataIgnoreTable[tn]) // tableCopy
        continue;
      if(!par.cols[p.id])
        return myHtmlError(par, "ERROR: "+tn+" has no attributes");
      par.mypd.push(p);
    }
  }

  if(!par.hasRootBookTempTable &&
     !(cfg.withSyncParamOnly && !par.syncParam)) {
    return create_rootBookTempTable(par, callbackFn);
  }

  if(par.rootbookonly)
    return callbackFn(par);

  par.pdIdx++;
  pd = par.mypd;
  if(par.pdIdx >= pd.length ||
     (cfg.withSyncParamOnly && !par.syncParam)) {
    if(callbackFn) {
      return callbackFn(par);

    } else {

      function
      nowUTC(d)
      {
        function pad(number) { return (number<10 ? '0'+number : number); }
        var ret =    d.getUTCFullYear() +
          '-' + pad( d.getUTCMonth()+1 ) +
          '-' + pad( d.getUTCDate() ) +
          ' ' + pad( d.getUTCHours() ) +
          ':' + pad( d.getUTCMinutes() ) +
          ':' + pad( d.getUTCSeconds() );
        return ret;
      }
      

      if(par.roletype=="UserFrontend") {
        execModFnList("mydataPostProcessor", par,
        function() { // fill tableCopy JSON, etc
          for(var i1=0; i1<par.ret.length; i1++) {
            var p = par.ret[i1], tbl=p.tablename;
            log("    "+tbl+" rightFor:"+p.nOrig+
                           " changed:"+p.nrFlt+
                           " sending:"+p.rows.length);
          }
          par.ret = { tbl:par.ret,
                      lastSync:nowUTC(new Date()),
                      okBook:par.okBook };
          //return myHtmlError(par, "Sorry, debugging is active");
          return myHtmlOk(par);
        });
        return;
      }
      par.ret.lastSync = nowUTC(new Date());
      return myHtmlOk(par);
    }
  }

  var p = pd[par.pdIdx];
  var tn = p.tablename;

  if(par.tablename && tn != par.tablename && p.pagetype != "HEADER")
    return gMUD_collect(par, callbackFn);

  if(!par.acceptedBook[par.p2b[p.id]] || par.skipTable[tn])
    return gMUD_collect(par, callbackFn);

  var whereCond="";
  if(p.pagetype == "BODY") {
    if(par.lastSync && !cfg.withSyncParamOnly)
      whereCond = " AND t.modified > '"+par.lastSync+"' ";
  }
  if(cfg.maxDays && cfg.maxDays[tn])
    whereCond += " AND t.modified > '"+thenUtc(cfg.maxDays[tn])+"' ";
  whereCond += " AND t.rootbookid in (select id from tmp_rootbook)";

  var sql=
    "SELECT r.bookId,r.foreignRowId,t.modified,t.modifiedby,t."+
                  par.cols[p.id].join(",t.")+(par.includeRowIds?",t.rowid":"")+
    " FROM "+tn+" t, kipus_rows r"+
    " WHERE r.id=t.rowid"+whereCond+
    " ORDER BY r.bookId,r.foreignRowId";
  par.connection.query({sql:sql, values:[], typeCast:tcConvert},
    function(err, rows) {
      if(err) 
        return myHtmlError(par, "gMUD 1 "+err);

      if(par.roletype=="UserFrontend" && rows.length == 0)
        return gMUD_collect(par, callbackFn);

      var bd = par.bdHash[par.p2b[p.id]];
      var nrows = [];
      for(var i2=0; i2<rows.length; i2++) {
        var r = rows[i2];
        par.okBook[r.bookId] = true;

        if(par.lastSync && 
           (par.lastSync+"").localeCompare(r.modified) >= 0 && 
           par.bookHash[r.bookId])
          continue;
        for(var k in r) // Do not send empty cols
          if(r[k] === "" || r[k] === null || r[k] === undefined)
            delete(r[k]);
        nrows.push(r);
      }

      if(nrows.length)
        par.ret.push({ tablename: p.tablename, bookdefid: bd.id, rows: nrows,
                       nOrig: rows.length, nrFlt: nrows.length });
      return gMUD_collect(par, callbackFn);
    });
}

//////////////////////////////////////////
function
getMyUserData(req, res, next)
{
  var b = req.body;
  var par = { req:req, res:res, next:next };

  if(b.forUser)
    b.username = b.forUser;
  var par = { req:req, res:res, next:next, includeRowIds:b.includeRowIds,
              tablename:b.tablename, project:b.project, 
              keepConnectionAlive:true };

  pool.getConnection(function(err, connection) {
    par.connection = connection;
    if(err) 
      return myHtmlError(par, "gMUD 2 "+err);
    return mods.bookDefinitions.createBookDefinition(par, 0, function(){
      par.ret2 = par.ret;
      delete par.ret;
      par.roletype = b.roletype;
      par.lastSync = b.lastSync;
      par.bookHash = b.bookHash;
      par.syncParam = b.syncParam;
      gMUD_collect(par);
    });
  });
}


//////////////////////////////////////////
// createUserBookIdsTable parameters:
//////////////////////////////////////////
function
createUserBookIdsTable(req, res, next)
{
  if(!req.body)
    req.body = {};
  var par = { req:req, res:res, next:next,
              roletype:"UserFrontend", keepConnectionAlive:true };
  delete(cfg.withSyncParamOnly);

  pool.getConnection(function(err, connection) {
    par.connection = connection;
    if(err) 
      return myHtmlError(par, "cUBIT 1 "+err);

    par.connection.query("truncate table kipus_generateduserbookids",
    function(err, res) {
      if(err) 
        return myHtmlError(par, "cUBIT 2 "+err);

    par.connection.query(
    "SELECT login,name FROM kipus_userprojects up,kipus_projects p "+
                "WHERE up.projectid=p.id",
    function(err, uprows) {
      if(err) 
        return myHtmlError(par, "cUBIT 3 "+err);
      var uprowsIdx = 0, opar = par;
      par.totalCount = 0;

      var computeOneUP = function(){
        if(uprowsIdx >= uprows.length)
          return par.res.end(JSON.stringify({ insertCount: par.totalCount }));

        var up = uprows[uprowsIdx++];

        par = {}; for(var k in opar) par[k] = opar[k];
        par.project = up.name; 
        par.req.body.username = up.login;

        return mods.bookDefinitions.createBookDefinition(par, 0, function(){
          par.rootbookonly = true;
          par.ret2 = par.ret;
          delete par.ret;
          return gMUD_collect(par, function() {
            par.connection.query(
            "INSERT INTO kipus_generateduserbookids "+
              "(login,rootbookid,projectName) "+
              "select '"+up.login+"',id,'"+up.name+"' from tmp_rootbook",
            function(err, res) {
              if(err) 
                return myHtmlError(par, "cUBIT 4 "+err);
              log("  "+up.name+"/"+up.login+": "+res.affectedRows);
              par.totalCount += res.affectedRows;
              computeOneUP();
            });
          });
        });
      };
      computeOneUP();
    });
    });
  });
}

function
myHtmlOk(par)
{
  if(par.errReturned)   // if there are multiple parallel calls with error.
    return;
  par.connection.release();
  return par.res.end(JSON.stringify(par.ret));
}

function
myHtmlError(par, err)
{
  if(par.errReturned)   // if there are multiple parallel calls with error.
    return;
  par.errReturned = true;
  par.connection.release();
  return htmlError(par, ""+err);
}

function
thenUtc(diff)
{
  function pad(number) { return (number<10 ? '0'+number : number); }
  var d = new Date();
  d.setDate(d.getDate()-diff);
  var ret =    d.getUTCFullYear() +
    '-' + pad( d.getUTCMonth()+1 ) +
    '-' + pad( d.getUTCDate() ) +
    ' ' + pad( d.getUTCHours() ) +
    ':' + pad( d.getUTCMinutes() ) +
    ':' + pad( d.getUTCSeconds() );
  return ret;
}


module.exports.createUserBookIdsTable = createUserBookIdsTable;
module.exports.cmd = { getMyUserData:getMyUserData };

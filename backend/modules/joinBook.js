/* Copyright KI-AG 2013-2019, Project KIPUS */

// joins a book on the server. To be called from the JS-Console. For an example
// see joinKipus

function
joinBook(req, res, next)
{
  var par = { req:req, res:res, next:next, status:0 };
  var b = req.body;

  if(!mods.auth.isAdmin(b.username))
    return htmlError(par, "Permission denied ("+b.username +" is not admin)");

  pool.getConnection(function(err, connection) {
    if(err) 
      return myHtmlError(par, "getConnection: "+err);
    par.connection = connection;
    par.connection.beginTransaction(function(err) {
      if(err)
        return myHtmlError(par, ""+err);
      par.inTransaction = true;
      par.state = 1;
      par.msg = "";
      doJoinBook(par);
    });
  });
}

function
joinKipus(req, res, next)
{
  var par = { req:req, res:res, next:next, status:0 };
  var b = req.body;

  if(!mods.auth.isAdmin(b.username))
    return htmlError(par, "Permission denied ("+b.username +" is not admin)");
  if(!b.list)
    return htmlError(par, "No list parameter supplied");

  pool.getConnection(function(err, connection) {
    if(err) 
      return myHtmlError(par, "getConnection: "+err);
    par.connection = connection;
    par.connection.beginTransaction(function(err) {
      if(err)
        return myHtmlError(par, ""+err);
      par.inTransaction = true;
      par.listIdx = 0;
      par.msg = "";
      doJoinKipus(par);
    });
  });
}

function
doJoinKipus(par)
{
  var b = par.req.body;
  var li = par.listIdx++;
  if(b.list.length <= li)
    return myHtmlOk(par);
  par.msg += "; ";
  b.oldid = b.list[li].oldid;
  b.newid = b.list[li].newid;
  log("dJK: "+b.oldid+" -> "+b.newid);
  b.headertable = 'N05_FARMDATAHEADER'; 
  b.bodytable   = 'N05_FARMMASTERDATA';
  b.depTbl = [
    { htbl:'CORRECTIVE_HDR', hcol:'PARENT',
      btbl:['CORRECTIVE_BODY'] },
    { htbl:'N03_HEADERDATA', hcol:'N03_FARMNAME',  },
    { htbl:'N04_FARMDATA',   hcol:'N04_FARMNAME',
      btbl:['N04_QUEST_FERTILIZER','N04_QUEST_PESTICIDE',
            'N04_QUEST_CONSTRUCTION', 'N04_QUEST_EQUIPMENT',
            'N04_QUEST_MACHINERY','N04_RSRC_QUESTIONS',
            'N04_QUEST_SEEDS','N04_QUEST_UNITSIZE'] },
    { htbl:'N06_AGRITRAININGHEADER', hcol:'N06_FARMNAME',
      btbl:['N06_AGRITRAININGBODY'] } ];
  par.state = 1;
  par.nextFn = doJoinKipus;
  doJoinBook(par);
}

function
doJoinBook(par)
{
  var state = par.state++;
  log("  dJB:"+state);
  var b = par.req.body;

  if(state == 1) {
    par.connection.query(
      "DELETE FROM kipus_rows WHERE bookid=? and foreignRowId=0", 
      [b.oldid], function(err, res) {
        if(err) 
          return myHtmlError(par, state+".DEL: "+err);
        par.msg += state+".DEL:"+res.affectedRows+" ";
        doJoinBook(par);
      });
  }

  if(state == 2) {
    par.connection.query(
      "DELETE FROM "+b.headertable+" WHERE bookid=?", 
      [b.oldid], function(err, res) {
        if(err) 
          return myHtmlError(par, state+".DEL: "+err);
        par.msg += state+".DEL:"+res.affectedRows+" ";
        doJoinBook(par);
      });
  }

  if(state == 3) {
    par.connection.query(
      "UPDATE "+b.bodytable+" set bookid=? WHERE bookid=?", 
      [b.newid, b.oldid], function(err, res) {
        if(err) 
          return myHtmlError(par, state+".UPD: "+err);
        par.msg += state+".UPD:"+res.affectedRows+" ";
        doJoinBook(par);
      });
  }

  if(state == 4) {
    par.connection.query(
        "UPDATE kipus_rows a inner join (SELECT MAX(foreignRowId) x, "+
             "? bookid FROM kipus_rows WHERE bookid=?) b "+
             "ON a.bookid=b.bookid SET a.foreignRowId = a.foreignRowId+b.x,"+
             "a.bookid=? WHERE a.bookid=?",
        [b.oldid, b.newid, b.newid, b.oldid], function(err, res) {
        if(err) 
          return myHtmlError(par, state+".UPD: "+err);
        par.msg += state+".UPD:"+res.affectedRows+" ";
        doJoinBook(par);
      });
  }

  if(state >= 5) {
    if(b.depTbl.length <= state-5) {
      if(par.nextFn)
        return par.nextFn(par);
      return myHtmlOk(par);
    }
    var d = b.depTbl[state-5];

    log("    "+d.htbl);
    if(d.btbl) {
      par.srow = d;
      par.subState = 1;
      doJoinSub(par);

    } else {
      par.connection.query(
          "UPDATE "+d.htbl+" SET "+d.hcol+"=? WHERE "+d.hcol+"=?",
          [b.newid+"/0", b.oldid+"/0"], function(err, res) {
          if(err) 
            return myHtmlError(par, "4.UPD: "+err);
          par.msg += state+".UPD:"+res.affectedRows+" ";
          doJoinBook(par);
        });
    }
  }
}

function
doJoinSub(par)
{
  var state = par.subState++;
  log("    dJS:"+state);
  var b = par.req.body;
  var d = par.srow;

  if(state == 1) {
    par.connection.query(
      "select bookid FROM "+d.htbl+" WHERE "+d.hcol+"=?",
      [b.oldid+"/0"], function(err, res) {
        if(err) 
          return myHtmlError(par, state+".SSEL: "+err);
        if(res.length != 1) {
          log("    no old book found");
          return doJoinBook(par);
        }
        par.ohbookid = parseInt(res[0].bookid); // no parseInt: collation error
        doJoinSub(par);
      });
  }

  if(state == 2) {
    par.connection.query(
      "select bookid FROM "+d.htbl+" WHERE "+d.hcol+"=?",
      [b.newid+"/0"], function(err, res) {
        if(err) 
          return myHtmlError(par, state+".SSEL: "+err);
        if(res.length != 1) {
          log("    no new book found");
          return doJoinBook(par);
        }
        par.nhbookid = parseInt(res[0].bookid);
        doJoinSub(par);
      });
  }

  if(state == 3) {
    par.connection.query(
      "DELETE FROM kipus_rows WHERE bookid=? AND foreignRowId=0",
      [par.ohbookid], function(err, res) {
        if(err) 
          return myHtmlError(par, state+".SDEL: "+err);
        par.msg += state+".SDEL:"+res.affectedRows+" ";
        doJoinSub(par);
      });
  }

  if(state == 4) {
    par.connection.query(
      "DELETE FROM "+d.htbl+" WHERE bookid=?",
      [par.ohbookid], function(err, res) {
        if(err) 
          return myHtmlError(par, state+".SDEL: "+err);
        par.msg += state+".SDEL:"+res.affectedRows+" ";
        doJoinSub(par);
      });
  }

  if(state == 5) {
    par.connection.query(
      "UPDATE kipus_rows a inner join (SELECT MAX(foreignRowId) x, "+
           "? bookid FROM kipus_rows WHERE bookid=?) b "+
           "ON a.bookid=b.bookid SET a.foreignRowId = a.foreignRowId+b.x,"+
           "a.bookid=? WHERE a.bookid=?",
      [par.ohbookid, par.nhbookid, par.nhbookid, par.ohbookid],
      function(err, res) {
        if(err) 
          return myHtmlError(par, state+".SUPD: "+err);
        par.msg += state+".SUPD:"+res.affectedRows+" ";
        doJoinSub(par);
      });
  }

  if(state >= 6) {
    if(d.btbl.length <= state-6)
      return doJoinBook(par);
    var btbl = d.btbl[state-6];

    log("      "+btbl+": "+par.ohbookid+" -> "+par.nhbookid);
    par.connection.query(
      "UPDATE "+btbl+" SET bookid=? WHERE bookid=?",
      [par.nhbookid, par.ohbookid], function(err, res) {
        if(err) 
          return myHtmlError(par, state+".SUPD: "+err);

        par.msg += state+".SUPD:"+res.affectedRows+" ";
        doJoinSub(par);
      });
  }
}

function
myHtmlOk(par)
{
  if(par.inTransaction)
    par.connection.commit(function(err) { if(err) log(err); });
  par.connection.release();
  return par.res.end(JSON.stringify({ result:par.msg }));
}

function
myHtmlError(par, err)
{
  if(par.inTransaction)
    par.connection.rollback();
  par.connection.release();
  return htmlError(par, ""+err);
}

module.exports.cmd = { joinBook:joinBook,
                       joinKipus:joinKipus };

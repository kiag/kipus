/* Copyright KI-AG 2013-2019, Project KIPUS */
// The column prf+TARGETID is mandatory in the target table
function
tableCopy(par, nextFn)
{
  if(!par.tcCol) {
    par.connection.query(
      "SELECT * FROM kipus_pageattributes WHERE constrainttype in (?,?)",
      ['tableCopy', 'tableRows'],
      function(err, rows){
        par.tcCol={};
        par.tcTbl={};
        for(var i1=0; i1<rows.length; i1++) {
          var r = rows[i1];
          par.tcTbl[r.pagedefid] = 1;
          par.tcCol[r.columnname] = r;
        }
        return tableCopy(par, nextFn);
      });
    return;
  }

  if(par.tcRows) {
    if(par.tcRows.length == par.tcRowIdx)
      return nextFn(1);
    var r = par.tcRows[par.tcRowIdx++];
    par.connection.query(r.sql, r.vals,
      function(err, rows){ 
        if(err) {
          log(err);
          return nextFn(0);
        }
        return tableCopy(par, nextFn);
      });
    return;
  }

  var b = par.req.body;
  b.now = (new Date()).toISOString().substring(0,19).replace("T", " ");
  par.tcRows = [];
  for(var i1=0; i1<b.rows.length; i1++) {             // each row
    var r = b.rows[i1];
    for(var tblName in r) {                           // each table
      if(!par.pn2d[tblName] || !par.tcTbl[par.pn2d[tblName].id])
        continue;
      var tr = r[tblName];
      for(var cn in tr) {
        if(!par.tcCol[cn] || !tr[cn])
          continue;
        var cp = par.tcCol[cn].constraintparam;
        var cpm = cp.match(/target:([^ ]*).*prefix:([^ ]*)/);
        var tgtTable = cpm[1];
        var tgtCol = cpm[2]+"TARGETID";
        var tgtVal = r._bookid+"/"+r._rowid;

        var res = JSON.parse(tr[cn]);
        log("    tableCopy "+cn+", rows: "+res.length);
        tr[cn] = r._bookid+"/"+r._rowid;
        par.tcRows.push({ sql:"DELETE FROM "+tgtTable+" WHERE "+tgtCol+"=?",
                          vals:[tgtVal] });
        for(var i2=0; i2<res.length; i2++) {
          var cols = ['modified','modifiedby','bookid','rowid','rootbookid', 
                      tgtCol];
          var vals = [b.now, b.username, r._bookid,0, par.rootBookId[r._bookid],
                      tgtVal ];
          var qs = ['?','?','?','?','?','?'];
          var tcr = res[i2];
          for(var tcc in tcr) {
            if(tcc == tgtCol) // we have set this value above
              continue;
            cols.push(tcc);
            vals.push(tcr[tcc] == '' ? null : tcr[tcc]); // mysql 5.7 is picky
            qs.push('?');
          }
          par.tcRows.push({ sql:"INSERT INTO "+tgtTable+" ("+cols.join(",")+
                                ") VALUES("+qs.join(",")+")", vals:vals});
        }
      }
    }
  }
  par.tcRowIdx = 0;
  return tableCopy(par, nextFn);
}

function
prepareTableCopy(par, nextFn)
{
  var pd = par.ret2.pagedefinition, pHash={};
  for(var i1=0; i1<pd.length; i1++)
    pHash[pd[i1].id] = pd[i1];

  var pa = par.ret2.pageattributes;
  var h = { tcTable:[], tcTgtArr:[], tcTgt:{}, tcIdx:0 };
  for(var i1=0; i1<pa.length; i1++) {
    var ad = pa[i1];
    if(!(ad.constrainttype=='tableCopy' || ad.constrainttype=='tableRows'))
      continue;
    var cpm = ad.constraintparam.match(/target:([^ ]*).*prefix:([^ ]*)/);
    if(!cpm || !cpm[1] || !cpm[2]) {
      log("ERROR: Bogus definition for "+ad.columnname);
      continue;
    }
    par.mydataIgnoreTable[cpm[1]] = true;
    var tbl = pHash[ad.pagedefid].tablename;
    h.tcTable.push({tbl:tbl, col:ad.columnname, tgtTable:cpm[1]});
    h.tcTgt[cpm[1]] = { prefix:cpm[2] };
  }
  for(var t in h.tcTgt)
    h.tcTgtArr.push(t);

  var whHash={};
  for(var i1=0; i1<par.ret.length; i1++) {
    var rows = par.ret[i1].rows;
    for(var i3=0; i3<rows.length; i3++) {
      var r = rows[i3];
      whHash[r.bookId+"/"+r.foreignRowId] = 1;
    }
  }
  var whArr = Object.keys(whHash);
  if(whArr.length < 1000)
    h.where = "('"+whArr.join("','")+"')";

  par.tcHash = h;
  nextFn();
}

function
fillTableCopy(par, nextFn)
{
  if(!par.tcHash)
    return prepareTableCopy(par, function(){ fillTableCopy(par, nextFn); });
  var h = par.tcHash;
  if(h.tcIdx < h.tcTgtArr.length) {
    var tbl = h.tcTgtArr[h.tcIdx++];
    var where = "";
    if(h.where)
      where = " WHERE "+h.tcTgt[tbl].prefix+"TARGETID IN "+h.where;

    par.connection.query("SELECT * FROM "+tbl+where, [],
      function(err, rows){
        if(err) {
          log(tbl+": "+err);
          delete par.tcHash;
          return nextFn();
        }
        log("    tableCopy "+tbl+": "+rows.length+" rows"+
                        (h.where ? ", where-length:"+h.where.length : ""));
        var rh = {}, colName = h.tcTgt[tbl].prefix+"TARGETID";

        for(var i1=0; i1<rows.length; i1++) {
          var r = rows[i1];
          delete(r.id); delete(r.modified); delete(r.modifiedby);
          if(!rh[r[colName]])
            rh[r[colName]] = [];
          rh[r[colName]].push(rows[i1]);
        }
        h.tcTgt[tbl].rowHash = rh;
        fillTableCopy(par, nextFn);
      });
    return;
  }

  for(var i1=0; i1<par.ret.length; i1++) {
    for(var i2=0; i2<h.tcTable.length; i2++) {
      var hr = h.tcTable[i2];
      if(par.ret[i1].tablename != hr.tbl)
        continue;
      var rows = par.ret[i1].rows;
      for(var i3=0; i3<rows.length; i3++) {
        var r = rows[i3];
        var idx = r.bookId+"/"+r.foreignRowId;
        var d = h.tcTgt[hr.tgtTable].rowHash[idx];
        r[hr.col] = d ? JSON.stringify(d) : "";
      }
    }
  }
  delete par.tcHash;
  nextFn();
}

function
fillIgnoredTables(par, nextFn)
{
  return prepareTableCopy(par, function () {
       delete par.tcHash;
       nextFn();
    });
}

module.exports.uploadPreProcessor = tableCopy;
module.exports.mydataPostProcessor = fillTableCopy;
module.exports.mydataPreProcessor = fillIgnoredTables;

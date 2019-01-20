/* Copyright KI-AG 2013-2019, Project KIPUS */
var dbPools={}, external;

function
rereadExternalTable(nextfn)
{
  pool.getConnection(function(err, connection) {
    if(err) {
      log("getConnection:"+err);
      return;
    }
    connection.query("SELECT * from kipus_external",
    function(err, rows) {
      if(err) {
        log("ERROR in rereadExternalTable: "+err);
      } else {
        external = rows;
      }
      connection.release();
      nextfn();
    });
  });
}

function
computeColumns(ex, b, row)
{
  var ret = { cols:[], vals:[], qms:[] };
  var cols = ex.columns.split(",");
  var lrow = row[ex.src_table];

  for(var i1=0; i1<cols.length; i1++) {
    var sd = cols[i1].split("=");
    var srcCol=sd[0], dstCol=srcCol;
    if(sd.length == 2)
      dstCol = sd[1];
    var val;
    if(srcCol == "modified")
      val = b.now;
    else if(srcCol == "modifiedby")
      val = b.username;
    else if(srcCol == "bookid")
      val = row._bookid;
    else if(srcCol == "rowid")
      val = row._serverRowId;
    else
      val = lrow[srcCol];
    ret.cols.push(dstCol);
    ret.vals.push(val);
    ret.qms.push('?');
  }
  return ret;
}

function
ep_close(ep)
{
  if(ep.conn && external[ep.epIdx].destination != 'local')
    ep.conn.release();
  delete(ep.conn);
}

function
externalPush(par, nextFn)
{
  if(!par.externalPush)
    par.externalPush = { err:[], epIdx:0, rowIdx:0 };
  var ep = par.externalPush;

  if(external == undefined) {
    if(ep.checked) {    // Cant read kipus_external
      delete(par.externalPush)
      return nextFn(1);
    }
    ep.checked = true;
    return rereadExternalTable(function(){ externalPush(par, nextFn) });
  }

  if(!ep.data) {
    ep.data = [];
    for(var i1=0; i1<external.length; i1++) {
      var ex = external[i1];
      var ed = [];      // array of user-data-rows for each external
      ep.data.push(ed);
      if(ex.direction != 'PUSH')
        continue;
      var rows = par.req.body.rows;
      for(var i2=0; i2<rows.length; i2++)
        if(rows[i2][ex.src_table] && rows[i2]._serverRowId) // No duplicate
          ed.push(computeColumns(ex, par.req.body, rows[i2]));
    }
  }

  if(ep.epIdx == external.length) {
    delete(par.externalPush);
    return nextFn(1);
  }

  if(ep.data[ep.epIdx].length == ep.rowIdx) { // after last element
    ep_close(ep);
    ep.epIdx++; ep.rowIdx = 0;
    return externalPush(par, nextFn);
  }


  var ex = external[ep.epIdx];
  var dst = ex.destination;
  if(ep.rowIdx == 0 && !ep.conn) {  // get new connection & start transaction
    if(dst == 'local') {
      ep.conn = par.connection;
      return externalPush(par, nextFn);
    }

    if(!dbPools[dst]) {
      if(!cfg.destination || !cfg.destination[dst]) {
        log("ERROR: no config.js definition for "+dst);
        ep.epIdx++;
        return externalPush(par, nextFn);
      }
      dbPools[dst] = mysql.createPool(cfg.destination[dst]);
    }

    dbPools[dst].getConnection(function(err, connection) {
      if(err) {
        log("ERROR: getConnection to "+dst+": "+err);
        ep.epIdx++;
        return externalPush(par, nextFn);
      }
      ep.conn = connection;
      ep.conn.beginTransaction(function(err) {
        if(err) {
          log("ERROR: beginTransaction on "+dst+": "+err);
          ep_close(ep);
          ep.epIdx++;
        }
        return externalPush(par, nextFn);
      });
    });
    return;
  }

  var c = ep.data[ep.epIdx][ep.rowIdx];
  var sql = "INSERT INTO "+ex.dst_table+" ("+c.cols.join(",")+
                ") VALUES ("+c.qms.join(",")+")";
  //log(sql); log(c.vals);
  ep.conn.query(sql, c.vals, function(err, insRes){
    if(err) {
      log("ERROR: insert on "+dst+": "+err);
      ep_close(ep);
      ep.epIdx++;
      return externalPush(par, nextFn);
    }

    ep.rowIdx++;
    if(ep.rowIdx == ep.data[ep.epIdx].length) {
      if(dst != 'local') {
        ep.conn.commit(function(err) {
          if(err)
            log("ERROR: commit on "+dst+": "+err);
          externalPush(par, nextFn);
        });
        return;
      }
    }

    return externalPush(par, nextFn);
  });
}

function
doExternalUpdate(ep)
{
  if(external == undefined) {
    if(ep.checked)
      return htmlError(ep, "Cant read kipus_external, check the log");
    ep.checked = true;
    return rereadExternalTable(function(){ doExternalUpdate(ep) });
  }

  if(!ep.ex) {
    for(var i1=0; i1<external.length; i1++)
      if(external[i1].id == ep.exId)
        ep.ex = external[i1];
    if(!ep.ex)
      return htmlError(ep, "Cant find external with this id");
  }

  if(!ep.data) {
    ep.rowIdx = 0;
    ep.data = [];
    ep.req.body.now = 
        (new Date()).toISOString().substring(0,19).replace("T", " ");
    pool.getConnection(function(err, connection) {
      if(err)
        return htmlError(ep, "getConnection(src_table):"+err);
      connection.query("SELECT * from "+ep.ex.src_table,
      function(err, rows) {
        if(err) {
          connection.release();
          return htmlError(ep, "select(src_table):"+err);
        }
        for(var i1=0; i1<rows.length; i1++) {
          var r = rows[i1];
          var rh = {_bookid:r.bookid, _serverRowId:r.rowid };
          rh[ep.ex.src_table] = r;
          ep.data.push(computeColumns(ep.ex, ep.req.body, rh));
        }
        connection.release();
        doExternalUpdate(ep);
      });
    });
    return;
  }

  if(ep.rowIdx >= ep.data.length) {
    if(!ep.conn)
      return ep.res.end(JSON.stringify({ret:"rows transferred: 0"}));

    ep.conn.commit(function(err) {
      if(err)
        return htmlError(ep, "commit:"+err);
      ep.conn.release();
      ep.res.end(JSON.stringify({ret:"rows transferred: "+ep.rowIdx}));
    });
    return;
  }

  if(!ep.conn) {  // get new connection & start transaction
    var dst = ep.ex.destination;
    if(dst != 'local' && !dbPools[dst]) {
      if(!cfg.destination || !cfg.destination[dst])
        return htmlError(ep, "no config.js definition for "+dst);
      dbPools[dst] = mysql.createPool(cfg.destination[dst]);
    }
    var lpool = (dst == 'local' ? pool : dbPools[dst]);

    lpool.getConnection(function(err, connection) {
      if(err)
        return htmlError(ep, "getConnection to "+dst+": "+err);
      ep.conn = connection;
      ep.conn.beginTransaction(function(err) {
        if(err) {
          ep.conn.release();
          return htmlError(ep, "beginTransaction to "+dst+": "+err);
        }
        doExternalUpdate(ep);
      });
    });
    return;
  }

  if(!ep.truncate) {
    ep.truncate = true;
    ep.conn.query("TRUNCATE TABLE "+ep.ex.dst_table, function(err){
      if(err) {
        ep.conn.release();
        return htmlError(ep, "truncate table: "+err);
      }
      doExternalUpdate(ep);
    });
    return;
  }

  var c = ep.data[ep.rowIdx];
  var sql = "INSERT INTO "+ep.ex.dst_table+" ("+c.cols.join(",")+
                ") VALUES ("+c.qms.join(",")+")";
  ep.conn.query(sql, c.vals, function(err, insRes){
    if(err) {
      ep.conn.release();
      return htmlError(ep, "insert: "+err);
    }

    ep.rowIdx++;
    return doExternalUpdate(ep);
  });
}

function
externalUpdate(req, res, next)
{
  var b = req.body;
  if(!mods.auth.isAdmin(b.username))
    return htmlError({req:req, res: res}, "Permission denied ("+b.username+" is not admin)");
   
  if(!b.externalid)
    return htmlError({req:req, res: res}, "externalid parameter missing");

  external = undefined;
  doExternalUpdate({ req:req, res:res, next:next, exId:b.externalid });
}


module.exports.uploadPostProcessor = externalPush;
module.exports.cmd = { externalUpdate:externalUpdate };

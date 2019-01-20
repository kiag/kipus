/* Copyright KI-AG 2013-2019, Project KIPUS */
function
createTableRowIndexes(req, res, next)
{
  var b = req.body;
  var par = { req: req, res:res, next: next };
  if(!mods.auth.isAdmin(b.username))
    return htmlError(par, "Permission denied ("+b.username+" is not admin)");
  pool.getConnection(function(err, connection) {
    if(err)
      return htmlError(par, "getConnection(src_table):"+err);
    var sql = "SELECT constraintparam from kipus_pageattributes where constrainttype = 'tableRows'";
    connection.query(sql, 
    function(err, rows) {
      if(err) {
        connection.release();
        return htmlError(par, "SQL: "+sql+":"+err);
      }
      var trHash = {};
      for(var i1=0; i1<rows.length; i1++) {
        var cp = rows[i1].constraintparam.split(" "), ch = {};
        for(var i2=0; i2<cp.length; i2++) {
           var o = cp[i2].indexOf(':');
           if(o > 0)
             ch[cp[i2].substr(0,o)] = cp[i2].substr(o+1);
           ch.index = "IX_"+ch.prefix+"TARGETID";
           ch.indexCol = ch.prefix+"TARGETID";
        }
        trHash[ch.target] = ch;
      }
      var todo = Object.keys(trHash).length;
      var result = "";
      var error = false;
      for (var tr in trHash) {
        (function(tr){
        var ch = trHash[tr];
        sql = "DROP INDEX " + ch.index + " ON " + tr;
        connection.query(sql,
          function(err, res) {
            // ignore DROP error
            sql = "CREATE INDEX " + ch.index + " USING BTREE ON " + ch.target +" ("+ch.indexCol+")";
            connection.query(sql,
              function(err, res) {
                if(err) {
                  if (!error) {
                    connection.release();
                    error = true;
                    return htmlError(par, "SQL: "+sql+":"+err);
                  }
                }
                if (--todo == 0 && !error) {
                  connection.release();
                  par.res.end(JSON.stringify({ indexes_created: trHash }));
                }
            });
          });
        })(tr);
      }
    });
  });
}

module.exports.cmd = { createTableRowIndexes:createTableRowIndexes };

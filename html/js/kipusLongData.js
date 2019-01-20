/////////////////////////
// Kipus V2. Copyright 2014 KIAG
/* Copyright KI-AG 2013-2019, Project KIPUS */
"use strict";

function
backendSendLongDataQ(param)
{
  log("backendSendLongDataQ status:"+param.status);
  var status = param.status++;
   
  if (status === 0) { // get first queued data item to send
    param.username = userData.username; // kps_initialize  runs in parallel
    param.password = userData.password; // and resets this data
    db_deQueueLongDataQ(backendSendLongDataQ, param);
  }
  
  if (status === 1) { // send to backend
    var fn = "uploadData";
    var data = {};
    param.synced++;
    for(var key in param)
      data[key] = param[key];
    data.function = fn;
    data.username = param.username;
    data.password = param.password;
    data.colType = bdef.cols[data.columnName].constrainttype;

    var started = (new Date()).getTime();
    var ax = $.ajax({ dataType:"json",
                      cache:false, url:backendPrefix+"/bc",
                      type:"POST",
                      contentType: 'application/json; charset=utf-8',
                      data:JSON.stringify(data) });
    param.ajaxCall = ax;
    ax.done(function(res) {
      delete(param.ajaxCall);
      clearTimeout(param.timerId);
      delete(param.timerId);
      log(fn+" done. bookId:"+param.bookId+" "+param.tableName+"/"+
          param.rowId+"/"+param.columnName+" tCP:"+param.tableCopyParam);
      kps_db.transaction(function(tx) {
        tx.executeSql("UPDATE kps_longDataQ SET transferInProgress = ? "+
                       " WHERE seqNum = ? AND bookId = ? AND tableName = ? "+
                       "   AND rowId = ? AND columnName = ? ",
          [0, param.seqNum, param.bookId, param.tableName,
              param.rowId, param.columnName],
          undefined, db_errFn);
      }, db_errFn);
      if(typeof(res) === 'object' && res.error) {
        kps_setSyncFlag(false);
        return bc_handleFail("backendSendLongDataQ", fn, res.error);
      }
      var sfx = " finished";
      if(typeof res.length === "number") 
          sfx = " returned "+res.length+ " rows";
      log("bC: "+fn+sfx+" in "+((new Date()).getTime()-started)+" msec");

      backendSendLongDataQ(param);
    })
    .fail(function(req, stat, err) {
      delete(param.ajaxCall);
      clearTimeout(param.timerId);
      delete(param.timerId);
      log("failed kps_longDataQ.transferInProgress for bookId:"+param.bookId+
          " tableName:"+param.tableName+" rowId:"+param.rowId+
          " columnName:"+param.columnName);
      kps_db.transaction(function(tx) {
        tx.executeSql("UPDATE kps_longDataQ SET transferInProgress = ? "+
                       " WHERE seqNum = ? AND bookId = ? AND tableName = ? "+
                       "   AND rowId = ? AND columnName = ? ",
          [0, param.seqNum, param.bookId, param.tableName,
              param.rowId, param.columnName],
          undefined, db_errFn);
      }, db_errFn);
      if(err === "" && stat !== "error")
        err = stat;
      if(err === "")
        err = req.state();

      if (err === "abort"){ // special handling for abort owing to timeout
        okDialog(tr.syncTimeout);
      }
      else
        bc_handleFail("backendSendLongDataQ", fn, err);
      kps_setSyncFlag(false);
    });
  }
  
  if (status === 2) { // delete sent data item from longDataQ
    db_deleteFromLongDataQ(backendSendLongDataQ, param);
  }
 
  if(status === 3) { // send the next queued data item
    backendSendLongDataQ({status:0, finishFn:param.finishFn });
  }
  
}

function
db_deleteFromLongDataQ(nextFn, param)
{
  kps_db.transaction(function(tx) {
    tx.executeSql("DELETE FROM kps_longDataQ "+
                  " WHERE seqNum = ? AND bookId = ? AND tableName = ? "+
                  "   AND rowId = ? AND columnName = ? ", 
                  [param.seqNum, param.bookId, param.tableName,
                   param.rowId, param.columnName],
    function(tx,rs) { nextFn(param); },
    db_errFn);
  }, db_errFn);
}

function
db_deQueueLongDataQ(nextFn, param)
{
  kps_db.transaction(function(tx) {
    tx.executeSql("SELECT seqNum,bookId,tableName,rowId,columnName,data,"+
                  "tableCopyParam,transferInProgress FROM kps_longDataQ "+
                  "ORDER BY seqNum ASC", [],
    function(tx,rs) {
      log("LongData to Upload: "+rs.rows.length);
      if (rs.rows.length > 0) {
        kps_setSyncFlag(true, rs.rows.length);
        var r = rs.rows.item(0);

        msg(tr.syncSendImages);
        
        // dequeue the first entry by setting its 'transferInProgress' to 1
        for(var key in r)
          param[key] = r[key];
        var updateQuery = "UPDATE kps_longDataQ SET transferInProgress = ? "+
                          " WHERE seqNum = ? AND bookId = ? AND tableName = ? "+
                          "   AND rowId = ? AND columnName = ? ";
        tx.executeSql(updateQuery,
          [1, r.seqNum, r.bookId, r.tableName, r.rowId, r.columnName],
          function(){
            param.transferInProgress = 1;
            param.timerId = setTimeout(
              function(){
                if (typeof(param.ajaxCall) !== 'undefined') {
                  log("abort backendSendLongDataQ");
                  param.ajaxCall.abort();
                }
                log("reset kps_longDataQ.transferInProgress for bookId:"+
                    r.bookId+" tableName:"+r.tableName+" rowId:"+r.rowId+
                    " columnName:"+r.columnName);
                kps_db.transaction(function(tx1) {
                  tx1.executeSql(updateQuery,
                    [0, r.seqNum, r.bookId, r.tableName, r.rowId, r.columnName],
                    undefined, db_errFn);
                }, db_errFn);
              }, 
              120000 ); // 2 minutes
            nextFn(param);
          }, db_errFn);

        } else { // rs.rows.length == 0
          kps_setSyncFlag(false);
          if(param.finishFn)
            param.finishFn();
        }
      }, db_errFn);
    }, db_errFn);
}

function
kps_queueLongData(nextFn, param)
{
  var bookId, rowId;
  var longDataItems = [];
  param.numLongDataItems = 0;
  var trIgn = { rowid:1, bookid:1, rootbookid:1 };

  function
  imageResize(columnName, cd, nextFn)
  {
    if(!cd.data || !cd.data.match(/^data:image/)) 
      return nextFn();
    var img = new Image();
    img.onload = function(){
      var ret = kps_resizeImage(img, 192,192, cd.data);
      log("imageResize: resized "+columnName+" from "+cd.data.length+
          " to "+ret.length+" bytes");
      cd.data = ret;
      nextFn();
    };
    img.src = cd.data;
  }

  function
  fileRemove(colName, data)
  {
    var c = bdef.cols[colName];
    if(c.constraintparam && c.constraintparam.indexOf("AllowDownload") != -1)
      return "";
    return data;
  }

  function
  doSave(mainRow, tcp)
  {
    if(!mainRow._finished || mainRow._imgTodo || tcp)
      return;
    var bookId  = mainRow._bookId;  delete(mainRow._bookId);
    var tblName = mainRow._tblName; delete(mainRow._tblName);
    var rowId   = mainRow._rowId;   delete(mainRow._rowId);
    delete(mainRow._finished);
    delete(mainRow._changed);
    delete(mainRow._imgTodo);
    if(mainRow._changed)
      db_updateAnswer(bookId, tblName, rowId, mainRow);
  }

  function
  searchCol(rows, tableCopyParam, parentRow)
  {
    for (var i1 = 0; i1 < rows.length; i1++) {
      bookId = rows[i1]._bookid;
      rowId = rows[i1]._rowid;
      for (var tblName in rows[i1]) {
        if (/^(_.*)$/.test(tblName))
          continue;

        var attribute = rows[i1][tblName];
        var mainRow = parentRow ? parentRow : attribute;
        var cd = mainRow._complexData;
        if(!cd)
          cd = {};
        if(!tableCopyParam) {
          mainRow._imgTodo = 0;
          mainRow._tblName = tblName;
          mainRow._rowId   = rowId;
          mainRow._bookId  = bookId;
        }
        for (var item in attribute) {
          if(item.indexOf("_") == 0)
            continue;
          if(!bdef.cols[item]) {
            log("ERROR: missing column definition for "+tblName+"."+item);
            continue;
          }
          var ct = bdef.cols[item].constrainttype;

          if(ct == 'tableRows' || ct == 'tableCopy') {
            var arr;
            try {
              arr = JSON.parse(attribute[item]);
            } catch(e) {
              log("Problem with JSON data in "+tblName+"/"+item);
              continue;
            }
            var ch = kps_tableCopyParseParam(bdef.cols[item]);
            for(var i2=0; i2<arr.length; i2++) {
              var nre={}, nr={};
              for(var ae in arr[i2])
                if(!trIgn[ae])
                  nr[ae] = arr[i2][ae];
              nre[ch.target] = nr;
              nre._rowid = arr[i2][ch.prefix+"INDEX"];
              nre._bookid = bookId;
              var tcp = ch.prefix+","+
                        arr[i2][ch.prefix+"TARGETID"]+","+
                        arr[i2][ch.prefix+"INDEX"];
              searchCol([nre], tcp, mainRow);
              arr[i2] = nr;
            }
            attribute[item] = JSON.stringify(arr);
          }

          var val = attribute[item];
          if(!cd[val] || !cd[val].modified) // applies to cols with _complexData
            continue;

          if(!cd[val].data) {
            cd[val].data = "";
            cd[val].filename = "";
          }
          log("kps_queueLongData "+tblName+"."+item +
               " length:" + cd[val].data.length+", tcp:"+tableCopyParam);
          longDataItems.push({ bookId:bookId,
                               tableName:tblName, rowId:mainRow._rowId,
                               columnName:item,
                               data:cd[val].filename+";"+cd[val].data,
                               tableCopyParam:tableCopyParam });
          cd.modified = false;
          mainRow._changed = true;
          if(ct == 'foto' || ct == 'signature') {
            (function(mainRow, tcp){
              mainRow._imgTodo++;
              imageResize(item, cd[val], function(){
                mainRow._imgTodo--;
                doSave(mainRow, tcp);
              });
            })(mainRow, tcp);
            
          }
          if(ct == 'file')
            cd[val].data = fileRemove(item, cd[val].data);
        }
        if(!tableCopyParam) {
          mainRow._finished = true;
          doSave(mainRow, tcp);
        }
      }
    }
  }
  searchCol(param.rows, "");
  if(longDataItems.length)
    db_enQueueLongDataQ();
  else
    nextFn(param);

  function
  db_enQueueLongDataQ()
  {
    kps_db.transaction(function(tx) {
      var counter = 0;
      for (var i = 0; i < longDataItems.length; i++){
        log("db_enQueueLongDataQ: bookId:"+longDataItems[i].bookId+
            ", tableName:"+longDataItems[i].tableName+
            ", rowId:"+longDataItems[i].rowId+
            ", tableCopyParam:"+longDataItems[i].tableCopyParam+
            ", columnName:"+longDataItems[i].columnName);
        tx.executeSql("INSERT OR IGNORE INTO kps_longDataQ (bookId,tableName,"+
                "rowId,columnName,data,tableCopyParam,transferInProgress)"+
         " VALUES(?,?,?,?,?,?,?)", 
          [longDataItems[i].bookId, longDataItems[i].tableName,
           longDataItems[i].rowId,  longDataItems[i].columnName, 
           longDataItems[i].data,   longDataItems[i].tableCopyParam, 0],
          function() {
            if (++counter === longDataItems.length)
              nextFn(param);
          },
          function(errCode, errMsg) {
            db_errFn(errCode,errMsg);
            if (++counter === longDataItems.length)
              nextFn(param);
          });
      }
    }, db_errFn);
  }
}

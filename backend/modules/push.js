/* Copyright KI-AG 2013-2019, Project KIPUS */
// removeToken   - if set, remove token, else insert token
// keepToken     - if set, skip topic insertion
// removedTopics - if set, unsubscribe topic for the given token
function
updatePushToken(req, res, next)
{
  var b = req.body;

  if(!b || !b.username || !b.token)
    return htmlError({req:req, res:res}, "either column username or token is missing");

  var usr = b.username.toLowerCase();
  var sql;
  if (b.removeToken)
    sql = "DELETE from kipus_pushtoken where login='"+usr+"' and token='"+b.token+"'";
  else {
    sql = "INSERT INTO kipus_pushtoken (login, token, clientinfo, modifiedby, modified) ";
    sql += "VALUES('"+usr+"','"+b.token+"','"+JSON.stringify(b.platform)+"','"+usr+"','"+now()+"') ";
  }
  //log("sql="+sql);
  pool.getConnection(function(err, connection) {
    function update_topics() {
      // update topics
      var sql = "SELECT topic from kipus_usertopics where login = '"+usr+"'";
      connection.query(sql, [], function(err, rows){
        var request = require('request');
        connection.release();
        var rt = {};
        var topics = [];
        for (var i=0; i<rows.length; i++)
          topics.push(rows[i].topic);
        if (b.removedTopics) {
          for (var i=0; i<b.removedTopics.length; i++)
            rt[b.removedTopics[i]] = 1;
          topics = topics.concat(b.removedTopics);
        }
        var todo = topics.length;
        if (todo == 0)
          return res.end(JSON.stringify({}));
          
        for (var i0=0; i0<topics.length; i0++) {
        (function(idx){
          var topic = topics[idx];
          var batchFn = b.removeToken || rt[topic]? "batchRemove" : "batchAdd";
          
        request({
          url: 'https://iid.googleapis.com/iid/v1:'+batchFn,
          method: 'POST',
          headers: {
            'Content-Type' :' application/json',
            'Authorization': 'key='+cfg.messaging.FCM_SERVER_KEY
          },
          body: JSON.stringify(
            { 
              "to" : "/topics/"+topic,
              "registration_tokens": [ b.token ]
            }
          )
        }, function(error, response, body) {
          if (error) { 
            console.log(error);
            return htmlError({req:req, res:res}, "subscribeUserToTopic error: "+ error);
          }
          else if (response.statusCode >= 400) { 
            return htmlError({req:req, res:res}, 'HTTP Error: '+response.statusCode+' - '+response.statusMessage+'\n'+body); 
          }
          else {
            console.log((batchFn=="batchRemove"?"un":"")+"subscribed token for user " + usr + " "+ (batchFn=="batchRemove"?"from":"to")+" topic " + topic);
            if (--todo == 0)
              return res.end(JSON.stringify({}));
          }
        });
        })(i0);
        }  // for
      });
    } // end update_topics

    if (b.keepToken)
      update_topics();
    else
      connection.query(sql, [], function(err, insRes){

      if(err) {
        log("error in sql="+sql);
        connection.release();
        htmlError({req:req, res:res}, "update kipus_pushtoken:"+err);
      }
      update_topics();
    });
  });
}

function
sendPushMessage(req, res, next)
{
  var b = req.body;
  if(!b || !b.title || !b.to || !b.message)
    return htmlError({req:req, res:res}, "either 'title' or 'to' or 'message' is missing");

  var request = require('request');
  request({
    url: 'https://fcm.googleapis.com/fcm/send',
    method: 'POST',
    headers: {
      'Content-Type' :' application/json',
      'Authorization': 'key='+cfg.messaging.FCM_SERVER_KEY
    },
    body: JSON.stringify(
      { "data": {
          "title": b.title,
          "message": b.message
      },
        "to" : b.to
      }
    )
  }, function(error, response, body) {
    if (error) { 
      console.log(error);
      return htmlError({req:req, res:res}, "sendPushMessage error: "+ error);
    }
    else if (response.statusCode >= 400) { 
      return htmlError({req:req, res:res}, 'HTTP Error: '+response.statusCode+' - '+response.statusMessage+'\n'+body); 
    }
    else {
      console.log("pushed message to " + b.to);
      res.end(JSON.stringify({}));
    }
  });
}

// function = batchAdd|batchRemove
// users = array
function
subscribeUserToTopic(req, res, next)
{
  var b = req.body;
  if(!b || !b.users || !b.topic)
    return htmlError({req:req, res:res}, "either users or topic is missing");
  // if batchFn is not set, default to batchAdd
  var batchFn = b.batchFn ? b.batchFn : "batchAdd";
  var sql = "SELECT token from kipus_pushtoken where login in ('"+b.users.join("','")+"')";
  //log("sql="+sql);
  pool.getConnection(function(err, connection) {
    connection.query(sql, [], function(err, rows){
      connection.release();
      if(err) {
        console.log(err);
        log("error in sql="+sql);
        return htmlError({req:req, res:res}, "subscribeUserToTopic:"+err);
      }
      var tokens = [];
      for (var i=0; i<rows.length; i++) {
        tokens.push(rows[i].token);
      }
      if (!tokens.length) {
        log("subscribeUserToTopic: user(s) "+b.users.join(",")+" is not subscribed to push");
        return res.end(JSON.stringify({}));
      }
      var request = require('request');
      request({
        url: 'https://iid.googleapis.com/iid/v1:'+batchFn,
        method: 'POST',
        headers: {
          'Content-Type' :' application/json',
          'Authorization': 'key='+cfg.messaging.FCM_SERVER_KEY
        },
        body: JSON.stringify(
          { 
            "to" : "/topics/"+b.topic,
            "registration_tokens": tokens
          }
        )
      }, function(error, response, body) {
        if (error) { 
          console.log(error);
          return htmlError({req:req, res:res}, "subscribeUserToTopic error: "+ error);
        }
        else if (response.statusCode >= 400) { 
          return htmlError({req:req, res:res}, 'HTTP Error: '+response.statusCode+' - '+response.statusMessage+'\n'+body); 
        }
        else {
          console.log((batchFn=="batchRemove"?"un":"")+"subscribed user(s) " + b.users.join(",") + " "+(batchFn=="batchRemove"?"from":"to")+" topic " + b.topic);
          console.log(body);
          res.end(JSON.stringify(body));
        }
      });
    });
  });
}

function
now()
{
  return (new Date()).toISOString().substring(0,19).replace("T", " ");
}

module.exports.cmd = { updatePushToken:updatePushToken, 
                       sendPushMessage:sendPushMessage,
                       subscribeUserToTopic:subscribeUserToTopic };


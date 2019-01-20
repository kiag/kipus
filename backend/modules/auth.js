/* Copyright KI-AG 2013-2019, Project KIPUS */
var userTbl = {};
var roles = {};
var crypto = require('crypto');

var shaPrf = "sha512;";

// update kipus_user set pwhash=concat('sha512;',substring(pwhash,7)) where pwhash like 'sha512%';


function
readRolesTable()
{
  pool.getConnection(function(err, connection) {
    if(err) {
      log("getConnection:"+err);
      return;
    }
    connection.query("SELECT * from kipus_roles",
    function(err, rows) {
      if(err) {
        log("select from kipus_roles:"+err);
      } else {
        roles = {};
        for (var i=0; i<rows.length; i++) {
          var r = rows[i];
          roles[r.id] = { id: r.id, admin_rights: r.admin_rights, bookdef_rights: r.bookdef_rights };
        }
      }
      connection.release();
    });
  });
}

function
computePwHash(login, password)
{
  login = login.toLowerCase();
  return shaPrf+
         crypto.createHash('sha512')
               .update("kipus"+login+password)
               .digest("hex");
}

function
userUpdate(req, res, next)
{
  var cols = req.body.columns;
  if(cols && cols.login && cols.password) {
    cols.pwhash = computePwHash(cols.login, cols.password);
    delete(cols.password);
  }
  return mods.tableOps.cmd.tableUpdate(req,res,next);
}

function
userCreate(req, res, next)
{
  var cols = req.body.columns;
  if(!cols || !cols.login || !cols.password)
    return htmlError({req:req, res:res}, "userCreate columns log/password parameter missing");

  cols.pwhash = computePwHash(cols.login, cols.password);
  delete(cols.password);
  return mods.tableOps.cmd.tableInsert(req,res,next);
}

function
changepw(req, res, next)
{
  var b = req.body;

  if(!b || !b.username || !b.newpw)
    return htmlError({req:req, res:res}, "changepw column username or newpw is missing");

  var usr = b.username.toLowerCase();
  var sql = "UPDATE kipus_user SET pwhash='" +computePwHash(usr, b.newpw)+"',";
  sql += "modifiedby='"+usr+"',";
  sql += "modified='"+now()+"' where login='"+usr+"'";
  pool.getConnection(function(err, connection) {
    connection.query(sql, [], function(err, insRes){
      if(err) {
        log("error in sql="+sql);
        connection.release();
        htmlError({req:req, res:res}, "update kipus_user:"+err);
      }
      res.end(JSON.stringify({}));
      connection.release();
    });
  });
}

function
now()
{
  return (new Date()).toISOString().substring(0,19).replace("T", " ");
}

module.exports.cmd = { userCreate:userCreate,
                       userUpdate:userUpdate,
                       changepw:changepw,
                     };

// callbackFn: (req, res, next, pwError)  where pwError is set on error
// NOTE: as a side-effect, sets the userTbl entry for the current user
module.exports.checkPw = function(req, res, next, callbackFn)
{
  if(!req.body || !req.body.username) {
    callbackFn(req, res, next, "No username specified");
    return;
  }

  if(!req.body.password) {
    callbackFn(req, res, next, "No password specified");
    return;
  }

  var usr=req.body.username.toLowerCase(), pw=req.body.password;
  //log("auth check for "+usr);
  userTbl = {};
  pool.getConnection(function(err, connection) {
    if(err) {
      log("getConnection:"+err);
      return;
    }
    // Get the user info
    connection.query("SELECT * from kipus_user where login = '"+usr+"'",
    function(err, rows) {
      if(err) {
        log("select from kipus_user:"+err);
      } else {
        for(var i1=0; i1 < rows.length; i1++) {
          var r = rows[i1];
          userTbl[r.login.toLowerCase()] = r;
        }
      }
      connection.release();

      // Perform the password check
      if(!userTbl[usr]) {
        callbackFn(req, res, next, "User '"+usr+"' not found");
        return;
      }

      var pwhashMd5 = crypto.createHash('md5').update("kipus"+usr+pw).digest("hex");
      var pwhashSha = computePwHash(usr, pw);

      if(userTbl[usr].pwhash != pwhashMd5 && userTbl[usr].pwhash != pwhashSha) {
        callbackFn(req, res, next, "Password incorrect");
        return;
      }

      callbackFn(req, res, next, undefined); // password check ok
    });
  });
}

module.exports.checkBasicAuth = function (req, res, next, callBackFn)
{
  if (!req.headers || !req.headers.authorization) {
    res.setHeader('WWW-Authenticate', 'Basic realm="REST API gcp"'); // TODO: avoid hard-coded "gcp"
    res.statusCode = httpStatus.UNAUTHORIZED;
    res.end();
    return;
  }

  var authHdr = req.headers.authorization;  // "Basic dXNlcjpwYXNzd29y"
  var authString = authHdr.substring(authHdr.lastIndexOf(" ") + 1);
  var authBuf = new Buffer(authString,'base64');
  var basicAuth = authBuf.toString();
  var basicCredentials = basicAuth.split(":");
  var usr = basicCredentials[0].toLowerCase();
  var pw = basicCredentials[1];
  var pwHash;
  
  pool.getConnection(function(err, connection) {
    if (err) {
      log("checkBasicAuth: getConnection: "+err, LOGLEVEL.ERROR);
      res.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
      res.end();
      return;
    }
    // Get the user info
    connection.query("SELECT pwhash from kipus_user where login = '"+usr+"'",
      function(err, rows) {
        if (err) {
          log("checkBasicAuth: select from kipus_user: "+err, LOGLEVEL.ERROR);
          res.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
          res.end();
          return;
       } 
        else if (rows.length === 0) {
          log("checkBasicAuth: User '"+usr+"' not found");
          res.statusCode = httpStatus.UNAUTHORIZED;
          res.end();
          return;
        }
        else if (rows.length > 1) {
          log("checkBasicAuth: Too many entries in kipus_user for user '"+usr+"'", LOGLEVEL.ERROR);
          res.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
          res.end();
          return;
        }
        else {
          pwHash = rows[0].pwhash;
        }
        connection.release();
  
        // Perform the password check
        var pwhashMd5 = crypto.createHash('md5').update("kipus"+usr+pw).digest("hex");
        var pwhashSha = computePwHash(usr, pw);
        if (pwHash != pwhashMd5 && pwHash != pwhashSha) {
          log("checkBasicAuth: Password incorrect for user '"+usr+"'");
          res.statusCode = httpStatus.UNAUTHORIZED;
          res.end();
          return;
        }
  
        callBackFn(req, res, next, usr); // basic auth check ok
      }
    );
  });  
}

function
userRights(user)
{
  if(!user)
    return "";
  var usr = user.toLowerCase();
  if(!userTbl[usr])
    return "";
  return userTbl[usr].rights;
}

module.exports.isReportReader = function(user)
{
  var rights = userRights(user)?userRights(user).split(" "):"";
  if (rights.length == 1) {
    var rid = rights[0].split(":")[0];
    var role = roles[rid];
    if (role && role.admin_rights && role.admin_rights.indexOf("Reports=read") >= 0)
      return true;
  }
  return false;
}

module.exports.isAdmin = function(user)
{
  if (module.exports.isReportReader(user))
    return false;
  // commented out, permission check is done in frontend, backend check to be done later
  return true;
  //return (userRights(user).indexOf("admin") >= 0);
}

module.exports.isViewer = function(user)
{
  // commented out, permission check is done in frontend, backend check to be done later
  return true;
  //return (userRights(user).indexOf("viewer") >= 0);
}
module.exports.computePwHash = computePwHash;

readRolesTable();

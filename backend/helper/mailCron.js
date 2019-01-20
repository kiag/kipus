/* Copyright KI-AG 2013-2019, Project KIPUS */

// $Id: mailCron.js 2344 2017-10-26 10:57:18Z dba $

// look in database for fertilizer/pesticides/fungicides/herbicides
// where modified-Date is not older than one hour.
// for each found entry, send Mail to mail recipients

global.log = console.log;
var argv = process.argv;

if(argv.length != 2) {
  log("Usage:");
  log("% export NODE_PATH=../node/node_modules");
  log("% ../node/bin/node helper/mailCron.js");
  process.exit(1);
}

var LOGLEVEL = {
  "ALL": 0,
  "TRACE": 1,
  "DEBUG": 2,
  "INFO": 3,
  "WARN": 4,
  "ERROR": 5,
  "FATAL": 6,
  "OFF": 7
};
global.LOGLEVEL = LOGLEVEL;


var cfg = require('../config');
var fs = require('fs');
var mysql = require('mysql');
log("Using database: " + cfg.db.database + " on host: " + cfg.db.host);
global.pool = mysql.createPool(cfg.db);
var db  = mysql.createConnection(cfg.db);
var notifiyMail  = require('../../html/projects/lvdm/sendMail.js');
var req = { body: { username: "nodeUser" } }; 

function
sendMail(par, callbackfn)
{
  var subject = "KIPUS"+cfg.prefix;
  var b = ((par.req && par.req.body) ? par.req.body : {});
  var os = require('os');
  var fn = (par.fn ? par.fn : b.function);
  var user = (par.username ? par.username : (b.username ? b.username:"system"));
  par.username = user;
  subject += " " + par.subject;
  var text = "\r\n\r\n" + par.text;
  //log("Sending mail:"+subject+"\n"+text);
  if (!cfg.mail) {
    log("mail is not configured in config, unable to send mail");
    process.exit(0);
  }

  var ca = [];
  fs.readdirSync(cfg.certDir).forEach(file => {
    if (file.indexOf(".pem")>-1)
      ca.push(fs.readFileSync(cfg.certDir+"/"+file));
  });
  cfg.mail.tls = { ca :  ca,
                   checkServerIdentity: function (host, cert) {
                          return undefined;
                   }
  };
  var mailOptions = {
    from: cfg.mail.from,
    to: par.to,
    subject: subject,
    text: text
  };

  var nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch(err) {
    log("Cannot load nodemailer:"+err);
    return;
  }

  var transporter = nodemailer.createTransport(cfg.mail);
  transporter.sendMail(mailOptions, function(error, info){
    if (error)
      log("mail error: " +error);
    if (callbackfn)
      callbackfn();
  });
}
global.sendMail = sendMail;

notifiyMail.notifyOnPlantProtectionUse(req, function() {
  log("notifyOnPlantProtectionUse finished");
  notifiyMail.notifyOnOtherInStore(req, function() {
    log("notifyOnOtherInStore finished");
    process.exit(0);
  });
});

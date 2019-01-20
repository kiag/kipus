// Kipus User Frontend Library
/* Copyright KI-AG 2013-2019, Project KIPUS */

var logBuffer=[], logSize=250, logIndex=logSize;
var isIE = (navigator.appVersion.indexOf("MSIE") > 0);
var isiOS = navigator.userAgent.match(/(iPad|iPhone|iPod)/);
var isAndroid = navigator.userAgent.match(/(Android)/);
var backendPrefix, projectName, offlineFilesArray=[];

var path = document.location.pathname;

backendPrefix = path.substr(0,path.lastIndexOf('/'));
  

function
log(txt)
{
  //if(arguments.callee.caller)
  //  txt = arguments.callee.caller.name + " "+txt;
  var d = new Date();
  var ms = ("000"+(d.getMilliseconds()%1000));
  ms = ms.substr(ms.length-3,3);
  txt = d.toTimeString().substring(0,8)+"."+ms+" "+txt;
  console.log(txt);
  logIndex = (logIndex+1)%logSize;
  logBuffer[logIndex] = txt;
}

function
okDialog(txt, quiet, options, callbackFn)
{
  if(window.kps_msgDivReset)
    kps_msgDivReset(0);
  if(!quiet)
    log("okDialog: "+txt);

  var d = $("div#dlg_ok");
  if(d.length > 0) {
    $(d).html(txt);
    return;
  }
  var param = {
    dialogClass:"no-close", modal:true, width:360,
    buttons: [{text:(tr.ok ? tr.ok : "Ok"), click:function(){
      if(callbackFn)
        callbackFn();
      okDialogClose();
    }}]
  };
  if(options)
    for(o in options)
      param[o] = options[o];

  $("body").append("<div id='dlg_ok'></div>");
  $("div#dlg_ok").html(txt);
  dlg = $("div#dlg_ok").dialog(param);
  if (options && options.windowResize) {
    window.addEventListener("resize", function() {
      if (!dlg)
         return;
      options.windowResize(dlg); 
    }, false);
  }
}

function
okDialogClose()
{
  if(window.kps_msgDivReset)
    kps_msgDivReset(1);
  $("div#dlg_ok").dialog('close');
  $("div#dlg_ok").remove();
}



function
okCancelDialog(txt, yesFn, noFn, yesTxt, noTxt)
{
  if(!yesTxt) yesTxt = tr.ok;
  if(!noTxt) noTxt = tr.cancel;
  $("body").append("<div id='dlg_okCancel'></div>");
  $("div#dlg_okCancel").html(txt);
  $("div#dlg_okCancel").dialog({
    dialogClass:"no-close", modal:true, buttons: [
      {text:noTxt, click:function(){
        $(this).dialog("close");
        $("div#dlg_okCancel").remove();
        if(noFn)
          noFn();
      }},
      {text:yesTxt, click:function(){
        $(this).dialog("close");
        $("div#dlg_okCancel").remove();
        if(yesFn)
          yesFn();
      }}]
  });
  log("okCancelDialog: "+txt);
}


function
now(d)
{
  function pad(number) { return (number<10 ? '0'+number : number); }
  if(!d)
    d = new Date();
  if(isNaN(d.getTime()))
    return "N/A";
  var ret =    d.getFullYear() +
    '-' + pad( d.getMonth()+1 ) +
    '-' + pad( d.getDate() ) +
    ' ' + pad( d.getHours() ) +
    ':' + pad( d.getMinutes() ) +
    ':' + pad( d.getSeconds() );
  return ret;
}

function
nowUTC(d)
{
  function pad(number) { return (number<10 ? '0'+number : number); }
  if(!d)
    d = new Date();
  if(isNaN(d.getTime()))
    return "N/A";
  var ret =    d.getUTCFullYear() +
    '-' + pad( d.getUTCMonth()+1 ) +
    '-' + pad( d.getUTCDate() ) +
    ' ' + pad( d.getUTCHours() ) +
    ':' + pad( d.getUTCMinutes() ) +
    ':' + pad( d.getUTCSeconds() );
  return ret;
}

function isDate(d) { if(!d || d == "0000-00-00") return false; return true; }

function
date2str(d) {
  if(!isDate(d))
    return "";
  return now(new Date(d)).substr(0,10);
}

function
str2date(d)
{
  if(!isDate(d))
    return "";
  return nowUTC(new Date(d))+".000Z";
}

function
dtime2str(d)
{
  if(d.indexOf("0000-00-00") == 0 || !isDate(d))
    return "";
  return now(new Date(d)).substr(0,16);
}

function
str2dtime(d)
{
  if(!isDate(d))
    return "";
  return nowUTC(new Date(d))+".000Z";
}


function
bc_handleFail(caller, fn, err, failFn, failPar)
{
  if(failFn) {
    log(caller+" "+fn+" FAILED: "+err+" (handled)");
    failFn(err, failPar);

  } else {
    if(err == "rejected")
      err = tr.networkErr ? tr.networkErr : 
            "Network Error, please check the Internet Connection.";
    okDialog(caller+" "+fn+" FAILED: "+err);
  }
}

function
backendCall(fn, data, resultFn, resultPar, failFn, failPar)
{
  data.function = fn;
  data.username = userData.username;
  data.password = userData.password;

  var started = (new Date()).getTime();
  var ax = $.ajax({ dataType:"json",
                    cache:false, url:backendPrefix+"/bc",
                    type:"POST",
                    timeout: 900000, // due to the chinese
                    contentType: 'application/json; charset=utf-8',
                    data:JSON.stringify(data) });

  ax.done(function(res) {
    if(typeof(res) == 'object' && res.error)
      return bc_handleFail("backendCall", fn, res.error, failFn, failPar);
    if(fn != "getImage") {
      var sfx = " finished";
      if(typeof res.length == "number") 
        sfx = " returned "+res.length+ " rows";
      log("bC: "+fn+sfx+" in "+((new Date()).getTime()-started)+" msec");
    }
    if(resultFn)
      resultFn(res, resultPar);
  })
  .fail(function(req, stat, err) {
    log("FAIL ERR:"+err);
    log("FAIL STAT:"+stat);
    if(fn == "upload")
      kps_setSyncFlag(false);
    if(err == "" && stat != "error")
      err = stat;
    if(err == "")
      err = req.state();
    bc_handleFail("backendCall", fn, err, failFn, failPar);
  });
}

function
backendGetImage(fname)
{
  var started = (new Date()).getTime();
  data.function = "getImage";
  data.username = userData.username;
  data.password = userData.password;
  var ax = $.ajax({ dataType:"json",
                    cache:false, url:backendPrefix+"/bc",
                    type:"POST",
                    contentType: 'application/json; charset=utf-8',
                    data:JSON.stringify(data) });

  ax.done(function(res) {
    if(typeof(res) == 'object' && res.error)
      return bc_handleFail("backendGetImage", fn, res.error, failFn, failPar);
    var sfx = " finished";
    if(typeof res.length == "number") 
      sfx = " returned "+res.length+ " rows";
    log("bC: "+fn+sfx+" in "+((new Date()).getTime()-started)+" msec");
    if(resultFn)
      resultFn(res, resultPar);

  })
  .fail(function(req, stat, err) {
    if(err == "" && stat != "error")
      err = stat;
    if(err == "")
      err = req.state();
    bc_handleFail("backendGetImage", fn, err, failFn, failPar);
  });
}


/////////////////////////////////////
function
loadTranslation(name, hash, quiet, nextFn)
{
  var fName, n1, n2;
  n1 = "/"+name;
  n2 = n1.replace(/-/g, "_");
  for(var i1=0; i1<offlineFilesArray.length; i1++) {
    var ofa = offlineFilesArray[i1].replace(/:.*/,'');
    if(ofa.indexOf(n1) >= 0 || ofa.indexOf(n2) >= 0) {
      fName = ofa;
      break;
    }
  }
  if(!fName) {
    if(!quiet)
      okDialog("File for "+name+" is missing");
    return nextFn();
  }

  log("Loading translation "+fName);
  $.ajax({ url:fName })
  .done(function(data) {
    $(data).find("trans-unit").each(function() {
      var t = $(this).find("target").text();
      if(!t)
        t = $(this).find("source").text();
      hash[$(this).attr("id")] = t;
    });
    return nextFn();
  })
  .fail(function(req, stat, err) {
    if(!quiet)
     okDialog("ERROR loading "+fName);
    return nextFn();
  });
}

function
sprintf()
{
  var formatted = arguments[0];
  for (var i = 1; i < arguments.length; i++) {
    var regexp = new RegExp('\\{'+i+'\\}', 'gi');
    var arg = arguments[i];
    if(arg == null)
      arg = '';
    formatted = formatted.replace(regexp, arg);
  }
  return formatted;
}

function
trDef(def, elName)
{
  if(!def)
    return elName;
  var res = tr[def.trpref+elName];
//log("trDef: "+def.trpref+elName+" "+def[elName] +"=>"+res);
  return res ? res : (def[elName] ? def[elName] : elName);
}

function
arrToObj(arr)
{
  var obj = {};
  for(var i1=0; i1<arr.length; i1++)
    obj[arr[i1]] = 1;
  return obj;
}

//////////////////////////
// start of script functions
function
loadScript(sname, callback)
{
  var h = document.head || document.getElementsByTagName('head')[0];
  var arr = h.getElementsByTagName("script");
  for(var i1=0; i1<arr.length; i1++)
    if(sname == arr[i1].getAttribute("src")) {
      if(callback)
        callback();
      return;
    }
  var script = document.createElement("script");
  script.src = sname;
  script.async = script.defer = false;
  script.type = "text/javascript";


  log("Loading script "+sname);
  if(isIE) {
    script.onreadystatechange = function() {
      if(script.readyState == 'loaded' || script.readyState == 'complete') {
        script.onreadystatechange = null;
        if(callback)
          callback();
      }
    }
  } else {
    script.onload = function(){ if(callback) callback(); }

  }
  
  h.appendChild(script);
}

function
loadLink(lname)
{
  var h = document.head || document.getElementsByTagName('head')[0];
  var arr = h.getElementsByTagName("link");
  for(var i1=0; i1<arr.length; i1++)
    if(lname == arr[i1].getAttribute("href"))
      return;
  var link = document.createElement("link");
  link.href = lname;
  link.rel = "stylesheet";
  log("Loading link "+lname);
  h.appendChild(link);
}

// float to HH:MM
function
float2hm(input)
{
  var h=parseInt(input), m=Math.round((parseFloat(input)-h)*60);
  return h+":"+(m < 10 ? '0'+m : m);
}

// HH:MM to float
function
hm2float(input)
{
  var val = input.split(":");
  return parseFloat(val[0])+(parseFloat(val[1])/60);
}

function
newUUID()
{
  var ml = [8,4,4,4,12], ret=[];
  for(var i1=0; i1<ml.length; i1++) {
    var str="";
    for(var i2=0; i2<ml[i1]; i2++) {
      str += Math.floor(Math.random()*16).toString(16);
    }
    ret.push(str);
  }
  return ret.join("-");
}

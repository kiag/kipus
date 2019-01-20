/* Copyright KI-AG 2013-2019, Project KIPUS */

var svnId = "$Id: kipus.js 3659 2019-01-20 14:03:39Z rko $";
var version = "V: "+svnId.split(" ")[3];

var platform;
var currentScreen, currentLevel, updatedScreen, screenNames=[], screenFns=[];
var screenEffect=[];
var contentOffset=46; // See kipus.css
var bdef, books, bookHash, luTables, origLuTables, hierHash, btnIdIdx=0;
var brPref="-webkit-";
var imgDir="css/images/", imagesBeingSaved = 0;
var userData = {}, kps_languages=[], kps_syslang, kps_deflang, kps_srclang;
var tr={};
var lastGlueWithNext="NO", lastGlueColName1="", lastGlueColName2="", lastGroup;
var syncInProgress, loginDone, syncMsg='';
var gq={}, kps_elevator, kps_geocoder, insideTableRows;
var debugdata, syncDebug = false;
var blockHooks = {};
var pgmHooks = { 
  checkParam:[],
  initialized:[],
  popScreen:[],
  save:[],
  showScreen:[],
  backButton:[],
};
var syncHooks = []; // uses nextFn, incompatible with pgmHooks
var jsChangeColumn, editRowParam, editBookParam;
var signaturePad, inDbOpen, reloadNeeded, syncChangedData, last_apcWidth;
var kps_inFinishPage;
var kpsGmKey = 'AIzaSyClpSTQdJrXrIhlubHCdtzGC9acwCEOZoo';
var kps_hiddenBook={}; // set from kipus_addition.js
var kps_msgDiv;        // msg in a div, not dialog
var useDeprecatedCache = false;
var kps_offlineTimestamps = {};
var cacheName, updateCacheName;
var kps_googleMapsEnabled=true;
var swRegistration;
var pn = location.pathname.split("/");

if(!platform) {
  var ua = navigator.userAgent;
  var off = ua.indexOf("Android");
  if(off > 0) {
    platform = { os: "Android",
                 platform: "mobile",
                 osVersion: ua.substring(off+8, ua.indexOf(';', off)) };
  } else if(ua.indexOf("iPhone") > 0 || ua.indexOf("iPad") > 0) {
    platform = { os: "iOS",
                 platform: "mobile",
                 osVersion: ua.substring(ua.indexOf("CPU OS"+6),
                 ua.indexOf(' like MacOS')) };
  } else {
    var os = "unknown";
    if(ua.indexOf("Windows") > 0)
      os = "windows";
    if(ua.indexOf("Mac") > 0)
      os = "mac";
    if(ua.indexOf("Linux") > 0)
      os = "linux";
    platform = { os: os, platform: "desktop", osVersion: "unknown" };
  }

  platform.userAgent = ua;
  platform.kipusVersion = version;
  if(navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate()
      .then(function(estimate){
        platform.storage = { 
          used:parseInt(estimate.usage/1024/1024)+" MB",
          max: parseInt(estimate.quota/1024/1024)+" MB"
        }
      });
  }
  var c = navigator.connection;
  if(c) {
    platform.connection = { type:c.type, effectiveType:c.effectiveType,
                            downlink:c.downlink, downlinkMax:c.downlinkMax,
                            rtt:c.rtt };
  }
  platform.permissions={};
  if(navigator.permissions) {
    function
    cp(perm) {
      navigator.permissions.query(perm).then(function(permRes) {
        platform.permissions[perm.name] = permRes.state;
      });
    }
    cp({name:'geolocation'});
    cp({name:'notifications'});
    cp({name:'push', userVisibleOnly:true });
  }
  platform.timezoneOffset = (new Date()).getTimezoneOffset();
}
  


function
msg(txt)
{
  if(kps_msgDiv)
    $(kps_msgDiv).html(txt.replace(/ /g, '&nbsp;'));
  else  
    okDialog(txt, false, { width:360 } );
}

window.onerror = function(errMsg, url, lineno){
  var fArr = url.split("/");
  okDialog(fArr[fArr.length-1]+" line "+lineno+": "+errMsg);
}
 


////////////////////////////////////////
$(document).ready(function(){
  projectName = $("title").attr("projectname");
  cacheName = 'kipusClient.'+ (pn.length > 3 ? pn[1]: location.host) +"."+projectName; // location.host is special treatment for project hosted external
  updateCacheName = 'update'+cacheName;
  log("project "+(projectName ? projectName:"default")+", pgm "+version);
  function doFallback() {
    // fallback to application cache (push and application.manifest not supported in this mode)
    $("html").attr("manifest", projectName+".manifest");
    var acActive = false;
    var acTypes = ['cached','checking','downloading','error',
                   'noupdate','obsolete','progress','updateready'];
    function
    handleCacheEvent(e)
    {
      if(e.type == "noupdate" && syncChangedData)
        return kps_initialize();
      if(e.type == "checking" || e.type == "noupdate" || e.type == "obsolete")
        return;

      if(e.type == "downloading")
        acActive = true;

      if(e.type == "error") {
        if(!acActive)       // initial error won't count: we are just offline
          return;
        var str = tr.downloadProgramError ? tr.downloadProgramError :
                  "Loading program failed:<br>{1}<br>Try to reload.";
        okDialog(sprintf(str, e.message));
      }

      if(e.type == "progress") {
        var str = tr.downloadProgram ? tr.downloadProgram :
                  "Loading program files:<br>{1} of {2}";
        okDialog(sprintf(str, e.loaded, e.total));
        acActive = true;
      }

      if(e.type == "cached" || e.type == "updateready") {
        if(inDbOpen) {
          reloadNeeded = true; // else race condition, db version remains is 1.1

        } else {
          window.onbeforeunload = undefined;
          window.location.reload();
        }
      }
    }
    for(var i in acTypes) {
      applicationCache.addEventListener(acTypes[i], handleCacheEvent, false);
    }
    useDeprecatedCache = true;
    kps_initialize()
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // use service worker for caching, push and application.manifest (add app to home screen)
    swRegistration = null;
    navigator.serviceWorker
             .register(projectName+'.service-worker.js')
             .then(function(registration) { 
                 swRegistration = registration;
                 console.log('Service Worker Registered');
                 navigator.serviceWorker.addEventListener('message', function(event) {
                   if (event.data.msg && (event.data.fn == "onDownloading" || event.data.fn == "onDownloadFinished")) {
                     //log(tr.ok);
                     okDialog(event.data.msg, false, { buttons: {}});
                     if (event.data.fn == "onDownloadFinished")
                       setTimeout(okDialogClose, 50);
                   }
                 });
                 kps_initialize();
              })
             .catch(function(err) {
                console.log("Service Worker Register Error");
                console.log(err);
                // fallback to application cache (push and application.manifest not supported in this mode)
                okDialog(tr.swRegisterError, false, null, doFallback );
             });
    // disable application cache manifest
    $("html").removeAttr("manifest");
  } else
    doFallback();
  kps_backbutton();
  jQuery.fn.center = function() {
      this.css({
          "position": "absolute",
          "top": ((($(window).height() - this.outerHeight()) / 2) + $(window).scrollTop() + "px"),
          "left": ((($(window).width() - this.outerWidth()) / 2) + $(window).scrollLeft() + "px")
      });
      return this;
  }
  window.addEventListener('appinstalled', function(event) {
    window.onbeforeunload = undefined;
    document.body.innerHTML = '<div style="padding: 50px;">'+tr.appInstalled+'</div>';
  });
});
$(window).resize(kps_resize);

function
kps_setHeight(h)
{
  if($("#content-wrapper").hasClass("login")) {
    $("#content-wrapper > div#d3 > div").css("min-height", h);
  } else {
    $("#content-wrapper > div#d3 > div").css("min-height", h-contentOffset);
  }
}

function
kps_resize()
{
  var w=$(window).width(), h=$(window).height();
  if(w < 500) {
    $("#header img").css({width:"30%", height:"auto"});
  } else {
    $("#header img").css({width:"auto", height:"auto"});
  }
  kps_setHeight(h);
  $("#content-wrapper").css(brPref+"perspective",w+"px");
  log("Resize to "+w+" x "+h); // Android keyboard display causes 2x resize
}

function
kps_registerScreen(caller)
{
  if(!caller) {
    screenNames = [ "kps_firstScreen" ];
    screenFns = [ { fn:kps_firstScreen, args:[] } ];
  } else {
    screenNames.unshift(caller.name)
    screenFns.unshift({ fn:caller , args:caller.arguments });
  }
}

function
kps_deregisterScreen()
{
  screenNames.shift();
  screenFns.shift();
}
 
function
kps_resetScreen()
{
  // Reset the screen stack
  currentLevel = 1;
  currentScreen = "#content-wrapper > div#d3 > div.level_1 > div";
  kps_registerScreen(); // reset

  blockHooks = {};
  $("#header-wrapper").html(
    '<div class="back level_1"></div>'+
    '<div class="title level_1"><span class="maintitle"></span></div>'+
    '<div id="menubuttons">'+
      '<div id="syncicon" class="toplevelonly"></div>'+
      '<div id="mainmenuicon" class="toplevelonly"></div>'+
      (kps_languages.length > 1 ? '<div id="settingsicon"></div>' : '')+
    '</div>');
  $("#header-wrapper #syncicon")
    .click(function(){
      syncChangedData = false;
      kps_syncBookDef(function() {
        kps_syncUploadData({ nextFn:function(nextFn){
          kps_execSyncHooks(function(){
            if(nextFn)
              nextFn();
            if (typeof messaging !== 'undefined' && typeof userData.pushAsked == 'undefined') {
              // user who where never asked to push, get asked on sync
              initializePush();
              if (!isSubscribed) {
                okCancelDialog(tr.pushPrompt, function(){ subscribeUser(); }, null,
                               tr.yes?tr.yes:"Yes",
                               tr.no?tr.no:"No");
                userData.pushAsked = true;
                db_updateAnswer(0,"userPref",0, userData);
              }
            }
          });
        }});
      });
    });
  $("#header-wrapper #mainmenuicon").click(kps_admin);
  $("#header-wrapper #settingsicon").click(kps_langChange);
  kps_setTitleTooltips();

  $("#content-wrapper > div#d3 div").remove();
  $("#content-wrapper > div#d3")
    .append('<div class="level_1"><div></div></div>');
}

function
kps_setTitleTooltips()
{
  $("#header-wrapper div.title.level_1").html(
     (bdef.user && bdef.user.status=="LOCKED") ?
        (tr.locked ? tr.locked:"Data entry locked") : tr.home);
  $("#header-wrapper #syncicon")    .attr("title", tr.admin_sync);
  $("#header-wrapper #mainmenuicon").attr("title", tr.admin);
  $("#header-wrapper #settingsicon")    .attr("title", tr.settingsTitle?tr.settingsTitle:"User settings");
}

function
kps_resetInternals()
{
  bdef={}, books=[], bookHash={}, luTables={};
  origLuTables={}, hierHash={}, userData={};
}

function
kps_loadTrans(lang, nextFn)
{
  kps_syslang = lang;
  $("body").attr("lang", lang);
  tr = {};
  loadTranslation("kipus-"+lang+".xml", tr, false, function(){
    loadTranslation("project_"+lang+".xml", tr, true, function(){
      loadTranslation("custom_"+lang+".xml", tr, true, function(){
        log("set datepicker defaults to " + lang);
        $.datepicker.setDefaults($.datepicker.regional['']);
        $.datepicker.setDefaults($.datepicker.regional[lang]);
        nextFn();
      });
    });
  });
}

////////////////////////////////////////////////
function
kps_initialize(param, data)
{
  if(!param || param.state == undefined) {
    syncChangedData = false;
    if(!param)
      param = {};

    if(!param.firstState) { // firstState is set only in kps_newBookChanged
      tr = {};
      kps_resetInternals();
      offlineFilesArray = $("#offlineFiles").html().split("\n");
      kps_srclang = $("#offlineFiles").attr("sourcelang");
      if(!kps_srclang)
        kps_srclang = "en";
      kps_deflang = $("#offlineFiles").attr("defaultlang");
      if(!kps_deflang)
        kps_deflang = "en";
    }

    param.state = (param.firstState ? param.firstState : 0);
  }

  var state = param.state++;
  //log("kps_initialize:"+state);
  if(state == 0) {
    kps_resize();
    inDbOpen = true;
    return db_open(function(){
      inDbOpen = false;
      if(reloadNeeded) {
        window.onbeforeunload = undefined;
        window.location.reload();
      } else {
        kps_initialize(param);
      }
    }, param);
  }

  if(state == 1) {     // check if current version is completely loaded
    //var isGood = (platform.platform == "desktop" || navigator.connection.type == "wifi" || 
    //             navigator.connection.type == "cellular" && navigator.connection.downlinkMax >= 0.2);
    if(swRegistration && swRegistration.active && swRegistration.active.state == "activated") {
      caches.open(cacheName).then(function(cache) {
        cache.keys().then(function(cacheNames) {
          if (cacheNames.length != 0 && cacheNames.length < offlineFilesArray.length) {
            log("cacheNames.length < offlineFilesArray.length ("+cacheNames.length +" < " + offlineFilesArray.length+")");
            log("current version is not completely loaded, try to restore from backup cache"); 
            caches.open(updateCacheName).then(function(updateCache) {
              updateCache.keys().then(function(updateCacheNames) {
                var todo = updateCacheNames.length;
                if (todo==0) {
                  log("no files in " + updateCacheName + " cache found, downloading on next sync");
                  return kps_initialize(param, data);
                }
                for (var i=0; i< updateCacheNames.length; i++) {
                   var request = updateCacheNames[i].clone();
                   updateCache.match(request).then(function(response) {
                     log("updating file " + response.url + " in cache");
                     cache.put(response.url, response.clone()).then(function() {
                       if (--todo==0) {
                         caches.delete(updateCacheName).then(function() {
                            log(updateCacheName+" cache deleted because no longer needed");
                         });
                         kps_initialize(param, data);
                       }
                     });
                   });
                }
              });
            });
             
          } else {
            if (cacheNames.length == offlineFilesArray.length)
              log("offlineFilesArray length = "+ offlineFilesArray.length+", current version is completely loaded in cache");
            kps_initialize(param, data);
          }
        });
      });
    } else
      state++;
  }

  if(state == 2) {
    var lHash = {};
    var re = new RegExp("(project|custom|kipus)_(..).xml");
    for(var i1=0; i1<offlineFilesArray.length;i1++) {
      var fn = offlineFilesArray[i1].replace(/:.*$/,'');
      var res = re.exec(fn);
      if(res && res.length > 2)
        lHash[res[2]] = 1;
      if(fn.indexOf(".css", fn.length - 4) !== -1) //commented in #939/2015-11
        loadLink(fn);
      if(fn.indexOf(".js", fn.length - 3) !== -1)
        loadScript(fn);
    }

    kps_languages = [];
    for(var lang in lHash)
      kps_languages.push(lang);
      
    kps_loadTrans(kps_deflang, function() { kps_initialize(param); });
    return;
  }

  if(state == 3) {
    kps_resetScreen();
    return db_getAnswer(0,"userPref",0, function(data) {
      db_getAnswer(0, "lastSync", 0, function(res){
        if(!data || !data.username || !res.lastSync)
          return kps_login(false);
        userData = data;
        if(userData.language == kps_syslang) {
          kps_initialize(param, data);

        } else {
          kps_loadTrans(userData.language, function(){kps_initialize(param);});
          return;
        }
      });
    });
  }

  if(state == 4) {
    return db_getAnswer(0,"bookdef",0,
                function(data){ kps_initialize(param, data); } );
  }

  if(state == 5) {
    if(data) {
      if(data.data)     // compatibility mode after kps_answer conversion
        data = JSON.parse(data.data);
      kps_digestBookdef(data);

      if(bdef.user && bdef.user.alwaysLogin=="YES" && !loginDone)
        return kps_login(false, param);
      return kps_initialize(param);

    } else {
      return kps_syncBookDef(kps_initialize, param); // ??
    }
  }

  if(state == 6)        // was: loading user translation
    return kps_initialize(param);

  if(state == 7)        // book specific translation is now project specific
    return kps_initialize(param);

  if(state == 8) {
    kps_setTitleTooltips();
    kps_loadLookupTables(function(){kps_initialize(param)});
    return;
  }

  if(state == 9)
    return db_getBooks(function(data){ kps_initialize(param, data); });

  if(state == 10) {      // Needs 7+8, to build correct short/long Title
    books = data;
    for(var i1=0; i1<books.length; i1++)
      bookHash[books[i1].bookId] = books[i1];
    if(books.length == 0)
      state++;
    else
      return kps_collectBookHeaders(kps_initialize, param);
  }

  if (state == 11) {    // collect OfflineTimestamps from cache
    //var isGood = (platform.platform == "desktop" || navigator.connection.type == "wifi" || 
    //             navigator.connection.type == "cellular" && navigator.connection.downlinkMax >= 0.2);
    if(swRegistration && swRegistration.active && swRegistration.active.state == "activated") {
      caches.open(cacheName).then(function(cache) {
        cache.keys().then(function(cacheNames) {
          var done = 0;
          for (var i=0; i< cacheNames.length; i++) {
             cache.match(cacheNames[i]).then(function(response) {
               var lastModified = response.headers.get("Last-Modified");
               if (!lastModified) // odd, files in db don't get Last-Modified in Header
                 lastModified = response.headers.get("Date");
               var re = new RegExp(location.origin+"/"+(pn.length > 3 ? location.pathname.split("/")[1]+"/":"")+projectName, "");
               var fileName = response.url.replace(re, "")     // strip filename from response url
                                          .replace(/^\//, "")  // remove leading slash
               if (fileName == response.url) {
                 // special treatment for old urls without projectName
                 re = new RegExp(location.origin+"/"+(pn.length > 3 ? location.pathname.split("/")[1]+"/":""), "");
                 fileName = response.url.replace(re, "").replace(/^\//, "");
               }
               if (fileName == "")
                 fileName = projectName;
               kps_offlineTimestamps[fileName] = lastModified;
               if (++done == cacheNames.length)
                 return kps_initialize(param);
             });
          }
          if (cacheNames.length == 0) {
             okDialog("WARNING, cache " + cacheName + " is empty, this should not happen. Please clear data and reload app.", false, {}, function() {
               return kps_initialize(param);
             });
          }
         });
      });
    } else
      state++;
  }
 

  if(state == 12) {     // Was kps_autoCreateBooks
    state++;
  }

  if(state == 13) {
    if(param.firstState)
      return param.callback();
    kps_callHooks("initialized");
    window.onbeforeunload = function(e) { return tr.leaveApp };
    return kps_firstScreen(param.callback);
  }
}

////////////////////////////////////////////////
function
kps_loadLookupTables(nextFn, updateOnly)
{
  var quizCols = 
    ["QUESTION", "ANSWER_1", "ANSWER_2", "ANSWER_3", "ANSWER_4", "ANSWER_5",
     "CORRECT_ANSWER", "SOLUTION_TEXT_1", "SOLUTION_TEXT_2",
     "SOLUTION_TEXT_3", "SOLUTION_TEXT_4", "SOLUTION_TEXT_5"];
  db_getLookupTables(function(data) {
    if (updateOnly)
      // don't replace, update data
      for (var tbl in data) {
        luTables[tbl] = data[tbl];
      }
    else
      luTables = data; 
    origLuTables={};
    for(var tn in luTables) {
      if(!bdef.tbldef || !bdef.tbldef[tn])
        continue;
      for(var i=0; i<luTables[tn].length; i++) {
        var r = luTables[tn][i];
        var k = tn+"."+r.id;
        if(tr[k+".displayname"])
          r["DISPLAYNAME"] = tr[k+".displayname"];
        if(tr[k+".helptext"])
          r["HELPTEXT"] = tr[k+".helptext"];
        if(tn.indexOf("QUIZ_") == 0)
          for(var j=0; j<quizCols.length; j++) {
            if(tr[k+"."+quizCols[j].toLowerCase()])
              r[quizCols[j]] 
                      = tr[k+"."+quizCols[j].toLowerCase()];
          }
      }
      origLuTables[tn] = true;
      if(luTables[tn].length > 0 && luTables[tn][0].PARENT != undefined)
        kps_computeHier(tn);

      if(bdef.tbldef[tn].pagetype == "HEADER") { // special for cfg.addLUTables
        var data = luTables[tn];
        for(var i1=0; i1<data.length; i1++)   // Pimp it for the select saveFn
          data[i1].id = data[i1].bookid+"/0";
      }

    }
    nextFn();
  });
}

////////////////////////////////////////////////
function
kps_collectBookHeaders(nextFn, param)
{
  if(!param.headerInit) {
    log("kps_collectBookHeaders");
    param.headerInit = true;
    param.headerIdx = 0;
    param.bdefHash = {};
    param.bdefArr = [];
    for(var i1=0; i1<books.length; i1++)
      param.bdefHash[books[i1].bookDefId] = 1;
    for(var i1 in param.bdefHash)
      param.bdefArr.push(i1);
    param.rUL_hash = { pagetype:"HEADER" };
  }

  if(param.headerIdx >= param.bdefArr.length) {
    delete param.headerInit; delete param.headerIdx;
    delete param.bdefHash;   delete param.bdefArr;
    return nextFn(param);
  }

  var bdefId = param.bdefArr[param.headerIdx++];
  var bd = bdef.book[bdefId];
  if(!bd) {
    okDialog("Book without definition:"+bdefId);
    return kps_collectBookHeaders(nextFn, param);
  }

  param.rUL_hash.id = bdefId;
  kps_reloadUserLookup(param.rUL_hash, 
    function(){
      var hp = bd.headerPage;
      if(!hp)
        return kps_collectBookHeaders(nextFn, param);
      db_getAnswerRows({tableName:hp.tablename, rowId:0},
        function(rows){
          for(var i1=0; i1<rows.length; i1++) {
            var r = rows[i1];
            var b = bookHash[r._bookId];
            if(!b)
              continue;
            b.header = r;
            b.longBookName  = kps_makeSummary(hp, "longtitle", r);
            b.shortBookName = kps_makeSummary(hp, "shorttitle", r);
          }
          kps_collectBookHeaders(nextFn, param);
        });
    });
}

function
kps_sortBooks()
{
  books.sort(function(a,b) {
    if(bdef.book[a.bookDefId] == undefined || // Safety measure
       bdef.book[b.bookDefId] == undefined)
      return -1;
    if(a.bookDefId == b.bookDefId && a.shortBookName && b.shortBookName)
      return a.shortBookName.localeCompare(b.shortBookName);
    else
      return bdef.book[a.bookDefId].name.localeCompare(
             bdef.book[b.bookDefId].name);
  });
}

//////////////////////////////////////////////
// Overview screen.
function
kps_firstScreen(callback)
{
  if (useDeprecatedCache)
    log("applicationCache.status:"+applicationCache.status);

  okDialogClose();
  $("div#header-wrapper").show();
  $("div#content-wrapper").removeClass("login");

  kps_sortBooks();

  var lastBookName="";
  for(var i1=0; i1<books.length; i1++) {     // List of created books.
    var b = books[i1];
    if(b.shortBookName == undefined || b._hidden)
      continue
    var bd = bdef.book[b.bookDefId];
    if(bd.parentbookid != undefined)
      continue;
    if(bd.name != lastBookName) {
      $(currentScreen).append('<div class="bookTitle '+bd.name+'">'+
                                        trDef(bd, "title")+'</div>');
      lastBookName = bd.name;
    }
    kps_addButton(b.longBookName, "book "+bd.name, kps_editBook,b,{bookIdx:i1});
  }

  kps_addEmptyRow();

  var br = kps_bookRights();
  if(kps_canCreateBooks(br) && bdef.user.status != "LOCKED")
    kps_addButton(tr.newBook, "newBookButton", kps_newBook);

  kps_showScreen();

  if(callback)
    callback();
}


function delAll() {
 if (typeof messaging !== 'undefined' && isSubscribed)
   unsubscribeUser(function() { kps_login(true); }, true);
 else
   kps_login(true); 
}

////////////////////////////////////////////////
function
kps_admin()
{
  if(screenNames[0].indexOf("kps_admin") == 0 ||
     screenNames[0] == "kps_guardWithPw")  // No recursive calling
    return;
  kps_newScreen(tr.admin);

  var as = applicationCache.status;
  var asMsg;
  if (useDeprecatedCache)
    asMsg = (as == 1 ? tr.loginOffline : tr.loginOnline);
  else
    asMsg = ($("html").attr("isOffline") == "YES" ? tr.loginOffline: tr.loginOnline);
  $(currentScreen).append('<div class="version">'+version+", "+asMsg+'</div>');

  if(isAndroid) {
    var vids=[];
    for(var i1=0; i1<offlineFilesArray.length;i1++) {
      var m = offlineFilesArray[i1].match(/(.*)\.(mp4):(.*)$/);
      if(m)
        vids.push(m[1]+"."+m[2]+":"+m[3]);
    }

    if(vids.length)
      kps_addButton(tr.videoDownload,  "admin videoDownload", function() {
        var url = location.href;
        if(url.indexOf(projectName) > 0)
          url = url.substring(0, url.indexOf(projectName));
        url = url.replace(/#.*/,'');
        if(url[url.length-1] != '/')
          url += '/';
        window.onbeforeunload = undefined;
        log("Calling intent with fallback:"+
                url+"projects/"+bdef.projects[0].name+"/KipusMedia.apk");
        location.href = "intent://localhost?vids="+vids.join(",")+"&url="+url+
                         "&ts="+(new Date()).getTime()+
                         "#Intent;scheme=KipusMedia;"+
                         "S.browser_fallback_url="+url+"projects/"+
                         bdef.projects[0].name+"/KipusMedia.apk;"+
                         "end;";
      });
  }

  kps_addButton(tr.pw_change,       "admin pwchange", kps_pwchange);

  kps_addButton(tr.resetDatabase,   "admin drop",
    function() { okCancelDialog(tr.delAll, delAll) });

  kps_addButton(tr.debugInfo,       "admin debug",    kps_debugInfo);

  kps_addButton(tr.admin_advanced,  "admin advanced",
                function(){ kps_guardWithPw(kps_adminAdvanced) });

  kps_addButton(tr.statistics ? tr.statistics:"Statistics", "admin", kps_stats);
  if (typeof messaging !== 'undefined') {
    var btnTxt = isSubscribed?tr.pushUnsubscribe:tr.pushSubscribe;
    if (navigator.connection.type == "none")
      btnTxt += " ("+(tr.networkNeeded?tr.networkNeeded:"needs internet connection")+")";
    kps_addButton(btnTxt, "admin push-button", function() {
      console.log("subscribe clicked");
      if (isSubscribed)
        return unsubscribeUser();
      return subscribeUser();
    });
    initializePush();
  }

  kps_showScreen();
}

////////////////////////////////////////////////
function
kps_stats()
{
  kps_newScreen("Statistics");

  $(currentScreen).append("<b>Storage</b>: <div id='storage'>N/A</div><br>");
  if(navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate()
      .then(function(estimate){
        $(currentScreen+" #storage").html(
                " used:"+parseInt(estimate.usage/1024/1024)+" MB,"+
                " max available:"+parseInt(estimate.quota/1024/1024)+" MB"); });
  }

  $(currentScreen).append("<b>Network</b>: <div id='network'>N/A</div><br>");
  if(navigator.connection) {
    var c = navigator.connection;
    $(currentScreen+" #network").html(
                " type: "+c.type+
                " effectiveType: "+c.effectiveType+"<br>"+
                " downlink: "+c.downlink+
                " downlinkMax: "+c.downlinkMax);
  }

  $(currentScreen).append("<b>Permissions</b>: "+
        "<div>Geolocation: <span id='p_geolocation'>N/A</span></div>"+
        "<div>Notifications: <span id='p_notifications'>N/A</span></div>"+
        "<div>Push: <span id='p_push'>N/A</span></div>"+
        "<div>Midi: <span id='p_midi'>N/A</span></div>");
  if(navigator.permissions) {
    function
    cp(perm) {
      navigator.permissions.query(perm).then(function(permRes) {
        $(currentScreen+" #p_"+perm.name).html(permRes.state);
      });
    }
    cp({name:'geolocation'});
    cp({name:'notifications'});
    cp({name:'push', userVisibleOnly:true });
  }

  kps_showScreen();
}

////////////////////////////////////////////////
function
kps_adminAdvanced()
{
  kps_newScreen(tr.admin);

  kps_addButton(tr.uploadClientDB,  "admin uploadDb", function() {
      db_uploadClientDB(function(fname) {
        okDialog(sprintf(tr.uploadClientDBReady, fname));
      });
    });

/*
  kps_addButton(tr.uploadData,      "admin upload",   kps_syncUploadData);
  kps_addButton(tr.admin_syncBookDef,"admin bookdef", kps_syncBookDef);
  kps_addButton(tr.downloadMyData,  "admin mydata",   kps_downloadMyData);
  kps_addButton(tr.programUpdate,   "admin pgmUpdate",function() {
    applicationCache.update();
  });
  kps_addButton(tr.admin_autocreate,"admin autocreate", function() {
    kps_autoCreateBooks(function(){kps_initialize();}, {});
  });
*/
  kps_showScreen();
}


function
kps_langChange()
{
  function
  updateOutput(param, sel, nextFn)
  {
    log("updateOutput");
    var vh = param?param.common.valueHash:common.valueHash;
    var loc;
    if (!vh.country)
      loc = navigator.language;
    else {
      if (countryHash[vh.country].indexOf("-") == -1)
        loc = langHashRev[vh.language]+"-"+countryHash[vh.country];
      else
        loc = countryHash[vh.country];
    }
    var currencyCode = currHash[vh.currency];
    if(!currencyCode)
      currencyCode = 'EUR';
    if(!vh.currencyDisplay)
      vh.currencyDisplay = 'code';
    var value = 400500.50,
      props = {
          style: "currency",
          currency: currencyCode,
          minimumFractionDigits: 0,
          maximumFractionDigits: currencyCode=="VND"?0:2,
          currencyDisplay: vh.currencyDisplay
      };
    $(currentScreen+" #v_dateformat div.infotext")
        .text((new Date()).toLocaleString(loc));
    $(currentScreen+" #v_currencyformat div.infotext")
        .text(value.toLocaleString(loc, props));
  }
  if(screenNames[0] == "kps_langChange")
    return;
  kps_newScreen(tr.settingsTitle?tr.settingsTitle:"User settings");
  var langArr=[], langHash={}, langHashRev={};
  for(var i1=0; i1<kps_languages.length; i1++) {
    var l1 = kps_languages[i1], l2 = "language."+l1;
    langArr.push(tr[l2] ? tr[l2] : l1);
    langHashRev[tr[l2] ? tr[l2] : l1] = l1;
    langHash[l1] = tr[l2] ? tr[l2] : l1;
  }
  
  var countryArr="AF,AX,AL,DZ,AS,AD,AO,AI,AQ,AG,AR,AM,AW,AU,AT,AZ,BS,BH,BD,BB,BY,BE,BZ,BJ,BM,BT,BO,BQ,BA,BW,BV,BR,IO,BN,BG,BF,BI,KH,CM,CA,CV,KY,CF,TD,CL,CN,CX,CC,CO,KM,CG,CD,CK,CR,CI,HR,CU,CW,CY,CZ,DK,DJ,DM,DO,EC,EG,SV,GQ,ER,EE,ET,FK,FO,FJ,FI,FR,GF,PF,TF,GA,GM,GE,DE,GH,GI,GR,GL,GD,GP,GU,GT,GG,GN,GW,GY,HT,HM,VA,HN,HK,HU,IS,IN,ID,IR,IQ,IE,IM,IL,IT,JM,JP,JE,JO,KZ,KE,KI,KP,KR,KW,KG,LA,LV,LB,LS,LR,LY,LI,LT,LU,MO,MK,MG,MW,MY,MV,ML,MT,MH,MQ,MR,MU,YT,MX,FM,MD,MC,MN,ME,MS,MA,MZ,MM,NA,NR,NP,NL,NC,NZ,NI,NE,NG,NU,NF,MP,NO,OM,PK,PW,PS,PA,PG,PY,PE,PH,PN,PL,PT,PR,QA,RE,RO,RU,RW,BL,SH,KN,LC,MF,PM,VC,WS,SM,ST,SA,SN,RS,SC,SL,SG,SX,SK,SI,SB,SO,ZA,GS,SS,ES,LK,SD,SR,SJ,SZ,SE,CH,SY,TW,TJ,TZ,TH,TL,TG,TK,TO,TT,TN,TR,TM,TC,TV,UG,UA,AE,GB,US,UM,UY,UZ,VU,VE,VN,VG,VI,WF,EH,YE,ZM,ZW".split(",");
  var countryNames="Afghanistan;Åland Islands;Albania;Algeria;American Samoa;Andorra;Angola;Anguilla;Antarctica;Antigua and Barbuda;Argentina;Armenia;Aruba;Australia;Austria;Azerbaijan;Bahamas;Bahrain;Bangladesh;Barbados;Belarus;Belgium;Belize;Benin;Bermuda;Bhutan;Bolivia, Plurinational State of;Bonaire, Sint Eustatius and Saba;Bosnia and Herzegovina;Botswana;Bouvet Island;Brazil;British Indian Ocean Territory;Brunei Darussalam;Bulgaria;Burkina Faso;Burundi;Cambodia;Cameroon;Canada;Cape Verde;Cayman Islands;Central African Republic;Chad;Chile;China;Christmas Island;Cocos (Keeling) Islands;Colombia;Comoros;Congo;Congo, the Democratic Republic of the;Cook Islands;Costa Rica;Côte d'Ivoire;Croatia;Cuba;Curaçao;Cyprus;Czech Republic;Denmark;Djibouti;Dominica;Dominican Republic;Ecuador;Egypt;El Salvador;Equatorial Guinea;Eritrea;Estonia;Ethiopia;Falkland Islands (Malvinas);Faroe Islands;Fiji;Finland;France;French Guiana;French Polynesia;French Southern Territories;Gabon;Gambia;Georgia;Germany;Ghana;Gibraltar;Greece;Greenland;Grenada;Guadeloupe;Guam;Guatemala;Guernsey;Guinea;Guinea-Bissau;Guyana;Haiti;Heard Island and McDonald Islands;Holy See (Vatican City State);Honduras;Hong Kong;Hungary;Iceland;India;Indonesia;Iran, Islamic Republic of;Iraq;Ireland;Isle of Man;Israel;Italy;Jamaica;Japan;Jersey;Jordan;Kazakhstan;Kenya;Kiribati;Korea, Democratic People's Republic of;Korea, Republic of;Kuwait;Kyrgyzstan;Lao People's Democratic Republic;Latvia;Lebanon;Lesotho;Liberia;Libya;Liechtenstein;Lithuania;Luxembourg;Macao;Macedonia, the former Yugoslav Republic of;Madagascar;Malawi;Malaysia;Maldives;Mali;Malta;Marshall Islands;Martinique;Mauritania;Mauritius;Mayotte;Mexico;Micronesia, Federated States of;Moldova, Republic of;Monaco;Mongolia;Montenegro;Montserrat;Morocco;Mozambique;Myanmar;Namibia;Nauru;Nepal;Netherlands;New Caledonia;New Zealand;Nicaragua;Niger;Nigeria;Niue;Norfolk Island;Northern Mariana Islands;Norway;Oman;Pakistan;Palau;Palestinian Territory, Occupied;Panama;Papua New Guinea;Paraguay;Peru;Philippines;Pitcairn;Poland;Portugal;Puerto Rico;Qatar;Réunion;Romania;Russian Federation;Rwanda;Saint Barthélemy;Saint Helena, Ascension and Tristan da Cunha;Saint Kitts and Nevis;Saint Lucia;Saint Martin (French part);Saint Pierre and Miquelon;Saint Vincent and the Grenadines;Samoa;San Marino;Sao Tome and Principe;Saudi Arabia;Senegal;Serbia;Seychelles;Sierra Leone;Singapore;Sint Maarten (Dutch part);Slovakia;Slovenia;Solomon Islands;Somalia;South Africa;South Georgia and the South Sandwich Islands;South Sudan;Spain;Sri Lanka;Sudan;Suriname;Svalbard and Jan Mayen;Swaziland;Sweden;Switzerland;Syrian Arab Republic;Taiwan, Province of China;Tajikistan;Tanzania, United Republic of;Thailand;Timor-Leste;Togo;Tokelau;Tonga;Trinidad and Tobago;Tunisia;Turkey;Turkmenistan;Turks and Caicos Islands;Tuvalu;Uganda;Ukraine;United Arab Emirates;United Kingdom;United States;United States Minor Outlying Islands;Uruguay;Uzbekistan;Vanuatu;Venezuela, Bolivarian Republic of;Viet Nam;Virgin Islands, British;Virgin Islands, U.S.;Wallis and Futuna;Western Sahara;Yemen;Zambia;Zimbabwe".split(";");
  var countryHash={}; 
  var uc;
  for (var i1=0; i1<countryArr.length; i1++) {
    countryHash[countryNames[i1]] = countryArr[i1];
    if (userData.country == countryArr[i1])
      uc = countryNames[i1];
  }
  var currArr="AED,AFN,ALL,AMD,ANG,AOA,ARS,AUD,AWG,AZN,BAM,BBD,BDT,BGN,BHD,BIF,BMD,BND,BOB,BRL,BSD,BTN,BWP,BYR,BZD,CAD,CDF,CHF,CLP,CNY,COP,CRC,CUC,CUP,CVE,CZK,DJF,DKK,DOP,DZD,EGP,ERN,ETB,EUR,FJD,FKP,GBP,GEL,GGP,GHS,GIP,GMD,GNF,GTQ,GYD,HKD,HNL,HRK,HTG,HUF,IDR,ILS,IMP,INR,IQD,IRR,ISK,JEP,JMD,JOD,JPY,KES,KGS,KHR,KMF,KPW,KRW,KWD,KYD,KZT,LAK,LBP,LKR,LRD,LSL,LTL,LVL,LYD,MAD,MDL,MGA,MKD,MMK,MNT,MOP,MRO,MUR,MVR,MWK,MXN,MYR,MZN,NAD,NGN,NIO,NOK,NPR,NZD,OMR,PAB,PEN,PGK,PHP,PKR,PLN,PYG,QAR,RON,RSD,RUB,RWF,SAR,SBD,SCR,SDG,SEK,SGD,SHP,SLL,OS,SPL,SRD,STD,SVC,SYP,SZL,THB,TJS,TMT,TND,TOP,TRY,TTD,TVD,TWD,TZS,UAH,UGX,USD,UYU,UZS,VEF,VND,VUV,WST,XAF,XCD,XDR,XOF,XPF,YER,ZAR,ZMK,ZWD".split(",");
  var currNames="United Arab Emirates Dirham,Afghanistan Afghani,Albania Lek,Armenia Dram,Netherlands Antilles Guilder,Angola Kwanza,Argentina Peso,Australia Dollar,Aruba Guilder,Azerbaijan New Manat,Bosnia and Herzegovina Convertible Marka,Barbados Dollar,Bangladesh Taka,Bulgaria Lev,Bahrain Dinar,Burundi Franc,Bermuda Dollar,Brunei Darussalam Dollar,Bolivia Boliviano,Brazil Real,Bahamas Dollar,Bhutan Ngultrum,Botswana Pula,Belarus Ruble,Belize Dollar,Canada Dollar,Congo/Kinshasa Franc,Switzerland Franc,Chile Peso,China Yuan Renminbi,Colombia Peso,Costa Rica Colon,Cuba Convertible Peso,Cuba Peso,Cape Verde Escudo,Czech Republic Koruna,Djibouti Franc,Denmark Krone,Dominican Republic Peso,Algeria Dinar,Egypt Pound,Eritrea Nakfa,Ethiopia Birr,Euro Member Countries,Fiji Dollar,Falkland Islands (Malvinas) Pound,United Kingdom Pound,Georgia Lari,Guernsey Pound,Ghana Cedi,Gibraltar Pound,Gambia Dalasi,Guinea Franc,Guatemala Quetzal,Guyana Dollar,Hong Kong Dollar,Honduras Lempira,Croatia Kuna,Haiti Gourde,Hungary Forint,Indonesia Rupiah,Israel Shekel,Isle of Man Pound,India Rupee,Iraq Dinar,Iran Rial,Iceland Krona,Jersey Pound,Jamaica Dollar,Jordan Dinar,Japan Yen,Kenya Shilling,Kyrgyzstan Som,Cambodia Riel,Comoros Franc,Korea (North) Won,Korea (South) Won,Kuwait Dinar,Cayman Islands Dollar,Kazakhstan Tenge,Laos Kip,Lebanon Pound,Sri Lanka Rupee,Liberia Dollar,Lesotho Loti,Lithuania Litas,Latvia Lat,Libya Dinar,Morocco Dirham,Moldova Leu,Madagascar Ariary,Macedonia Denar,Myanmar (Burma) Kyat,Mongolia Tughrik,Macau Pataca,Mauritania Ouguiya,Mauritius Rupee,Maldives (Maldive Islands) Rufiyaa,Malawi Kwacha,Mexico Peso,Malaysia Ringgit,Mozambique Metical,Namibia Dollar,Nigeria Naira,Nicaragua Cordoba,Norway Krone,Nepal Rupee,New Zealand Dollar,Oman Rial,Panama Balboa,Peru Nuevo Sol,Papua New Guinea Kina,Philippines Peso,Pakistan Rupee,Poland Zloty,Paraguay Guarani,Qatar Riyal,Romania New Leu,Serbia Dinar,Russia Ruble,Rwanda Franc,Saudi Arabia Riyal,Solomon Islands Dollar,Seychelles Rupee,Sudan Pound,Sweden Krona,Singapore Dollar,Saint Helena Pound,Sierra Leone Leone,Somalia Shilling,Seborga Luigino,Suriname Dollar,São Tomé and Príncipe Dobra,El Salvador Colon,Syria Pound,Swaziland Lilangeni,Thailand Baht,Tajikistan Somoni,Turkmenistan Manat,Tunisia Dinar,Tonga Pa'anga,Turkey Lira,Trinidad and Tobago Dollar,Tuvalu Dollar,Taiwan New Dollar,Tanzania Shilling,Ukraine Hryvna,Uganda Shilling,United States Dollar,Uruguay Peso,Uzbekistan Som,Venezuela Bolivar Fuerte,Viet Nam Dong,Vanuatu Vatu,Samoa Tala,Communauté Financière Africaine (BEAC) CFA Franc BEAC,East Caribbean Dollar,International Monetary Fund (IMF) Special Drawing Rights,Communauté Financière Africaine (BCEAO) Franc,Comptoirs Français du Pacifique (CFP) Franc,Yemen Rial,South Africa Rand,Zambia Kwacha,Zimbabwe Dollar".split(",");
  var currHash={}; 
  var ucurr;
  for (var i1=0; i1<currArr.length; i1++) {
    currHash[currNames[i1]] = currArr[i1];
    if (userData.currency == currArr[i1])
      ucurr = currNames[i1];
  }
  var mtArr = "ROADMAP,SATELLITE,HYBRID,TERRAIN".split(",");
  var mtNames = "Road map - normal 2D map,Satellite - photographic map,Hybrid - photographic map + roads and city names,Terrain - road map + mountains and rivers".split(",");
  var mtHash={};
  var umt;
  for (var i1=0; i1<mtArr.length; i1++) {
    mtHash[mtNames[i1]] = mtArr[i1];
    if (userData.mapType == mtArr[i1])
      umt = mtNames[i1];
  }
  
  kps_languages.sort();
  var ut = {};
  var mypt = [];
  for (var i=0; i<bdef.pushtopics.length; i++) {
    var pt = bdef.pushtopics[i];
    // don't show mail_notification topic, management only
    if (pt.topic.indexOf("mail_notification") >= 0)
      continue;
    ut[pt.topic] = pt;
    if (pt.subscribed)
      mypt.push(pt.topic);
  }
  var common = { valueHash:{language:langHash[userData.language], country:uc, 
                            currency: ucurr, currencyDisplay: userData.currencyDisplay,
                            mapType: umt, pushtopics: mypt.join(","), gpsType: userData.gpsType } };
  var defaults = {}; 
  if (luTables.DEFAULTS)
    for (var i=0; i<luTables.DEFAULTS.length; i++) {
      defaults[luTables.DEFAULTS[i].DEFAULT_KEY] = luTables.DEFAULTS[i].DEFAULT_VALUE;
    }
  kps_addWidget({columnname:'language', displayname:tr.langLabel,
                 common:common,
                 addChangeFn:updateOutput,
                 constrainttype:'singleFromArg',
                 defaultvalue: defaults.language,
                 constraintparam:langArr.join(","),
                 inputtype:'mandatory'});
  kps_addWidget({columnname:'country', displayname:tr.countryLabel?tr.countryLabel:"Country",
                 common:common,
                 addChangeFn:updateOutput,
                 constrainttype:'singleFromArg',
                 defaultvalue: defaults.country,
                 constraintparam:countryNames.sort(),
                 inputtype:'mandatory'});
  kps_addWidget({columnname:'currency', displayname:tr.currencyLabel?tr.currencyLabel:"Currency",
                 common:common,
                 addChangeFn:updateOutput,
                 defaultvalue: defaults.currency,
                 constrainttype:'singleFromArg',
                 constraintparam:currNames.sort().join(","),
                 inputtype:'mandatory'});
  kps_addWidget({columnname:'currencyDisplay', displayname:tr.currencyDisplay?tr.currencyDisplay:"Currency display using",
                 common:common,
                 addChangeFn:updateOutput,
                 constrainttype:'singleFromArg',
                 constraintparam:"code,name,symbol",
                 defaultvalue: defaults.currencyDisplay,
                 inputtype:'mandatory'});
  kps_addWidget({columnname:'dateformat', displayname:'Date format',
                 common:common,
                 constrainttype:'infotext',
                 constraintparam:'',
                 inputtype:'readonly'});
  kps_addWidget({columnname:'currencyformat', displayname:'Currency format',
                 common:common, 
                 constrainttype:'infotext',
                 constraintparam:'',
                 inputtype:'readonly'});
  kps_addWidget({columnname:'mapType', displayname:tr.mapType?tr.mapType:'Map Type',
                 common:common, 
                 constrainttype:'singleFromArg',
                 constraintparam:mtNames.sort().join(","),
                 inputtype:'mandatory'});
  /*kps_addWidget({columnname:'gpsType', displayname:tr.gpsType?tr.gpsType:'GPS Field capture',
                 common:common, 
                 constrainttype:'singleFromArg',
                 constraintparam:"manual,automatic",
                 inputtype:'mandatory'});*/

  if (Object.keys(ut).length > 0) {
    kps_addWidget({columnname:'pushtopics', displayname:tr.pushtopics?tr.pushtopics:'Subscribe with push to following topics (change '+tr.networkNeeded+')',
                   common:common, 
                   constrainttype:'multiFromArg',
                   constraintparam:Object.keys(ut).sort().join(","),
                   inputtype:'mandatory'});
    // add pushtopic description
    $("#w_pushtopics ul.answers-list li").each(function() {
      var topic = $(this).find("img.radios").attr("val");
      $(this).append("<span class='qbuttons'></span>");
      if (ut[topic] && ut[topic].displayname)
        $(this).find("label.answertext").text(ut[topic].displayname);
    });
    $("#w_pushtopics ul.answers-list li span.qbuttons").click(function() {
      var topic = $(this).closest("li").find("img.radios").attr("val");
      var desc = ut[topic] && ut[topic].description ? ut[topic].description: "No info";
      desc = desc.replace(/\n/g, "<br>");
      okDialog(desc);
    });
   }
  updateOutput();

  kps_addButton(tr.settingsButton?tr.settingsButton:"Update settings", "changeLang", function() {
    var res = {};
    kps_collectData(res);
    userData.language = langHashRev[res.language];
    userData.country = countryHash[res.country];
    userData.currency = currHash[res.currency];
    userData.currencyDisplay = res.currencyDisplay;
    userData.mapType = mtHash[res.mapType];
    if (res.gpsType)
      userData.gpsType = res.gpsType;

    function update_push_subscriptions() {
      if (typeof messaging == 'undefined')
        return;
      var newpt = res.pushtopics.split(",");
      log("push change detected");
      var old = {}, changed = {};
      for (var i=0;i<mypt.length; i++)
        old[mypt[i]] = 1;
      for (var i=0;i<newpt.length; i++)
        changed[newpt[i]] = 1;
      var cmds=[];
      var removedTopics=[];
      for (var t in ut) {
        if (old[t] == changed[t])
          continue; 
        if (!old[t] && changed[t]) {
           cmds.push({ fn:"tableInsert", tableName:"kipus_usertopics", columns:{
                 topic:t,
                 login:userData.username
                 }
           });
        }
        if (old[t] && !changed[t]) {
          cmds.push({ fn:"tableDelete", tableName:"kipus_usertopics",
                      filterCol:['login','topic'], filterVal:[ userData.username, t ] });
          removedTopics.push(t);
        }
      }
      if (!cmds.length)
        return;
      backendCall("tableBatch", { commands:cmds },
      function(res,resultPar){
         // update subscribed-flag in bdef.pushtopics
         for (var i=0; i<bdef.pushtopics.length; i++) {
           var pt = bdef.pushtopics[i];
           pt.subscribed = (changed[pt.topic] == 1);
         }
         if (userData.pushToken) {
           var ptData = { token: userData.pushToken, keepToken: true, removedTopics: removedTopics, platform: platform };
           backendCall("updatePushToken", ptData, function(res) {
             log("update topics done");
           }, undefined, function(err) {
             okDialog("update to subscription topics failed:<br>"+err);
           });
         }
      });
    }

    db_updateAnswer(0,"userPref",0, userData, function() {
      for(var i1=0; i1<screenFns.length; i1++)
        screenFns[i1].redraw = true;
      kps_loadTrans(userData.language, function() {
        kps_setTitleTooltips();
        kps_loadLookupTables(function() {
          kps_collectBookHeaders(function(){
            if (res.pushtopics != mypt.sort().join(",")) {
              update_push_subscriptions();
            }
            kps_popScreen();
          }, {});
        }, true); // called with updateOnly, this solves a bug when calling settings from crop-cycle
      });
    });
  });
  kps_showScreen();
}

/////////////////////////////////////////
function
kps_login(dropTables, initparam)
{
  var alwaysLogin = (bdef.user && bdef.user.alwaysLogin=="YES" && initparam);

  if(dropTables) {
    kps_resetInternals();
    db_dropTables(function(){ 
      if (swRegistration) {
         // unregister serviceWorker
         swRegistration.unregister().then(function(boolean) {
          // delete cacheStorage
          caches.delete(cacheName).then(function(boolean) {
            // your cache is now deleted
            caches.delete(updateCacheName).then(function(boolean) {
              window.onbeforeunload = undefined;
              //window.location.reload();
              document.body.innerHTML = '<div style="padding: 50px;">'+tr.resetDatabaseDone+'</div>';
              return;
            });
          });
       });
      } else {
        db_open(kps_login, false); 
        if(applicationCache.status == 1)
          applicationCache.update();
      }
    });
    return;
  }

  kps_resetScreen();
  screenNames[0] = "kps_login";

  screenFns = [ { fn:kps_login, args:[dropTables, initparam] } ];
  kps_setHeight($(window).height());
  blockHooks.popScreen = true;

  $("div#header-wrapper").hide();
  $("div#content-wrapper").addClass("login");

  $(currentScreen).attr("id", "loginScreen");
  $(currentScreen).append('<div id="login-header"><img src="projects/'+
                $("div#offlineFiles").attr("projectname")+'/logo.png"/></div>');
  var langArr=[], langHash={}, langHashRev={};
  for(var i1=0; i1<kps_languages.length; i1++) {
    var l1 = kps_languages[i1], l2 = "language."+l1;
    langArr.push(tr[l2] ? tr[l2] : l1);
    langHashRev[tr[l2] ? tr[l2] : l1] = l1;
    langHash[l1] = tr[l2] ? tr[l2] : l1;
  }
  
  var as = applicationCache.status;
  var common = { valueHash:{ username:userData.username, 
                             language:langHash[kps_syslang] } };
  kps_addWidget({columnname:'username', displayname:tr.loginName,
                 common:common, gluewithnext:'NEWROW',
                 constrainttype:'text', inputtype:'visible'});
  kps_addWidget({columnname:'password', displayname:tr.password,
                 common:common,
                 constrainttype:'password', inputtype:'visible'});

  $(currentScreen+" #v_username .qbuttons").click(function(){
    okDialog(tr.helpTextLoginName);
  });
  $(currentScreen+" #v_password .qbuttons").click(function(){
    okDialog(tr.helpTextPassword);
  });
  if(kps_languages.length > 1) {
    var buttons = "";
    for (var i=0;i<kps_languages.length; i++) {
       buttons += "<div class='language "+kps_languages[i]+
                        (kps_syslang==kps_languages[i]?" active":"")+
       "' lang='"+kps_languages[i]+ "'></div>";
    }
    $(currentScreen+" #w_username")
        .prepend('<div class="settingsicons">'+buttons+"</div>");
    $(currentScreen+" #w_username div.settingsicons .language")
    .click(function() {
       $(currentScreen+" #w_username div.settingsicons .language")
        .removeClass("active");
       $(this).addClass("active");
       userData.language = $(this).attr("lang");
       db_updateAnswer(0,"userPref",0, userData, function() {
         for(var i1=0; i1<screenFns.length; i1++)
           screenFns[i1].redraw = true;
         kps_loadTrans(userData.language, function() {
           kps_setTitleTooltips();
           kps_loadLookupTables(function() {
             kps_collectBookHeaders(function(){
               kps_login(false);
             }, {});
           });
         });
       });
    });
  }

  $(currentScreen+" #v_username input")
        .attr("autocapitalize", "off")
        .attr("autocorrect", "off")
        .attr("autocomplete", "off")
        .attr("spellcheck", "false");

  function
  enableInput() { 
    $("#loginScreen button,#loginScreen input").removeAttr("disabled");
  }
  function
  disableInput() { 
    $("#loginScreen button,#loginScreen input").attr("disabled", "disabled");
  }

  function
  doLogin()
  {
    disableInput();

    if(alwaysLogin) {
      var d = {};
      kps_collectData(d);
      enableInput();
      if(d.username.toLowerCase() != userData.username.toLowerCase())
        return okDialog("Login failed: wrong username");
      if(d.password != userData.password)
        return okDialog("Login failed: wrong password");
      $("div#header-wrapper").show();
      loginDone = true;
      kps_resetScreen();
      kps_initialize(initparam);
      return;
    }

    kps_collectData(userData);
    backendCall("login", {}, function(){
      loginDone = true;
      userData.language = kps_syslang;
      db_updateAnswer(0,"userPref",0, userData, function() {
        $(currentScreen+" .version")
                .before("<div id='kps_msgDiv'>"+tr.connecting+"</div>");
        $(currentScreen+" #w_username input").prop("readonly", true);
        kps_msgDiv = currentScreen+" #kps_msgDiv";
        kps_doDownloadMyData(true, enableInput);  // Calls kps_initialize
        function push_syncHook() {
          if (typeof messaging !== 'undefined' &&
              typeof userData.pushAsked == 'undefined') {
            initializePush();
            if (!isSubscribed ) {
              okCancelDialog(tr.pushPrompt, 
                 function(){ subscribeUser(function() { syncHooks.pop() }); }, 
                 function() { syncHooks.pop(); },
                 tr.yes ? tr.yes : "Yes",
                 tr.no  ? tr.no  : "No");
              if (typeof userData.pushAsked == "undefined") {
                userData.pushAsked = true;
                db_updateAnswer(0,"userPref",0, userData);
              }
            }
          }
        }
        // call pushPrompt on login, if not subscribed, ask
        if (typeof messaging !== 'undefined')
          syncHooks.push(push_syncHook);
      });
    }, undefined, function(err) {
      userData = {};
      enableInput();
      okDialog("Login failed:<br>"+err);
    });
  }

  var ocs = currentScreen;
  $(currentScreen+" #w_username").append("<div class='buttons'/>");
  currentScreen = currentScreen+" #w_username div.buttons";
  kps_addButton(tr.changeuser, "chuser-button", function() {
    okCancelDialog(tr.delAll, delAll);
  });
  kps_addButton(tr.login, "login-button", function() {
    doLogin();
  });
  var asMsg;
  if (useDeprecatedCache)
    asMsg = (as == 1 ? tr.loginOffline : tr.loginOnline);
  else
    asMsg = ($("html").attr("isOffline") == "YES" ? tr.loginOffline: tr.loginOnline);
  currentScreen = ocs;
  $(currentScreen+" #w_username").append('<div class="version">'+version+', '+asMsg+'</div>');


  $('#v_password input').keypress(function(e) { if(e.which==13) doLogin(); });


  kps_showScreen();
}

function
kps_msgDivReset(normalClose)
{
  kps_msgDiv = null;
  if(!normalClose) {
    $(currentScreen+" #w_username .kpsButton").show();
    $(currentScreen+" #w_username #kps_msgDiv").remove();
    $(currentScreen+" #w_username input").prop("readonly", false);
  }
}



////////////////////////////////////////////////
function
kps_storeMyData(res, p)
{
  if(!p.lastSync) {
    p.lastSync = res.lastSync;
  }
  if(!p.tbl) {
    log("kps_storeMyData: tbl length:"+res.tbl.length);
    p.tbl = res.tbl;
    p.oLastSync = res.lastSync;
    if(p.tbl.length) {
      syncChangedData = true;
      syncMsg += "<br>"+tr.syncGotData;
    }
    var par = { have:bookHash, allowed:res.okBook }
    par.nextFn = function(){
      if(par.booksDeleted)
        syncChangedData = true;
      kps_storeMyData(res, p);
    };
    db_deleteBooks(par);
    return;
  }

  if(!p.bookSynced) {
    kps_syncBookDef(function(){
      p.bookSynced = true;
      kps_storeMyData(undefined, p);
    }, {});
    return;
  }

  if(!p.gotRowUpdates) {
    p.gotRowUpdates = true;
    return db_getRowUpdates(function(res){
      p.rowUpdates = res;
      kps_storeMyData(undefined, p);
    });
  }

  if(p.tblIdx >= p.tbl.length) {       // finished
    function
    callNext()
    {
      if(p.syncAgain) {
        kps_collectBookHeaders(function(){
          if(p.nextFn)
            return p.nextFn(p);
          else
            return kps_initialize({callback:kps_execSyncHooks});
        }, {});
      } else {
        if(p.nextFn)
          return p.nextFn(p);
        else
          return kps_initialize({callback:kps_execSyncHooks});
      }
    }

    db_updateAnswer(0, "lastSync", 0, { lastSync:p.oLastSync }, callNext);
    return;
  }

  var tbl = p.tbl[p.tblIdx], row;

  for(;;) {
    if(p.rowIdx >= tbl.rows.length) {
      p.tblIdx++; p.rowIdx = 0;
      return kps_storeMyData(res, p);         // next table
    }

    row = tbl.rows[p.rowIdx];
    if(p.syncAgain)
      break;
    var myTS = p.rowUpdates[row.bookId+"/"+row.foreignRowId];
    if(!myTS || myTS.localeCompare(row.modified)<0)
      break;
    p.rowIdx++;
  }

  msg(sprintf(tr.downloadSaving,
            p.tbl[p.tblIdx].tablename+ " ("+p.rowIdx+"/"+tbl.rows.length+")"));
  syncChangedData = true;
  if(p.lastBookId != row.bookId) {
    var mr = bookHash[row.bookId] ? bookHash[row.bookId].maxRow : 0;
    p.book = { bookId:row.bookId, bookDefId:tbl.bookdefid, maxRow:mr,
               updated:row.modified, firstSync:row.modified,
               synced:row.modified },
    p.lastBookId = row.bookId;
    db_updateBook(p.book, function(){ saveRow(p) }, p);

  } else {
    saveRow(p);

  }

  function
  saveRow(p)
  {
    var tbl = p.tbl[p.tblIdx];
    var row = tbl.rows[p.rowIdx++];
    var rowId = row.foreignRowId; 
    var bookId = row.bookId; 
    delete row.bookId;
    delete row.foreignRowId;
    delete row.modified;
    row._itemsToLoad = 0; row._itemsLoaded = 0; row._complexData={}
    var re = /\[(file|deferred):([^\]]+\/[0-9]+\/[^\]]+)\]/g, reRes;

    for(var key in row) {
      if(!row[key] || typeof row[key]!="string" || !p.withPicture)
        continue;

      var idx = 0;

      while((reRes = re.exec(row[key])) !== null) {
        idx++;
        var fType = reRes[1], fName = reRes[2];
        (function(p, tablename, lRowId, lKey, lRow, fName, fType, idx) {
          imagesBeingSaved++; // used by kipusAdditions.js
          lRow._itemsToLoad++;
          var fn, arg;

          if(fType == "deferred") {
            fn = "getImage";
            arg = { imgName:fName };
          } else {
            fn = "getBigdata";
            var c = bdef.cols[lKey];
            var ad = (c.constraintparam &&
                      c.constraintparam.indexOf("AllowDownload") != -1);
            arg = { fileName:fName, allowDownload:ad };
          }

          backendCall(fn, arg,
            function(ret){
              var h = { id:"["+fType+":"+fName+"]", modified:false};
              var off = ret.indexOf(";");
              if(off >= 0) {
                h.filename = ret.substr(0,off);
                ret = ret.substr(off+1);
                h.data = (ret == h.id ? "" : ret); // file, no AllowedData
              }  else {
                h.filename = "";
                h.data = ret;
              }
              h.link = (fType=='file' ? "../dbFile?fileid="+fName :
                                        "../dbImage?imageid="+fName);
              lRow._complexData[h.id] = h;
              lRow._itemsLoaded++;

              if(lRow._itemsToLoad == lRow._itemsLoaded) {
                delete p.tx;
                delete lRow._itemsToLoad;
                delete lRow._itemsLoaded;
                var itemsLoaded = lRow._itemsLoaded;
                delete(lRow._itemsLoaded);
                delete(lRow._itemsToLoad);
                db_updateAnswer(p.book, tablename, lRowId, lRow, 
                  function() {
                    imagesBeingSaved -= itemsLoaded;
                    kps_storeMyData(undefined, p);
                  }, true, undefined, true);
              }
            });

        })(p, tbl.tablename, rowId, key, row, fName, fType, idx);
      }
    }

    if(row._itemsToLoad == 0)
      db_updateAnswer(p.book, tbl.tablename, rowId, row, 
        function() { kps_storeMyData(undefined, p) }, true, p, true);

  }
}

function
kps_doDownloadMyData(withPicture, failFn)
{
  if(withPicture == undefined)
    withPicture = true;
  backendCall("getMyUserData",
    { forUser:(userData.syncName ? userData.syncName : userData.username),
      project:projectName,
      syncParam:userData.syncParam, roletype:"UserFrontend" },
    kps_storeMyData, {withPicture:withPicture, tblIdx:0, rowIdx:0},
    function(err){
      okDialog(err);
      if(failFn)
        failFn();
    });
}

function
kps_downloadMyData()
{
  kps_newScreen(tr.downloadMyData);

  var vh = { valueHash:{} };
  kps_addWidget({columnname:'withPicture', displayname:tr.downloadMD_picture,
                 common:vh,
                 constrainttype:'multiFromArg',
                 constraintparam:" "
                 });
  kps_addButton(tr.download, "downloadMyData", function() {
    var data = {};
    kps_collectData(data);
    kps_doDownloadMyData(data.withPicture==" ");
  });

  kps_showScreen();
}


////////////////////////////////////////////////
function
kps_syncBookDef(nextFn, param)
{
  msg(tr.connecting);
  kps_doDownload(undefined,
        {status:0, nextFn:nextFn, nextFnParam:param, outstandingCall:0});
}

////////////////////////////////////////////////
// Get Bookdefinition, and check application cache
function
kps_doDownload(res, p)
{
  var status = p.status++;
  if(status == 0) {                           // get structVersion
    db_getAnswer(0, 'structVersion', 0, function(row) {
      p.structVersion = (row.version == undefined ? '' : row.version);
      kps_doDownload(res, p);
    });
    return;
  }

  if(status == 1) {                           // structure Changes
    backendCall("getStructChanges", {
      projectName:projectName, 
      version:p.structVersion,
      platform:platform,
    }, kps_doDownload, p);
    return;
  }

  if(status == 2) {
    if(!p.structChanges) {
      p.structChanges = res;
      p.structIdx = 0;
    }
    if(p.structIdx == p.structChanges.length) {
      if(window.nextFn) {
        delete window.nextFn;
        okDialogClose();
        return kps_initialize();
      } else {
        kps_doDownload(undefined, p);
      }
      return;
    }
    p.status--;
    var sc = p.structChanges[p.structIdx++];
    okDialog(sprintf(tr.structExec, sc.version));
    window.nextFn = function() { // called by sc.jscode
      db_updateAnswer(0, "structVersion", 0, {version:sc.version}, function() {
        kps_doDownload(undefined, p) 
      }, p);
    };
    log("EVAL:"+sc.jscode);
    eval(sc.jscode);
    return;
  }

  if(status == 3) {                             // prepare: get image metadata
    db_getImageMetadata(function(res){ 
      p.imgMeta = res;
      db_getAnswer(0, 'lastSync', 0, function(res) {
        p.lastSync = res.lastSync;
        kps_doDownload(undefined, p);
      });
    });
    return;
  }

  if(status == 4) {                             // get data
    backendCall("getMyBookDefinitions",
      { project:projectName,
        lastUpdate:(bdef ? bdef.lastUpdate : ""),
        lastImage:(p.lastSync ? p.lastSync : ""),
        numBooks:(bdef.bookdefinition ? bdef.bookdefinition.length : 0) },
      kps_doDownload, p,
      function(errMsg) {                // Failed
        okDialog("getMyBookDefinitions failed: "+errMsg);
      });
    return;
  }

  if(status == 5) {                             // save & digest bookdef
    if(res.noNewData) {
      syncMsg = p.syncMsg = tr.syncNoDef;
      p.status = 10;
      return kps_doDownload(undefined, p) 
    }
    p.images = res.images; delete(res.images);
    p.imgArr = Object.keys(p.images);
    p.imgIdx = 0;
    p.tables = res.tables; delete(res.tables);
    log("getMyBookDefinitions => images:"+p.imgArr.length+" tables:"+p.tables.length);
    db_updateAnswer(0,"bookdef",0, res,
    function(){
      var oldStatus = bdef.user ? bdef.user.status : "";
      kps_digestBookdef(res);
      if(bdef.user.status != oldStatus)
        syncChangedData = true;
      kps_doDownload(undefined, p);
    }, true, p);
    return;
  }

  if(status == 6) {                             // save tables
    var nTablesSaved=0, nTablesTotal=Object.keys(p.tables).length;
    for(tbl in p.tables)
      luTables[tbl] = p.tables[tbl]; origLuTables={};
    for(var tn in luTables)
      origLuTables[tn] = true;

    if(nTablesTotal == 0)
      return kps_doDownload(undefined, p);

    for(var tName in p.tables) {
      log("Storing table "+tName);
      db_updateAnswer(0,"table."+tName,0, p.tables[tName],
        function(){
          if(++nTablesSaved == nTablesTotal)
            return kps_doDownload(undefined, p);
        }, p);
    }
    return;
  }

  if(status == 7) {                             // load images
    function
    doImgDownload()
    {
      if(p.imgIdx == p.imgArr.length) {
        if(p.outstandingCall == 0)
          kps_doDownload(undefined, p);
        return;
      }

      if(p.outstandingCall >= 5)
        return;

      var imgName = p.imgArr[p.imgIdx++];
      if(p.imgMeta[imgName] &&
         p.imgMeta[imgName].localeCompare(p.images[imgName]) >= 0)
        return doImgDownload();

      p.outstandingCall++;
      var imgA = imgName.split("/");
      var bdType = { LOOKUP:1, QUIZ:1 };
      var tbldef = bdef.tbldef[imgA[0]];
      var isBigData = bdType[tbldef ? tbldef.pagetype : ""] ? true : false;
      msg(sprintf(tr.loadImg,imgA[0]+"/"+imgA[1]+(isBigData ? '' : 'i'))
          .replace(/ /g, '&nbsp;'));
      backendCall("getImage",
        { bigdata:isBigData, imgName:imgName },
        function(ret) { // Success, load next
          db_saveImage(imgName, p.images[imgName], ret);
          p.outstandingCall--;
          doImgDownload();
        }, 0,
        function(ret) { // Failed, load next
          p.loadFailed = true;
          p.outstandingCall--;
          doImgDownload();
        });
      return doImgDownload(); // Generate multiple outstanding calls
    }

    doImgDownload();
  }


  if(status == 8)
    return kps_doDownload(undefined, p); // was saving lastCompletedOp

  if(status == 9) {                             // done
    if(p.loadFailed)
      p.syncMsg = tr.bookDefFailed;
    else 
      p.syncMsg = sprintf(tr.bookDefResult, bdef.bookdefinition.length,
                        bdef.pagedefinition.length, bdef.pageattributes.length);
    kps_callHooks("initialized");
    return kps_doDownload(undefined, p);
  }

  if(status == 10) {
    syncMsg = p.syncMsg;
    if(p.nextFn)
      p.nextFn(p.nextFnParam);
    else if(p.syncMsg)
      msg(p.syncMsg);
    return;
  }
}

function
kps_execSyncHooks(nextFn, p)
{
  if(!p) {
    p = { syncHookIdx:0 };
    if(syncDebug) {
      backendCall("uploadDebugInfo",
        { rows:kps_getSortedLog(), comment:"SyncLog" },
        function(res) {
          for(var i1=0; i1<=logSize; i1++)
            delete(logBuffer[i1]);
        }, undefined, function(){} );
    }
  }

  if(p.syncHookIdx == syncHooks.length) {
    if(nextFn)
      nextFn();
    return;
  }
  p.status--;
  return syncHooks[p.syncHookIdx++](function(){ kps_execSyncHooks(nextFn,p) });
}


function
kps_setSyncFlag(newState, nPic, par)
{
  if(!syncInProgress && !newState)  // false alarm
    return;

  if(syncInProgress && !newState)
    syncInProgress = false;
  else if(!syncInProgress && newState)
    syncInProgress = true;

  if(nPic)
    msg(sprintf(tr.syncImgRem, nPic));
}

////////////////////////////////////////////////
// Send data to the backend (high and low prio) and call nextFn
function
kps_syncUploadData(p)
{
  if(!p)
    p = {};

  if(!p.haveLastSync && syncInProgress == true)   // button pressed twice
    return;

  kps_setSyncFlag(true);
    
  if(!p.haveLastSync) {
    p.haveLastSync = true;
    db_getAnswer(0, 'lastSync', 0, function(row) {
      if(row.lastSync == undefined) { // compatibility
        db_getLastSync(function(ls){
          p.lastSync = ls;
          kps_syncUploadData(p);
        });
      } else {
        p.lastSync = row.lastSync;
        kps_syncUploadData(p);
      }
    });
    return;
  }

  if(!p.storeDone) {
    p.storeDone = true;
    p.bh = {};
    for(bookId in bookHash)
      p.bh[bookId] = true;
    log("kps_syncUploadData: requesting from backend data newer than "+p.lastSync);
    backendCall("getMyUserData",
      { forUser:(userData.syncName ? userData.syncName : userData.username),
        project:projectName, 
        syncParam:userData.syncParam, roletype:"UserFrontend",
        lastSync:p.lastSync, bookHash:p.bh },
      kps_storeMyData,
      { withPicture:true, tblIdx:0, rowIdx:0, bookSynced:true,
        nextFn:function(par) {
          p.lastSync = par.lastSync;
          kps_syncUploadData(p);
        }
      },
      function(err) { okDialog(err); kps_setSyncFlag(false); }
    );
    return;
  }


  if(p.rows == undefined) {
    msg(tr.syncDataCollect);
    return db_getUnsynced(function(rows){ p.rows=rows; kps_syncUploadData(p)});
  }

  msg(tr.syncSend);             // after DataCollect, as collect displays msg

  function
  showDialog()
  {
    function doShowDialog(downloadCompleted=false) {
      function okClicked() {
        okDialogClose();
        if(useDeprecatedCache && applicationCache.status==applicationCache.IDLE)
          applicationCache.update();
        else if(syncChangedData) {
          if(swRegistration && swRegistration.active && swRegistration.active.state == "activated") {
            log("reload when offline and using service worker");
            window.onbeforeunload = undefined;
            window.location.reload();
          } else
            kps_initialize();
        }
      }
      okDialogClose();
      if (downloadCompleted) {
        // show completed without ok button
        okDialog(syncMsg, false, { buttons: {}});
        setTimeout(okClicked, 50);
        return;
      }
      $("body").append("<div id='dlg_ok'></div>");
      $("div#dlg_ok").html(syncMsg);
      syncMsg = '';
      $("div#dlg_ok").dialog({
        dialogClass:"no-close", modal:true, buttons: [
          {text:tr.ok, click:function(){
            $(this).dialog("close");
            $("div#dlg_ok").remove();
            okClicked();
          }}]
      });
    }
    //var isGood = (platform.platform == "desktop" || navigator.connection.type == "wifi" || 
    //             navigator.connection.type == "cellular" && navigator.connection.downlinkMax >= 0.2);
    if(swRegistration && swRegistration.active && swRegistration.active.state == "activated") {
      // get timestamps of offline files, and load newer files
      backendCall("getOfflineTimestamps",
        { project:projectName },
        function(res) {
           var fetchList = [];
           for (var file in res) {
             var url = location.origin + "/" + (pn.length > 3 ? location.pathname.split("/")[1] + "/":"") + projectName + "/" + file;
             if (!kps_offlineTimestamps[file] || new Date(res[file].modified) > new Date(kps_offlineTimestamps[file])) {
               fetchList.push(url);
               if (kps_offlineTimestamps[file])
                 log("file " + file + " on server newer than cached file ("
                     +(new Date(res[file].modified).toISOString()) + " > " + (new Date(kps_offlineTimestamps[file]).toISOString()) + ")");
               else
                 log("new file " + file + " on server found, add " + url + " to download list");
             }
           }
           if (fetchList.length==0)
             return doShowDialog();
           p.downloaded = p.done = p.deleted = 0;
           // show for first dialog
           var str = tr.downloadNewerFile ? tr.downloadNewerFile :
                         "Downloading files:<br>{1} of {2}";
           okDialog(sprintf(str, 1, fetchList.length), false, { buttons: {}});
           for (idx=0; idx<fetchList.length; idx++) {
             fetch(new Request(fetchList[idx]), {cache: "no-store" }).then(function(response){
                log("download finished of "+response.url);
                var str = tr.downloadNewerFile ? tr.downloadNewerFile :
                             "Downloading files:<br>{1} of {2}";
                okDialog(sprintf(str, ++p.downloaded, fetchList.length), false, { buttons: {}});
                if (++p.done == fetchList.length) {
                  // all downloads complete
                  caches.open(cacheName).then(function(cache) {
                     for (i=0; i<fetchList.length; i++) {
                       log("delete from cache: "+fetchList[i]);
                       cache.delete(fetchList[i]).then(function() {
                          if (++p.deleted == p.downloaded) {
                            // all newer files deleted from cache, will be loaded from Update cache after reload
                            syncMsg = sprintf(tr.downloadComplete ? tr.downloadComplete :
                                  "Download files completed:<br>{1} of {1}", p.downloaded);
                            syncChangedData = true;
                            kps_offlineTimestamps = res;
                            doShowDialog(true);
                            
                          }
                       });
                     }
 
                  });
                }
             }).catch(function(err) {
                var str = tr.downloadError ? tr.downloadError :
                          "Loading file failed:<br>{1}<br>Try to reload.";
                okDialog(sprintf(str, err.message));
              });
           } 
        }, null,
        function(err) { okDialog(err); }
      );
    } else 
      doShowDialog();
  }

  function
  callNextFn(res)
  {
    if(!p.nextFn)
      p.nextFn = function(n) { n() }

    p.nextFn(function(){
      backendSendLongDataQ({status:0,
      finishFn:function(){
        if(res && res.syncAgain) { // my uploaded data got enriched, download it
          backendCall("getMyUserData",
            { forUser:(userData.syncName ? userData.syncName:userData.username),
              project:projectName, 
              syncParam:userData.syncParam, roletype:"UserFrontend",
              lastSync:res.syncAgain, bookHash:p.bh },
            kps_storeMyData, { withPicture:true, tblIdx:0, rowIdx:0,
                          syncAgain:true, bookSynced:true, nextFn:showDialog },
            function(err) { okDialog(err); kps_setSyncFlag(false); }
          );
        } else {
          showDialog();
        }
      }});
    });
  }
  
  if(p.rows.length === 0) {
    syncMsg = (syncMsg ? syncMsg+'<br>':'')+tr.syncNoData;
    kps_setSyncFlag(false);
    callNextFn();
    return;
  }


  var param = { rows:p.rows, lastSync:p.lastSync };
  kps_queueLongData(function(param) {
    param.structVersion = version;
    log(sprintf("upload: sending {1} entries, net data length {2} bytes",
                  p.rows.length, JSON.stringify(param).length));
    if(syncDebug) {
      for(var i1=0; i1<p.rows.length; i1++)
        log(JSON.stringify(p.rows[i1]).substr(0,184));
    }
    backendCall("upload", param,
      function(res) {
        for(var i1=0; i1<books.length; i1++)
          if(!books[i1].header._firstSync)
            books[i1]._rstSync = res.now;
        db_setSynced(res);
        syncMsg = (syncMsg ? syncMsg+'<br>':'')+tr.syncFinished;
        callNextFn(res);
      },
      undefined,
      function(res) {
        kps_setSyncFlag(false);
        okCancelDialog(tr.syncFailed,
          undefined,                    // YesFn
          function(){ okDialog(res); }, // NoFn
          tr.ok ? tr.ok : "Ok",
          tr.syncDetails ? tr.syncDetails : "Technical details");
      });
  }, param);
}

////////////////////////////////////////////////
function
kps_newBook(fromBook, noNewScreen)
{
  if(!bdef || !bdef.bookdefinition || !bdef.bookdefinition.length)
    return okDialog(tr.noBookDef);
  if(!noNewScreen)
    kps_newScreen(tr.newBook);

  var bName=[];
  var bookRight = kps_bookRights(fromBook);
  for(var i1=0; i1<bdef.bookdefinition.length; i1++) {
    var bd = bdef.bookdefinition[i1];
    if(fromBook == null && bd.parentbookid != null ||
       bd.hidden == "YES" || bd.autocreate == "YES")
      continue;
    if(fromBook != null && fromBook.bookDefId != bd.parentbookid)
      continue;
    if(bookRight[bd.id] != "write")
      continue;
    if(fromBook && bd.showif) {
      var a = bd.showif.split("=");
      if(!(new RegExp(a[1]).test(fromBook.header[a[0]])))
        continue;
    }
    bName.push(bd.title ? trDef(bd, "title") : trDef(bd, "name"));
  }
  bName.sort();
  var par = { columnname:'book', displayname:tr.book,
              common:{ valueHash:{_bookId:(new Date()).getTime(), _rowId:0} },
              constrainttype:'singleFromArg',
              constraintparam:bName.join(','), 
              addChangeFn:kps_newBookChanged,
              fromBook:fromBook,
              inputtype:'mandatory',
            };
  if(bName.length > 1)
    kps_addWidget(par);
  kps_newBookChanged(par, bName[0], kps_showScreen);
}

////////////////////////////////////////////////
// Show the header page columns, depending on the selected book
function
kps_newBookChanged(param, sel, nextFn)
{
  if(param.inNBC)       // avoid beeing called by kps_finishPageFn
    return;
  if(!param.hp) {       // Load HEADER data first for lookup
    var b;
    for(var i1=0; i1<bdef.bookdefinition.length; i1++)
      if(trDef(bdef.bookdefinition[i1], "title") == sel)
        b = bdef.bookdefinition[i1];
    param.selBook = b;

    $(currentScreen).find("div.question-wrapper:first .upper_questionhelp")
      .each(function(){
        var ht = trDef(b, "helptext");
        $(this).html(ht == "helptext" ? "" : ht);
      });

    // delete old questions
    $(currentScreen).find("div.question-wrapper").not(":first").remove();
    $(currentScreen).find("div.question-value.parentLink").remove();
    $(currentScreen).find("button").remove();

    param.hp = bdef.book[b.id].headerPage;
    if(!param.hp)
      return;
    kps_reloadUserLookup({ id:b.id, pagetype:"HEADER" },
                        function(){kps_newBookChanged(param, sel, nextFn)});

  } else {              // Show the columns
    var common = { valueHash:{_bookId:param.common.valueHash._bookId, _rowId:0} };
    kps_addParentData(common.valueHash, param.fromBook);
    param.hpd = bdef.page[param.hp.id];
    param.col2tbl = { _complexData:param.hpd };
    lastGroup = undefined;

    for(var i1=0; i1<param.hpd.cols.length; i1++) {
      var c = param.hpd.cols[i1];
      // Parent Link
      if(param.selBook.parentHdrCol == c.columnname && param.fromBook) {
        $(currentScreen).append('<div class="question-value parentLink" id="v_'+
                c.columnname+'" constrainttype="singleFromArg" val="'+
                param.fromBook.bookId+'/0" style="display:none"></div>');
      } else {
        param.col2tbl[c.columnname] = param.hpd;
        c.common = common;
        c.table = param.hpd;
        kps_addWidget(c, false);
      }
    }

    param.inNBC = true;
    kps_finishPageFn();
    if(nextFn)
      nextFn(param);
    delete(param.inNBC);
    delete(param.hp);

    var saving = false;
    kps_addButton(tr.create, "save book", function() {  // Create book, ==save
      if(saving)
        return;
      saving = true;
      var data = {};
      kps_collectData(data);
      $("#v_book").each(function(){ param = this.param });

      if(!kps_checkParam(param.hpd.cols, param.col2tbl, data)) {
        saving = false;
        return;
      }
      if(!kps_checkUniqueBook(param.selBook, data)) {
        saving = false;
        return;
      }

      var mBookId = param.common.valueHash._bookId;
      var bDefId = param.selBook.id;

      var testbook = (param.fromBook ? param.fromBook :
                        {bookId:mBookId, header:data });
      var bookRight = kps_bookRights(testbook, bDefId);
      if(bookRight[bDefId] != "write") {
        okDialog(tr.createNotAllowed);
        saving = false;
        return;
      }

      var book = {bookId:mBookId, bookDefId:bDefId, maxRow:0 };
      db_updateBook(book, function() {
        if(param.hpd && param.hpd.tablename) {
          delete(data.book);
          db_updateAnswer(book, param.hpd.tablename, 0, data, function(){
            kps_initialize({
              firstState:8, // db_getBooks
              callback:function(){
                kps_autoCreateBooks(function(acp){
                  kps_callHooks("initialized");
                  if(acp.acCreated) {
                    kps_initialize({
                      firstState:8, // db_getBooks
                      callback:function(){
                        kps_callHooks("save", data);
                        kps_popScreen();
                      }});
                  } else {
                    kps_callHooks("save", data);
                    kps_popScreen();
                  }
                }, { acBookId:mBookId} );
              }
            });
          });
        }
      });
    });
  }
}



///////////////////////////////////////
function
kps_makeSummary(pd, stype, data)
{
  var formatString = trDef(pd, stype);
  if(formatString == undefined || formatString == null)
    return "No "+stype+" specified";
  formatString = formatString.replace(/{([A-Z0-9_]+)(\.([A-Z0-9_]+))?}/g,
    function(match1, col1, match2, col3){
      var r = (data[col1] ? data[col1] : "");
      var c = bdef.cols[col1];

      if(!col3 || !r) {
        if(r == undefined || r=="null")
          r = "";
        if(r != "") {
          if(c && c.constrainttype == "date")
            r = kps_fmtDate(c, date2str(r));
          if(c && (c.constrainttype == "dateTime" || 
             c.constrainttype == "hiddenTimestamp"))
            r = dtime2str(r);
          if(c && c.constrainttype == "foto" ||
                  c.constrainttype == "signature") {
            if(data._complexData && data._complexData[r])
              r = data._complexData[r].data;
            else
              r = r.substr(r.indexOf(";")+1);
          }
        }
        return (r == undefined || r=="null" ? "" : r);
      }

      if(!c || typeof c.constraintparam != "string")   // Table Lookup
        return "<BadDef>";

      if(c.constrainttype == "tableRows") {
        if(!r)
          return "";
        var tr = JSON.parse(r), res=[];
        for(var i1=0; i1<tr.length; i1++)
          res.push(tr[i1][col3]);
        return res.join(", ");
      }

      var row = kps_getTablePtr(c.constraintparam, r);
      if(!row)
        return "";
      r = row[col3];
      if(r == "")
        return "";
      c = bdef.cols[col3];
      if(c) {
        if(c.constrainttype == "date")
          r = kps_fmtDate(c, date2str(r));
        if(c.constrainttype == "dateTime" || 
           c.constrainttype == "hiddenTimestamp")
          r = dtime2str(r);
        if(c.constrainttype == "foto")
          r = r.substr(r.indexOf(";")+1);
      }
      return r;
    });
  return formatString;
}


///////////////////////////////////////
function
kps_getTablePtr(tName, val)
{
  var tbl = luTables[tName.split(" ")[0]];
  if(!tbl)
    return undefined;

  for(var i1=0; i1<tbl.length; i1++)
    if(tbl[i1].id == val)
      return tbl[i1];
  return undefined;
}

function
kps_getTableText(rowdef, val)
{
  var fa = rowdef.constraintparam.split(" ");
  var row = kps_getTablePtr(fa[0], val);
  return (row ? row.DISPLAYNAME : "");
}

////////////////////////////////////////////////
function
kps_reloadUserLookup(hash, nextFn, data)
{
  var pArr = bdef.b2p[hash.id];

  if(typeof data == "undefined") { // collect tablenames to read in

    hash.rUL_tablesToGet = [];
    if(!hash.rUL_loaded)
      hash.rUL_loaded = {};

    for(var i1=0; i1<pArr.length; i1++) {
      var pd = pArr[i1];
      if(pd.pagetype != hash.pagetype)
        continue;
      for(var i2=0; i2<pd.cols.length; i2++) {
        var c = pd.cols[i2];
        if(c.constrainttype != "singleFromTable" ||
           typeof c.constraintparam != "string")
          continue;
        var tn = c.constraintparam.split(" ");
        if(!origLuTables[tn[0]] && !hash.rUL_loaded[tn[0]]) {
          hash.rUL_loaded[tn[0]] = 1;
          hash.rUL_tablesToGet.push(tn[0]);
        }
        // BodyTables.
        if(tn.length>=3 && tn[1].indexOf('{') == 0 && !hash.rUL_loaded[tn[2]]) {
          hash.rUL_loaded[tn[2]] = 1;
          hash.rUL_tablesToGet.push(tn[2]);
        }
      }
    }

    if(hash.rUL_tablesToGet.length == 0) {
      delete(hash.rUL_tablesToGet);
      delete(hash.rUL_tablesLoaded);
      return nextFn();
    }

    hash.rUL_tablesLoaded = 0;
    db_getAnswerRows(makeFilter(),
              function(data){ kps_reloadUserLookup(hash, nextFn, data); } );
    return;
  }

  for(var i1=0; i1<data.length; i1++)   // Pimp it for the select saveFn
    data[i1].id = data[i1]._bookId+"/"+data[i1]._rowId;

  var tn = hash.rUL_tablesToGet[hash.rUL_tablesLoaded].split(",");
  luTables[tn[0]] = data;
  if(++hash.rUL_tablesLoaded == hash.rUL_tablesToGet.length) {
    delete(hash.rUL_tablesToGet);
    delete(hash.rUL_tablesLoaded);
    nextFn();

  } else {
    db_getAnswerRows(makeFilter(),
              function(data){ kps_reloadUserLookup(hash, nextFn, data); } );
  }

  function
  makeFilter()
  {
    var tl = hash.rUL_tablesToGet[hash.rUL_tablesLoaded].split(',');
    return '(tablename="'+tl.join('" or tablename="')+'")';
  }
}


////////////////////////////////////////////////
function
kps_editBook(b, data, entriesOnly, noNewScreen)
{
  var bd = bdef.book[b.bookDefId], pArr = bdef.b2p[b.bookDefId];

  if(typeof data == "undefined" && typeof b.eb_step == "undefined") {
    log("Edit book with id:"+b.bookId);

    b.eb_step = 1;
    db_getAnswerRows({bookId:b.bookId },
           function(data){ kps_editBook(b, data, entriesOnly, noNewScreen); } );
    return;
  }

  if(b.eb_step == 1) {          // Read in additional tables;
    b.bookdata = data; 
    b.header = data[0];
    b.eb_step++;
    return kps_reloadUserLookup({id:b.bookDefId, pagetype:"BODY"},
            function(){ kps_editBook(b, undefined, entriesOnly, noNewScreen) });
  }
  delete(b.eb_step);

  // Search for the bodypage
  var bodyPage, hdr=b.bookdata[0];
  for(var i1=0; i1<pArr.length; i1++) {
    var pd = pArr[i1];
    if(pd.pagetype != "BODY")
      continue;
    if(!pd.subpageparam) {
      if(!bodyPage)
        bodyPage = pd;
    } else {
      var cv = pd.subpageparam.split(":", 2);
      if(cv.length == 2 && kps_pageMatch(bd.headerPage, hdr[cv[0]],cv[0],cv[1]))
        bodyPage = pd;
    }
  }

  // check subbook showifs, if we really have children
  b._hasChildren = bd.hasChildren; 
  if(b._hasChildren) {
    var cnt = 0;
    for(var i1=0; i1<bdef.bookdefinition.length; i1++) {
      var lbd = bdef.bookdefinition[i1];
      if(lbd.parentbookid != bd.id)
        continue;
      if(lbd.showif) {
        var si = lbd.showif.split("=");
        if(!(new RegExp(si[1]).test(b.header[si[0]])))
          continue;
      }
      cnt++;
    }
    b._hasChildren = (cnt > 0);
  }

  if(!bodyPage && !b._hasChildren)
    return kps_showBookHeader(b);

  if(!noNewScreen)
    kps_newScreen(b.shortBookName);
  $(currentScreen).attr("data-bdefId", b.bookDefId);
  $(currentScreen).attr("data-bookId", b.bookId);
  editBookParam = b; // Needed for printing

  
  var bookRights = kps_bookRights(b.parentbook ? b.parentbook : b);
  var canWrite = (bookRights[b.bookDefId] == "write");
  var myBooks = kps_myBooks(b);
  $(currentScreen)[0].param = { book:b, myBooks:myBooks };

  //log("EditBook:  entriesOnly:"+entriesOnly+" hasChildren:"+b._hasChildren);
  if(entriesOnly || !b._hasChildren) {

    if(!bodyPage) {
      kps_popScreen(undefined, true);
      return kps_showBookHeader(b);
    }

    if(bdef.book[b.bookDefId].autocreate != "YES") {
      kps_addButton(tr.bookHeader, "bookHeaderButton",  function(){
        kps_showBookHeader(b);
      });
      kps_addEmptyRow();
    }

    var sbooks = b.bookdata.slice(1); // sorted books
    if(!bodyPage.sortby)
      bodyPage.sortby = "shorttitle";
    var sb = bodyPage.sortby, revSort;
    if(sb && sb.indexOf("!") == 0) {
      sb = sb.substr(1);
      revSort = true;
    }

    if(sb && sb.indexOf("{") == 0) {
      eval(sb);

    } else {
      sbooks.sort(function(a,b) {
        if(a._rowId == 0) return -1;
        if(b._rowId == 0) return  1;
        if(sb == "shorttitle") {
          a = kps_makeSummary(bodyPage, "shorttitle", a);
          b = kps_makeSummary(bodyPage, "shorttitle", b);
        } else {
          a = a[sb]; b = b[sb];
        }
        if(a && b)
          return (revSort ? b.localeCompare(a) : a.localeCompare(b));
        return 0;
      });
    }

    // Display one line per entry
    for(var i1=0; i1<sbooks.length; i1++) {
      var r = sbooks[i1];
      kps_addButton(kps_makeSummary(bodyPage, "longtitle", r), "entry "+bd.name,
            kps_editRow, {book:b, data:r, bodyPage:bodyPage, canWrite:canWrite},
            { row:b.bookId+"/"+r._rowId, bdefId:b.bookDefId });
    }

    kps_addEmptyRow();

    if(canWrite && bdef.user.status != "LOCKED") {
      kps_addButton(tr.add, "addEntryButton",  function(){
        kps_editRow({ book:b, data:{_rowId:(b.maxRow+1)}, bodyPage:bodyPage,
                        newBook:true}); // newBook used by kipus_addition
      });
    }

    kps_showScreen();
    return;

  } else {

    kps_addButton(tr.viewEntry, "bookEntries "+bd.name,  function(){
      kps_editBook(b, undefined, true);
    });
    kps_addEmptyRow();

  }



  var lastBookName="";
  var oCS = currentScreen;
  for(var i1=0; i1<myBooks.length; i1++) {
    var sb=myBooks[i1], sbd=bdef.book[sb.bookDefId];
    if(sbd.hidden == "YES")
      continue;
    if(sbd.showif) {
      var si = sbd.showif.split("=");
      if(!(new RegExp(si[1]).test(b.header[si[0]])))
        continue;
    }

    if(sbd.name != lastBookName) {
      var dId = sbd.name.toLowerCase()+'Div';
      $(oCS).append('<div id="'+dId+'">');
      currentScreen = "#"+dId;
      $(currentScreen).append('<div class="bookTitle '+sbd.name+'">'+
                                        trDef(sbd, "title")+'</div>');
      lastBookName = sbd.name;
    }
    sb.parentbook = b;
    kps_addButton(sb.longBookName, "book "+sbd.name, kps_editBook, sb);
  }
  currentScreen = oCS;

  if(kps_canCreateBooks(bookRights, b) && bdef.user.status != "LOCKED") {
    kps_addEmptyRow();
    kps_addButton(tr.newBook, "newBookButton", kps_newBook, b);
  }

  kps_showScreen();
}

///////////////////////////////////////
function
kps_autoCreateBooks(nextFn, param)
{
  var acBooks={};
  for(var i1=0; i1<bdef.bookdefinition.length; i1++) {
    var sbd = bdef.bookdefinition[i1];
    if(!sbd.parentbookid || sbd.autocreate != "YES" || !sbd.parentHdrCol)
      continue;
    if(!acBooks[sbd.parentbookid])
      acBooks[sbd.parentbookid] = {};
    acBooks[sbd.parentbookid][sbd.id] = 1;
  }

  var toC1=[], toC2=[], bHash={};
  for(var i1=0; i1<books.length; i1++) {
    var b = books[i1], bd = bdef.book[b.bookDefId];
    if(param.acBookId && b.bookId != param.acBookId)
      continue;
    if(bd.parentbookid && bd.parentHdrCol && b.header[bd.parentHdrCol]) {
      var phc = b.header[bd.parentHdrCol];
      if(!bHash[phc])
        bHash[phc] = {};
      bHash[phc][bd.id] = 1;
    }
    if(acBooks[b.bookDefId])
      toC1.push(b);
  }
  for(var i1=0; i1<toC1.length; i1++) {
    var b = toC1[i1];
    for(var sId in acBooks[b.bookDefId])
      if(!bHash[b.bookId+"/0"] || !bHash[b.bookId+"/0"][sId])
        toC2.push({b:b, sId:sId});
  }

  if(!toC2.length)
    return (nextFn ? nextFn(param) : 0);
  log("autoCreateBooks:"+toC2.length);

  var counter=0, mBookId = (new Date()).getTime();
  for(var i1=0; i1<toC2.length; i1++) {
    (function(i1) {
      var b = toC2[i1].b, sbd = bdef.book[toC2[i1].sId];
      var book = { bookId:++mBookId, bookDefId:sbd.id, maxRow:0 };
      var header = {};
      header[sbd.parentHdrCol] = b.bookId+"/0";
      db_updateBook(book, function() {
        db_updateAnswer(book, sbd.headerPage.tablename, 0, header, function(){
          if(++counter == toC2.length) {
            if(nextFn) {
              param.acCreated = toC2.length;
              nextFn(param);
            }
          }
        });
      });
    })(i1);
  }
}

///////////////////////////////////////
function
kps_myBooks(b)
{
  var ret=[];
  for(var i1=0; i1<books.length; i1++) {
    var sb=books[i1], sbd=bdef.book[sb.bookDefId];
    if(sb.shortBookName == undefined || sbd.parentbookid != b.bookDefId ||
      !sbd.parentHdrCol)
      continue;
    var pc = sb.header[sbd.parentHdrCol];
    if(!pc || pc.split("/").shift() != b.bookId)
      continue;
    ret.push(sb);
  }
  ret.sort(function(a,b){
    var ad = bdef.book[a.bookDefId], bd = bdef.book[b.bookDefId];
    var an = "", bn = "";
    if(ad.headerPage && ad.headerPage.sortby && a.header)
      an = a.header[ad.headerPage.sortby];
    if(bd.headerPage && bd.headerPage.sortby && b.header)
      bn = b.header[bd.headerPage.sortby];
    return (ad.title+an+a.shortBookName).localeCompare(
            bd.title+bn+b.shortBookName);
  });

  return ret;
}


///////////////////////////////////////
function
kps_showBookHeader(b)
{
  var bd = bdef.book[b.bookDefId];
  var h = bd.headerPage;

  var isSynced = (b.header._firstSync && b.header._firstSync != "");
  var isRo = isSynced;
  for(var i1=0; i1<h.cols.length; i1++)
    if(h.cols[i1].inputtype.indexOf('modifiablehdrcol') >= 0)
      isRo = false;
  if(!isRo) {
    var br = kps_bookRights(b, b.bookDefId);
    if(br[b.bookDefId] != "write")
      isRo = true;
  }
  
  kps_newScreen(b.shortBookName+(isRo ? ". "+tr.readonly : ""));
  $(currentScreen)[0].param = { book:b };
  $(currentScreen).attr("data-bdefId", b.bookDefId);

  var common = { valueHash:{_bookId:b.bookId, _rowId:0} };
  kps_addParentData(common.valueHash, b);
  var col2tbl = { _complexData:h };
  b.beforeChangedData = { _complexData:common.valueHash._complexData };
  b.ro = isRo;
  for(var i1=0; i1<h.cols.length; i1++) {

    var c = h.cols[i1];
    if(bdef.book[b.bookDefId].parentHdrCol == c.columnname) { // Parent Link
      $(currentScreen).append('<div class="question-value parentLink" id="v_'+
              c.columnname+'" constrainttype="singleFromArg" val="'+
              b.header[c.columnname]+'" style="display:none"></div>');
    } else {
      if(c.columnname == bd.parentHdrCol)
        continue;
      c.common = common;
      c.table = h;
      kps_addWidget(c, c.inputtype.indexOf('modifiablehdrcol')<0 && isSynced);
      col2tbl[c.columnname] = h;
      b.beforeChangedData[c.columnname] = common.valueHash[c.columnname];
    }

    if(bdef.book[b.bookDefId].parentHdrCol == c.columnname)
      $(currentScreen).find("#w_"+c.columnname).css("display", "none");
  }
  if(!isRo && bdef.user.status != "LOCKED") {
    var saving=false;
    kps_addButton(tr.save, "save book", function(){
      if(saving)
        return;
      saving = true;
      var data={}; // b.header contains _bookId&co, cannot use db_updateAnswer
      kps_collectData(data);
      for(var i in data)
        b.header[i] = data[i];
      b.synced = null;
      if(!kps_checkParam(h.cols, col2tbl, data)) {
        saving = false;
        return;
      }
      db_updateAnswer(b, h.tablename, 0, data, function(){
        kps_callHooks("save", data);
        kps_popScreen();
      });
    });
  }
  kps_finishPageFn();

  kps_showScreen();
}

///////////////////////////////////////
function
kps_pageMatch(pd, data, colName, flt)
{
  if(typeof data == "undefined")
    return false;
  var c;
  for(var i1=0; i1<pd.cols.length; i1++)
    if(pd.cols[i1].columnname == colName)
      c=pd.cols[i1];
  if(!c)
    return false;

  var row;
  if(c.constrainttype == "singleFromTable") {
    row = kps_getTablePtr(c.constraintparam, data);
    if(!row)
      return false;
  }
  var fltArr = flt.split(" ");
  for(var i1=0; i1<fltArr.length; i1++) {
    if(c.constrainttype != "singleFromTable") {
      if((new RegExp(fltArr[i1])).test(data))
        return true;
    } else {
      var kv = fltArr[i1].split("=",2);
      if(kv.length == 1 && (new RegExp(kv[1])).test(row.DISPLAYNAME))
        return true;
      if(kv.length == 2 && (new RegExp(kv[1])).test(row[kv[0]]))
        return true;
    }
  }
  return false;
}

////////////////////////////////////////////////
// Filter: Col=Val or .Col=Val (for exact match)
// Col is column in the row to be filtered
// Val is either "val" for a constant, fld for another field or fld:fldCol for
// lookup in table belonging to fld, current value of fld, column fldCol
function
kps_filterIsSet(row, common, fltData)
{
  if(fltData.filter == undefined || fltData.filter == '=')
    return true;
  if(!fltData.filters) {
    fltData.filters=[];
    var fk = fltData.filter.split(/&/);
    for(var i1=0; i1<fk.length; i1++) {
      var r = {};
      var fa = fk[i1].split(/[:=]/);
      r.cmpCol = fa[0];
      if(r.cmpCol.charAt(0) == '.') {   // Hack: equal, not regexp
        r.equal = true;
        r.cmpCol = r.cmpCol.substr(1);
      }

      var f1 = fa[1];
      r.cmpField = f1;
      if(fa.length == 2) {
        r.noTable = true;
        if(f1.charAt(0) == '"')     // ColumnName="val"
          r.const = f1.substr(1, f1.length-2);
      }

      if(fa.length == 3) {
        r.cmpCol2 = fa[2];
        if(bdef.cols[r.cmpField] && 
           bdef.cols[r.cmpField].constrainttype == "tableRows") {
            r.tableRowsData = [];
          if(common.valueHash[r.cmpField]) {
            try {
              r.tableRowsData = JSON.parse(common.valueHash[r.cmpField]);
            } catch(e) {
              log(e);
              log("Data:"+common.valueHash[r.cmpField]);
              okDialog("Error during parsing "+r.cmpField+" data");
            }
          }
        }
      }
      fltData.filters.push(r);
    }
  }

  for(var i1=0; i1<fltData.filters.length; i1++) {
    var r = fltData.filters[i1];

    var val = row[r.cmpCol];
    if(typeof val == "undefined" || val == null) // null.
      return false;
    if(r.tableRowsData) {
      var fnd;
      for(var i2=0; i2<r.tableRowsData.length; i2++)
        if(val == r.tableRowsData[i2][r.cmpCol2]) {
          fnd = true;
          break;
        }
      if(fnd)
        continue;
      return false;
    }

    if(r.noTable) {
      if(r.const) {
        if((""+val).indexOf(r.const) < 0) // val is sometimes a number
          return false;

      } else if(typeof(common.valueHash[r.cmpField]) == "undefined") {
        return false;

      } else if(r.equal) {
        if(common.valueHash[r.cmpField] != val)
          return false;

      } else if((""+common.valueHash[r.cmpField]).indexOf(val) < 0) {
          return false;

      }
      continue;
    }

    if(common.cachedTblLu == undefined)
      common.cachedTblLu = {};

    var str = r.cmpField+"/"+r.cmpCol2;
    if(common.cachedTblLu[str] == undefined) {
      var tbl = common.tblContent[r.cmpField];
      if(!tbl) {
        tbl = common.tblName[r.cmpField];
        if(tbl)
          tbl = luTables[tbl];
      }
      if(!tbl) {
        if(bdef.cols[r.cmpField] && 
           bdef.cols[r.cmpField].constraintparam)
          tbl = luTables[bdef.cols[r.cmpField].constraintparam.split(" ")[0]];
      }
      if(!tbl) {
        okDialog(r.cmpField+" is not a valid column-name for filtering");
        return false;
      }
      var cmpVal = common.valueHash[r.cmpField];
      for(var i2=0; i2<tbl.length; i2++) {
        if(tbl[i2].id == cmpVal) {
          common.cachedTblLu[str] = tbl[i2][r.cmpCol2];
          break;
        }
      }
    }
    if(common.cachedTblLu[str] == undefined)
      return false;
    if(r.equal) {
      if(common.cachedTblLu[str] != val)
        return false;
      continue;
    }
    if((common.cachedTblLu[str]+"").indexOf(val) < 0)
      return false;
  }
  return true;
}

function
kps_filterBody(row, fbHash)
{
  var br = row.id.split("/");

  if(!fbHash.rootId) {
    var b = screenFns[0].args[0].book;
    fbHash.rootId = (b.parentbook ? b.parentbook.bookId : b.bookId)+"/0";
    fbHash.book = bdef.book[bookHash[br[0]].bookDefId];
  }
  return (bookHash[br[0]].header[fbHash.book.parentHdrCol] == fbHash.rootId);
}

function
kps_addParentData(vh, b)
{
  vh._usertype = bdef.user.usertype; // showif advanced user
  if(!vh._complexData)
    vh._complexData = {};
  while(b) {
    for(k in b.header)
      if(typeof(k)=="string" && k.indexOf("_")!=0 && k.indexOf("modified")!=0)
        vh[k] = b.header[k];
    if(b.header._complexData) {
      for(k in b.header._complexData)
        vh._complexData[k] = b.header._complexData[k];
    }
    b = b.parentbook;
  }
}

////////////////////////////////////////////////
//  Edit one entry == book row
function
kps_editRow(param)
{
  var b = param.book;

  editRowParam = param; // Needed for printing
  var bd = bdef.book[b.bookDefId];
  var synced = (param.data._firstSync && param.data._firstSync != "");
  var ro = synced;
  if(synced) {
    var cols = param.bodyPage.cols;
    for(var i1=0; i1<cols.length; i1++) {
      if(cols[i1].inputtype.indexOf('modifiablehdrcol') >= 0)
        ro = false;
    }
  }

  param.ro = ro;        // for the hooks

  kps_newScreen(b.shortBookName+(ro ? (". "+tr.readonly) : ""));

  $(currentScreen).attr("data-bdefId", param.book.bookDefId);
  $(currentScreen).attr("data-bookId", b.bookId);
  $(currentScreen).attr("data-rowId",  param.data._rowId);
  param.data._bookId = b.bookId; // tableRows

  param.col2tbl = {};
  // bookdata in common needed for {last} in default
  param.common = { valueHash:param.data, tblContent:{}, 
                   tblName:{}, bookdata:param.book.bookdata };
  kps_addParentData(param.common.valueHash, param.book);
  if(b.header) {        // add the Headerdata for showif/etc checks
    var hp = bdef.book[b.bookDefId].headerPage;
    for(var el in b.header) {
      if(el.indexOf("_") == 0)
        continue;
      param.data[el] = b.header[el];    // value
      param.col2tbl[el] = hp; // definition
    }
    for(var i1=0; i1<hp.cols.length; i1++) {
      if(hp.cols[i1].constrainttype.indexOf("FromTable") > 0) {
        var sp = hp.cols[i1].constraintparam.split(" ");
        param.common.tblName[hp.cols[i1].columnname] = sp[0];
      }
    }
  }

  param.dontCallFinish = true;
  param.beforeChangedData = {_complexData:param.common.valueHash._complexData};
  kps_addCols(param.bodyPage, param);
  delete(param.dontCallFinish);
  kps_finishPageFn();
  $(currentScreen)[0].param = param;    // corrective

  if(!synced && param.canWrite) {
    kps_addButton(tr.deleteRow, "deleteEntryButton", function(){
      okCancelDialog(sprintf(tr.deleteRowReally, b.shortBookName), function(){
        db_delAnswer(b, param.data, function(){ 
          kps_popScreen(function(){kps_editBook(b, undefined, true)})
        });
      }, undefined, tr.deleteRowReallyOK, tr.deleteRowReallyCancel);
    });
  }

  if(!ro && bdef.user.status != "LOCKED") {
    kps_addButton(tr.save, "save row", function() {
      var data = {};
      kps_collectData(data);
      if(!kps_checkParam(param.cols, param.col2tbl, data))
        return;
      if(param.newbook)
        if(!kps_checkUniquePage(param, data))
          return;
      kps_callHooks("save", data);
      b.synced = null;
      b.firstSync = param.data._firstSync; // for Update
      db_deleteAnswer(b.bookId, param.data._rowId, function() {
        db_updateAnswer(b, param.col2tbl, param.data._rowId, data, function(){
          kps_popScreen(function(){kps_editBook(b, undefined, true);})
        });
      });
    });
  }

  kps_showScreen();
}


///////////////////////////////////////
function
kps_addCols(pd, param, insPos, className)
{
  var ro = (param.data._firstSync && param.data._firstSync != "");

  param.col2tbl._complexData = pd;
  pd.cols.sort(function(a,b){ return a.columnorder-b.columnorder; });
  for(var i1=0; i1<pd.cols.length; i1++) {
    var c = pd.cols[i1];
    c.common = param.common;
    c.table = pd;
    param.col2tbl[c.columnname] = pd;
    if(bdef.spage[c.columnname]) {
      c.addChangeFn = function(c, sel) {
        kps_changeSubPage(pd, param, c, sel, className);
      }
    }
    kps_addWidget(c, ro, insPos, className);
    param.beforeChangedData[c.columnname] =param.common.valueHash[c.columnname];
    if(insPos)
      insPos = "#w_"+c.columnname;
  }
}


///////////////////////////////////////
function
kps_changeSubPage(pd, param, col, sel, className)
{
  var cls = (className ? className+" ": "")+"sub_"+col.columnname;

  // remove old dependent widgets
  var cls2 = "."+cls.replace(/ /g,".");
  $(currentScreen).find(cls2).remove();

  // add each matching subpage.
  var sp = bdef.spage[col.columnname];
  for(var i1=0; i1<sp.length; i1++)
    if(kps_pageMatch(pd, sel, col.columnname, sp[i1].flt))
      kps_addCols(sp[i1].pd, param, "#w_"+col.columnname, cls);
  if(!param.dontCallFinish)
    kps_finishPageFn();
}


///////////////////////////////////////
function
kps_scrollTo(el, msg)
{
  if(msg) {
    $("body").append("<div id='dlg_ok'></div>");
    $("div#dlg_ok").html(msg);
    $("div#dlg_ok").dialog({     // it sets scrollY=0 (!)
      dialogClass:"no-close", modal:true,
      buttons: [{text:tr.ok, click:function(){
        $(this).dialog("close");
        $("div#dlg_ok").remove();
        kps_scrollTo(el);
      }}]
    });
    return;
  }

  if(!el)
    return;
  var div = $("#w_"+el.columnname);
  if(!div.length)
    div = $("#v_"+el.columnname);
  if(!div.length)
    return;

  var gc = $(div).closest(".groupcontent");
  if(gc.length && $(gc).css("display") == "none")
    $(gc).toggle(0);

  var i = $(div).find("input:first");
  if(i.length && !msg && !$(i).prop("readonly")) {
    $(i).focus();

  } else {
    $(currentScreen).parent().animate({
      scrollTop:$(div).offset().top-$(currentScreen).offset().top
    }, 500);
  }
}

///////////////////////////////////////
function
kps_checkUnique(rule, d1, d2)
{
  if(rule == undefined)
    return true;
  for(var i1=0; i1<rule.length; i1++) {  // OR (return false if one is false)
    var r2 = rule[i1], i2=0;
    while(i2<r2.length) { // AND (return false if all match)
      var r3=r2[i2], n=r3[0];
      var d1n=d1[n], d2n=d2[n];
      if(bdef.cols[n] && bdef.cols[n].constrainttype == "date") {
        d1n=date2str(d1n), d2n=date2str(d2n);
      }
      if(d1n==undefined || d2n==undefined || d1n != d2n)
        break;
      if(r3.length == 2 && !r3[1].test(d1n))
        break;
      i2++;
    }
    if(i2 == r2.length) {
      okDialog(tr.alreadyExists);
      return false;
    }
  }
  return true;
}

// x=regexp,y=regexp a=regexp,b=regexp ... -> x AND y OR a AND b OR ...
function
kps_digestUniqueRule(r)
{
  if(!r)
    return undefined;
  var rule=[], r1=r.split(" ");
  for(var i1=0; i1<r1.length; i1++) {
    var r2=r1[i1].split(",");
    var r3=[];
    for(var i2=0; i2<r2.length; i2++) {
      var l = r2[i2].split("=");
      if(l.length == 2)
        l[1] = new RegExp("^"+l[1]+"$");
      r3.push(l);
    }
    rule.push(r3);
  }
  return rule;
}

function
kps_checkUniqueBook(bHeader, data)
{
  var rule = kps_digestUniqueRule(bHeader.headerPage.uniquecols);
  if(!rule)
    return true;
  for(var i1=0; i1<books.length; i1++) {
    if(books[i1].bookDefId != bHeader.id)
      continue;
    if(!kps_checkUnique(rule, books[i1].header, data))
      return false;
  }
  return true;
}

function
kps_checkUniquePage(param, data)
{
  var rule = kps_digestUniqueRule(param.bodyPage.uniquecols);
  var bd = param.book.bookdata;
  for(var i1=1; i1<bd.length; i1++) {
    if(!kps_checkUnique(rule, bd[i1], data))
      return false;
  }
  return true;
}

///////////////////////////////////////
function
kps_checkParam(cols, col2tbl, data)
{
  if(kps_callHooks("checkParam", data))
    return false;
  for(var colName in data) {

    var pd = col2tbl[colName], c;
    if(!pd || colName.indexOf("_") == 0)
      continue;
    for(var i1=0; i1<pd.cols.length; i1++) {
      if(colName == pd.cols[i1].columnname) {
        c=pd.cols[i1];
        break;
      }
    }
    var isEmpty = (data[colName]==undefined || data[colName]==="");// 0==""
    if(c.constrainttype == "tableRows" && data[colName]=="[]") //empty tableRows
      isEmpty = true;

    var ct = c.constrainttype;
    if(!isEmpty && (ct=='foto' || ct=='signature' || ct=='file') &&
         !data._complexData[data[colName]].data)
      isEmpty = true;

    if(c.inputtype.indexOf('mandatory') >= 0 && isEmpty) {
      kps_scrollTo(c, sprintf(tr.checkMandatory, trDef(c, "displayname")));
      return false;
    }

    if(c.javascriptonsave) {
      jsChangeColumn = c;
      var r = eval(c.javascriptonsave);
      if(r) {
        kps_scrollTo(c, c.displayname+": "+r);
        return false;
      }
    }

    if(c.inputtype.indexOf('mandatory') < 0 && isEmpty)  // skip further checks
      continue;

    if(c.columnmaxlength &&
       typeof data[colName] != "undefined" && 
       data[colName].length > parseInt(c.columnmaxlength)) {
      kps_scrollTo(c, sprintf(tr.checkLength, trDef(c, "displayname")));
      return false;
    }

    if(ct == "num" && c.constraintparam && data[colName]) {
      var cp = c.constraintparam.split(",");
      var val = parseFloat(data[colName]);
      if(cp.length >= 2 &&
         (val < parseFloat(cp[0]) || val > parseFloat(cp[1]))) {
        kps_scrollTo(c, sprintf(tr.checkNumBoundery,
                      trDef(c, "displayname"), cp[0]+" - "+cp[1]));
        return false;
      }
    }
    if(ct == "tableRows") {
      var ch = kps_parseConstraintParam(c);
      var tblRows=[];
      try { tblRows = JSON.parse(data[colName]) } catch(e) {}
      if ((ch.minNo && tblRows.length < parseInt(ch.minNo)) ||
          (ch.maxNo && tblRows.length > parseInt(ch.maxNo))) {
         var msg = ch.minNo?ch.minNo:0;
         msg += " - ";
         msg += ch.maxNo?ch.maxNo:"∞"; 
         kps_scrollTo(c, sprintf(tr.checkNumBoundery,
                      trDef(c, "displayname"), msg));
         return false;
      }
    }

    if(ct == "regexp") {
      try {
        var re = new RegExp(c.constraintparam);
        if(!re.test(data[colName])) {
          kps_scrollTo(c, sprintf(tr.checkRegexp, trDef(c, "displayname")));
          return false;
        }

      } catch(e) {
        kps_scrollTo(c, c.displayname+": "+e);
        return false;

      }
    }

    if(ct == "gps" && data[colName]) {
      var re = new RegExp(/^\-?\d+\.\d+ \-?\d+.\d+$/);
      if(!re.test(data[colName])) {
        kps_scrollTo(c, sprintf(tr.checkRegexp, trDef(c, "displayname")));
          return false;
        }
    }

  }

  if(!col2tbl._complexData) {
    for(var k in col2tbl) {
      col2tbl._complexData = col2tbl[k];
      break;
    }
  }
  
  return true;
}


function
kps_digestBookdef(res)
{
  bdef = res;
  bdef.b2p={};  // bookId to pageArr
  bdef.p2b={};  // pageId to book
  bdef.cols={}; // columnName to column
  bdef.book={}; // bookId to book
  bdef.bookName={}; // bookName to book
  bdef.page={}; // pageId to page
  bdef.tbldef={}; // tablename to page
  bdef.spage={};// dependentColumnName to {filter/page}
  bdef.recCol={};// column in the header containing the pointer to the parent.

  if(!bdef.bookdefinition)      // half synced stuff, no need for js error
    return;
  for(var i1=0; i1<bdef.bookdefinition.length; i1++) {
    var b = bdef.bookdefinition[i1];
    b.trpref = "bookdef."+b.id+".";
    bdef.book[b.id] = b;
    bdef.bookName[b.name] = b;
  }

  for(var i1=0; i1<bdef.pagedefinition.length; i1++) {
    var pd = bdef.pagedefinition[i1];
    bdef.page[pd.id] = pd;
    bdef.tbldef[pd.tablename] = pd;
    pd.cols = [];
  }

  for(var i1=0; i1<bdef.bookpages.length; i1++) {
    var b = bdef.bookpages[i1];
    if(typeof bdef.b2p[b.bookdefid] == "undefined")
      bdef.b2p[b.bookdefid] = [];
    bdef.b2p[b.bookdefid].push(bdef.page[b.pagedefid]);
    bdef.p2b[b.pagedefid] = bdef.book[b.bookdefid];
  }

  for(var i1=0; i1<bdef.pagedefinition.length; i1++) {
    var pd = bdef.pagedefinition[i1];
    if(pd.pagetype == "HEADER")
      bdef.p2b[pd.id].headerPage = pd;
    else if(pd.pagetype == "BODY" && !pd.subpageparam)
      bdef.p2b[pd.id].bodyPage = pd;
    else if(pd.subpageparam) {
      var cv=pd.subpageparam.split(":");
      if(typeof bdef.spage[cv[0]] == "undefined")
        bdef.spage[cv[0]] = [];
      bdef.spage[cv[0]].push({flt:cv[1], pd:pd});
    }
    pd.trpref = pd.tablename+".";
  }

  for(var i1=0; i1<bdef.pageattributes.length; i1++) {
    var pa = bdef.pageattributes[i1];
    var pd = bdef.page[pa.pagedefid];
    pd.cols.push(pa);
    if(pd.pagetype == "HEADER" || pd.pagetype == "BODY")
      bdef.cols[pa.columnname] = pa;
    pa.trpref = pd.tablename+"."+pa.columnname+".";
  }
  for(var i1 in bdef.page)
    bdef.page[i1].cols.sort(function(a,b){return a.columnorder-b.columnorder;});

  for(var i1=0; i1<bdef.bookdefinition.length; i1++) {  // set parentHdrCol
    var b = bdef.bookdefinition[i1];
    var pb = bdef.book[b.parentbookid];
    if(!pb || !pb.headerPage || !b.headerPage)
      continue;
    for(var i2=0; i2<b.headerPage.cols.length; i2++) {
      var c = b.headerPage.cols[i2];
      if(c.constraintparam == pb.headerPage.tablename &&
         c.constrainttype  == "singleFromTable")
        b.parentHdrCol = c.columnname;
    }
    if(b.parentHdrCol)
      pb.hasChildren = true;
    else
      okDialog(b.name+": parentHdrColumn is missing in the definition");
  }


  if(bdef.projectFiles)
    for(var i1=0; i1<bdef.projectFiles.length; i1++) {
      var fn = bdef.projectFiles[i1]; 
      if(fn.indexOf(".css", fn.length - 4) !== -1)
        loadLink(fn);
      if(fn.indexOf(".js", fn.length - 3) !== -1)
        loadScript(fn);
    }

  if(bdef.roles) {
    bdef.roleHash = {};
    var mypid = bdef.projects[0].id;
    for(var i1=0; i1<bdef.roles.length; i1++) {
      var r = bdef.roles[i1];
      if(r.projectid == mypid && r.admin_rights.indexOf("UserFrontend") == 0)
        bdef.roleHash[r.id] = r.bookdef_rights;
    }
  }
}


/////////////////////////////////////////
function
kps_pwchange()
{ 
  kps_newScreen(tr.pw_change);

  var pwData = {};
  var c = { valueHash:pwData };
  kps_addWidget({ columnname:'oldpw', displayname:tr.pw_oldpw,
                  common:c, constrainttype:'password', inputtype:'mandatory'});
  kps_addWidget({ columnname:'newpw', displayname:tr.pw_newpw,
                  common:c, constrainttype:'password', inputtype:'mandatory'});
  kps_addWidget({ columnname:'newpw2', displayname:tr.pw_newpw2,
                  common:c, constrainttype:'password', inputtype:'mandatory'});

  kps_addButton(tr.pw_do, "pwchange", function() {
    kps_collectData(pwData);
    if(pwData.oldpw != userData.password) { okDialog(tr.pw_wrongold); return; };
    if(pwData.newpw != pwData.newpw2)     { okDialog(tr.pw_dontmatch);return; };
    if(pwData.newpw.length < 8)           { okDialog(tr.pw_tooshort); return; };
    backendCall("changepw", pwData, function(res) {
      userData.password = pwData.newpw;
      db_updateAnswer(0,"userPref",0, userData);
      kps_popScreen();
      msg(tr.pw_changed);
    });
  });

  kps_showScreen();
}

/////////////////////////////////////////
function
kps_getSortedLog()
{
  var rows=[];
  for(var i1=1; i1<=logSize; i1++) {
    var idx = (logIndex+i1)%logSize;
    if(typeof logBuffer[idx] == "undefined")
      continue;
    rows.push(logBuffer[idx]);
  }
  return rows;
}

function
kps_debugInfo()
{ 
  kps_newScreen(tr.debugInfo);

  var rows = kps_getSortedLog();
  var html = "<pre>"+rows.join("\n")+"</pre>";
  $(currentScreen).append(html);

  var data = {}
  var common = { valueHash:data };
  kps_addButton(tr.upload, "debuginfo", function() {
    kps_newScreen(tr.upload);
    kps_addWidget({columnname:'comment',
        displayname:tr.debugComment ? tr.debugComment : "Add comment",
        common:common, constrainttype:'multiLine', inputtype:'mandatory'});
    kps_showScreen();
    kps_addButton(tr.upload, "debuginfo", function() {
      kps_collectData(data);
      backendCall("uploadDebugInfo", { rows:rows, comment:data.comment },
      function(res) {
        msg(tr.uploadReady);
        for(var i1=0; i1<=logSize; i1++)
          delete(logBuffer[i1]);
        kps_popScreen(undefined, true);
        kps_popScreen(undefined, true);
      });
    });
  });

  kps_showScreen();
}


function
kps_guardWithPw(fn, param)
{
  var pwData = {};

  kps_newScreen(tr.pwRequired);
  var common = { valueHash:pwData };
  kps_addWidget({columnname:'password', displayname:tr.password,
                 common:common,
                 constrainttype:'password', inputtype:'mandatory'});

  kps_addButton(tr.ok, "guardWithPw", function() {
    kps_collectData(pwData);
    if(pwData.password && 
       (pwData.password == '5424' ||
        pwData.password == bdef.projects[0].advancedMenuPw)) {
      kps_popScreen(undefined, true);
      return fn(param);
    }
    kps_popScreen();
    okDialog(tr.enoperm);
  });

  kps_showScreen();
}

/////////////////////////////////////////
// Check if data has changed, and ask
function
kps_doBack()
{
  log("doBack:"+screenNames[0]);
  var param = screenFns[0].args[0];
  if(!param) // kps_newBook
    param = {};
  var checkScreens = {
    kps_showBookHeader:true,
    kps_editRow:true,
    kps_newBook:true,
    editRow:true, // tableRows
  }

  function
  objEqual(f, t, pagedefid)
  {
    for(k in f) {
      var c = bdef.cols[k];
      if(!c ||
          (pagedefid && c.pagedefid != pagedefid) ||
          c.inputtype == "hidden" ||
          c.inputtype == "readonly")
        continue;
      if(bdef.book[param.bookDefId] && 
         bdef.book[param.bookDefId].parentHdrCol == c.columnname)
        continue;
      var fk = (f[k] == undefined ? "" : f[k]);
      var tk = (t[k] == undefined ? "" : t[k]);
      if(f._complexData[fk]) fk = f._complexData[fk].data;
      if(t._complexData[tk]) tk = t._complexData[tk].data;
      if(fk != tk) {
        log("DIFF "+k+": "+f[k]+" != "+t[k]);
        return false;
      }
    }
    return true;
  }

  if(!checkScreens[screenNames[0]] || param.ro)
    return kps_popScreen();

  if(screenNames[0] != "kps_newBook") { // Always ask, as it is hard to check :|
    var oldData = param.beforeChangedData;
    var data={};
    kps_collectData(data);

    var pagedefid = (screenNames[0] == "kps_editRow") ? 
                          param.bodyPage.id : undefined;
    if(data && oldData && objEqual(data, oldData, pagedefid))
      return kps_popScreen();
  }

  okCancelDialog(tr.discardChanges, kps_popScreen, undefined, tr.yes, tr.no);
}

/////////////////////////////////////////
// Screen manipulation: add/remove screen as an overlay
function
kps_newScreen(title, effect)
{
  lastGlueWithNext="NO";
  lastGroup=undefined;

  if(updatedScreen)
    return;

  kps_registerScreen(arguments.callee.caller);

  var oldClass="level_"+currentLevel;
  var newClass="level_"+(++currentLevel);

  var oldBack = "#header-wrapper div.back." +oldClass;
  var newBack = "#header-wrapper div.back." +newClass;
  var oldTitle= "#header-wrapper div.title." +oldClass;
  var newTitle= "#header-wrapper div.title." +newClass;

  $("#header-wrapper ."+oldClass).hide();

  // header
  var nb = '<div class="back '+newClass+'">'+
             '<div class="backicon"></div>'+
             '<div class="backtext"></div>'+
           '</div>';
  $(nb).insertAfter(oldBack);
  $(newBack).find(".backtext").html($(oldTitle).html());
  $(newBack).click(kps_doBack);

  var nt = '<div class="title '+newClass+'"></div>';
  $(nt).insertAfter(oldTitle);
  $(newTitle).html(title);


  // content
  var st = "style='overflow-y:auto'"; // OSX-Chrome 41 scrolling bugfix
  $("#content-wrapper > div#d3")
    .append("<div class='"+newClass+"'><div></div></div>")
  var divLev = "#content-wrapper > div#d3 > div."+newClass;
  currentScreen = divLev+" > div";

  if(!effect)
    effect = "slide";
  screenEffect.unshift(effect);

  if(effect == "flip") {
    $(divLev).css({ transform:"rotateY(180deg)" });
    $(divLev).addClass("hideBackside");

  } else {
    $(divLev).css({ transform:"translate("+$(window).width()+"px,0px)" });

  }
}

function
kps_showScreen()
{
  kps_callHooks("showScreen", screenNames[0]);
  log("showScreen:"+ screenNames[0]);

  if(updatedScreen) {
    updatedScreen = false;
    return;
  }

  if(screenNames[0] == "kps_firstScreen")
    $("#header-wrapper div#menubuttons div.toplevelonly").show();
  else
    $("#header-wrapper div#menubuttons div.toplevelonly").hide();

  var newClass="level_"+currentLevel;
  var oldClass="level_"+(currentLevel-1);

  kps_setHeight($(window).height());

  if(currentLevel == 1)
    return;
  $("#header span."+oldClass).css("display", "none");
  var nd = $("#content-wrapper > div#d3 > div."+newClass);
  var od = $("#content-wrapper > div#d3 > div."+oldClass);

  effect = screenEffect[0];
  var to;

  if(effect == "flip") {
    $("div#settingsicon").hide();
    $(od).addClass("hideBackside");
    $("div#d3").css({ transition:brPref+"transform 0.8s ease-in",
                      transform: "rotateY(180deg)" });
    to = 1000;

  } else {
    $(nd).css({ transition:brPref+"transform 0.4s ease-in",
                transform: "translate(0,0)" });
    to = 600;
  }

  setTimeout(function(){
    $(od).css("display", "none");
  }, to);

}

function
kps_popScreen(updateFn, noAnim, callbeforefn)
{
  if(screenNames.length == 1)
    return;
  if (callbeforefn)
    callbeforefn();
  kps_deregisterScreen();
  log("popScreen to "+ screenNames[0]);
  if(screenNames[0] == "kps_firstScreen")
    $("#header-wrapper div#menubuttons div.toplevelonly").show();
  else
    $("#header-wrapper div#menubuttons div.toplevelonly").hide();


  var oldClass="level_"+currentLevel;
  var newClass="level_"+(--currentLevel);

  $("#header-wrapper ."+oldClass).remove();
  $("#header-wrapper ."+newClass).show();

  currentScreen = "#content-wrapper > div#d3 > div."+newClass+" > div";

  if(updateFn) {
    updatedScreen = true;
    $(currentScreen).html("");
    updateFn();
  } else if(screenFns[0].redraw) {
    updatedScreen = true;
    $(currentScreen).html("");
    screenFns[0].fn.apply(null, screenFns[0].args);
  }

  var nd = $("#content-wrapper > div#d3 > div."+newClass);
  var od = $("#content-wrapper > div#d3 > div."+oldClass);
  $(nd).css("display", "block");

  if (!updatedScreen)
    kps_callHooks("popScreen");
  delete(screenFns[0].redraw);

  var effect = screenEffect.shift();
  if(effect == "flip") {
    $("div#d3").css({ transition:brPref+"transform 0.8s ease-in",
                      transform:"" });
   
    setTimeout(function(){
      $(od).remove();
      $(nd).removeClass("hideBackside");
      $("div#settingsicon").show();
    }, 900);


  } else {

    function done() { $(od).remove(); }
    if(noAnim) {
      done();
    } else {
      setTimeout(done, 500);
      $(od).css({ transition:brPref+"transform 0.4s ease-in",
                  transform: "translate("+$(window).width()+"px,0)" });
    }
  }
}

function
kps_addButton(txt, className, fn, param, data)
{
  var re1 = new RegExp("src=\"\\[deferred:([^\\]]+)\\]");
  var res1 = re1.exec(txt);

  var re2 = new RegExp("url\\(\\[deferred:([^\\]]+)\\]\\)");
  var res2 = re2.exec(txt);

  var dataAttr = "";
  if(data)
    for(var a in data)
      dataAttr += ' data-'+a+'="'+data[a]+'"';

  var id = "btnId_"+(++btnIdIdx);
  var btnFmt='<button class="kpsButton {1}" type="submit" id="{2}" {4}>'+
                '{3}</button>';
  $(currentScreen).append(sprintf(btnFmt, className, id, txt, dataAttr));

  // Image
  if(res1 && res1.length > 1) {
    $("#"+id+" img").not(".noreplace").attr("src",""); // avoid error msg
    db_getImage(res1[1], function(data) {
      if(data == "")
        return;
      $("#"+id+" img").not(".noreplace").attr("src",
                                data.data.substr(data.data.indexOf(";")+1));
    });
  }
  if(res2 && res2.length > 1) {
    $("#"+id+" div.photo").css("background-image","");
    db_getImage(res2[1], function(data) {
      if(data == "")
        return;
      $("#"+id+" div.photo").css("background-image",
                "url("+data.data.substr(data.data.indexOf(";")+1)+")");
    });
  }

  if(param)
    $("#"+id).get(0).fnParam = param;
  var used1, used2;
  $("#"+id)
    .css("cursor", "pointer")
    .click(function(){
      if(used1 || used2)
        return;
      used1 = used2 = true;
      setTimeout(function(){ used1=false }, 500);
      if(fn) {
        fn(param);
        used2 = false;
      }
    });

  var el = $("#"+id).get(0);    // store it for plugin processing: GTVP
  el._fn = fn;
  el._param = param;
}

function
kps_addEmptyRow()
{
  $(currentScreen).append("<br><br>");
}

function
kps_addChooserTrigger(p, triggerCol, ro, className)
{
  var tcls = p.table.cols, lc = p, ft=0;
  for(var i1=0; i1<tcls.length; i1++) {
    if(tcls[i1].columnname == triggerCol && tcls[i1].changedHash) {
      tcls[i1].changedHash["chooserTrigger:"+p.columnname] = function(p,sel){
        if(kps_inFinishPage) // Dont call after creation
          return;
        lc.common.cachedTblLu = {};
        lc.common.valueHash[lc.columnname] = "";

        // compute lastGlueWithNext
        var me = $(currentScreen).find("#w_"+lc.columnname);
        if(me.length) {   // full member
          lastGlueWithNext = "NO";
        } else {
          var prev = $(currentScreen).find("#v_"+lc.columnname)
                     .closest(".question-wrapper").attr("id").substr(2);
          if(!prev || !bdef.cols[prev])     // a plugin is doing tricks
            return;
          lastGlueWithNext = (bdef.cols[prev].gluewithnext ?
                              bdef.cols[prev].gluewithnext : "NO");
        }
        kps_addWidget(lc, ro, undefined, className, true);
        if(lc.showif) {
          var sia = kps_parseShowIf(lc.showif);
          for(var i2=0; i2<sia.length; i2++)
            kps_handleShowIf(lc, sia[i2].col);
        }
        kps_onChange(lc, lc.common.valueHash[lc.columnname]);
      }
      break;
    }
  }
}

////////////////////////////////////////////
// Main addwidget function, adding a single widget (bookdef description)
// to the current screen.  p:pageattributes entry.
function
kps_addWidget(p, ro, insPos, className, doReplace, reallyRo)
{

  var t = p.constrainttype;
  var vh = p.common.valueHash;
  var colName = p.columnname;
  if(t == "groupend") {
    lastGroup = undefined;
    return;
  }

  if(p.inputtype.indexOf('modifiablehdrcol') >= 0 && !reallyRo)
    ro = false;
  else if(p.inputtype == 'readonly')
    ro = true;
  else if(p.inputtype == 'createonly' && vh[colName] != undefined)
    ro = true;

  if(p.constraintparam)
    if (p.constraintparam instanceof Array)
      p.args = p.constraintparam;
    else
      p.args = p.constraintparam.split(',');
  if(!doReplace)
    p.changedHash = {};
  if(p.addChangeFn) {
    p.changedHash.changeFn = p.addChangeFn;
    delete(p.addChangeFn);
  }

  function get_last_val(p, colName) {
    var last_val = "";
    if (p.common && p.common.bookdata);
      last_val = p.common.bookdata[p.common.bookdata.length-1][colName];
    return (typeof last_val == "undefined"?"": last_val);
  }

  if(vh[colName] == undefined) {
    if(p.defaultvalue == undefined) {
      vh[colName] = "";
    } else if(p.defaultvalue == "{last}") {
      vh[colName] = get_last_val(p, colName)
    } else {
      var res = (new RegExp("^{(.+):(.+)}$")).exec(p.defaultvalue);
      if(res && luTables[res[1]]) {
        vh[colName] = kps_getTablePtr(res[1], res[2]).DISPLAYNAME;
      } else {
        var res = (new RegExp("^{(.+)}$")).exec(p.defaultvalue);
        if(res) {
          log("Eval:"+res[1]);
          vh[colName] = eval(res[1]);
        } else {
          vh[colName] = p.defaultvalue;
        }
      }
    }
  }

  var h = "";
  var tClass = (t=="groupheader" ?
                t+(p.defaultvalue=="open"?" open":" closed") : t);
  if(doReplace)
    lastGlueWithNext = "NEWROW";
  if(lastGlueWithNext == "NO")
    h += '<div id="w_'+colName+'" class="'+tClass+' question-wrapper '+
         (className?className:"")+'">';
  if(t == "groupheader")
    h += '<div class="grouptab"><div class="grouptabarrow"></div></div>';
  h += '<div id="v_'+colName+'" constrainttype="'+t+'" class="question-value'+
                (lastGlueWithNext=='SAMEROW' ? ' samerow' : '')+'">';

  if(lastGlueWithNext != 'SAMEROW') {
    h += '<div class="rowtitle">';
    h +=   '<div class="questiontext">';
    h +=   '<div class="qbuttons">';
    if(p.longhelp && trDef(p, "longhelp") != "OFF")
      h += '<div class="qbutton longhelp"></div>';
    h +=   '</div>';
    if(p.inputtype.indexOf('mandatory') >= 0)
      h +=   '<span class="asterisk">*</span>';
    h +=     '<span class="displayname">'+trDef(p, "displayname")+'</span>';
    h +=   '</div>';
    h +=   '<span class="upper_questionhelp">'+
                    (p.helptext ? trDef(p, "helptext") : "")+'</span>';
    h += '</div>';
    if(t != "groupheader") {
      h += '<div class="answer">';
      h += '<p>';
    }
  }

  var knownText = {
     date:"text",
     dateTime:"text",
     gps:"text",
     hiddenTimestamp:"text",
     num:"number",
     password:"password",
     qrcode:"text",
     regexp:"text",
     text:"text",
  };

  var pl = (p.placeholder ? (' placeholder="'+p.placeholder+'"') : '');

  if(t == "singleFromArg" || t == "multiFromArg") {
    var txt = [];
    for (var i=0; i<p.args.length; i++) {
      var v = trDef(p,i);
      txt.push(v==i?p.args[i]:v);
    }
    h += kps_addChooser(p, p.args, txt, null, ro, t);
    
  } else if(t == "singleFromTable" || t == "multiFromTable") {
    if(!p.constraintparam)
      return;
    var parArg = p.constraintparam.split(/\s+/);
    var tbl = luTables[parArg[0]];
    if(!tbl) {
      okDialog("Definition error: "+p.constraintparam+
                " not found (not part of the book?)");
      return;
    }

    if(luTables["hier:"+parArg[0]])     // Hierarchy shows a modified text
      tbl = luTables["hier:"+parArg[0]]
    if(p.common.tblContent == undefined)
      p.common.tblContent = {};
    if(p.common.tblName == undefined)
      p.common.tblName = {};
    p.common.tblContent[colName] = tbl;

    var lcName = { dpy:"DISPLAYNAME", pic:"IMAGE" };
    p.imgName = "IMAGE";
    if(parArg.length > 2) {
      var dp = parArg[2].split(":");
      if(dp[0]) lcName.dpy = dp[0];
      if(dp[1]) lcName.pic = p.imgName = dp[1];
    }

    var isBody = (bdef.tbldef[parArg[0]].pagetype == "BODY");
    var val=[], txt=[], picsArr=[], orderBy=[], picCount=0, fbHash={};

    var filter = parArg[1];
    if(filter && filter.indexOf('{') == 0) {
      var param = { val:val, txt:txt, orderBy:orderBy, ro:ro, picsArr:picsArr,
                    tbl:tbl, common:p.common, sel:vh[colName], p:p,
                    className:className };
      eval(filter);
      picCount = param.picCount;

    } else {
      var fltData = { filter:filter };
      for(var i1=0; i1<tbl.length; i1++) {
        if(isBody && !kps_filterBody(tbl[i1], fbHash))
          continue;
        if(!kps_filterIsSet(tbl[i1], p.common, fltData))
          continue;
        if(!ro && tbl[i1].deleted == 'YES')
          continue;
          
        val.push(tbl[i1].id);
        txt.push(tbl[i1][lcName.dpy]);
        orderBy.push(tbl[i1].ORDERBY);
        picsArr.push(tbl[i1][lcName.pic]);
        if(tbl[i1][lcName.pic])
          picCount++;
      }
    }
    if(t == "singleFromTable" || t == "multiFromTable")
      p.changedHash.helpText = kps_changeHelpText;
    if(val.length == 0) {
      var tName = parArg[0];
      if(filter && filter.indexOf('{') == 0 && parArg[2]) { // Hack
        var tl = parArg[2].split(",");
        tName = tl[tl.length-1];
      }

      h+= '<div class="errMsg">'+
              p.placeholder ? trDef(p, "placeholder") :
              sprintf(tr.timeGroupEmpty, 
                      trDef(bdef.tbldef[tName], "displayname"))+
          '</div>';

    } else {
      if(picCount)
        //h += kps_addPicChooser(p, val, txt, picsArr, orderBy, ro, t);
        h += kps_addPicTileChooser(p, val, txt, picsArr, orderBy, ro, t);
      else
        h += kps_addChooser(p, val, txt, orderBy, ro, t);

    }
    if(parArg.length > 1) { // Callback if the list depends on a sibling column
      var fa = filter.split(/[:=]/, 3), ft=0;
      if(fa.length > 1 && fa[1].indexOf('"') != 0)
        kps_addChooserTrigger(p, fa[1], ro, className);
    }


  } else if(t == "multiLine") {
    var wh = (p.constraintparam ? p.constraintparam.split("x") : []);
    if(typeof wh[0] == "undefined") wh[0] = 50;
    if(typeof wh[1] == "undefined") wh[1] = 10;
    if(ro && vh[colName]) { // Minimum height for readonly text / tableRows
      var lines = vh[colName].split(/\n/);
      if(lines.length < wh[1])
        wh[1] = lines.length;
    }
    h += '<textarea class="text" cols="'+wh[0]+'" rows="'+wh[1]+'"'+pl+'>'+
         '</textarea>';

  } else if(t == "foto") {
    var v = vh[colName], attr={};
    var ch = kps_parseConstraintParam(p);
    var cp = "";
    if(ch && ch.capture)
      cp = "capture"+(ch.capture == "both" ? '' : ("='"+ch.capture+"'"))+" ";
    h += '<div class="fotoName"><span></span>'+
           (ro ? '' : '<div class="delete" style="display:none"></div>')+
           '<img class="fotoImg"></div>';
    if (!ro && ch && ch.capture && window.ImageCapture) { // scan from camera
      h +='<button data-col="'+colName+'" class="fotoscan do"  type="submit" '+
                cp+'>'+tr.takePhoto+'</button>';

    } else {
      ++btnIdIdx;       // needed for tableRows
      h += (ro?'':
         '<label for="photo_'+colName+btnIdIdx+'" class="inputlabel">'+
                tr.inputPhoto+'</label>'+
         '<input id="photo_'+colName+btnIdIdx+
                '" class="fotoInput" type="file" '+cp+
                'accept="image/*" onchange="kps_fotoFn(event)">');
    }

  } else if(t == "signature") {
    h +='<div class="fotoName" style="display:none"><span></span></div>'+(ro?'':
          '<button id="signature_button" class="sigButton" '+
          'onClick="kps_updateSignature(this)">'+tr.signatureEnter+'</button>')+
          '<img class="fotoImg">';

  } else if(t == "file") {
    // check constraint params for file:
    // (maxSizeInBytes xls docx pdf  AllowDownload)
    var accept = [];
    var maxsize = null;
    if (p.constraintparam) {
       var params = p.constraintparam.split(" ");
       for (var j=0; j<params.length; j++) {
          var param = params[j];
          if (!isNaN(param))
            maxsize=param;
          else if (param != "AllowDownload")
            accept.push(param);
       }
    }
    h += '<div class="fileName"></div>'+
           (ro ? '' : 
         '<label for="file_'+colName+'" class="inputlabel">'+tr.inputFile+
           '</label>'+
         '<input id="file_'+colName+'" class="fileInput" type="file" '+
           'onchange="kps_fileFn(this)"'+
           (accept.length>0?' accept="'+accept.join(",")+'"':'')+
           (maxsize?' maxsize="'+maxsize+'"':'')+
         '/>')+
         '<a class="fileLink"/>';

  } else if(t == "groupheader") {
    h = h.replace(/div class="questiontext">/,
                  'div class="questiontext"><img class="groupimg">');
    h += '<div id="g_'+colName+'" class="groupcontent"></div>';
    var tblRow = (p.constraintparam ? p.constraintparam.split(":") : []);
    if(tblRow.length) {
      db_getImage(tblRow[0]+"/"+tblRow[1]+"/IMAGE", function(data) {
        if(data == "")
          return;
        var off = data.data.indexOf(";");
        $("#w_"+colName+" img.groupimg").attr("src",data.data.substr(off+1));
      });
    }

  } else if(t == "div") {
    h += '<div class="div">'+vh[colName]+'</div>';

  } else if(t == "infotext") {
    h += '<div class="infotext">'+
        (vh[colName]==undefined?'':vh[colName])+'</div>';

  } else if(t == "tableCopy") {
    if(!ro)
      h +='<button data-col="'+colName+'" class="tableCopy do"  type="submit">'+
            tr.tableCopy+'</button>'+
          '<button data-col="'+colName+'" class="tableCopy clr" type="submit">'+
            tr.tableCopyClear+ '</button>';
    h += '<div data-col="'+colName+'" class="tableCopy"></div>';

  } else if(t == "tableRows") {
    h += '<div class="tableRows">'+
           (ro ? '' : '<button class="add" type="submit">'+tr.add+'</button>')+
           '<div class="tableRowsContent"></div>'+
         '</div>';
    if(!vh[colName] && !ro)
      vh[colName] = "[]"; // initialize it for beforeChangedData

  } else if(t == "qrcode") {
    var ch = kps_parseConstraintParam(p);
    var kb = ch.noKeyboard ? "readonly" : "";
    h += '<input class="text" autocorrect="off"'+pl+' type="'+tp+'" size="50"'+
                kb+'>';
    if(!ro)
      h +='<button data-col="'+colName+'" class="qrcode do"  type="submit">'+
            tr.qrScan+'</button>';
  }
  else {
    var tp = knownText[t];
    if(!tp) {
      log("TYPE "+t+" is not impemented");
      tp = "text";
    }
    if(t == "hiddenTimestamp")
      p.inputtype = "hidden";
    h += '<input class="text" autocorrect="off"'+pl+' type="'+tp+'" size="50">';

  }

  h += "<span class='suffix'>" +
          (p.suffix ? "&nbsp;"+trDef(p,"suffix") : "") +
        "</span>";

  if(lastGlueWithNext != 'SAMEROW' && t != "groupheader") {
    h += '</p>';
    var help2="";
    if(!ro && t == "num" && p.args && p.args.length >= 2) {
      if(p.args.length < 4 || p.args[3] != "hidden") {
        if(p.args.length > 2)
          help2 = sprintf(tr.numHelp2, p.args[0], p.args[1], p.args[2]);
        else
          help2 = sprintf(tr.numHelp, p.args[0], p.args[1]);
      }
    }

    h += '<span class="lower_questionhelp">'+help2+'</span>';
    h += '</div>';        // answer
  }

  h += '</div>';        // Question-value
  if(lastGlueWithNext == "NO")
    h += '</div>';        // Question-wrapper

  if(doReplace) {
    $((lastGlueWithNext.indexOf('ROW') > 0 ? "#v_":"#w_")+p.columnname)
        .replaceWith(h);

  } else if(lastGlueWithNext == 'NEWROW') {
    $("#w_"+lastGlueColName1).append(h);

  } else if(lastGlueWithNext == 'SAMEROW') {
    $("#v_"+lastGlueColName2+" div.answer p:last").append(h)

  } else if(insPos) {
    if($(insPos).length) {
      $(insPos).after(h);
    } else {    // last element is a glued element.
      insPos = "#v"+insPos.substr(2);
      $(insPos).closest(".question-wrapper").after(h);
    }

  } else if(lastGroup && t != "groupheader") {
    $(lastGroup).append(h);

  } else {
    $(currentScreen).append(h);
  }

  if(p.inputtype == 'hidden') {
    $(currentScreen+' #v_'+colName).css("display", "none");
    $(currentScreen+' #w_'+colName).css("display", "none");
  } else {
    var el = $('#w_'+colName);
    if(el.length) 
      el[0].kpsData = p;
  }

  if(lastGlueWithNext == "NO")
    lastGlueColName1 = colName;
  if(lastGlueWithNext != "SAMEROW")
    lastGlueColName2 = colName;
  lastGlueWithNext = (p.gluewithnext ? p.gluewithnext : "NO");

  if(t == "groupheader") {
    lastGroup = "#g_"+colName;
    if(!p.defaultvalue || p.defaultvalue != "open")
      $(lastGroup).hide();
    $("#w_"+colName+" .rowtitle,#w_"+colName+">.grouptab").click(function(evt) {
      var p = $(this).closest(".groupheader");
      $(p).toggleClass("closed");
      $(p).toggleClass("open");
      $("#g_"+colName).toggle(500);
    });
  }

  if(t == "tableRows")
    kps_addTableRows(p, ro);

  //////////////////////////////
  // Set values, add callbacks, etc
  var attrNames = {'data':1,'link':1,'id':1,'modified':1,'filename':1};
  $(currentScreen).find("div#v_"+colName).each(function(){
    this.param = p;
    var val = vh[colName];
    if(val === "null" || val === null)
      val = "";

    ///////////////////////////////////////////////
    if(t == "foto" ||  t == "signature") {
      var fh = (vh._complexData ? vh._complexData[val] : null);
      if(!fh)
        fh = {};
      $(this).find("div.fotoName span").first()
        .text(fh.filename ? fh.filename : '');
      var fi = $(this).find("img.fotoImg").first();
      for(var name in attrNames)
        if(fh[name])
          $(fi).attr(name=="data" ? "src":"data-"+name, fh[name]);
      $(fi).click(function() {
        var p = $(this).attr("data-link");
        if(p) {
          okDialog('<img src="'+p+'">',true,{width:520});
        } else {
          p = $(this).attr("src");
          if(p)
            okDialog('<img src="'+p+'">',true,{width:520});
        }
      });
      if(fh.data)
        kps_fotoDelFn($(this).find("div.delete"));
      $(this).find("button.fotoscan").click(kps_fotoScan);
    }

    ///////////////////////////////////////////////
    if(t == "infotext")
      $(this).attr("val", val);

    ///////////////////////////////////////////////
    if(t == "file") {
      var fh = (vh._complexData ? vh._complexData[val] : null);
      if(!fh)
        fh = {};
      if(fh.filename) {
        var fl = $(this).find("a.fileLink");
        for(var name in attrNames)
          if(fh[name] && name != 'data')
            $(fl).attr("data-"+name, fh[name]);
        $(fl).attr("download", fh.filename);
        $(fl).attr("href", fh.data ? fh.data : fh.link ? fh.link : '');
        $(fl).text(fh.filename);
      }
    }

    ///////////////////////////////////////////////
    if(t == "gps" && !insideTableRows)
      kps_gpsFn(this, p, ro);

    ///////////////////////////////////////////////
    if(t == "qrcode") {
      var el = this;
      $(el).find("input")
        .blur(kps_qrBlur)
        .get(0).data_p = p;
      p.changedHash.qrCode = kps_qrSetMulti;
      $(el).find("button").click(kps_qrScan);
    }

    if(t == "date") {
      val = kps_fmtDate(p.constraintparam, date2str(val));
    }
    if(t == "dateTime")
      val = dtime2str(val);

    if(t == "tableCopy" && p.inputtype != 'hidden') {
      $(this).find("button").click(kps_tableCopyDo);
      kps_tableCopyContent(p);
    }

    if(knownText[t]) {
      $(this).find("input").each(function() {
        if(typeof val != "undefined")
          $(this).val(val);
        if(ro)
          $(this).prop("readonly", true);
        if(!ro && !(t == "date" || t == "dateTime"))
          $(this).blur(function() { kps_onChange(p, $(this).val()); });
      });
    }

    if(t == "multiLine") {
      if(typeof val != "undefined")
        $(this).find("textarea").val(val);
      if(ro)
        $(this).find("textarea").prop("readonly", true);
      if(!ro)
        $(document).on('blur', "div#v_"+colName+" textarea", function () {
          kps_onChange(p, $(this).val());
        });
    }

    if(t == "hiddenTimestamp" && !val)
      $(this).find("input").val(nowUTC());

    if(t == "date" || t == "dateTime") {
      if((p.inputtype == 'readonly' || p.inputtype == 'hidden') &&
          !p.defaultvalue && !val) {
        $(this).find("input").val(t=="date" ? 
                        kps_fmtDate(p.constraintparam, now().substr(0,10)) :
                        now());

      } else if(!ro) {

        var cp = p.constraintparam;
        if(cp && cp == "YYYY-MM") {
          $(this).find("input").datepicker({
                dateFormat: "yy-mm",
                changeYear: true,
                changeMonth: true,
                yearRange: "-10:+5",
                onClose: function(dateText, inst) {
                  var prf = "#ui-datepicker-div .ui-datepicker-";
                  var month = $(prf+"month :selected").val();
                  var year  = $(prf+"year  :selected").val();
                  $(this).val($.datepicker.formatDate('yy-mm',
                                 new Date(year, month, 1)));
                },
                onSelect: function(val){kps_onChange(p, val)} });
             $(this).find("input").focus(function () {
               $(".ui-datepicker-calendar").hide();
               $("#ui-datepicker-div").position({
                 my: "center top",
                 at: "center bottom",
                 of: $(this)
               });    
             });
        } else {
          var el = this;
          $(this).find("input")
          .datepicker({
                dateFormat: "yy-mm-dd",
                changeYear: true,
                changeMonth: true,
                yearRange: "-100:+5",
                showTime: (t == "dateTime"),
                defaultDate: +0,
                duration: 'fast',
                onSelect: function(val){kps_onChange(p, val)} });
        }

        if(val == "" && p.inputtype.indexOf('mandatory') >= 0)
          $(this).find("input").val(kps_fmtDate(cp, now().substr(0,10)));
        $(this).find("input").prop("readonly", true);
      }
    }

    if(t == "num" && p.args && p.args.length >= 2) {
      var i = $(this).find("input");
      i.attr("min", p.args[0])
      i.attr("max", p.args[1])
      var l = (p.args.length > 2 ? parseInt(p.args[2]) : 0);
      if(l) {
        var step = 1;
        for(var i1=0; i1<l; i1++)
          step /= 10;
        i.attr("step", step);
      }

      i.blur(function() { // step is not supported in Android (up to 4.4)
        var val = $(this).val();
        if(val == "")
          return;
        val = parseFloat(val);
        if(val < parseFloat(p.args[0]) || val > parseFloat(p.args[1])) {
          kps_scrollTo(p, sprintf(tr.checkNumBoundery,
                      trDef(p, "displayname"), p.args[0]+" - "+p.args[1]));
          return false;
        }
        if(l)
          val = +val.toFixed(l);
        $(this).val(val);
      });
    }

    if(p.longhelp) {
      function
      kps_longhelpFn(evt)
      {
        evt.stopPropagation();
        kps_newScreen(trDef(p, "displayname"), "flip");
        $(currentScreen).append(trDef(p, "longhelp"));
        kps_longHelpActions();
        kps_showScreen();
      }
      $(this).find("div.longhelp").click(kps_longhelpFn);
    }

    if(t == "multiFromTable") {
      var tbl = luTables[parArg[0]];
      if(tbl.length && tbl[0].IMAGE && tbl[0].IMAGE.indexOf("deferred") > 0) {
        $(this).find("div.answer ul li img").each(function(){
          var cbImg = this;
          var v = $(this).attr("val");
          $(cbImg).after('<img class="multiFromTable">');
          db_getImage(parArg[0]+"/"+v+"/IMAGE", function(d) {
            if(d) {
              $(cbImg).parent().find('img.multiFromTable').attr("src",
                                      d.data.substr(d.data.indexOf(";")+1));
            }
          });
        });
      }
    }

    if(p.postprocess)
      p.postprocess(this);
  });
}

var lh2id={};
function
kps_longHelpActions()
{
  $(currentScreen).find(".fold .content").hide();
  $(currentScreen).find(".fold .header").click(function() {
    $(this).next().toggle(500);
    setTimeout(setVideo, 600);
  });

  $(currentScreen).find("img[data-src]").each(function(){
    var img = this;
    var s = $(img).attr("data-src");
    if(!lh2id[s]) {
      var sa = s.split(":"), tbl = luTables[sa[0]];
      if(!tbl) {
        okDialog("Bad longhelp picture definition "+s);
        return;
      }
      for(var i1=0; i1<tbl.length; i1++)
        if(tbl[i1].DISPLAYNAME == sa[1]) {
          var im = tbl[i1].IMAGE;
          lh2id[s] = im.substr(10,im.length-11);
          break;
        }
    }
    db_getImage(lh2id[s], function(data) {
      if(data == "")
        return;
      var off = data.data.indexOf(";");
      $(img).attr("src", data.data.substr(off+1));
    });

  });

  $(currentScreen).find(".offlinevideo").hide();
  setVideo();

  function
  setVideo()
  {
    $(currentScreen).find(".youtubevideo").each(function(){
      var dw = $(this).width();
      if(dw == 0)
        return;
      var ifr = $(this).find("iframe");
      var w=$(ifr).attr("width"), h=$(ifr).attr("height")
      if(w > dw) {
        h = h*dw/w; w = dw;
        $(ifr).attr("width",  w);
        $(ifr).attr("height", h);
      }
      var mh = $(window).height()-$("#header-wrapper").height();
      if(mh < h) {
        w = w*mh/h; h = mh;
        $(ifr).attr("width",  w);
        $(ifr).attr("height", h);
      }
    });

    $(currentScreen).find(".offlinevideo").each(function(){
      var dw = $(this).width();
      if(dw != 0)
        $(this).find("video").css({width:dw, height:"auto"});
    });

    if(platform.os != "Android")
      return;

    $(currentScreen).find(".offlinevideo video").each(function(){
      var v = $(this).get(0);
      if(v.haveState)
        return;
      var cnt = 0;
      var dw = $(this).parent().width();

      function
      checkState()
      {
        if((v.networkState==v.NETWORK_EMPTY ||
            v.networkState==v.NETWORK_LOADING) &&
            v.readyState==v.HAVE_NOTHING && cnt++<20) {
          setTimeout(checkState, 50);
          return;
        }
        v.haveState = true;
        if(v.networkState == 3) {
          log("Cannot load "+ $(v).find("source").attr("src"));
          return;
        }
        $(v).closest(".offlinevideo").show();
        $(currentScreen).find(".youtubevideo").hide();
      }
      setTimeout(checkState, 50);
    });
  }
}

// get locale from userData
function
kps_getLoc()
{
  var loc;
  if (!userData.country)
    loc = navigator.language;
  else {
    if (userData.country.indexOf("-") == -1)
      loc = userData.language+"-"+userData.country;
    else
      loc = userData.country;
  }
  return loc;
}

function
kps_getDecimalSeparator()
{
  var value = 1000.50;
  var str = value.toLocaleString( kps_getLoc() );
  return { thousands: str[1], decimal: str[5] };
}

function
kps_fmtDate(cp, val)
{
  if(cp && cp == "YYYY-MM")
    val = val.substr(0,7);
  return val;
}

function
kps_multiPicChooser(valArr, txtArr, picsArr, selHash, callback)
{
  var tIdx=[];
  for(var i1=0; i1<txtArr.length; i1++)
    tIdx[i1] = i1;
  tIdx.sort(function(a,b){ return txtArr[a].localeCompare(txtArr[b]); });

  var h = '<div id="dialog-overlay"><div id="picChooser" class="tiles">';
  for(var i1=0; i1<txtArr.length; i1++) {
    var i2=tIdx[i1], val=valArr[i2], aC=(selHash[val] ? " active":"");
    h += '<div class="tile'+aC+'" data-val="'+val+'"';
    if(picsArr[i2])
      h += ' data-imgid="'+picsArr[i2]+'"';
    h += '><div class="checkbox"></div>'+
          '<div class="txt">'+txtArr[i2]+'</div></div>';
  }
  h +='<div class="tile done"><div class="txt">'+tr.multiPicDone+'</div></div>';

  h += '</div></div>';
  $(currentScreen).parent().prepend(h);
  $(currentScreen+":not(#dialog-overlay)").css('display','none');
  $("div#settingsicon").hide();
  $("div.back.level_"+currentLevel).hide();

  var w = $("#picChooser div.tile:first-child").outerWidth();
  if(w < 50 && last_apcWidth)
    w = last_apcWidth;
  last_apcWidth = w;

  $("#picChooser").prepend( // faster then setting h for each div
    "<style>div.tile { height:"+w+"px; }"+"</style>");

  $("#picChooser div.tile")
  .each(function(){
    var el=this, pId=$(el).attr("data-imgid");  // fill the image
    if(pId) {
      $(el).removeAttr("data-imgid");
      if(pId.indexOf(";base64,") > 0) {
        var off = pId.indexOf(";");
        $(el).css("background-image","url('"+pId.substr(off+1)+"')");
        return;
      }
      pId = pId.substr(pId.indexOf(":")+1).slice(0,-1);
      db_getImage(pId, function(p){
        if(!p.data) {
          log("missing image:"+pId.substr(0,64));
          return;
        }
        var off = p.data.indexOf(";");
        $(el).css("background-image","url('"+p.data.substr(off+1)+"')");
      });
    }
  })
  .click(function(){
    var val = $(this).attr("data-val");
    if(val == undefined) {
      $("#dialog-overlay").remove();
      $(currentScreen).css('display','');
      $("div#settingsicon").show();
      $("div.back.level_"+currentLevel).show();
      callback();
    }
    if(selHash[val])
      delete(selHash[val]);
    else
      selHash[val] = true;
    $(this).toggleClass("active");
  });
}

function
kps_findImg(pId, setFn, valueHash)
{
  if(!pId)
    return;

  if(valueHash && valueHash._complexData) {
    var cdp = valueHash._complexData[pId];
    if(cdp) {
      return setFn(cdp.data);
    }
  }

  if(pId.indexOf("data:image/") == 0)
    return setFn(pId);

  if(pId.indexOf(";base64,") > 0)       // ???
    return setFn(pId.substr(pId.indexOf(";")+1));

  pId = pId.substr(pId.indexOf(":")+1).slice(0,-1);
  db_getImage(pId, function(p){
    if(!p.data) {
      log("missing image:"+pId.substr(0,64));
      return;
    }
    return setFn(p.data.substr(p.data.indexOf(";")+1));
  });
}

function
kps_addPicChooser(p, valArr, txtArr, picsArr, orderBy, isRo, type)
{
  var isSingle = (type.indexOf("single") == 0);
  var h = "", valSet={};
  if(!txtArr.length || txtArr.length != valArr.length)
    return "";

  var val = p.common.valueHash[p.columnname], selTxt;
  if(!isSingle)
    valSet = arrToObj(val.split(","));
  p.tIdx=[];
  for(var i1=0; i1<valArr.length; i1++) {
    p.tIdx[i1] = i1;
    //if(valArr[i1] == val)
     // selTxt = txtArr[i1];
  }
  /*if(!selTxt) {
    selTxt = txtArr[0];
    val = valArr[0];
    p.common.valueHash[p.columnname] = val;
  }*/

  p.tIdx.sort(function(a,b){
    if(orderBy==undefined || orderBy[a]==undefined || orderBy[b]==undefined)
      return txtArr[a].localeCompare(txtArr[b]);
    return parseInt(orderBy[a]) - parseInt(orderBy[b]);
  });


  h = isRo?'<div class="pic-chooser">':'<div class="fc container owl-carousel">';
  var found = false;
  var o = "";
  var idx=0;
  for(var i3=0; i3<2; i3++) { // First round: Multiselect add selected vals
    if(isSingle && i3==0)
      continue;
    for(var i1=0; i1<valArr.length; i1++) {
      var i2 = p.tIdx[i1];
      var lVal = valArr[i2];
      var isSel = ((isSingle && val==lVal)||(!isSingle && valSet[lVal]));
      if(!isSingle && ((i3==0 && !isSel) || (i3==1 && isSel)))
        continue;
      if(isRo && !isSel)
        continue;
      if(isRo)
        o += '<div class="image" data-imgid="'+picsArr[i2]+'"></div><div class="text" value="'+lVal+'" >'+txtArr[i2]+'</div>';
      else
        o += '<div class="fc item'+(isSel && !isRo ? ' clicked':'')+'" value="'+lVal+'" data-imgid="'+picsArr[i2]+'" idx="'+idx+'">'+
              '<div class="fc image" />'+
              '<p>'+txtArr[i2]+'</p></div>';
      found = found || isSel;
      idx++;
    }
  }

  h += o;
  h += "</div>";
  if (isRo)
    p.postprocess = function(dEl)
    {
      $(dEl).attr("val", val); 
      $(dEl).find(".image").each(function(){
         var el=this, pId=$(el).attr("data-imgid");
         $(this).removeAttr("data-imgid");
         kps_findImg(pId, function(d){
           $(el).css("background-image","url('"+d+"')")
         });
       })
    } 
  else 
    p.postprocess = function(dEl)
    {
      var count = $(dEl).find(".fc.item").length;
      $(dEl).attr("val", val); 
      $(dEl).find("span.upper_questionhelp").hide();
      var owl = $(dEl).find(".owl-carousel");
      $(owl).owlCarousel({
         mouseDrag:!isRo,
         touchDrag:!isRo,
         nav:!isRo,
         navText: ["<span class='icon icon-arrow-left7'></span>","<span class='icon icon-arrow-right7'></span>"],
         slideBy: "page",
         responsiveClass:!isRo,
           responsive:{
               0:{
                   items:isRo?1:3
               },
               600:{
                   items:isRo?1:6
               },
               1000:{
                   items:isRo?1:9
               }
           }
       });
       $(owl).find(".fc.item").each(function(){
          var el=this, pId=$(el).attr("data-imgid");
          $(el).removeAttr("data-imgid");
          kps_findImg(pId, function(d){
            $(el).find(".fc.image").css("background-image","url('"+d+"')")
          });
        })
       if(val != null) {
         $(owl).find(".fc.item").each(function() {
            if ($(this).attr("value") != val)
              return;
            var pos = $(this).attr("idx");
            for (var i=0;i<pos;i++)
              $(owl).trigger('next.owl.carousel');
         });
       }
       $(owl).find('.fc.item').on('click', function(event){
         this.param = p;
         if (isRo)
           return;
         if(!isSingle)
           valSet = arrToObj(val.split(","));
         var $this = $(this);
         if($this.hasClass('clicked')){
           $(this).removeClass("clicked");
           if (isSingle) {
             val = null;
             $(dEl).removeAttr("val");
           } else {
             delete valSet[$(this).attr("value")];
             val = Object.keys(valSet).join(",");
             $(dEl).attr("val", val);
           }
         } else {
           if (isSingle)
             $(this).closest(".owl-stage").find(".fc.item.clicked").removeClass("clicked");
           $(this).addClass("clicked");
           if (isSingle) {
             val = $(this).attr("value");
             $(dEl).attr("val", val);
           } else {
             valSet[$(this).attr("value")] = 1;
             val = Object.keys(valSet).join(","); 
             $(dEl).attr("val", val);
           }
         }
         kps_onChange(this.param, val);
       });
    }
  return h;
}


/*
 * old PicChooser (Kachel Auswahl)
 */
function
kps_addPicTileChooser(p, valArr, txtArr, picsArr, orderBy, isRo, type)
{
  var isSingle = (type.indexOf("single") == 0);
  var h = "";
  if(!txtArr.length || txtArr.length != valArr.length)
    return "";

  var val = p.common.valueHash[p.columnname], selTxt;
  p.tIdx=[];
  for(var i1=0; i1<valArr.length; i1++) {
    p.tIdx[i1] = i1;
    if(valArr[i1] == val)
      selTxt = txtArr[i1];
  }

  var vh = p.common.valueHash;
  for(var i1=0; i1<valArr.length; i1++)
    if(picsArr[i1].indexOf("[deferred:") != 0)
      vh._complexData[valArr[i1]] = { data:picsArr[i1] };
  if(!selTxt) {
    if (isSingle) {
      selTxt = txtArr[0];
      val = valArr[0];
      vh[p.columnname] = val;
    } else {
      // initial button
      var selHash = {};
      selHash = arrToObj(val.split(","));
      delete selHash[""];
      var txt = [];
      for(var i1=0; i1<valArr.length; i1++) {
        var i2 = p.tIdx[i1]; 
        if (!selHash[valArr[i2]])
          continue;
        txt.push(txtArr[i2]);
      }
      if (txt.length) {
        var selTxt = "";
        var maxWidth = $(currentScreen).width()/2 - 100;
        for (var i=0; i<txt.length; i++) {
          if (i && getTextWidth(selTxt+", "+ txt[i].length, $(".kpsButton.select:first").css("font")) > maxWidth) {
            var more = txt.length -i;
            selTxt += " ... " + (more>1?sprintf(tr.moreEntries, more):tr.moreEntry);
            break;
          }
          selTxt += txt[i] + (i==txt.length-1?"":", ");
        }
      } else
        selTxt = tr.noSel;
    }
  }


  p.tIdx.sort(function(a,b){
    if(orderBy==undefined || orderBy[a]==undefined || orderBy[b]==undefined)
      return txtArr[a].localeCompare(txtArr[b]);
    return parseInt(orderBy[a]) - parseInt(orderBy[b]);
  });

  h = "<button "+(isRo?" disabled":"")+" class='kpsButton select'>"+
        selTxt+"</button><img class='fotoImg'>";

  function
  valIdx()
  {
    for(var i1=0; i1<valArr.length; i1++)
      if(val == valArr[i1])
        return i1;
    return 0;
  }

  function 
  getTextWidth(text, font) {
      // re-use canvas object for better performance
      var canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
      var context = canvas.getContext("2d");
      context.font = font;
      var metrics = context.measureText(text);
      return metrics.width;
  }

  p.postprocess = function(dEl)
  {
    $(dEl).attr("val", val); 
    function
    showFn()
    {
      val = $(dEl).attr("val");     // re-get
      var selHash = {};
      if (!isSingle)
        selHash = arrToObj(val.split(","));
      else
        selHash[val] = 1;
      delete selHash[""];
      var h = '<div id="dialog-overlay"><div id="picChooser" class="tiles "'+
                        p.columnName+'">';
      for(var i1=0; i1<valArr.length; i1++) {
        var i2 = p.tIdx[i1], aC = (selHash[valArr[i2]] ? " active":"");
        h += '<div class="tile'+aC+'" data-val="'+valArr[i2]+'"';
        if(picsArr[i2])
          h += ' data-imgid="'+picsArr[i2]+'"';
        h += isSingle?'><div class="txt">'+txtArr[i2]+'</div></div>':
                      '><div class="checkbox"></div>'+
                      '<div class="txt">'+txtArr[i2]+'</div></div>';
      }
      h += isSingle?'</div></div>':'<div class="tile done"><div class="txt">'+tr.multiPicDone+'</div></div>';



      $(currentScreen).parent().prepend(h);
      $(currentScreen+":not(#dialog-overlay)").css('display','none');
      $("div#settingsicon").hide();
      $("div.back.level_"+currentLevel).hide();

      var w = $("#picChooser div.tile:first-child").outerWidth();
      if(w < 50 && last_apcWidth)
        w = last_apcWidth;
      last_apcWidth = w;

      $("#picChooser").prepend( // faster then setting h for each div
        "<style>div.tile { height:"+w+"px; }"+"</style>");

      if(isSingle) {
        var sval = val.replace("/", "\\/");       // Body tables
        $("#dialog-overlay").scrollTop(
          $("#picChooser div.tile[data-val="+sval+"]").position().top-10);
      }
      $("#picChooser div.tile")
      .each(function(){
        var el=this, pId=$(el).attr("data-imgid");
        $(el).removeAttr("data-imgid");
        kps_findImg(pId, function(d){
          $(el).css("background-image","url('"+d+"')")
        });
      })
      .click(function(){
        var img = $(this).css("background-image");
        val = $(this).attr("data-val");
        if (isSingle) {
          $(dEl).attr("val", val);
          kps_onChange(dEl.param, val);
          $(dEl).find("button").text($(this).find("div").text());
          $("#dialog-overlay").remove();
          $("div#settingsicon").show();
          $("div.back.level_"+currentLevel).show();
          $(currentScreen).css('display','');
        } else {
          if (val) {
            if(selHash[val])
              delete(selHash[val]);
            else
              selHash[val] = true;
          }
          $(this).toggleClass("active");
          if (val == undefined) {
            // done called
            var txt = [];
            $("#picChooser div.tile.active").each(function() {
              if ($(this).attr("data-val"))
                txt.push($(this).text());
            });
            var btnTxt = "";
            var maxWidth = $(currentScreen).width()/2 - 100;
            for (var i=0; i<txt.length; i++) {
              if (i && getTextWidth(btnTxt+", "+ txt[i].length, $(dEl).find("button").css("font")) > maxWidth) {
                var more = txt.length -i;
                btnTxt += " ... " + (more>1?sprintf(tr.moreEntries, more):tr.moreEntry);
                break;
              }
              btnTxt += txt[i] + (i==txt.length-1?"":", ");
            }
            $(dEl).attr("val", Object.keys(selHash).join(","));
            kps_onChange(dEl.param, $(dEl).attr("val"));
            $(dEl).find("button").text(txt.length?btnTxt:tr.noSel);
            $("#dialog-overlay").remove();
            $("div#settingsicon").show();
            $("div.back.level_"+currentLevel).show();
            $(currentScreen).css('display','');
          } 
        }
      });
    }

    var btn = $(dEl).find("button");
    if(btn.length) {
      $(btn).click(function(e) {
        e.preventDefault();
        showFn();
        return false;
      });

    } else {
      var em = $(dEl).find("div.errMsg");
      if(em.length == 0)
        showFn();
    }
  }
  return h;
}

function
kps_addChooser(p, valArr, txtArr, orderBy, isRo, type, limit, size)
{
  var h = "", valSet={};
  var isSingle = (type.indexOf("single") == 0);
  if(!txtArr.length || txtArr.length != valArr.length)
    return "";
  var val = p.common.valueHash[p.columnname];
  if(!isSingle)
    valSet = arrToObj(val.split(","));

  var tLen = 0;
  p.tIdx = [];
  for(var i1=0; i1<valArr.length; i1++) {
    if(tLen < txtArr[i1].length)
      tLen = txtArr[i1].length;
    p.tIdx[i1] = i1;
  }
  tLen *= valArr.length;
  if(type.indexOf("FromTable") > 0) {
    p.tIdx.sort(function(a,b){
      if(orderBy==undefined || orderBy[a]==undefined || orderBy[b]==undefined)
        return txtArr[a].localeCompare(txtArr[b]);
      return parseInt(orderBy[a]) - parseInt(orderBy[b]);
    });
  }

  if(!limit)
    limit = (isSingle ? 7 : 12);
  if((isRo || valArr.length <= limit) && lastGlueWithNext != 'SAMEROW') {

    var wLen =  $(window).width();
    var owLen = $("#outer-wrapper").width();
    if(wLen > owLen)
      wLen = owLen;
    var oneLine = (valArr.length*85 + 10*tLen < wLen-60);

    h += '<ul style="'+brPref+'column-count:'+(oneLine?valArr.length:1)+'"'+
      ' class="answers-list radio-list">';
    for(var i1=0; i1<valArr.length; i1++) {
      var i2 = p.tIdx[i1];
      var lVal = valArr[i2];
      var src, fn;
      if(isSingle) {
        if(isRo && val != lVal)
          continue;
        src = (val==lVal) ? "radio" : "no_radio";
        fn = "kps_radioFn";
      } else {
        if(isRo && !valSet[lVal])
          continue;
        src = valSet[lVal] ? "check" : "no_check";
        fn = "kps_checkboxFn";
      }

      var name = "rb_"+p.columnname+'_'+i2;
      h += '<li id="'+name+'" class="answer-item radio-item">';
      h += '<img class="radios" src="'+imgDir+src+'.png"'+
        ' val="'+lVal+'" '+(isRo ? '':'onclick="'+fn+'(event)"') +'>';
      h +='<label for="'+name+'" class="answertext">'+txtArr[i2]+'</label>';
      h += '</li>';
    }
    h += '</ul>';
    p.postprocess = function(el){
      $(el).attr("val", val);
      $(el).find("ul li img").css("cursor", "pointer");
    }

  } else {
    var msize = size?size:8;
    h = "<select onChange='kps_selectFn(event)'"+
      (isRo ? " disabled" : "")+
      (isSingle ? "":" multiple size='"+msize+"'")+">";
    var found = false;
    var o = "";
    if(isSingle)
      o += '<option value=""'+(val ? "":" selected")+'></option>';
    for(var i3=0; i3<2; i3++) { // First round: Multiselect add selected vals
      if(isSingle && i3==0)
        continue;
      for(var i1=0; i1<valArr.length; i1++) {
        var i2 = p.tIdx[i1];
        var lVal = valArr[i2];
        var isSel = ((isSingle && val==lVal)||(!isSingle && valSet[lVal]));
        if(!isSingle && ((i3==0 && !isSel) || (i3==1 && isSel)))
          continue;
        o += '<option value="'+lVal+'"'+
                (isSel ? " selected":"")+'>'+txtArr[i2]+'</option>';
        found = found || isSel;
      }
    }
    h += o;
    h += "</select>";
 
    p.postprocess = function(el){ $(el).attr("val", val); }

  }
  return h;
}

///////////////////////////////////////////////////
function
kps_range(pic)
{
  var p = jsChangeColumn;
  if(!pic)
    return;
  if(p.inRange)
    return;

  if(p.constrainttype != "num" || !p.constraintparam)
    return okDialog(p.columnname+": kps_range must be num with min,max");

  var val = $("#v_"+p.columnname+" input").first().val();
  var mm=p.constraintparam.split(","), min=parseInt(mm[0]), max=parseInt(mm[1]);

  var sl = $("#v_"+p.columnname+" div.answer div.rangedisplay");
  if(sl.length == 0) {
    var sc = '<div class="rangecontainer" id="range_'+p.columnname+'">';

    sc += '<div class="rangedisplay">';
    sc += '<div data-nr="0" class="active range Zero"></div>';
    for(var i1=1; i1<=max; i1++)
      sc += '<div data-nr="'+i1+'" class="range range'+pic+'"></div>';
    sc += '<div class="infotext"><div>';
    sc += '</div>'

    $("#v_"+p.columnname+" div.answer span.lower_questionhelp").replaceWith(sc);
    sl = $("#v_"+p.columnname+" div.answer div.rangecontainer");
    p.justCreated = true;

    if(screenFns[0].fn.name == "kps_newBook" || !screenFns[0].args[0].ro) {
      $(sl).find("div.range")
      .css("cursor", "pointer")
      .click(function(){
        if(screenFns[0].fn.name != "kps_newBook" && screenFns[0].args[0].ro)
          return;
        var v = $(this).attr("data-nr");
        if(v == 0 && $(this).hasClass("range"+pic))
          v = '';
        $("#v_"+p.columnname+" input").first().val(v);
        setDiv(sl,max,v);
      });
    }

    $("#v_"+p.columnname+" input").css("display", "none");
  }

  function
  setDiv(sl,max,val)
  {
    for(var i1=1; i1<=max; i1++) {
      if(val && i1<=val)
        $(sl).find("div[data-nr="+i1+"]").addClass("active");
      else
        $(sl).find("div[data-nr="+i1+"]").removeClass("active");
    }
    if(val == '') {
      $(sl).find("div.infotext").css("visibility", "hidden")
      $(sl).find("div[data-nr=0]").removeClass("range"+pic);
    } else {
      $(sl).find("div.infotext").css("visibility", "visible").html(val);
      $(sl).find("div[data-nr=0]").addClass("range"+pic);
    }
    p.inRange = true;
    if(!p.justCreated)
      kps_onChange(p, val);
    delete(p.justCreated);
    delete(p.inRange);
  }
  setDiv(sl,max,val);
}

function
kps_timeGroupHourSet(ch, tim, vEach, callBack)
{
  $(tim).find("div.hourscontainer input").css("cursor","pointer");
  $(tim).find("div.hourscontainer div.input")
  .css("position", "relative")
  .click(function(e){
    e.preventDefault(); // no input handling
    e.stopPropagation(); // no currentScreen notification
    var div=$(this).closest(".hours");

    // Build
    html = '<div class="numberselector">'+
             '<div class="fullnum">';
    for(var i1=0; i1<24; i1++)
      html += '<div data-nr="'+i1+'">'+i1+'</div>';
    html += '</div>'; // fullnum
    html += '<div class="fragnum min5">';
    for(var i1=0; i1<60; i1+=5) {
      var j = (i1<10 ? '0'+i1:i1)
      html += '<div data-nr="'+j+'">:'+j+'</div>';
    }
    html += '</div>'; // fragnum
    html += '</div>'; // numberselector
    $(tim).find("div.numberselector").remove();
    $(div).find("input").before(html);

    // Set active fields
    var val = $(div).find("input").val().split(":");
    $(div).find('div.fullnum [data-nr='+val[0]+']').addClass("active");
    $(div).find('div.fragnum [data-nr='+val[1]+']').addClass("active");

    // Position
    var cp = $(currentScreen).parent();
    var isGrp = $(div).hasClass("hourGroup");
    $(cp).animate({ scrollTop:$(cp).scrollTop()+$(tim).position().top }, 500);
    var ns = $(tim).find("div.numberselector");
    var left = $(div).position().left;
    var nsw = $(ns).width()/2 - $(div).width()/2;
    $(ns).css({left:left<nsw ? -left : -nsw, top:40});

    // Handler
    $(currentScreen).off("click");
    $(currentScreen).on("click",hide);

    function
    hide()
    {
      $(currentScreen).off("click");
      $(tim).find("div.numberselector").remove();
    }

    $(tim).find("div.fullnum > div").click(function(e){
      e.stopPropagation();
      $(tim).find("div.fullnum div").removeClass("active");
      $(this).addClass("active");
    });

    $(tim).find("div.fragnum > div").click(function(e){
      e.stopPropagation();
      $(tim).find("div.fragnum div").removeClass("active");
      $(this).addClass("active");
      var hr = $(tim).find("div.fullnum div.active").attr("data-nr");
      if(!hr) hr = 0;
      var mn = $(this).attr("data-nr");
      $(div).find("input").val(hr+":"+mn);
      setHVal(hr+":"+mn, isGrp);
      hide();
    });

    function
    setHVal(hm, isGrp)
    {
      var thisV = hm2float(hm);
      var tNum = vEach.length;
      if(isGrp) {
        var single = parseInt((thisV*12)/tNum)/12, shm = float2hm(single);
        $(div)
          .closest("div.hourscontainer")
          .find("input.singlehour")
          .val(shm);
        $(div)
          .closest("div.hourscontainer")
          .find("input.singlehour")
          .first()
          .val(float2hm(single+(thisV-tNum*single)));
        total = thisV;

      } else {
        var locked = $(tim).find("div.singlehours").hasClass("locked");
        if(locked) {
          $(div)
            .closest("div.singlehours")
            .find("input.singlehour")
            .val(hm);
        }
      }

      var vTotal = 0; var idx=0;
      $(div)     // Collect the values
        .closest("div.hourscontainer")
        .find("input.singlehour")
        .each(function(){
          var v = hm2float($(this).val());
          if(!isNaN(v)) {
            vEach[idx][ch.prefix+"HOURS"] = v;
            vTotal += v;
          }
          idx++;
        });
      $(div)     // set the group
        .closest("div.hourscontainer")
        .find("input.grouphour").val(float2hm(vTotal));
      callBack(thisV, vTotal);
    }
  });
}

function
kps_timeGroup() { log("kps_timeGroup is DEPRECATED"); }

///////////////////////////
function
kps_timeGroup2(picName, hrTable, hrName, hrNameShort, hrPic, hrFilter)
{
  var p = jsChangeColumn;
  if(p.constrainttype != "tableCopy")
    return okDialog(p.columnname+": kps_timeGroup2 must be tableCopy");
  var ch = kps_parseConstraintParam(bdef.cols[p.columnname]);

  var el = $("#v_"+p.columnname);

  var vEach = el.attr("val");
  var s = screenFns[0].args[0];
  var tgtId = s.book.bookId+"/"+s.data._rowId;
  if(!vEach)
    vEach = s.data[p.columnname];
  try {
    vEach = vEach ? JSON.parse(vEach) : [];
  } catch (e) {
    vEach = [];
  }
  var html = '<div class="hourscontainer">'+
               '<div class="singlehours '+(vEach.length>1 ? ' locked':'')+'">';
  var tNum = vEach.length;
  if(tNum == 0)
    tNum = 1;
  var vTotal = 0;
  for(var i1=1; i1<=tNum; i1++) {
    var v = (i1 <= vEach.length ? vEach[i1-1][ch.prefix+'HOURS'] : '');
    if(v == undefined) v = '';
    if(v) { 
      vTotal += v;
      v = float2hm(v);
    }
    html += '<div data-nr="'+i1+'" class="hours hour'+picName+'">'+
              '<div class="image'+(i1>vEach.length ?' inactive':'')+'"></div>'+
              '<div class="input">'+
                '<input readonly class="singlehour" type="text" value="'+v+'">'+
              '</div>'+
            '</div>';
  }
  if(tNum > 1)
    html += '<div class="separator"><div>=</div></div>' +
            '<div class="grouphours">'+
              '<div class="hours hourGroup"><div class="image"></div>'+
              '<div class="input">'+
                '<input class="grouphour" readonly type="text" value="'+
                        float2hm(vTotal)+'"></div></div>'+
             '</div>';
  if(vEach.length > 1)
    html+='<div data-nr="0" class="hours lock"><div class="image"></div></div>';
  html += '</div>'; // singlehours
  html += '</div>'; // hourscontainer

  el.find("div.hourscontainer").remove();
  el.find("div.answer")
        .css("display","none")
        .after(html);

  if(!screenFns[0].args[0].ro) {
    $(el).find("div.hours.lock")
    .css("cursor", "pointer")
    .click(function(){
      $(el).find("div.singlehours").toggleClass("locked");
    });
  }
  if(!screenFns[0].args[0].ro && vEach.length > 0) {
    kps_timeGroupHourSet(ch, el, vEach, function(thisV, vTotal){
      $(el).attr("val", JSON.stringify(vEach));
    });
  }

  var sel={},val=[],txt=[],pics=[], fbHash={}, common={valueHash:{}}, idHash={};
  var userCol = ch.prefix+'USERID';
  function
  setPic(idx)
  {
    var hr = idHash[vEach[idx][userCol]];
    if(!hr)
      return;
    el.find("div.hourscontainer div[data-nr="+(idx+1)+"] div.image").each(
    function(){
      $(this).find("div.name").remove();
      $(this).find("div.name").remove();
      if(hr[hrNameShort])
        $(this).append('<div class="name">'+hr[hrNameShort]+'</div>');
      if(hr[hrPic])
        $(this).css('background-image',
              'url('+ hr[hrPic].substr(hr[hrPic].indexOf(";")+1)+')');
      if(hr[hrPic])
        $(this).addClass("timeGroupWithPhoto");
      else
        $(this).removeClass("timeGroupWithPhoto");
    });
  }

  db_getAnswerRows({tablename:hrTable }, function(r){
    var fltData = { filter:hrFilter };
    for(var i1=0; i1<r.length; i1++) { // Pimp it for the select saveFn
      r[i1].id = r[i1]._bookId+"/"+r[i1]._rowId;
      if(!kps_filterBody(r[i1], fbHash) ||
         !kps_filterIsSet(r[i1], common, fltData))
        continue;
        
      idHash[r[i1].id] = r[i1];
      val.push(r[i1].id);
      txt.push(r[i1][hrName]);
      pics.push(r[i1][hrPic]);
    }
    for(var i1=0; i1<vEach.length; i1++) {
      sel[vEach[i1][userCol]] = true;
      setPic(i1);
    }
  });

  if(!screenFns[0].args[0].ro) {
    el.find("div.hourscontainer div.hour"+picName+" div.image")
    .css("cursor","pointer")
    .click(function(e){
      if(val.length == 0) {
        okDialog(sprintf(tr.timeGroupEmpty,
                 trDef(bdef.tbldef[hrTable], "displayname")));
        return;
      }
      kps_multiPicChooser(val, txt, pics, sel, function(){
        var nEach=[], idx=1;

        for(var i1=0; i1<vEach.length; i1++) { // preserve the old
          var id = vEach[i1][userCol];
          if(sel[id]) {
            vEach[i1][ch.prefix+'INDEX']=idx++;
            nEach.push(vEach[i1]);
            sel[id] = false;
          }
        }
        for(k in sel) { // add the new
          if(sel[k]) {
            var h={};
            h[userCol]=k; 
            h[ch.prefix+'TARGETID'] = tgtId;
            h[ch.prefix+'INDEX'] = idx++;
            nEach.push(h);
          }
        }
        el.attr("val", JSON.stringify(nEach));
        jsChangeColumn = p;
        kps_timeGroup2(picName, hrTable, hrName, hrNameShort, hrPic, hrFilter);
      });
    });
  }
}

///////////////////////////////////
// Set Image & Help Texts
function
kps_changeHelpText(p, sel)
{
  if(p.cht_entered)
    return;
  var selected = sel;
  if (p.constrainttype == "multiFromTable" && typeof(sel) == "string")
    selected = sel.split(",")[0];
  p.cht_entered = 1;
  // ugly hack, for lvdm/tayninh
  var doClick = (p.constrainttype == "singleFromTable" && p.constraintparam.indexOf("LU_INPUTS") == 0);
  var tbl = p.common.tblContent[p.columnname];
  if(!tbl) {
    tbl = p.common.tblName[p.columnname];
    if(tbl)
      tbl = luTables[tbl];
  }
  if(!tbl) {
    delete(p.cht_entered);
    return;
  }
  var delayed;
  var imgFound = false;
  var tName = "div#v_"+p.columnname+" span.upper_questionhelp";
  $(tName).removeClass("moreEntries");
  for(var i1=0; i1<tbl.length; i1++) {
    var r = tbl[i1];
    if(r.id == selected) {
      if(r.HELPTEXT)
        $(tName).html(r.HELPTEXT);

      var img = r[p.imgName];
      if(img) {
        imgFound = true;
        if(img.indexOf("[deferred:") < 0) {
          $(tName).find("img.questionhelp").remove();
          $(tName).prepend('<img class="questionhelp">');
          $(tName).find("img")
                  .attr("src",img.substr(img.indexOf(";")+1));
          if (doClick)
          $(tName).find("img").click(function() {
              var p = $(this).attr("src");
              if(p)
                okDialog('<div class="flex-img"><img src="'+p+'"></div>',false,{width:$(window).width()*0.9, height:$(window).height()*0.9});
            });

        } else {
          var cd = p.common ? p.common.valueHash._complexData[selected] : null;
          if(cd) {
            $(tName).find("img.questionhelp").remove();
            $(tName).prepend('<img class="questionhelp">');
            $(tName).find("img").attr("src", cd.data);

          } else if(p.constraintparam) {
            var arg = p.constraintparam.split(" ");
            delayed = 1;
            var imgName = img.substr(10, img.length-11);
            db_getImage(imgName, function(data) {
              delete(p.cht_entered);
              if(data == "")
                return;
              var off = data.data.indexOf(";");
              $(tName).find("img.questionhelp").remove();
              $(tName).prepend('<img class="questionhelp">');
              $(tName).find("img").attr("src", data.data.substr(off+1));
              if (doClick)
              $(tName).find("img").click(function() {
                  var p = $(this).attr("src");
                  if(p)
                    okDialog('<div class="flex-img"><img src="'+p+'"></div>',false,{width:$(window).width()*0.9, height:$(window).height()*0.9});
                });
            });
          }
        }
        if (p.constrainttype == "multiFromTable" && sel) {
          // add more entries after image
          $(tName).addClass("moreEntries");
          $(tName).attr("data-before", typeof(sel) == "string"?sel.split(",").length:1);
        }
      } 
      break;
    }
  }
  if(!delayed)
    delete(p.cht_entered);
  if(!imgFound && !delayed)
    $(tName).find("img.questionhelp").attr("src", "");
}

///////////////////////////////////
// widget change related 
function
kps_onChange(p, val)
{
  if(!p)
    return;
  var c = p.common;
  c.valueHash[p.columnname] = val;

  if(p.javascriptonchange) {
    jsChangeColumn = p;
    //log(p.columnname+" javascriptonchange:"+p.javascriptonchange);
    eval(p.javascriptonchange);
  }

  for(var key in p.changedHash)
    p.changedHash[key](p, val);

  if(c.sidata && c.sidata[p.columnname]) {
    if (p.inputtype != "hidden")
      kps_handleShowIf(p, p.columnname);
  }
}

function
kps_selectFn(e)
{
  var val = $(e.target).val();
  $(e.target).closest("div.question-value")
    .each(function(){
      $(this).attr("val", val);
      kps_onChange(this.param, val);
    });
}


function
kps_checkboxFn(e)
{
  var sel = ($(e.target).attr("src").indexOf("no_check") < 0);
  sel = !sel;
  $(e.target).attr("src", imgDir+(sel?"":"no_")+"check.png");
  var val=[];
  $(e.target).closest("div.question-value").find("ul li img.radios")
  .each(function(){
    if($(this).attr("src").indexOf("no_check") < 0)
      val.push($(this).attr("val").replace(/,/g,"&#44;"));
  });
  var v = val.join(",");

  $(e.target).closest("div.question-value")
    .each(function(){
      $(this).attr("val", v);
      kps_onChange(this.param, v);
    });
}

function
kps_radioFn(e)
{
  if($(e.target).attr("src").indexOf("no_radio") < 0) // already selected
    return;
  var val = $(e.target).attr("val");
  $(e.target).closest("ul").find("img").each(function(){
    $(this).attr("src", imgDir+"no_radio.png");
  });
  $(e.target).attr("src", imgDir+"radio.png");

  $(e.target).closest("div.question-value")
    .each(function(){
      $(this).attr("val", val);
      kps_onChange(this.param, val);
   });
}

function
kps_resizeImage(img, maxW, maxH, origData)
{
  var w=img.width, h=img.height, resize=false;
  if(w > h && w > maxW) {
    h = Math.round(h * (maxW/w));
    w = maxW;
    resize = true;
  } else if(h > maxH) {
    w = Math.round(w * (maxH/h));
    h = maxH;
    resize = true;
  }
  // resize not supported for png
  if(origData.indexOf("data:image/png") == 0)
    resize = false;
  if(resize) {
    log("resizeImage to "+w+" x "+h);
    // iOS 6 is buggy, squashes images > 2MP, using megapix-library
    // Android < 4.2 is buggy, cannot encode JPEG, using js-jpeg-encoder
    // Get EXIF orientation
    var rawImage = atob(origData.replace("data:image/jpeg;base64,", ""));
    var exif = EXIF.readFromBinaryFile(new EXIF.BinaryFile(rawImage));
    var orientation = exif.Orientation; // 6:up, 1:btnright, 8:down, 3:btnleft

    var canvas = document.createElement('canvas');
    renderImageToCanvas(img, canvas,
        {width:w, height:h, orientation:orientation}, 1);
    var newData;

    try {
      newData = canvas.toDataURL("image/jpeg", 0.7);

    } catch(e) {
      if(orientation == 6 || orientation == 8) { // Swap w & h for portrait
        var x=w; w=h; h=x;
      }
      var data = canvas.getContext('2d').getImageData(0,0,w,h);
      var enc = new JPEGEncoder(75);
      newData = enc.encode(data);
    }
    origData ="data:image/jpeg;base64,"+ExifRestorer.restore(origData, newData);
    log("resized image size:"+origData.length);
  }
  return origData;
}

//////////
// show the input file in a div with link
function
kps_fileFn(input)
{
  if(input.files && input.files[0]) {
    var fName = input.files[0].name.replace(/;/g,"");
    var fr = new FileReader();
    fr.onload = function(e) {
      var link = $(input).parent().find(".fileLink");
      $(link).attr('href', e.target.result);
      $(link).attr('download', fName);
      $(link).text(fName);

      $(link).attr('data-modified', 'true');
      $(link).attr('data-filename', fName);
      if(!$(link).attr('data-id')) {
        $(link).attr('data-id', newUUID());
      }
    }
    // check maxsize
    var filesize = input.files[0].size;
    var maxsize = $(input).attr("maxsize");
    if (!isNaN(maxsize) && filesize > parseInt(maxsize)) 
      okDialog('<div>'+sprintf(tr.filesizeExceeded, maxsize)+'</div>');
    else
      fr.readAsDataURL(input.files[0]);
  }

  $(input).closest("div.question-value").each(function(){
    kps_onChange(this.param, "CHANGED");
  });
}

function
kps_updateSignature(button)
{
  $("body").append("<div id='dlg_okCancel'></div>");
  $("div#dlg_okCancel").html('<div id="signature-pad" class="m-signature-pad">'+
    '<div class="m-signature-pad--body">'+
      '<canvas></canvas>'+
    '</div></div>');
  $("div#dlg_okCancel").dialog({
    width: 700,
    height: 520,
    open: function(event, ui) {
        log("open");
        $(this).parent().find(".ui-widget-content").css("border", "none");
        var wrapper = document.getElementById("signature-pad"),
        canvas = wrapper.querySelector("canvas");

        // Adjust canvas coordinate space taking into account pixel ratio,
        // to make it look crisp on mobile devices.
        // This also causes canvas to be cleared.
        function resizeCanvas() {
            log("resizeCanvas");
            // When zoomed out to less than 100%, for some very strange reason,
            // some browsers report devicePixelRatio as less than 1
            // and only part of the canvas is cleared then.
            var ratio =  Math.max(window.devicePixelRatio || 1, 1);
            var height = canvas.offsetHeight * ratio;
            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = height;
            canvas.getContext("2d").scale(ratio, ratio);
        }

        resizeCanvas();
        signaturePad = new SignaturePad(canvas);
       
   },
    dialogClass:"no-close", modal:true, buttons: [
      {text:tr.clear, click:function(){
        //if (signaturePad)
        //  signaturePad.clear();
        $(this).dialog("close");
        doSave("");
      }},
      {text:tr.cancel, click:function(){
        $(this).dialog("close");
        $("div#dlg_okCancel").remove();
      }},
      {text:tr.save, click:function(){
        $(this).dialog("close");
        var img = new Image();
        img.onload = function() { 
          doSave(img.src);
        }
        img.src = signaturePad.toDataURL();
      }}]
  });

  function
  doSave(result)
  {
    var fi = $(button).parent().find("img");
    $(fi).attr('src', result);
    $(fi).attr("data-modified", "true");
    $(fi).attr("data-filename", result ? 'Signature':'');
    if(!$(fi).attr("data-id")) {
      $(fi).attr("data-id", newUUID());
    }
    $(fi).removeAttr("data-link");
    $(button).closest("div.question-value").each(function(){
      kps_onChange(this.param, "CHANGED");
    });
    $("div#dlg_okCancel").remove();
  }
}

function
kps_fotoDelFn(el)
{
  $(el)
  .unbind("click")
  .css({display:"block",cursor:"pointer"})
  .click(function(){
    $(el).css({display:"none"})
    var p = $(el).parent();
    var fi = $(p).find("img.fotoImg");

    $(fi).attr("src","");
    $(fi).attr("data-filename","");
    $(fi).removeAttr("data-link");
    if($(fi).attr("data-id").indexOf("/") < 0) { 
      $(fi).removeAttr("data-id");  // newly created, do not sync
      $(fi).removeAttr("data-modified");
    } else {
      $(fi).attr("data-modified", "true"); // old one
    }
    $(p).find("span").html("");
  });
}
//////////
// show the input file in a div if its an image.
function
kps_fotoFn(event)
{
  var el = event.target;
  if(el.files && el.files[0] &&
     el.files[0].name.match(/(\.jpg|\.jpeg)$/i)) {
    var fName = el.files[0].name.replace(/;/g,"");
    $(el).parent().find(".fotoName span").first().html(fName);
    var dd = $(el).parent().find("> div.fotoName > div.delete");

    var fr = new FileReader();
    fr.onload = function(e) {
      var img = new Image();
      img.onload = function() { // resize the image, if its too big.
        var result = e.target.result;
        var maxwh;
        $(el).closest(".question-value").each(function(){
          if(this.param.constraintparam)
            maxwh = this.param.constraintparam.match(/(\d+) *x *(\d+)/)
        });
        if(maxwh && maxwh.length == 3)
          result = kps_resizeImage(img, maxwh[1], maxwh[2], result);

        var fi = $(el).parent().find("img").first();
        $(fi).attr('src', result);
        $(fi).attr("data-modified", "true");
        $(fi).attr("data-filename", fName);
        if(!$(fi).attr("data-id")) {
          $(fi).attr("data-id", newUUID());
        }
        $(fi).removeAttr("data-link");

        kps_fotoDelFn(dd);
      }
      img.src = e.target.result;
      $(dd).css("display", "block");
      kps_fotoDelFn(dd);
    }
    fr.readAsDataURL(el.files[0]);
  } else if (el.files.length > 0) {
    okDialog('<div>'+tr.unsupportedImage+'</div>');
  }

  $(el).closest("div.question-value").each(function(){
    kps_onChange(this.param, "CHANGED");
  });
}


///////////////////////
// GPS stuff
function
kps_gpsFn(div, param, ro)
{
  var el = $(div).find("input");
  $(el).attr("size", 20);
  var pa = kps_parseConstraintParam(param);

  // Current location Button
  if (!ro) {
    $(el).after('<button type="submit" class="gpsGetLoc">'+tr.gpsGetLoc+
                '<img src="'+imgDir+'gps.gif'+'" style="visibility:hidden"/>'+
                '</button>');
    el = $(div).find("button.gpsGetLoc")
      .css("cursor", "pointer")
      .click(function(){ kps_gpsGetLocation(this, param) });
  }
  // Use Google Maps checkbox
  if(!insideTableRows && kps_googleMapsEnabled) {
    $(div).find(ro?"input":"button").after(
      '<span class="useGoogleMaps">'+
        '<img class="gpsUG" src="'+imgDir+'check.png">'+tr.gpsUseGM+
      '</span>'+
      '<span class="gpshelp" style="display:none"></span>');
  }


  function
  imgClick(evt, initial){
    var img = evt.target;
    var isSet = !insideTableRows && kps_googleMapsEnabled &&
                ($(img).attr("src").indexOf("no_check") >= 0);
    if(!isSet && isAndroid && initial) {
      // with good internet connection, enable google maps initially
      isSet = (navigator.connection.type == "wifi" || 
               navigator.connection.type == "cellular" && navigator.connection.downlinkMax >= 0.2);
    }
    if(initial)
      isSet = true;
    var src = isSet ? "check" : "no_check";
    $(img).attr("src", imgDir+src+'.png');
    log("kps_gpsAddGM readonly="+ro+", inputtype="+param.inputtype);
    if(isSet && param.inputtype != "hidden") {
      loadScript('https://maps.googleapis.com/maps/api/js'+
                        '?key='+kpsGmKey+'&libraries=drawing',
                        function(){ 
          kps_gpsAddGM(div, param, ro, function() {
            if(pa.COMPUTED && initial)
              $("div#w_"+pa.COMPUTED).css("display", "block");
            // hide gps fields
            $(div).find(".gpshelp").hide();
            $(div).find("input.text").hide();
            $(div).find("button.gpsGetLoc").hide();
            var gpsHelp = $(div).find(".upper_questionhelp").html();
            if (gpsHelp && gpsHelp.indexOf("GPS") > 0)
              $(div).find(".upper_questionhelp").hide();
            $("#v_"+pa.ADDRESS).show();
            $("#v_"+pa.ELEVATION).show();
            $("#v_"+pa.COMPUTED).show();
            $("#v_"+pa.AREA).show();
          });
      });
    } else {
      var id = param.columnname;
      $(div).find("#gmap_"+id).remove();
      delete(gq["map"+id]);
      delete(gq["marker"+id]);
      window.map = null;
      $(div).find(".gpshelp").html(tr.gpsUseGMHelp1);
      if(pa.COMPUTED && !$("div#w_"+pa.COMPUTED).find("textarea").val())
        $("div#w_"+pa.COMPUTED).css("display", "none");
      $(div).find(".gpshelp").show();
      $(div).find("input.text").show();
      $(div).find("button.gpsGetLoc").show();
      $(div).find(".upper_questionhelp").show();
      $("#v_"+pa.ADDRESS).hide();
      $("#v_"+pa.ELEVATION).hide();
      $("#v_"+pa.COMPUTED).hide();
      $("#v_"+pa.AREA).hide();
    }
  }
  $(div).find("img.gpsUG").click(imgClick);
  imgClick({ target:$(div).find("img.gpsUG") }, true);

  if((param.inputtype == 'readonly' ||
        param.inputtype == 'hidden' ||
        pa.AUTOFILL) &&
      !param.common.valueHash[param.columnname] && 
      (!ro || param.showif)) {
    if(param.showif) {
      var sia = kps_parseShowIf(param.showif);
      if(kps_checkOneShowIf(param, param, sia, false)) {
        return;
      }
    }
    kps_gpsGetLocation(undefined, param);
  }
}

///////////////////////////
// Add Google Maps to a div
  function
kps_gpsAddGM(div, param, ro, callbackfn)
{
  Set = kps_Set;
  if(!kps_googleMapsEnabled ||
      typeof(google) == "undefined" ||
      typeof(google.maps) == "undefined" ||
      typeof(google.maps.LatLng) == "undefined") { // could not load scripts
    return;
  }
  var id = param.columnname;
  var pa = kps_parseConstraintParam(param);
  $(div).find("span.gpshelp").after(
    '<div id="gmap_'+id+'" style="width:100%;height:320px"/>');
  $(div).find(".gpshelp").html(pa.AREA ? tr.gpsUseGMHelp3 : tr.gpsUseGMHelp2);

  $(div).find("input").change(function(){
    kps_gpsSetGeoAddr(id, $(this).val(), 3);
  });

  var gmParam = { zoom:11, 
                  mapTypeId:userData.mapType?google.maps.MapTypeId[userData.mapType]:google.maps.MapTypeId.TERRAIN, 
                  gestureHandling: 'cooperative' };
  var ll;
  if(param.common.valueHash[param.columnname])
    ll = param.common.valueHash[param.columnname].split(" ");
  if(!ll || ll.length != 2) {
    ll = [];
    ll[0] = 50.93659;
    ll[1] =  6.95780; // Koeln, Guerzenich Str. 21
  }

  gmParam.center = new google.maps.LatLng(ll[0], ll[1]);
  window.map = new google.maps.Map(document.getElementById("gmap_"+id), gmParam);
  function get_last_val(p, colName) {
    var last_val = "";
    if (p.common && p.common.bookdata);
      last_val = p.common.bookdata[p.common.bookdata.length-1][colName];
    return (typeof last_val == "undefined"?"": last_val);
  }
  if (param.defaultvalue) {
    var dv; 
    var res = (new RegExp("^{(.+):(.+)}$")).exec(param.defaultvalue);
    if(res && luTables[res[1]]) {
      dv = kps_getTablePtr(res[1], res[2]).DISPLAYNAME;
    } else {
      var res = (new RegExp("^{(.+)}$")).exec(param.defaultvalue);
      if(res) {
        if (res[1] == "last")
          dv = get_last_val(param, param.columnname)
        else {
          log("Eval:"+res[1]);
          dv = eval(res[1]);
        }
      } else {
        dv = param.defaultvalue;
      }
    }
    if (dv) {
      var la = dv.split(" "), iw;
      var ll = new google.maps.LatLng(la[0],la[1]);
      var icon = {
          url: "https://maps.google.com/mapfiles/kml/shapes/ranger_station.png",
          scaledSize: new google.maps.Size(32, 32), // scaled size
          origin: new google.maps.Point(0,0), // origin
          anchor: new google.maps.Point(0, 0) // anchor
      };
      var m = new google.maps.Marker({ position:ll, draggable:false, map:map, zIndex: 0, icon: icon});
    }
  }
  var poly;
  if(pa.AREA && pa.SHAPE)
    poly = kps_gpstxt2shape(map, Get(pa.SHAPE), !ro);
  var marker = new google.maps.Marker({ position:gmParam.center,
                        draggable:ro||poly?false:true, map:map, id:'mk_'+id , zIndex: 1});
  google.maps.event.addListener(map, 'rightclick',
    function(event) { if (marker.draggable) kps_gpsSetGeoVal(id, event, 1); });
  google.maps.event.addListener(marker, 'dragend',
    function(event) { kps_gpsSetGeoVal(id, event, 0) });
  gq["map"+id]=map;
  gq["marker"+id]=marker;

  var dm;
  // Create the DIV to hold the control and call the delete shape button
  function ShapeControl(controlDiv, map) {

    // Set CSS for the control border.
    var controlUI = document.createElement('button');
    controlUI.className = "shape-delete-button";
    controlUI.title = tr.gpsDeleteShape;
    controlDiv.appendChild(controlUI);

    // Set CSS for the control interior.
    var icon = document.createElement('div');
    icon.className = "shape-delete-button-icon";
    controlUI.appendChild(icon);

    // Setup the click event listeners
    controlUI.addEventListener('click', function() {
      log("delete shape click");
      delShape();
      $(div).find("button.shape-delete-button").parent().remove();
      initDrawManager();
      marker.setMap(null);
    });

  }

  function
  delShape()
  {
    if(poly) {
      poly.setMap(null);
      poly = null;
      Set(pa.AREA, ""); Set(pa.SHAPE, "");
      dm.setDrawingMode(null);
      marker.setDraggable(true);
      $("button.widget-mylocation-button").removeClass("disabled");
    } else {
      dm.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
      $("button.widget-mylocation-button").addClass("disabled");
    }
  }

  function
  doOverlayComplete() 
  {
    log("doOverlayComplete");
    var infoWindow;
    var ha;
    var ar = google.maps.geometry.spherical.computeArea(poly.getPath());
    if(ar == 0) {
      okDialog((tr.computedAreaToSmall ? tr.computedAreaToSmall: 
               "The computed area is < 1 ㎡, the distance between shape points is too small."+
               "<br>Shape was removed."));
      return delShape();
    }
    // add delete shape button to map
    var shapeDiv = document.createElement('div');
    var shapeControl = new ShapeControl(shapeDiv, map);
    shapeDiv.index = 1;
    map.controls[google.maps.ControlPosition.TOP_CENTER].push(shapeDiv);
    var ppath = poly.getPath()
    google.maps.event.addListener(ppath, 'set_at', polygonChanged);
    google.maps.event.addListener(ppath, 'insert_at', polygonChanged);
    google.maps.event.addListener(ppath, 'remove_at', polygonChanged);
    function polygonChanged(){
      log("polygonChanged");
      Set(pa.SHAPE, kps_gpsshape2txt(map, poly));
      resetPolyMarker();
      ar = google.maps.geometry.spherical.computeArea(poly.getPath());
      ha = Math.round(ar/10)/1000;
      Set(pa.AREA, ha);
      var content = sprintf(tr.gpsArea? tr.gpsArea:"Calculated area: {1} ha", ha);
      marker.setTitle(content);
      infoWindow.setContent(content);
      infoWindow.open(map, marker); 
    }
    dm.setDrawingMode(null);
    dm.setMap(null);
    ha = Math.round(ar/10)/1000;
    Set(pa.AREA, ha);
    if(pa.SHAPE)
      Set(pa.SHAPE, kps_gpsshape2txt(map, poly));
    resetPolyMarker();
    var content = sprintf(tr.gpsArea? tr.gpsArea:"Calculated area: {1} ha", ha);
    marker.setTitle(content);
    infoWindow = new google.maps.InfoWindow({ content: content });
    google.maps.event.clearListeners(marker, 'click');
    marker.addListener('click', function() {
      infoWindow.open(map, marker); 
    });
    infoWindow.open(map, marker); 
    marker.setDraggable(false);
    $("button.widget-mylocation-button").addClass("disabled");
  }

  function 
  initDrawManager()
  {
    log("init DrawManager");
    if (pa.AREA && !ro) {
      dm = new google.maps.drawing.DrawingManager({
            drawingMode: null,
            drawingControl: true,
            drawingControlOptions: {
              position: google.maps.ControlPosition.TOP_CENTER,
              drawingModes: [ 'polygon']
            },
            polygonOptions: {
              strokeColor: 'black',
              fillColor: '#DCDCDC',
              fillOpacity: 0.8,
              strokeWeight: 2,
              clickable: false,
              editable: true,
              zIndex: 1
            }
          });
    } else
      dm = new google.maps.drawing.DrawingManager(
                                  {drawingMode: null, drawingControl: false});
    dm.setMap(map); 
    google.maps.event.addListener(dm, 'overlaycomplete',
    function(e) {
      log("shape completed");
      poly = e.overlay;
      doOverlayComplete();
    });
    // shape exists on init, change to delete button
    if (poly && !ro)
      doOverlayComplete();
  }  

  function
  resetPolyMarker() {
    if (!poly)
      return;
    log("reset poly marker");
    // reposition poly marker
    marker.setMap(map);
    var pt = poly.getPath().getAt(0);
    var center = new google.maps.LatLng(pt.lat(), pt.lng());
    kps_gpsSetGeoVal(id, { latLng:center }, 1);
  }

  initDrawManager();
  function MyLocationControl(controlDiv, map) {

    // Set CSS for the control border.
    var controlUI = document.createElement('button');
    controlUI.className = "widget-mylocation-button"+(poly?" disabled":"");
    controlUI.title = tr.gpsGetLoc;
    controlDiv.appendChild(controlUI);

    // Set CSS for the control interior.
    var icon = document.createElement('div');
    icon.className = "widget-mylocation-button-icon-common widget-mylocation-button-normal";
    controlUI.appendChild(icon);

    // Setup the click event listeners
    controlUI.addEventListener('click', function() {
      if (poly) 
        return;
      log("my location clicked");
      kps_gpsGetLocation(this, param) 
      resetPolyMarker();
    });
  }
  // add myLocation  button to map
  var myLocDiv = document.createElement('div');
  var myLocControl = new MyLocationControl(myLocDiv, map);
  myLocDiv.index = 1;
  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(myLocDiv);
  $("#gmap_"+id).get(0).data_center = gmParam.center;
  kps_gpsSetGeoVal(id, { latLng:gmParam.center }, 1);
  if (callbackfn)
    callbackfn();
}

// calculate a poligon from a list of points
function
kps_gpstxt2shape(map, s, editable)
{
  if(!s)
    return null;
  var pa = s.split(" "), pl=[];
  if(pa.length > 0)
    map.setZoom(parseInt(pa[0]));
  for(var i1=1; i1<pa.length; i1+=2)
    pl.push({lat:parseFloat(pa[i1]), lng:parseFloat(pa[i1+1])});
  return new google.maps.Polygon({ editable: editable, map:map, paths:pl});
}

function
kps_gpsshape2txt(map, poly)
{
  var r=[], p=poly.getPath();
  r.push(map.getZoom());
  for(var i=0; i<p.length; i++) {
    var pt = p.getAt(i);
    r.push(pt.lat());
    r.push(pt.lng());
  }
  return r.join(" ");
}



function
kps_gpsGetLocation(btn, param) // CurrentLocation button pressed
{
  var pa = kps_parseConstraintParam(param);
  $(btn).find("img").css("visibility", "");
  navigator.geolocation.getCurrentPosition(
    function(p) {
      if(p.timestamp && pa.TIMESTAMP) {
        var ts = now(new Date(p.timestamp));
        log("GPS timestamp: "+ts);
        Set(pa.TIMESTAMP, ts);
      }

      $(btn).find("img").css("visibility", "hidden");
      var id = param.columnname;
      if(!gq["map"+id]) {     // No google Map.
        var val = Math.round(p.coords.latitude *100000)/100000 + " " +// 11meter
                  Math.round(p.coords.longitude*100000)/100000;
        $("#v_"+id+" input").val(val);
        param.common.valueHash[id] = val;
        return;
      }
      var gPos = new google.maps.LatLng(p.coords.latitude, p.coords.longitude);
      kps_gpsSetGeoVal(id, { latLng:gPos }, 1);
    },
    function(error) { 
      okDialog("GPS: "+error.message+"<br>To continue, allow Device Location for the site "+location.origin
        +"<br>Go to Chrome -> Settings -> Website-Settings -> Location"); 
      $(btn).find("img").css("visibility", "hidden");
    },
    { enableHighAccuracy:true, timeout: 180000, maximumAge:300000 });
}

function
kps_gpsSetGeoAddr(id, str, eType)
{
  if(typeof(google)=="undefined" || !gq["map"+id] || !str)
    return;
  if(!kps_geocoder)
    kps_geocoder = new google.maps.Geocoder();

  var arg;
  if(eType == 3) {
    var l = str.split(" ",2);
    arg = {'latLng':new google.maps.LatLng(parseFloat(l[0]), parseFloat(l[1]))};
  } else {
    arg = {'address':str};
  }

  kps_geocoder.geocode(arg, function(results, status) {
    if(status == google.maps.GeocoderStatus.OK) {
      kps_gpsSetGeoVal(id, { latLng:results[0].geometry.location },
              eType, results, status);
    } else {
      okDialog("Geocoding failed:" + status);
    }
  });
}

function
kps_gpsSetGeoVal(id, e, eType, results, status)
{
  // eType: 0:dragEnd, 1:getCurrentPosition/click, 2:address, 3:latlong
  log("kps_gpsSetGeoVal "+id+" type "+eType);

  var div = $("#v_"+id);
  if(eType != 3) {
    $(div).find("input").val(
        Math.round(e.latLng.lat()*10000)/10000 + " " +
        Math.round(e.latLng.lng()*10000)/10000);
  }

  if(!gq["map"+id])     // No google Map.
    return;

  if(eType != 0) {
    gq["map"+id].panTo(e.latLng);
    gq["marker"+id].setPosition(e.latLng);
  }

  var param;
  $(div).each(function(){param = this.param});
  var pa = kps_parseConstraintParam(param);

  var ad = $("#v_"+pa.ADDRESS).find("input");
  var cad = $("#v_"+pa.COMPUTED).find("textarea");
  if(ad.length && cad.length) {
    function
    resultFn(results, status) {
      if(status == google.maps.GeocoderStatus.OK) {
        if(results[0]) {
          var r = results[0];
          if(eType != 2)
            $(ad).val(r.formatted_address);
          var cadTxt = "";
          for(var i=0; i<r.address_components.length; i++) {
            var ac = r.address_components[i];
            cadTxt += ac.types[0]+": "+ac.long_name+"\n";
          }
          $(cad).val(cadTxt);

        } else if($(ad).val() == "") {
          if(eType != 2)
            $(cad).val("No address found");
        }
      } else if($(ad).val() == "") {
        if(eType != 2)
          $(cad).val(status);
      }
    }

    if(typeof(results)=="undefined") {
      if(!kps_geocoder)
        kps_geocoder = new google.maps.Geocoder();
      kps_geocoder.geocode( {'latLng': e.latLng}, resultFn);
    } else {
      resultFn(results, status);
    }
  }

  var ee = $("#v_"+pa.ELEVATION).find("input");
  if(ee.length) {
    if(!kps_elevator)
      kps_elevator = new google.maps.ElevationService();

    var pReq = { 'locations': [ e.latLng ] }
    kps_elevator.getElevationForLocations(pReq, function(results, status) {
      if (status == google.maps.ElevationStatus.OK) {
        if (results[0]) {
          $(ee).val(Math.round(results[0].elevation));
        } else {
          log("Elevation service found no results");
        }
      } else {
        log("Elevation service failed due to:" + status);
      }
    });
  }

}

function
kps_gpsIgnoreComputed(cmpCol)
{
  var ta = $("div#v_"+cmpCol).find("textarea");
  ta.after('<div class="gpsIC"><img src="'+imgDir+'no_check.png">'+
                        tr.gpsIgnComp+'</div>');
  $("div#v_"+cmpCol+" div.gpsIC img").click(function(evt){
    var img = evt.target;
    var isSet = ($(img).attr("src").indexOf("no_check") >= 0)
    var src = isSet ? "check" : "no_check";
    $(img).attr("src", imgDir+src+'.png');
    var val = ta.val();
    var str = "ignore: yes\n";
    val = val.replace(str, "");
    if(isSet)
      val = str+val;
    ta.val(val);
  });
}

// Syntax:
// - part1&part2&part3 (linked by AND)
// - part: name=regexp or name!=regexp
// - name: col or col:col_in_referenced_table
// - if regexp is of the form {...}, then it is evaluated, e.g. tblRows.length>1
function
kps_parseShowIf(si)
{
  var r = [];
  if(!si)
    return r;
            // col/tbl    :col?      =    regexp
  si.replace(/([^:!=&]+)(:[^:!=&]+)?(!?=)([^&]+)/g, function(a,n,tc,o,re) { 
    r.push({ col:n, tblCol:(tc?tc.substr(1):tc), op:o, re:re});
  });
  return r;
}

///////////////////////
// collect all showif parameters, and make a list of "causer"
function
kps_finishPageFn(cs)
{
  if(kps_inFinishPage)
    return;
  kps_inFinishPage = true;
  var sidata={}, tblName={}, tblContent={};
  if(!cs)
    cs = currentScreen;
  $(currentScreen).find(".question-value").each(function(){
    var p = this.param;
    if(!p)              // parent link
      return;
    if (p.inputtype != "hidden")
      p.common.sidata = sidata;
    p.common.tblName = tblName;
    p.common.tblContent = tblContent;

    var sia = kps_parseShowIf(p.showif);
    for(var i1=0; i1<sia.length; i1++) {
      var c = sia[i1].col;
      if(typeof sidata[c] == "undefined")
        sidata[c] = [];
      sidata[c].push(p);
    }

    if(p.constrainttype.indexOf("FromTable") > 0) {
      var sp = p.constraintparam.split(" ");
      tblName[p.columnname] = sp[0];
    }

    if(p.constrainttype == "gps") { // Hide empty computed address
      // call gpsSetGeoVal after finishPageFn, 
      // because address and elevation may not be rendered in addWidget(gps)
      if ($("#gmap_"+p.columnname).length) {
        var center = $("#gmap_"+p.columnname).get(0).data_center;
        kps_gpsSetGeoVal(p.columnname, { latLng:center }, 1);
      }

      var pa = kps_parseConstraintParam(p);
      if(pa.COMPUTED) {
        kps_gpsIgnoreComputed(pa.COMPUTED);
        if(!p.common.valueHash[pa.COMPUTED])
          $("div#w_"+pa.COMPUTED).css("display", "none");
      }

      if(pa.ADDRESS) {
        $("div#v_"+pa.ADDRESS+" input").blur(function(){
          kps_gpsSetGeoAddr(p.columnname, $(this).val(), 2);
        });
      }
      // hide automatic fields if google maps is disabled
      if ($(".useGoogleMaps .gpsUG").length > 0 && 
          $(".useGoogleMaps .gpsUG").attr("src").indexOf("no_check") > 0) {
        $("div#v_"+pa.ADDRESS).hide();
        $("div#v_"+pa.ELEVATION).hide();
        $("div#v_"+pa.COMPUTED).hide();
        $("div#v_"+pa.AREA).hide();
      } 
    }

    kps_onChange(p, p.common.valueHash[p.columnname]);;

  });
  for(var col in sidata) 
    kps_handleShowIf(sidata[col][0], col);
  kps_inFinishPage = false;
}

function
kps_checkOneShowIf(p, lp, sia, hide)
{
  for(var i2=0; i2<sia.length; i2++) {
    var s=sia[i2], val=p.common.valueHash[s.col], match=false;

    if(s.tblCol) {                         // table lookup
      var re = new RegExp(s.re), tblContent=p.common.tblContent[s.col];
      if(!tblContent)
        tblContent = luTables[p.common.tblName[s.col]];
      if(tblContent) {
        for(var i3=0; i3<tblContent.length; i3++)
          if(tblContent[i3].id == val) {
            if(re.test(tblContent[i3][s.tblCol]))
              match = true;
            break;
          }
      } else {
        okDialog("showif for "+p.columnname+": cannot find table "+s.col);

      }

    } else if((new RegExp(s.re)).test(val)) {
      match = true;

    } else {
      var m = s.re.match(/{(.*)}/);
      if(m) {
        var tblRows="";
        if(bdef.cols[s.col] && 
           bdef.cols[s.col].constrainttype == "tableRows") {
          try { tblRows = JSON.parse(val) } catch(e) {}
        }
        match  = eval(m[1]);
      }
    }

    if(s.op == "!=")
      match = !match;
    if(!match) {
      hide=true;
      break;
    }
  }
  return hide;
}

/////////////////
// Called when a column changed (or at the beginning for each displayed column)
// to hide all dependant(!) fields. The column is potentially not on the
// current screen
function
kps_handleShowIf(p, col)
{
  var sd = p.common.sidata[col];

  for(var i1=0; i1<sd.length; i1++) {              // each dependent field
    var lp = sd[i1];

    var sia = kps_parseShowIf(lp.showif);
    var hide = (lp.inputtype == "hidden");
    hide = kps_checkOneShowIf(p, lp, sia, hide);
    if(hide) {
      $(currentScreen+" #w_"+lp.columnname).css("display", "none");
      $(currentScreen+" #v_"+lp.columnname).css("display", "none");
      $(currentScreen+" #v_"+lp.columnname).attr("data-hidden", 1);

    } else {
      $(currentScreen+" #w_"+lp.columnname).css("display", "");
      $(currentScreen+" #v_"+lp.columnname).css("display", "");
      $(currentScreen+" #v_"+lp.columnname).attr("data-hidden", 0);

    }
    if(col != lp.columnname && p.common.sidata[lp.columnname])
      kps_handleShowIf(p, lp.columnname);
  }
}


///////////////////////////////
function
kps_collectData(data, screen)
{
  if(!screen)
    screen = currentScreen;
  if(!data._complexData)
    data._complexData = {};
  var attrNames = {'data':1,'link':1,'id':1,'modified':1,'filename':1};
  $(screen).find(".question-value").each(function(){
    if($(this).attr("data-hidden") == 1 ||
       $(this).attr("data-plugin-hidden") == 1)
      return;
    var t = $(this).attr("constrainttype");
    var n = $(this).attr("id").substr(2);
    if(t=="multiLine") {
      data[n] = $(this).find("textarea").val();

    } else if(t=="singleFromArg" || t=="singleFromTable" ||
              t=="multiFromArg"  || t=="multiFromTable" ||
              t=="infotext"      || t=="tableCopy") {
      data[n] = $(this).attr("val");

    } else if(t=="tableRows") { // have to relocate complexData
      var val=$(this).attr("val"), tra=val?JSON.parse(val):[];
      for(var i = 0; i<tra.length; i++) {
        if(tra[i]._complexData) {
          for(var k in tra[i]._complexData)
            data._complexData[k] = tra[i]._complexData[k];
          delete(tra[i]._complexData);
        }
      }
      data[n] = JSON.stringify(tra);

    } else if(t=="foto" || t=="signature") {
      var h = {}, fi = $(this).find("img.fotoImg");
      for(var name in attrNames)
        h[name] = $(fi).attr(name == "data" ? "src" : "data-"+name);
      if(h.id) {
        data._complexData[h.id] = h;
        data[n] = h.id;
      } else {
        data[n] = "";
      }

    } else if(t=="file") {
      var h = {}, fl = $(this).find("a.fileLink");
      for(var name in attrNames)
        h[name] = $(fl).attr(name == "data" ? "href" : "data-"+name);
      if(/^...dbFile.fileid=(.*)/.exec(h.data))
        h.data = "";
      if(h.id) {
        data._complexData[h.id] = h;
        data[n] = h.id;
      } else {
        data[n] = "";
      }

    } else if(t=="groupheader" || t=="groupend") {
      return;

    } else {
      data[n] = $(this).find("input").first().val();
      if(t=="num" && data[n] !== "")    // 0==""
        data[n] = parseFloat(data[n]);

      if(t=="date" && data[n] != "")
        data[n] = kps_fmtDate(t, str2date(data[n])).substr(0,10);
      if(t=="dateTime" && data[n] != "")
        data[n] = str2dtime(data[n]);
    }
  });
}



///////////////////////////////
// returns a hash with bdefid=read|write for each possible bookdefinition.
function
kps_bookRights(parentBook, bDefId)
{
  var ret={};
  if(!bdef.user || !bdef.user.rights || !bdef.roleHash)
    return ret;

  while(parentBook && parentBook.parentbook)    // go to the root book
    parentBook = parentBook.parentbook;
  if(parentBook && !bDefId)
    bDefId = parentBook.bookDefId;

  // bdef.user.rights syntax 5:N05_FARMCOOP=6,N05_FARMREGION=7 6:N05_FARMCOOP=3
  var ra = bdef.user.rights.split(" ");
  for(var i1=0; i1<ra.length; i1++) {
    var rh = ra[i1].split(":");
    if(rh.length != 2)
      continue;

    if(parentBook) {
      var colvals = rh[1].split(/[,=]/), matches=true;
      for(var i2=0; matches && i2<colvals.length; i2+=2) {
        if(colvals[i2] == parentBook.bookDefId) {
          if(colvals[i2+1] != parentBook.bookId)
            matches = false;

        } else if(colvals[i2].indexOf("OWN.") == 0) {
          if(colvals[i2].substr(4) != bDefId)
            matches = false;

        } else {
          var col = parentBook.header[colvals[i2]];
          if(col==undefined || !kps_checkHier(colvals[i2], col, colvals[i2+1]))
            matches = false;

        }
      }
      if(!matches)
        continue;
    }

    var r = bdef.roleHash[rh[0]];
    if(!r)                    // irrelevant for this project
      continue;
    var br = r.split(/[ =]/); // role syntax: 19=write 20=read
    for(var i2=0; i2<br.length; i2+=2) {
      var bdId = br[i2];
      if(!bdId)
        continue;
      if(!ret[bdId] || ret[bdId] == "read")
        ret[bdId] = br[i2+1];
    }
  }
  return ret;
}

// Hash comes from kps_bookRights.
function
kps_canCreateBooks(hash, parent)
{
  for(var bDefId in hash) {
    if(!bdef.book[bDefId] || bdef.book[bDefId].autocreate == "YES")
      continue;
    if(hash[bDefId] == "write" && 
       ((parent && bdef.book[bDefId].parentbookid == parent.bookDefId) ||
        (!parent && !bdef.book[bDefId].parentbookid)))
      return true;
  }
  return false;
}

function                        // bookHier: bookData, usrHier: userRightValue
kps_checkHier(colName, bookHier, usrHier)
{
  var hier, cdef = bdef.cols[colName];
  if(cdef.constrainttype == 'singleFromTable')
    hier = hierHash[cdef.constraintparam.split(" ")[0]];

  if(!hier)
    return bookHier == usrHier;
  if(hier[bookHier] == undefined ||
     hier[usrHier] == undefined)
    return false;
  var b=hier[bookHier].path+"", u=hier[usrHier].path+"";
  return (b.indexOf(u) == 0 &&
          (b.length <= u.length || b.substr(u.length,1) == "/"));
}

function
kps_computeHier(tn)
{
  var tbl=luTables[tn], h={}, lastfnd=0;
  if(tbl.length == 0)
    return;

  log("Compute hierarchy for "+tn);
  for(;;) {
    var fnd = 0;
    for(var i1 = 0; i1<tbl.length; i1++) {
      var r=tbl[i1], p=r.PARENT;
      if(h[r.id]) {
        fnd++; continue;
      }
      if(!p || p == r.id) {
        h[r.id]= { path:r.id, level:0, orderby:r.DISPLAYNAME };
        fnd++; continue;
      }
      if(!h[p])
        continue;
      h[r.id] = { path:h[p].path+"/"+r.id, 
                  level:h[p].level+1, 
                  orderby:h[p].orderby+"/"+r.DISPLAYNAME };
      fnd++;
    }
    if(fnd == tbl.length || fnd == lastfnd)
      break;
    lastfnd = fnd;
  }
  hierHash[tn] = h;

  if(!tbl[0].DISPLAYNAME)
    return;

  // Shadow table for dropdown/select
  var tbl2=[];
  for(var i1=0; i1<tbl.length; i1++) {
    var r = tbl[i1];
    var d = r.DISPLAYNAME;
    if(!h[r.id]) {
      okDialog(tn+": bad hierarchy definition");
      continue;
    }
    if(h[r.id].level)
      d = Array(h[r.id].level+1).join("&nbsp;&nbsp;")+d;
    var r2 = {};
    for(var attr in r)
      r2[attr] = r[attr];
    r2.DISPLAYNAME=d;
    tbl2.push(r2);
  }
  tbl2.sort(function(a,b) { return h[a.id].orderby.localeCompare(
                                   h[b.id].orderby)} );
  for(var i1=0; i1<tbl2.length; i1++)
    tbl2[i1].ORDERBY = i1;
  luTables["hier:"+tn] = tbl2;
}

function
kps_callHooks(topic, param)
{
  if(blockHooks[topic])
    return;
  if(topic == "save") {
    for(var i1=0; i1<screenFns.length; i1++)
      screenFns[i1].redraw = true;
  }

  var pt = pgmHooks[topic];
  if(!pt)
    return;
  var tret = 0;
  for(var i1=0; i1<pt.length; i1++) {
    var ret = pt[i1](param);
    if(typeof(ret) == "number")
      tret += ret;
  }
  return ret;
}

///////////////////////////////////
// Called directly by the configurator
function
kps_smiley(col, min, max, translate)
{
  if(min == undefined) min = 1;
  if(max == undefined) max = 5;
  var reverse;
  if(max < min) {
    var x=min, min=max, max=x;
    reverse = 1;
  }
  var v = $("#v_"+col).attr("val");
  if(v == undefined)
    v = $("#v_"+col+" input").val();
  if(v == undefined) {
    okDialog("Error: wrong smiley definition for "+col);
    return;
  }
    
  v = v.replace(/&#44;/g, ","); // Neat trick to embed , into choicelist values
  if(translate)
    v = translate[v];
  else if(typeof v == "string")
    v = v.replace(/[^\d\.-]/g, "");
  if(v == undefined || v == "")
    v = 1;
  v = parseInt(1+5*(v-min)/(max-min));
  if(v < 1) v = 1;
  if(v > 5) v = 5;
  if(reverse)
    v = 6-v;

  $("#v_"+col+" img.smiley").remove();
  $('<img class="smiley" src="'+imgDir+v+'.png">')
        .insertAfter("#v_"+col+" div.answer p:first");
}


function
Age(n)
{
  var v = $("#v_"+n+" input").val();
  return (new Date((new Date()) - (new Date(v)))).getYear()-70;
}

function
Get(n, col, tbl2,col2)
{
  var v = $("#v_"+n+" input").val();
  if(v == undefined)
    v = $("#v_"+n+" textarea").val();
  if(v == undefined)
    v = $("#v_"+n+" .text").attr("value");
  if(v == undefined)
    v = $("#v_"+n).attr("val");

  if(v == undefined) {  // search for the header value 
    var p = $("div.question-value").first().get(0).param;
    if(p && p.common && p.common.bookdata) {
      var h = p.common.valueHash;
      v = h[n];
    } else {
      v = undefined;
    }
  }

  var pd = bdef.cols[n];
  if(!pd) // may be empty for dynamically created widgets!
    return v;
  if(pd.constrainttype == "tableRows") {
    try{ v = JSON.parse($("#v_"+n).attr("val")); 
      if (col) {
         var n = [];
         for (var i=0; i<v.length; i++) {
           var r = v[i];
           if (r[col])
             n.push(r[col]);
         }
         v = n;
      }
    } catch(e) { v = []; }
  }


  if(!col || pd.constrainttype != "singleFromTable")
    return v;

  // return col from the corresponding table
  function
  resolve(tblName,cName, v, tblName2,colName2)
  {
    var tbl = luTables[tblName];
    if(!tbl)
      return v;
    for(var i1=0; i1<tbl.length; i1++)
      if(tbl[i1].id == v) {
        var c = tblName+"."+v+"."+(cName.toLowerCase());
        if(tr[c])
          return tr[c];
        return tblName2 ? resolve(tblName2,colName2,tbl[i1][cName]) : 
                          tbl[i1][cName];
      }
    return v;
  }

  return resolve(pd.constraintparam.split(" ")[0],col, v, tbl2,col2);
}

// arg: { table:TBL, filter:{COL1:VAL1, COL2:VAL2}, result:COL3 }
function
LuGet(arg)
{
  var tbl = luTables[arg.table], sc = arg.filter;
  if(!tbl)
    return "";
  for(var i1=0; i1<tbl.length; i1++) {
    var r=tbl[i1], fnd=true;
    for(var col in sc)
      if(r[col] != sc[col])
        fnd=false;
    if(fnd)
      return r[arg.result];
  }
  return "";
}

function
kps_Set(n, v)
{
  //log("Set("+n+","+v+")");
  if(n == "longhelp") {
    $(currentScreen).html(v);
    return;
  }

  var pd = bdef.cols[n];
  var ct = (pd ? pd.constrainttype : "");
  $("#v_"+n).attr("val", v);
  if(ct == "infotext") {
    $("#v_"+n+" div.infotext").html(v);
    return;
  }

  var e = $("#v_"+n+" input:first");
  if(e.length) {
    $(e).val(v);
    return;
  }

  e = $("#v_"+n+" select:first");
  if(e.length) {
    $(e).val(v);
    return;
  }

  var e = $("#v_"+n+" textarea:first"); // multiline
  if(e.length) {
    $(e).val(v);
    return;
  }

  if(ct == "singleFromTable") { // Number of entries < 10
    $("#v_"+n+" img.radios").attr("src", imgDir+"no_radio.png");
    $("#v_"+n+" img.radios[val="+v+"]").attr("src", imgDir+"radio.png");
    // set owl-item
    $("#v_"+n+" .fc.container .fc.item").removeClass("clicked");
    if (v)
      $("#v_"+n+" .fc.container .fc.item[value="+v+"]").addClass("clicked");
    return;
  }
  log("Cannot Set "+n+"/"+ct+", widget not implemented");
}

// google maps bug as of 2018-04-12: it defines a global Set native function. A
// JavaScript "direct" function cannot be overwritten, so we get an Exception
// loading the google maps api. Assigning the function to a variable can be
// overwritten though (?). After loading the api, the Set variable has to be
// reassigned.
var Set = kps_Set;

function
SetSuffix(n, v)
{
  $("#v_"+n+" .answer span.suffix").html("&nbsp;"+v);
}

function
CheckDateStartEndOnSave(startField, endField)
{
  return CheckDateStartEnd(startField, endField, true);
}

function
CheckDateStartEndOnChange(startField, endField)
{ 
  return CheckDateStartEnd(startField, endField, false);
}

function
CheckDateStartEnd(startField, endField, onSave)
{
  if (kps_inFinishPage)
     return;
  if (!startField || ! endField)
     return;
  var sDate = Get(startField); 
  var eDate = Get(endField); 
  if (!sDate || !eDate)
     return;
  if (eDate < sDate) {
    var msg =  tr.checkDateStartEnd;
    if (!onSave)
      okDialog(msg);
    return msg;
  }
}

// Iterates over the body table which col belongs to
// Pushes the value of col as id and (if col is singleFromTable) the
// corrsponding DISPLAYNAME as txt to the list
// Filter is the "usual" tablefilter
function
BodyTable(p, col, filter)
{
  var c=bdef.cols[col], tbl=bdef.page[c.pagedefid].tablename, lu;
  if(c.constrainttype == 'singleFromTable')
    lu = luTables[c.constraintparam.split(" ")[0]];
  var data=luTables[tbl], fbHash={}, fltHash={}, fltData = { filter:filter };
  for(var i1=0; i1<data.length; i1++) {
    var r = data[i1];
    if(!kps_filterBody(r, fbHash))
      continue;

    var val=r[col], txt=val;
    if(!val)            // Different subpage
      continue;
    fltHash.valueHash = p.common.valueHash;
    if(filter && !kps_filterIsSet(r, fltHash, fltData)) 
      continue;
    if(p.ro && p.sel != val)
      continue;

    if(lu) {
      var ptr = kps_getTablePtr(c.constraintparam, val);
      if(!ptr) {
        log("ERROR: BodyTable: "+c.constraintparam+", id "+val+" not found");
        continue;
      }
      txt = ptr.DISPLAYNAME;
    }
    p.val.push(val);
    p.txt.push(txt);
    p.orderBy.push(txt);
  }
}

///////////////////////////////////

//////////////////////
// table base longHelp (?)
function
kps_replacePage(tbl, col, filter)
{
  var pScreen = "#content-wrapper > div#d3 > div.level_"+
                        (currentLevel-1)+" > div";
  var param = $(pScreen)[0].param;      // updated by kps_onChange

  var tbl = luTables[tbl];
  if(!tbl) {
    okDialog("kps_replacePage: "+tbl+" not found");
    return;
  }

  param.common.cachedTblLu = {}; // cached values might have changed
  var txt = "kps_replacePage: no value found for "+filter;
  var fltData = { filter:filter };
  for(var i1=0; i1<tbl.length; i1++) {
    if(!kps_filterIsSet(tbl[i1], param.common, fltData))
      continue;
    txt = tbl[i1][col];
    break;
  }
  $(currentScreen).html(txt);
}

///////////////////////////////////
// datetimepicker extension START
$.datepicker._super_updateDatepicker = $.datepicker._updateDatepicker;
$.datepicker._updateDatepicker = function(inst)
{
  var dt = this;
  dt._super_updateDatepicker(inst);
  if(inst.settings.showTime) {
    var nc = '<div class="numberselector">'
    var h = (new Date()).getHours();
    var m = parseInt((new Date()).getMinutes()/5)*5;    // round to 5min
    if(inst.lastVal) {
      var m = inst.lastVal.match(/(..):(..)/);
      if(m) {
        h = parseInt(m[1]);
        m = parseInt(m[2]/5)*5;
      }
    }
    if(m < 10)
      m = '0'+m;

    nc += '<div class="fullnum">';
    for(var i1=0; i1<24; i1++)
      nc += '<div data-nr="'+i1+'">'+i1+'</div>';
    nc += '</div>';
    
    nc += '<div class="fragnum min5">';
    for(var i1=0; i1<60; i1+=5) {
      var j = (i1<10 ? '0'+i1:i1)
      nc += '<div data-nr="'+j+'">:'+j+'</div>';
    }
    nc += '</div></div>';

    inst.dpDiv.append(nc);
    inst.dpDiv.find('div.fullnum [data-nr="'+h+'"]').addClass("active");
    inst.dpDiv.find('div.fragnum [data-nr="'+m+'"]').addClass("active");

    inst.dpDiv.find("div.fullnum div").click(function(){
      inst.dpDiv.find("div.fullnum div").removeClass("active");
      $(this).addClass("active");
    });
    inst.dpDiv.find("div.fragnum div").click(function(){
      inst.dpDiv.find("div.fragnum div").removeClass("active");
      $(this).addClass("active");
      dt._super_selectDate("#"+inst.id);
    });
  }

  setTimeout(function(){  // dialog header is hidden by our header.
    if($("#ui-datepicker-div").position().top < 50)
      $("#ui-datepicker-div").css("top","50px");
  }, 1);
}

$.datepicker._super_selectDate = $.datepicker._selectDate;
$.datepicker._selectDate = function(id, dateStr)
{
  var target = $(id),
      inst = this._getInst(target[0]);
  if(!inst.settings.showTime)
    this._super_selectDate(id, dateStr);
}

$.datepicker._super_selectDay = $.datepicker._selectDay;
$.datepicker._selectDay = function(id, month, year, td)
{
  $(td).closest("table").find("td a").removeClass("ui-state-highlight");
  $(td).find("a").addClass("ui-state-highlight");
  this._super_selectDay(id, month, year, td);
}

$.datepicker._super_formatDate = $.datepicker._formatDate;
$.datepicker._formatDate = function(inst, day, month, year)
{
  var r = this._super_formatDate(inst, day, month, year);
  if(inst.settings.showTime) {
    var h = inst.dpDiv.find(".fullnum .active").attr("data-nr");
    var m = inst.dpDiv.find(".fragnum .active").attr("data-nr");
    if(h < 10)
      h = '0'+h;
    r += " "+h+":"+m;
  }
  return r;
}

// datetimepicker extension END
///////////////////////////////////


///////////////////////////////////
// tableCopy
function
kps_parseConstraintParam(cDef)
{
  if(!cDef.constraintparam)
    return {};
  var cp = cDef.constraintparam.split(/[ \n\r]/), ch={};
  for(var i1=0; i1<cp.length; i1++) {
    var o = cp[i1].indexOf(':');
    if(o > 0)
      ch[cp[i1].substr(0,o)] = cp[i1].substr(o+1);
  }
  return ch;
}

// used in kipusFarmPrint.js
function kps_tableCopyParseParam(cDef) { return kps_parseConstraintParam(cDef) }

function
kps_tableCopyContent(p)
{
  var cDef = bdef.cols[p.columnname];
  var ch = kps_parseConstraintParam(cDef);
  var v = p.common.valueHash[p.columnname];
  if(v) {
    try{ v = JSON.parse(v); } catch(e) { v = []; }
  }
  return kps_tableCopyShow({cDef:cDef, res:(v ? v: []), ch:ch});
}

function
kps_tableCopyShow(e)
{
  if(!e.ch.display)     // tableCopy used for storage, e.g. timeGroup
    return;
  var cArr = e.ch.display.split(",");
  var prf=e.ch.prefix, prfLen=prf.length;
  var h = '';
  h += '<button class="kpsButton round dsc_fold tableCopy" status="down">'+
       '</button>';
  h += '<table id="tbl_'+e.cDef.columnname+'" class="tableCopy">';
  h += '<thead>';
  if (e.res.length > 0)
  for(var i1=0; i1<cArr.length; i1++) {
     var cols = bdef.p2b[bdef.tbldef[e.ch.source].id].bodyPage.cols;
     for(var i2=0; i2<cols.length; i2++) {
       if (cArr[i1] != cols[i2].columnname)
         continue;
       h+= '<th>'+cols[i2].displayname+'</th>';
     }
  }
  h += '</thead><tbody>';
  for(var i1=0; i1<e.res.length; i1++) {
    h += '<tr class="'+(i%2 ? 'odd' : 'even')+'">';
    var fc = false;
    for(var i2=0; i2<cArr.length; i2++) {
      var v = e.res[i1][e.ch.prefix+cArr[i2]];
      if(bdef.cols[cArr[i2]].constrainttype == 'foto') {
        h += '<td><div class="img" data="'+e.ch.source+'/'+cArr[i2]+'/'+
                e.res[i1][e.ch.prefix+'SOURCEID']+'"></div></td>';
      } else {
        if(v == undefined)
          v = "";
        else if (bdef.cols[cArr[i2]].constrainttype == 'singleFromTable' &&
                 luTables[bdef.cols[cArr[i2]].constraintparam])
          v = luTables[bdef.cols[cArr[i2]].constraintparam][v].DISPLAYNAME;
        h += '<td>'+v+'</td>';
        fc = true;
      }
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  $("#v_"+e.cDef.columnname+" div.tableCopy").html(h);
  $("#v_"+e.cDef.columnname).attr("val",JSON.stringify(e.res));

  $("#v_"+e.cDef.columnname+" div.tableCopy div.img[data]").each(function(){
    var img = this;
    var d = $(this).attr("data").split("/");
    db_getAnswer(d[2], d[0], d[3], function(row){
      var v = row[d[1]];
      if(v)
        $(img).css("background-image", "url("+v.substr(v.indexOf(";")+1)+ ")");
    });
  });
  $("#v_"+e.cDef.columnname+" div.tableCopy button").click(function(){
    if($(this).attr("status") == 'down') {
      $(this).attr("status","up");
      $("#v_"+e.cDef.columnname+" div.tableCopy table").hide();
    } else {
      $(this).attr("status","down");
      $("#v_"+e.cDef.columnname+" div.tableCopy table").show();
    }
  });
}

function
kps_tableCopyDo(e)
{
  if(e.target) {
    var cDef = bdef.cols[$(e.target).attr("data-col")];
    var ch = kps_parseConstraintParam(cDef);
    if($(e.target).hasClass("clr"))
      return kps_tableCopyShow({cDef:cDef, res:[], ch:ch});

    var pb = bookHash[screenFns[0].args[0].book.bookId]; // Find parent book
    while(pb.parentbook)
      pb = pb.parentbook;

    // Find source table: 217 -> 27;
    var sbDefId = bdef.p2b[bdef.tbldef[ch.source].id].id;
    var sbookid;
    for(var bId in bookHash) {
      var b = bookHash[bId];
      if(b.bookDefId == sbDefId && 
         (b.bookId==pb.bookId || 
          (b.parentbook && b.parentbook.bookId==pb.bookId))) {
        sbookid = b.bookId;
        break;
      }
    }

    db_getAnswerRows(
      "kps_answer.bookId="+sbookid+" AND kps_answer.tableName='"+ch.source+"'",
      function(res) {
        kps_tableCopyDo({res:res, ch:ch, cDef:cDef });
      });
      return;
  }

  if(e.res) {
    if(e.res.length == 0)
      return okDialog(tr.tableCopyEmpty);
    var fHash={};

    if(e.ch.filter) {                   // filter
      var fArr=e.ch.filter.split(",");
      for(var i1=0; i1<fArr.length; i1++) {
        var kv=fArr[i1].split("=");
        fHash[kv[0]] = kv[1];
      }
      var r2=[];
      for(var i1=0; i1< e.res.length; i1++) {
        var r = e.res[i1], isOk = true;
        if(r._rowId == 0)
          continue;
        for(var f in fHash)
          if(r[f] != fHash[f])
            isOk = false;
        if(isOk)
          r2.push(r);
      }
      e.res = r2;
    }

    var s = screenFns[0].args[0], res=[];
    var tgtId = s.book.bookId+"/"+s.data._rowId;
    var prf=e.ch.prefix, prfLen=prf.length, tDef=bdef.tbldef[e.ch.target];
    for(var i1=0; i1< e.res.length; i1++) {
      var r = e.res[i1], l={};
      r.SOURCEID = r._bookId+"/"+r._rowId;
      r.TARGETID = tgtId;
      for(var i2=0; i2<tDef.cols.length; i2++) {  // Copy everything possible
        var cNameS = tDef.cols[i2].columnname, cNameT=cNameS;
        if(cNameS.substr(0,prfLen)==prf)
          cNameS = cNameS.substr(prfLen);
        if(r[cNameS]) {
          if(bdef.cols[cNameS] && bdef.cols[cNameS].constrainttype == 'foto')
            l[cNameT] = "";
          else
            l[cNameT] = r[cNameS];
        }
      }
      res.push(l);
    }
    e.res = res;
    kps_tableCopyShow(e);
  }
}
// tableCopy END
///////////////////////////////////

///////////////////////////////////
// qrcode START. TODO: remove popscreen callback in stopVideo
// Using QRCODE reader Copyright 2011 Lazar Laszlo
// http://www.webqr.com
// Options:
//   prefix:<string> (without trailing /)
//   regexp:<string>
//   multi:0|1
//   noKeyboard:0|1
var kps_qrInitialized, kps_qrActive;
function
kps_qrSetMulti(cDef, v)
{
  var ch = kps_parseConstraintParam(cDef);
  if(!ch.multi)
    return;
  var p = $("#v_"+cDef.columnname+" > div.answer > p");
  $(p).find("div.qrmulti").remove();
  if(v == '')
    return;
  var isRo = ($(p).find("button").length == 0);
  var html = '<div class="qrmulti">', a=v.split(",");
  if(a.length == 1 && isRo)
    return;
  for(var i1=0; i1<a.length; i1++)
    html +='<div>'+(isRo ? '' : '<div class="xbutton"></div>')+
                '<div class="content">'+a[i1]+'</div></div>';
  html += '</div>';
  $(p).append(html);
  $(p).find("div.qrmulti div.xbutton")
      .css("cursor", "pointer")
      .click(function(e) {
        var val = $(this).parent().find("div.content").html();
        var a2=[];
        for(var i1=0; i1<a.length; i1++)
          if(a[i1] != val)
            a2.push(a[i1]);
        val = a2.join(",");
        $(p).find("input").val(val);
        kps_onChange(cDef, val);
      });
}

function
kps_qrBlur()
{
  var colName = $(this).parent().find("button").attr("data-col");
  if(!colName) // readonly mode
    return;
  var cDef = bdef.cols[colName];
  var ch = kps_parseConstraintParam(cDef);
  if(ch.regexp) {
    var re = new RegExp(ch.regexp);
    var v = $(this).val();
    if(!re.test(v)) {
      log("QR:"+v+" does not match "+ch.regexp);
      return okDialog(tr.qrBadRegexp);
    }
  }
}


function
kps_fotoScan(e)
{
  function
  takeFoto(btn)
  {
    log("takeFoto");
    $(".capturediv").addClass("spinning");
    $("div.blackdiv").remove();
    $("#fdiv").parent().parent().append("<div class='blackdiv'></div>");
    var v = $("#fvideo").get(0);
    if(v) {
      v.pause();
      if (opt.video.flash)
        v.stream.getVideoTracks().forEach(function (track) {
          // the light will be on as long the track exists
          track.applyConstraints({
            advanced: [{torch: true }]
          });
        });
      var theImageCapturer = new ImageCapture(v.stream.getVideoTracks()[0]);
      theImageCapturer.takePhoto()
        .then(function(blob) {
         var reader = new window.FileReader();
           reader.onloadend = function() {
            kps_popScreen(undefined, false, stopVideo);

            var img = new Image();
            img.onload = function() { // resize the image, if its too big.
              var maxwh;
              $(btn).parent().closest(".question-value").each(function(){
                if(this.param.constraintparam)
                  maxwh = this.param.constraintparam.match(/(\d+) *x *(\d+)/)
              });
              if(maxwh && maxwh.length == 3)
                result = kps_resizeImage(img, maxwh[1], maxwh[2],reader.result);
              var fi = $(btn).parent().find("img").first();
              $(fi).attr('src', result);
              $(fi).attr('data-modified', 'true');
              $(fi).attr('data-filename', 'Camera');
              if(!$(fi).attr('data-id')) {
                $(fi).attr('data-id', newUUID());
              }
              $(fi).removeAttr("data-link");
              kps_fotoDelFn($(btn).parent().find("div.delete"));
            }
            img.src = reader.result;
            $(btn).parent().find("div.delete").css("display", "block");
            kps_fotoDelFn($(btn).parent().find("div.delete"));
            $(btn).parent().closest("div.question-value").each(function(){
              kps_onChange(this.param, "CHANGED");
            });
          }
          reader.readAsDataURL(blob); 
        })
        .catch(function(err) { log('Error: ' + err) });
    } 
  }

  if(!e.target)
    return;
  log("kps_fotoScan");
  var cDef = bdef.cols[$(e.target).attr("data-col")];
  var ch = kps_parseConstraintParam(cDef);

  var btn = this;
  stopVideo();
 
  var cp = $(currentScreen).parent();
  var opt = { video:{ facingMode: "environment", width:{ideal:640}, height:{ideal:480} }, audio:false };
  if(ch && ch.capture == "user")
    opt.video.facingMode = "user";
  function removePopFromHook(name) {
    var found = null;
    for (var i=0; i<pgmHooks.popScreen.length; i++) {
      if (pgmHooks.popScreen[i].name == name) {
        found = i;
      }
    }
    if (found != null)
      pgmHooks.popScreen.splice(found, 1);
  }
  function
  doStream()
  {
    navigator.mediaDevices.getUserMedia(opt).then(
      function(stream){
        $(cp).animate({ scrollTop:$(cp).scrollTop()+
                        $(btn).closest(".question-wrapper").position().top }, 500);

        kps_newScreen(tr.takePhoto);
        kps_showScreen();
        $(currentScreen).append(
          '<div id="fdiv">'+
            '<video id="fvideo" autoplay muted></video>'+
          '</div><div class="capturediv"></div>'+
          (platform.platform != "desktop"?'<div class="flashdiv off"></div>':'')+
          (ch && ch.capture == "both" && platform.platform != "desktop"?'<div class="flipdiv"></div>':'')
          );
        var video = $("#fvideo").get(0);
        var input = $(btn).parent().find("input");
        //video.src = window.URL.createObjectURL(stream);
        video.srcObject = stream;
        video.stream = stream;
        removePopFromHook("stopVideo");
        pgmHooks.popScreen.push(stopVideo);
        $(".capturediv").click(function() { 
           $(".capturediv").unbind("click");
           takeFoto(btn); 
        });
        $(".flipdiv").click(function() { 
           opt.video.facingMode = (opt.video.facingMode == "user"? "environment":"user");
           var v = $("#fvideo").get(0);
           if(v) {
             v.pause();
             v.src="";
             v.stream.getVideoTracks().forEach(function (track) {
               track.stop();
             });
           }
           doStream();
        });
        $(".flashdiv").click(function() {
          var flashOn = $(this).hasClass("off");
          if (flashOn) {
            $(this).removeClass("off");
            $(this).addClass("on");
          } else {
            $(this).removeClass("on");
            $(this).addClass("off");
          }
          opt.video.flash = flashOn;
        });
            }, 
            function(error){
              okDialog("Cannot init camera:"+error.message);
            });
        }

  if(!navigator.mediaDevices) {   // Older Chrome?
    log("fotoScan bug:"+navigator.userAgent);
    doStream();

  } else {
    navigator.mediaDevices.enumerateDevices().then(function(mdil) {
      for(var i1=0; i1 < mdil.length; i1++)
        if(mdil[i1].kind.indexOf('video') == 0 &&
           mdil[i1].label.indexOf("facing front") < 0)
          opt.video.deviceId = mdil[i1].deviceId; // MediaStream:id
      doStream();
    });
  }

  function
  stopVideo()
  {
    log("stopVideo");
    var v = $("#fvideo").get(0);
    if(v) {
      v.pause();
      v.src="";
      v.stream.getVideoTracks().forEach(function (track) {
        track.stop();
      });
      v = null;
    }
    $("#fdiv").remove();
    removePopFromHook("stopVideo");
  }
}

function
kps_qrScan(e)
{
  if(!e.target)
    return;
  var cDef = bdef.cols[$(e.target).attr("data-col")];
  var ch = kps_parseConstraintParam(cDef);

  var btn = this;
  var btnTxt = $(btn).html();
  stopVideo();
  if(btnTxt == tr.qrScanAbort) {
    if (typeof(QRReader) != "undefined")
      QRReader.destroy(); 
    return;
  } 
  $(btn).html(tr.qrScanAbort);

  var cp = $(currentScreen).parent();
  $(cp).animate({ scrollTop:$(cp).scrollTop()+
                  $(btn).closest(".question-wrapper").position().top }, 500);

  $(btn).parent().append(
    '<div id="qrdiv">'+
      '<video id="qrvideo" autoplay></video>'+
      '<canvas id="qr-canvas" width="640" height="480"'+
                'style="display:none"></canvas>'+
    '</div>'
    );

  var video = $("#qrvideo").get(0);
  var input = $(btn).parent().find("input");
  var opt = { video:{ width:{ideal:640}, height:{ideal:480} }, audio:false };
  function
  scanCallback(v) {
//log("scanCallback " + v);
    stopVideo(); 
    if(ch.prefix) {
      if(v.indexOf(ch.prefix) != 0) {
        log("QR:"+v+" has no prefix "+ch.prefix);
        return okDialog(tr.qrBadPrefix);
      }
      v = v.substr(ch.prefix.length+1);
    }
    if(ch.regexp) {
      var re = new RegExp(ch.regexp);
      if(!re.test(v)) {
        log("QR:"+v+" does not match "+ch.regexp);
        return okDialog(tr.qrBadRegexp);
      }

    }
    if(ch.multi)
      v = removeDup($(input).val()+","+v);
    $(input).val(v);
    kps_onChange($(input).get(0).data_p, v);
    if (typeof(QRReader) != "undefined")
      QRReader.destroy();
  }
  function
  doStream()
  {
    navigator.mediaDevices.getUserMedia(opt).then(
      function(stream){
        //video.src = window.URL.createObjectURL(stream);
        video.srcObject = stream;
        video.stream = stream;
        if(!kps_qrInitialized) {
          kps_qrInitialized = 1;
          pgmHooks.popScreen.push(stopVideo);
        }
        if (typeof qrcode != "undefined") {
          qrcode.callback = function(v){ scanCallback(v); };
          kps_qrActive = 1;
          if (typeof(QRReader) != "undefined") {
            QRReader.init(video, "js/qrscan/");
            setTimeout(altCapture, 500);
          }  
          else
            setTimeout(capture, 500);
        } else {
          log("QR not loaded"); 
        }
      }, 
      function(error){
        okDialog("Cannot init camera:"+error.message);
      });
  }

  if(!navigator.mediaDevices) {   // Older Chrome?
    log("QR bug:"+navigator.userAgent);
    doStream()

  } else {
    navigator.mediaDevices.enumerateDevices().then(function(mdil) {
      for(var i1=0; i1 < mdil.length; i1++)
        if(mdil[i1].kind.indexOf('video') == 0 &&
           mdil[i1].label.indexOf("facing front") < 0)
          opt.video.deviceId = mdil[i1].deviceId; // MediaStream:id
      doStream();
    });
  }

  function
  removeDup(v)
  {
    var h={}, a=v.split(',');
    for(var i1=0; i1<a.length; i1++)
      if(a[i1] != '')
        h[a[i1]] = 1;
    a=[];
    for(var k in h)
      a.push(k);
    a.sort();
    return a.join(",");
  }

  function
  stopVideo()
  {
    if(!kps_qrActive)
      return;
    var v = $("#qrvideo").get(0);
    if(v) {
      v.pause();
      v.src="";
      v.stream.getVideoTracks().forEach(function (track) {
        track.stop();
      });
      v = null;
    }
    $("#qrdiv").remove();
    $("button.qrcode").html(tr.qrScan);
    kps_qrActive = 0;
  }

  var gCtx = $("#qr-canvas").get(0).getContext("2d");
  function
  altCapture()
  {
    if(!kps_qrActive)
      return;
    var v = $("#qrvideo").get(0);
    gCtx.drawImage(v, 0, 0);
    QRReader.scan(function (result) {
      scanCallback(result);
    });
  }
  function
  capture()
  {
    if(!kps_qrActive)
      return;
    gCtx.drawImage(video, 0, 0);
    try {
      qrcode.decode();
    } catch(e) {
      log(e);
      setTimeout(capture, 500);
    };
  }
}
// qrcode END
///////////////////////////////////

///////////////////////////////////
// radioTable START
// rowTable: lookup table name for the rows to show
// rowCol:   column in the tableCopy target:table to store the selected rowId
// colTable: lookup table name for the columns to show
// colCol:   column in the tableCopy target:table to store the selected colId
// filter:   c1=c2: c1: columnName in the rowTable, c2: visible widgetName
function
kps_radioTable(rowTable, rowCol, colTable, colCol, filter)
{
  var p = jsChangeColumn;
  if(p.constrainttype != "tableCopy")
    return okDialog(p.columnname+": kps_radioTable must be tableCopy");
  var ch = kps_parseConstraintParam(bdef.cols[p.columnname]);
  var p = jsChangeColumn;
  if(p.constrainttype != "tableCopy")
    return okDialog(p.columnname+": kps_timeGroup2 must be tableCopy");
  var ch = kps_parseConstraintParam(bdef.cols[p.columnname]);

  var el = $(currentScreen).find("#v_"+p.columnname);
  var data = p.common.valueHash[p.columnname];
  data = (data ? JSON.parse(data) : []);
  var dh = {};
  for(var i1=0; i1<data.length; i1++)
    dh[data[i1][rowCol]] = i1;
  var s = screenFns[0].args[0];
  var tgtId = s.book.bookId+"/"+s.data._rowId;

  var ct = luTables[colTable];
  if(ct[0].ORDERBY != undefined)
    ct.sort(function(a,b){ return a.ORDERBY - b.ORDERBY });
  else
    ct.sort(function(a,b){ return a.DISPLAYNAME.localeCompare(b.DISPLAYNAME) });

  var rt = luTables[rowTable];
  if(rt[0].ORDERBY != undefined)
    rt.sort(function(a,b){ return a.ORDERBY - b.ORDERBY });
  else
    rt.sort(function(a,b){ return a.DISPLAYNAME.localeCompare(b.DISPLAYNAME) });
  
  var flt;
  if(filter) {
    flt = filter.split("=");
    var row = kps_getTablePtr(bdef.cols[flt[1]].constraintparam, 
                              p.common.valueHash[flt[1]]);
    flt[2] = row ? (new RegExp("(^|,)"+row.DISPLAYNAME+"(,|$)")) : "";
    if(bdef.cols[flt[1]].changedHash) { // only needed if filter is on this page
      bdef.cols[flt[1]].changedHash["radioTable:"+p.columnname] = function() {
        jsChangeColumn=p;
        $(el).attr("val", "");
        kps_radioTable(rowTable, rowCol, colTable, colCol, filter);
      };
    }
  }

  var htmlTh='', htmlRow='', htmlCol='';
  for(var i1=0; i1<ct.length; i1++) {
    htmlTh  += "<th><span>"+ct[i1].DISPLAYNAME+"</span></th>";
    htmlRow += "<td data-col='"+ct[i1].id+
                "'><img class='radios' src='css/images/no_radio.png'></td>";
    htmlCol += "<col>";
  }
  var html = "<table class='radioTable'>"+
             "<colgroup><col class='name'>"+htmlCol+"</colGroup>"+
             "<thead><tr><th></th>"+htmlTh+"</tr></thead><tbody>";
  for(var i1=0; i1<rt.length; i1++) {
    if(flt && flt[2] && !rt[i1][flt[0]].match(flt[2]))
      continue;
    html += "<tr data-row='"+rt[i1].id+"'><td class='rowName'>"+
                rt[i1].DISPLAYNAME+'</td>'+htmlRow+'</tr>';
  }
  html += "</tbody></table>";
  $(el).find("div.answer").html(html);

  $(el).find("table.radioTable img")
    .css("cursor", "pointer")
    .click(function(){
      if(screenFns[0].args[0].ro)
        return;
      var r = $(this).closest("tr").attr("data-row");
      var c = $(this).closest("td").attr("data-col");
      $(this).closest("tr").find("img").attr("src", "css/images/no_radio.png");
      $(this).attr("src", "css/images/radio.png");
      if(dh[r] == undefined) {
        dh[r] = data.length;
        data.push({});
        data[dh[r]][ch.prefix+"TARGETID"] = tgtId;
        data[dh[r]][rowCol] = r;
      }
      data[dh[r]][colCol] = c;
      $(el).attr("val", JSON.stringify(data));
    });

  for(var i1=0; i1<data.length; i1++) {
    $(el).find("table.radioTable tr[data-row="+data[i1][rowCol]+"] "+
                                "td[data-col="+data[i1][colCol]+"] img")
         .attr("src", "css/images/radio.png");
  }
}
// radioTable end
///////////////////////////////////

///////////////////////////////////
// tableRows
function
kps_addTableRows(p, ro)
{
  var valNode = currentScreen+" div#v_"+p.columnname;
  var ch = kps_parseConstraintParam(p);

  if(ch.expandColumn) {
    $(valNode+" button.add").hide();
    
  } else {
    $(valNode+" button.add")
      .css("cursor","pointer")
      .click(function(){editRow({})});
  }

  var contentDiv = $(valNode +" div.tableRowsContent");
  var cs = currentScreen;

  var pd = bdef.tbldef[ch.target];
  if(!pd)
    return okDialog("Bad tableRows definition for "+p.columnname+": table "+
                    ch.target+" is missing");
    
  pd.cols.sort(function(a,b){ return a.columnorder-b.columnorder; });
  var trData = [], val = p.common.valueHash[p.columnname];

  if(val && val != '[]') {
    // extract _complexData to each single row
    trData = JSON.parse(val);
    for(var i1=0; i1<trData.length; i1++) {
      var row = trData[i1];
      row._complexData={};
      for(var key in row) {
        var c = bdef.cols[key];
        if(!c || !row[key])
          continue;
        if(!(c.constrainttype == 'foto' ||
             c.constrainttype == 'signature' ||
             c.constrainttype == 'file'))
          continue;
        row._complexData[row[key]] = p.common.valueHash._complexData[row[key]];
      }
    }
    $(valNode).attr("val", JSON.stringify(trData));

  } else if(ch.expandColumn) {
    var tbl = bdef.cols[ch.expandColumn].constraintparam;
    if(!tbl || !luTables[tbl]) {
      okDialog("Bad expandColumn definition for "+p.columnname+"<br>"+
                (tbl ? "table "+tbl+" is not a lookuptable" :
                       "expandColumn definition is missing"));
    } else {
      var tbl = luTables[tbl];
      tbl.sort(function(a,b) {
        if(a.ORDERBY)
          return a.ORDERBY-b.ORDERBY;
        return a.DISPLAYNAME.localeCompare(b.DISPLAYNAME);
      });
      for(var i1=0; i1<tbl.length; i1++) {
        var h = {};
        h[ch.prefix+"INDEX"] = i1;
        h[ch.expandColumn] = tbl[i1].id;
        trData.push(h);
      }
    }
  }
  drawAll();

  function
  editRow(erParam)
  {
    var origVh = erParam.origVh;
    var cName= ch.prefix+"INDEX";
    if(!bdef.cols[cName])
      return okDialog(cName+" column missing in "+ch.target);
    cName= ch.prefix+"TARGETID";
    if(!bdef.cols[cName])
      return okDialog(cName+" column missing in "+ch.target);
    kps_newScreen(p.displayname);

    var vh = { _complexData:p.common.valueHash._complexData };
    if(origVh)
      for(var k in origVh)
        vh[k] = origVh[k];
    for(var k in p.common.valueHash) // needed for showif, etc.
      if(k.indexOf(ch.prefix) != 0)
        vh[k] = p.common.valueHash[k];

    var param = { common:{valueHash:vh}, col2tbl:{} };
    erParam.beforeChangedData = { _complexData:vh._complexData};
    for(var i1=0; i1<pd.cols.length; i1++) {
      var c = pd.cols[i1];
      c.common = param.common;
      c.table = pd;
      param.col2tbl[c.columnname] = pd;
      kps_addWidget(c);
      erParam.beforeChangedData[c.columnname] = vh[c.columnname];
    }
    kps_finishPageFn();

    kps_addButton(origVh ? tr.save:tr.add, "save book", function() {
      var data = (origVh ? origVh : {});
      kps_collectData(data);
      if(!kps_checkParam(pd.cols, param.col2tbl, data))
        return;
      if(!origVh) {
        if(pd.uniquecols) {
          var rule = kps_digestUniqueRule(pd.uniquecols);
          for(var i1=0; i1<trData.length; i1++)
            if(!kps_checkUnique(rule, trData[i1], data))
              return;
        }
        data[ch.prefix+"INDEX"] = trData.length+1;
        var pvh = p.common.valueHash;
        data[ch.prefix+"TARGETID"] = pvh._bookId+"/"+pvh._rowId;
        trData.push(data);
      }
      $(valNode).attr("val", JSON.stringify(trData));
      drawAll();
      kps_popScreen();
    });
    kps_showScreen();
  }

  function
  drawOne(idx, origVh)
  {
    $(contentDiv).append("<div class='tableRow' data-row='"+idx+"'></div>");
    currentScreen = cs+" #v_"+p.columnname+" > > > > div[data-row="+idx+"]";
    var lg = lastGroup;
    lastGroup = undefined;
    lastGlueWithNext = "NO";

    var lcs = $(currentScreen);
    if(!ro && bdef.user.status != "LOCKED")
      $(lcs).append(    // 7ms
        '<div class="buttonRow">'+
          (ch.noDelete == "true" ? '':'<button class="delete">Delete</button>')+
          '<button class="edit">Edit</button>'+
        '</div>');
    var vh = { _complexData:p.common.valueHash._complexData };
    if(origVh)
      for(var k in origVh)
        vh[k] = origVh[k];
    for(var k in p.common.valueHash) // needed for showif, etc.
      if(k.indexOf(ch.prefix) != 0 && k != "_complexData")
        vh[k] = p.common.valueHash[k];

    insideTableRows = true;
    var param = { common:{valueHash:vh}, col2tbl:{} }
    for(var i1=0; i1<pd.cols.length; i1++) {
      var c = pd.cols[i1];
      c.common = param.common;
      c.table = pd;
      param.col2tbl[c.columnname] = pd;
      if(vh[c.columnname] != undefined && vh[c.columnname] != "")
        kps_addWidget(c, true, undefined, undefined, undefined, true);
    }
    kps_finishPageFn(lcs);      // showIf handling
    insideTableRows = false;
    $(lcs).find("div[id]").removeAttr("id");
    $(lcs).find(".question-value").each(function(){this.param=undefined});
    currentScreen = cs;
    lastGroup = lg;
    lastGlueWithNext = "NO";
  }

  function
  drawAll()
  {
    $(contentDiv).html("");
    trData.sort(function(a,b) { return a[ch.prefix+"INDEX"] -
                                       b[ch.prefix+"INDEX"] });
    for(var i1=0; i1<trData.length; i1++)
      drawOne(i1, trData[i1]);
    if(!ch.expandColumn && ch.maxNo)
      if(trData.length >= ch.maxNo)
        $(valNode+" button.add").hide();
      else
        $(valNode+" button.add").show();
      
    $(contentDiv).find(".question-value").attr("data-hidden", 1);

    $(contentDiv).find("button.edit")
      .css("cursor","pointer")
      .click(function(){
        var idx = $(this).closest(".tableRow").attr("data-row");
        editRow({origVh:trData[idx]});
      });

    $(contentDiv).find("button.delete")
      .css("cursor","pointer")
      .click(function(){
        var idx = $(this).closest(".tableRow").attr("data-row");
        trData.splice(idx,1);
        for(var i1=0; i1<trData.length; i1++)
          trData[i1][ch.prefix+"INDEX"] = i1;
        $(valNode).attr("val", JSON.stringify(trData));
        drawAll();
      });
  }
}

// tableRows end
///////////////////////////////////

/* DEBUGGING */
/* TIMER: override the original functions. Add debugging to see who is calling
(function(w) {
    var oldST = w.setTimeout;
    var oldSI = w.setInterval;
    var oldCI = w.clearInterval;
    var timers = [];
    w.timers = timers;
    w.setTimeout = function(fn, delay) {
        var id = oldST(function() { fn && fn(); removeTimer(id); }, delay);
        timers.push(id);
        return id;
    };
    w.setInterval = function(fn, delay) {
        var id = oldSI(function(){ fn && fn(); }, delay);
        timers.push(id);
        return id;
    };
    w.clearInterval = function(id) {
        oldCI(id);
        removeTimer(id);
    };
    w.clearTimeout = w.clearInterval;

    function removeTimer(id) {
        var index = timers.indexOf(id);
        if (index >= 0)
            timers.splice(index, 1);
    }
}(window));
*/

function
kps_stacktrace()
{
  var x = arguments.callee.caller, s="", n=0;
  while(x && n < 20) {
    s += " <= "+ x.name;
    x = x.caller;
    n++;
  }
  return s;
}


//////////////////////////////////
// Disable the back button
function
kps_backbutton()
{
  location.href += "#";
  window.onhashchange = function () {
    if(location.hash != "#!") {
      location.hash = "#!";
      if(currentLevel && currentLevel > 1 && !kps_callHooks("backButton"))
        kps_doBack();
    }
  };
}

function
image_hover_enter(el)
{
  var src = '../dbImage?'+$(el).attr('data-link');
  $("#imageView img").remove();
  $("#imageView").append("<img src="+src+"></img>");
  $("#imageView").click(function() {
    $("#imageView").hide();
    $("#imageView img").remove();
  });
  $('#imageView img').load(function(){
    $("#imageView").show();
    if ($(window).width() < $(window).height())
      // portrait
      $(this).css({
          "width": "100%",
          "height":  "auto",
      });
    else
      // landscape
    $(this).css({
        "width": "auto",
        "height":  "100%",
    });
    $(this).center();
  });
}

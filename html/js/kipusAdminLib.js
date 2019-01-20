/* Copyright KI-AG 2013-2019, Project KIPUS */

var bcUser,bcPasswd;
var trHtml={};
var trSave={}; // needed as backup for switching back to english after once switched to another language
var prefLang, prefStyle, prgName, debug;
var backendPrefix = document.location.pathname;
backendPrefix = backendPrefix.substr(0,backendPrefix.lastIndexOf('/'));
var lastCallTime = (new Date()).getTime();
var bCalls = [];

function
log(txt)
{
  var d = new Date();
  txt = d.toTimeString().substring(0,8)+"."+(d.getMilliseconds()%1000)+" "+
        txt;
  if(typeof window.console != "undefined")
    console.log(txt);
}

function
okDialog(txt, callbackfn)
{
  $("#page-content-wrapper").append("<div id='dlg_errorMessage'></div>");
  $("div#dlg_errorMessage").html(txt);
  $("div#dlg_errorMessage").dialog({
    dialogClass:"no-close", modal:true, width:"auto",
    buttons: [{text:"OK", click:function(){
      $(this).dialog("close");
      $("div#dlg_errorMessage").remove();
      if (callbackfn)
        callbackfn();
    }}]
  });
  if(txt.length < 132)
    log(txt);
  else
    log(txt.substr(0,132)+"...");
}

function
yesNoDialog(txt, yesTxt, yesFn, noTxt, noFn)
{
  $("#page-content-wrapper").append("<div id='dlg_errorMessage'></div>");
  $("div#dlg_errorMessage").html(txt);
  $("div#dlg_errorMessage").dialog({
    dialogClass:"no-close", modal:true, width:"auto",
    buttons: [
    {text:yesTxt, click:function(){
      if(yesFn)
        yesFn();
      $(this).dialog("close");
      $("div#dlg_errorMessage").remove();
    }},
    {text:noTxt, click:function(){
      if(noFn)
        noFn();
      $(this).dialog("close");
      $("div#dlg_errorMessage").remove();
    }}]
  });
}

/////////////////////////////////////
// fmt contains {1}, {2}, ...
function
sprintf() {
  var formatted = arguments[0];
  for (var i = 1; i < arguments.length; i++) {
    var regexp = new RegExp('\\{'+i+'\\}', 'gi');
    formatted = formatted.replace(regexp, arguments[i]);
  }
  return formatted;
};


function
showAlert(message, type)
{
  if (type == "warning")
    okDialog("Warning: " + message);
  else if (type == "error")
    okDialog("Error: " + message);
  else {
    log(message);
    /*$(".alert").alert('close'); 
    $(".alert-container").append("<div class='alert alert-"+type+"'>" + 
        "<button type='button' class='close' data-dismiss='alert'>×</button>" +
        message + "</div>");*/
  }
}


function
check_regexp(el, regexp, prefix)
{
  var ro = $(el).is('[readonly]');
  var patt = new RegExp(regexp);
  var res = patt.test(prefix?prefix+el.value:el.value);
  var span = $(el).parent().find(".glyphicon");
  if (!ro && (!res || el.value.length == 0)) {
    $(el).parent().addClass("has-error").removeClass("has-success");
    $(span).removeClass("glyphicon-ok").addClass("glyphicon-warning-sign");
    var nr = $(span).attr("tooltipnr");
    $(span).tooltip({title:trHtml.tooltip[(nr?nr:0)]}).tooltip('show');
    window.setTimeout(function() { $(span).tooltip('hide'); }, 2000);
  } else {
    $(span).parent().addClass("has-success").removeClass("has-error");
    $(span).removeClass("glyphicon-warning-sign").addClass("glyphicon-ok");
    $(span).tooltip('destroy');
  }
}

function
bc_handleFail(fn, err, failFn, failPar)
{
  bCalls.pop();
  if (bCalls.length == 0) {
    $("img.waiting").remove();
    $(".headtitle span.waiting").hide();
    $("#snackbar").removeClass("fadein").addClass("fadeout");
  }
  if(failFn) {
    log("backendCall "+fn+" FAILED: "+err+" (handled)");
    failFn(err, failPar);
  } else {
    if(err == "")
      err = "<br>This is likely due to an internet connection problem.";
    //okDialog("backendCall "+fn+" FAILED: "+err, doReload);
    okDialog(err);
  }
}

function
backendCall(fn, data, resultFn, resultPar, failFn, failPar)
{
  if (!bCalls.length) {
    $("#snackbar").text("Waiting ...");
    $("#snackbar").addClass("fadein").removeClass("fadeout");
  }
  bCalls.push(fn);
  $(".headtitle span.waiting").show();
  
  if (!navigator.onLine)
    return bc_handleFail(fn, "Please check your internet connection.");

  var started = (new Date()).getTime();
  data.function = fn;
  data.username = bcUser;
  data.password = bcPasswd;
  var ax = $.ajax({ dataType:"json",
                    cache:false, url:backendPrefix+"/bc" + (fn == "importProject" ? "?"+started:""),
                    type:"POST", contentType: 'application/json; charset=utf-8',
                    data:JSON.stringify(data) });
  ax.done(function(res) {
    if(typeof(res) == 'object' && res.error)
      return bc_handleFail(fn, "Server returned error: " + res.error, failFn, failPar);
    bCalls.pop();
    if (bCalls.length == 0) {
      $("img.waiting").remove();
      $(".headtitle span.waiting").hide();
      $("#snackbar").removeClass("fadein").addClass("fadeout");
    }
    var sfx = " finished";
    if(typeof res.length == "number") 
      sfx = " returned "+res.length+ " rows";
    sfx = (fn=="tableSelect" || fn=="tableUpdate" ? " "+data.tableName : "")+sfx;
    log("bC: "+fn+sfx+" in "+((new Date()).getTime()-started)+" msec");
    if(resultFn)
      resultFn(res, resultPar);
    var seconds = (started - lastCallTime)/1000;
    lastCallTime = started; 
    if (seconds / 3600 > 4) {
      // more than 4 hours inactivity, do reload
      console.log("more than 4 hours inactivicy, log out user");
      logout();
    }
  })
  .fail(function(req, stat, err) {
    $(".headtitle span.error").show();
    return bc_handleFail(fn, "Please check your internet connection.");
  });
}



/////////////////////////////////////
function
translateHtml(pgm, lang, nextFn, param, initial=true)
{
  if (trSave[lang]) {
    // load from trSave
    $("[trid]").each(function() {
      var id = $(this).attr("trid");
      if (trSave[lang][id])
        $(this).html(trSave[lang][id]);
      else
        log("Missing translation for "+id);
    });
    nextFn(param);
    return;
  } else {
    trSave[lang] = {};
  }
  if(0) { // change to 1 to dump translations to the console
    var t = {}; // unique...
    $("[trid]").each(function() {
      var id = $(this).attr("trid");
      var txt = $(this).html()
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;");
      t[id] = txt;
    });
    for(i in t)
      log("<trans-unit id='"+i+"'><source>"+t[i]+"</source></trans-unit>")
  }

  if(!param.htmlStarted)
    param.htmlStarted = (new Date()).getTime();

  if(initial && (lang == "en-US" || lang == "en")) {  // Speedup
    nextFn(param);
    return;
  }

  //var fName = "translations/"+pgm+"/html-"+lang+".xml";
  var fName = "projects/ADMIN/"+pgm+"_"+lang+".xml";
  $.ajax({ url:fName })
  .done(function(data) {
    $("[trid]").each(function() {
      var id = $(this).attr("trid");
      var tr = $(data).find("#"+id);
      if(tr) {
        var txt = $(tr).find("target").text();
        if(!txt)
          txt = $(tr).find("source").text();
        if(txt) {
          $(this).html(txt);
          trSave[lang][id] = txt.replace(/&amp;/g, "&");
        }
      } else {
        log("Missing translation for "+id);
      }
    });
    log("Loading "+fName+" took "+
                ((new Date()).getTime()-param.htmlStarted)+" msec");
    nextFn(param);
  })
  .fail(function() {
    log("Failed loading translation " + fName);
    var d = lang.split("-");
    if(d.length == 2)
      return translateHtml(pgm, d[0], nextFn, param, initial);
    if(d == "en") {
      log("ERROR loading html-"+lang+".xml");
      nextFn(param);
      return;
    }
    return translateHtml(pgm, "en", nextFn, param, initial);
  });
}

function
readTranslatedTables(trHash=trHtml)
{
  $("div#translations > div").each(function(){
    var id=$(this).attr("id");    
    var arr = [];
    $(this).find("div").each(function(){
      var v = $(this).html().replace(/&amp;/g, "&");
      arr.push(v);
    });
    trHash[id] = arr;
  });
}

function
hashKeysAsArray(obj)
{
  var keys = [];
  for(var key in obj)
    keys.push(key);
  return keys;
}

function
arrayAsHash(arr)
{
  var hash = {}
  for(var i1=0; i1<arr.length; i1++)
    hash[arr[i1]] = 1;
  return hash;
}

function
dropdownMenu(event, el, arr, fn)
{
  function
  deldropdown()
  {
    $("#dropdownmenu").remove();
    $('html').unbind('click.dropdownmenu');
  }

  event.stopPropagation();
  deldropdown();

  var html = '<ul id="dropdownmenu">';
  for(var i=0; i<arr.length; i++)
    html += '<li data-row="'+i+'"><a>'+arr[i]+'</a></li>';
  html += '</ul>';
  $("#dashboard").append(html);
  $('html').bind('click.dropdownmenu', function() { deldropdown(); });
  $("#dropdownmenu").css($(el).offset());

  $("#dropdownmenu")
    .menu({
      select: function(e,ui) {
        e.stopPropagation();
        fn($(e.currentTarget).attr("data-row"));
        deldropdown();
      }
    });
}

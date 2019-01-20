/* Copyright KI-AG 2013-2019, Project KIPUS */

var bcUser='xliffedit';
var bcPasswd='5424_xliffedit';
var trHtml={};
var prefLang, prefStyle, prgName, debug;
var backendPrefix = document.location.pathname;
backendPrefix = backendPrefix.substr(0,backendPrefix.lastIndexOf('/'));
backendPrefix = backendPrefix.replace('/xliffedit','');
log("backendPrefix="+backendPrefix);

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
error(txt, suppressLog)
{
  $("div#dlg_errorMessage").html("Error: "+txt);
  var ok = (typeof trHtml.dlg == "undefined" ? "OK" : trHtml.dlg[0]);
  $("div#dlg_errorMessage").dialog({
    dialogClass:"no-close", 
    buttons: [{text:ok, click:function(){
      $(this).dialog("close");
      doReload();
    }}]
  });
  if(!suppressLog)
    log("Error:"+txt);
}

function
okDialog(txt, callbackFn)
{
log("okDialog " + txt);
  $("#outer-wrapper").append("<div id='dlg_errorMessage'></div>");
  $("div#dlg_errorMessage").html(txt);
  $("div#dlg_errorMessage").dialog({
    dialogClass:"no-close", modal:true, width:"auto",
    buttons: [{text:"OK", click:function(){
      $(this).dialog("close");
      $("div#dlg_errorMessage").remove();
      if (callbackFn)
        callbackFn();
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
  $("#outer-wrapper").append("<div id='dlg_errorMessage'></div>");
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
  var patt = new RegExp(regexp);
  var res = patt.test(prefix?prefix+el.value:el.value);
  var span = $(el).parent().find(".glyphicon");
  if (!res || el.value.length == 0) {
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
resetLeaveMsg()
{
  if(!navigator.userAgent.match(/MSIE/))
    window.onbeforeunload = undefined;
}

function
doReload()
{
  resetLeaveMsg();
  window.location.reload();
}

function
bc_handleFail(fn, err, failFn, failPar)
{
  $("img.waiting").remove();
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
  if (!navigator.onLine)
    return bc_handleFail(fn, "Please check your internet connection.");
  var started = (new Date()).getTime();
  data.function = fn;
  data.username = bcUser;
  data.password = bcPasswd;
  $(".headtitle span.waiting").show();
  var ax = $.ajax({ dataType:"json",
                    cache:false, url:backendPrefix+"/bc" + (fn == "importProject" ? "?"+started:""),
                    type:"POST", contentType: 'application/json; charset=utf-8',
                    data:JSON.stringify(data) });
  ax.done(function(res) {
    $(".headtitle span.waiting").hide();
    if(typeof(res) == 'object' && res.error)
      return bc_handleFail(fn, res.error, failFn, failPar);
    var sfx = " finished";
    if(typeof res.length == "number") 
      sfx = " returned "+res.length+ " rows";
    sfx = (fn=="tableSelect" || fn=="tableUpdate" ? " "+data.tableName : "")+sfx;
    log("bC: "+fn+sfx+" in "+((new Date()).getTime()-started)+" msec");
    if(resultFn)
      resultFn(res, resultPar);
  })
  .fail(function(req, stat, err) {
    $(".headtitle span.waiting").hide();
    $(".headtitle span.error").show();
    return bc_handleFail(fn, "Please check your internet connection.");
  });
}



/////////////////////////////////////
function
translateHtml(pgm, lang, nextFn, param)
{
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

  if(lang == "en-US" || lang == "en") {  // Speedup
    nextFn(param);
    return;
  }

  var fName = "translations/"+pgm+"/html-"+lang+".xml";
  $.ajax({ url:fName })
  .done(function(data) {
    $("[trid]").each(function() {
      var id = $(this).attr("trid");
      var tr = $(data).find("#"+id);
      if(tr) {
        var txt = $(tr).find("target").text();
        if(!txt)
          txt = $(tr).find("source").text();
        if(txt)
          $(this).html(txt);
      } else {
        log("Missing translation for "+id);
      }
    });
    log("Loading "+fName+" took "+
                ((new Date()).getTime()-param.htmlStarted)+" msec");
    nextFn(param);
  })
  .fail(function() {
    var d = lang.split("-");
    if(d.length == 2)
      return translateHtml(pgm, d[0], nextFn, param);
    if(d == "en") {
      log("ERROR loading html-"+lang+".xml");
      nextFn(param);
      return;
    }
    return translateHtml(pgm, "en", nextFn, param);
  });
}

function
readTranslatedTables()
{
  $("div#translations > div").each(function(){
    var id=$(this).attr("id");    
    var arr = [];
    $(this).find("div").each(function(){
      var v = $(this).html().replace(/&amp;/g, "&");
      arr.push(v);
    });
    trHtml[id] = arr;
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

function
readCsvTables(nextFn, param)
{
  if(typeof param.nextIdx == "undefined")
    param.nextIdx = 0;
  if(param.nextIdx >= param.tables.length) {
    nextFn(param);
    return;
  }

  var tblName = param.tables[param.nextIdx];
  var fName = "masterdata/"+tblName+".csv?"+(new Date()).getTime();
  var started = (new Date()).getTime();
  $.ajax({ url:fName })
    .done(function(data) {
      var rows = $.csv.toArrays(data, {separator:';', delimiter:'"'});
      var lu={};
      for(var i1=0; i1<rows.length; i1++)
        lu[rows[i1][0]] = rows[i1];
      masterdata[tblName] = lu;
      masterdata["arr_"+tblName] = rows;
      log("Loading "+fName+" ("+rows.length+" lines) took "+
                ((new Date()).getTime()-started)+" msec");
      param.nextIdx++;
      readCsvTables(nextFn, param);
    })
    .fail(function() { 
      error("Failed to load "+fName); 
      nextFn(param);
    });
}

function
unfold_header(id)
{
  $(".hdrrow").show();
  if(id.indexOf("ovv")>=0)
    $("#hdrrow4").hide();

  $("#mo_"+id).find(".helptext").show(0);
  $("#mo_"+id).find("img.fold").attr("src", "css/images/fold-up.png");
}

function
fold_header()
{
  var parent = $(this).closest(".omm_div");
  var isUp = ($(this).attr("src").indexOf("-up") > 0);
  var img = "css/images/fold-"+(isUp ? "down":"up")+".png";
  var isOvv = ($(parent).attr("id").indexOf("mo_ovv") >= 0);
  $(this).attr("src", img);
  if(isUp) {
    $(".hdrrow").hide(500);
    $(parent).find(".helptext").hide(500);
  } else {
    $(".hdrrow").show(500);
    if(isOvv)
      $("#hdrrow4").hide();
    $(parent).find(".helptext").show(500);
  }
  setTimeout(resize_window, 600);
}

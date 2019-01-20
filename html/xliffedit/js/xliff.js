/* Copyright KI-AG 2013-2019, Project KIPUS */
var svnId="$Id: xliff.js 1849 2016-01-11 13:56:24Z dba $";
var showId=0;
var trHtml={}, trDwb;
var mandatory = {};
var masterdata = {};
var model = "";
var origlang = "en";
var origversion = "13.1";
var lang = "";
var version = "";
var xliffdata = "";
var betafolder = "translations/dwb";
var outputfolder = "output";
var createTargetFromScratch = 0;
var rgl = new Object();
var lgl = new Object();
var gl = new Object();
var tgl = new Object();
var glossaryMode = 0;
var editMode = 0;
var onlyChanges = 0;
var saveSuccess = 0;
var targetUpdated = 0;
var sourceHash = {};
var targetHash = {};
var config, isLocked;

function 
toggle_hide_id_col() {
  log("toggle_hide");
  $("#hidecol span").text("please wait (rendering ...)");
  $("#hidecol input").attr("disabled", "disabled");
  function doToggle() {
    if ($("#xliffovv_tbl").hasClass("id_hidden"))
      $("#xliffovv_tbl").removeClass("id_hidden");
    else
      $("#xliffovv_tbl").addClass("id_hidden");
    log("id is visible"+ $("#xliffovv_tbl tr:last td:first").is(":visible"));
    $("#hidecol span").text("Show ID");
  $("#hidecol input").removeAttr("disabled");
  }
  window.setTimeout(doToggle,100);
}


function getSelected() {
    var t = '';
    if(window.getSelection){
      t = window.getSelection();
    }else if(document.getSelection){
      t = document.getSelection();
    }else if(document.selection){
      t = document.selection.createRange();
    }
    return t;
}

function
createLanguage_xliff_options(tblName, selVal)
{
  var a = masterdata["arr_"+tblName];
  var html = "";
  var model = "";
  for(var i1=0; i1<a.length; i1++) {
    model = "model-" + a[i1][2] + "-" + a[i1][0].toLowerCase() + ".xml";
    html += "<option value='"+model+"'"+
                (a[i1][0]==selVal ? " selected":"")+">"+a[i1][1]+"</option>";
  }
  return html;
}

function
init_xliff(data)
{
    xliffdata = data;
    log("init_xliff");
    // sort trans-units after ID
    var wrapper = $(xliffdata).find('body'), tus = wrapper.find('trans-unit');
    [].sort.call(tus, function(a,b) {
        return $(a).attr('id').localeCompare($(b).attr('id'));
    });
    tus.each(function(){
      wrapper.append(this);
    });
    // footer
    $("#footer").appendTo("#mo_xliff");
    $("#footer").css("display", "block");
    $("#mo_footertxt1").html(trHtml.footerText[0]);
    var changedIds = new Object();
    if (!config) {
      var a = masterdata["arr_changes-"+origversion];
      for(var i1=0; i1<a.length; i1++) {
        changedIds[a[i1][0]] = 1;
      }
    } else {
      if (config.title) {
        $("title").replaceWith(sprintf("<title>{1}</title>", config.title));
      }
      if (config.header) {
        $("[trid=hdrtab_lsovv]").html(config.header);
      }
      if (config.help)
        $("#title").html(config.help);
      if (config.changed)
      for(var i1=0; i1<config.changed.length; i1++) {
        changedIds[config.changed[i1]] = 1;
      }
    }
    var html = "";
    var row = "";
    var i = 0;
    sourceHash = {};
    targetHash = {};
    $(xliffdata).find("trans-unit").each(function() {
      var el = $(this);
      var id = el.attr("id");
      var source = el.find("source").text();
      if (source)
        sourceHash[id] = source;
      var target = el.find("target").text();
      if (target)
        targetHash[id] = target;
      row = "";
      row +='<tr class="'+(i%2 ? "even":"odd");
      if (!(id in changedIds)) {
         row += " unchanged";
      } 
      if (!(id.indexOf("txt") == 0))
      {
        row += " glossary-hide";
      }
      row += '" id="'+id+'" row_id="'+i+'">';
      row += '<td class="xliffid">'+id+'</td>';
      row += '<td class="xliffsource">';
      row += '</td>';
      row += '<td class="xlifftarget">';
      row += '</td>';
      row += '</tr>';
      html+= row;
      if (createTargetFromScratch && lang==origlang) {
        update_target($("table#xliffovv_tbl tbody tr[row_id="+i+"]"));
      }

      if(id.indexOf("G") == 0) {
       if(!(id in gl))
         gl[id] = source;
         tgl[id] = target;
      }
      i++;
    });
    $("table#xliffovv_tbl tbody").append(html);
    $("#xliffovv_tbl tr").each(function() {
      var el = $(this);
      var id = el.attr("id");
      if (sourceHash[id]) {
        if (config)
          $(el).find(".xliffsource").text(sourceHash[id]);
        else
          $(el).find(".xliffsource").html(sourceHash[id]);
      }
      if (targetHash[id]) {
        if (config)
          $(el).find(".xlifftarget").text(targetHash[id]);
        else
          $(el).find(".xlifftarget").html(targetHash[id]);
      }
    });
     
    $("table#xliffovv_tbl tbody .xliffsource, table#xliffovv_tbl tbody .xliffid").unbind("click").click(function(e){
      $(this).closest("tr").find(".xlifftarget").trigger("click");
    });
    $("table#xliffovv_tbl tbody .xlifftarget").unbind("click").click(function(e){
      if (!editMode)
        return;
      var el = this;
      $(el).find(".glattach").remove();
      var xliffid = $(el).closest("tr").find(".xliffid").text();
      $("#footer span").text("ID: "+xliffid);
      var xlifftarget = $(this);
      var readonly = (xlifftarget.find("textarea").size() == 0);
      if (readonly) {
        $("table#xliffovv_tbl tbody textarea").each(function(e){
           update_target(this);
        });
        // edit
        var html = '<textarea>';
        html += xlifftarget.html();
        html += '</textarea>';
        xlifftarget.html(html);
        xlifftarget.find("textarea").TextAreaExpander();
        xlifftarget.find("textarea").on("keydown", function(e) { 
          var keyCode = e.keyCode || e.which; 
          if (keyCode == 9) { 
            e.preventDefault(); 
            // tab pressed
            log("tab pressed");
            var next = (e.shiftKey?$(el).closest("tr").prev("tr").find(".xlifftarget"):$(el).closest("tr").next("tr").find(".xlifftarget") );
            update_target(el);
            addHover($(el).closest("tr"));
            $(next).click();
          } 
        });
        xlifftarget.find("textarea").blur(function(e){
          update_target(el);
          addHover($(el).closest("tr"));
        });
        if ($("#tooltip").is(":visible"))
          $("#tooltip").dialog("close");
        xlifftarget.find("textarea").focus();
      }
    });
    addHover("table#xliffovv_tbl");
    update_glossary();
    //set_editmode(1);
}

function
addHover(root)
{
  log("add hover for glossaries");
  $(root).find(".glossary").hover(function(e){
    var glid = $(this).attr("glid");
    var parentClass = $(this).parent().prop("className");
    var gloss;
    if (parentClass == "xliffsource") {
      gloss = gl[glid].split(";",2);
    }
    if (parentClass == "xlifftarget") {
      gloss = tgl[glid].split(";",2);
    }
    var html = "<div>" + gloss[1] + "</div>";
    $("#tooltip").html(html);
    $("#tooltip").dialog({
      dialogClass: "no-close", width: "30%", buttons: null, position: { my: "left top", at: "right bottom", of: $(this) }
    });
  }, function(e) {
    $("#tooltip").dialog("close");
  });
}

function
set_onlychanges(mode) {
  if (mode == onlyChanges)
    return;
  //log("onlychanges mode="+mode);
  $("#xliffovv_tbl .odd").removeClass("odd");
  $("#xliffovv_tbl .even").removeClass("even");
  if (!mode) {
    $("#onlychanges").attr("src","css/images/lastchanges-on-icon.png");
    $(".unchanged").css("display", "table-row");
    if(glossaryMode)
      $(".glossary-hide").css("display", "none");
    $("#status").html(trHtml.xstatus[0]);
    log("showOnlyChanges off");
  } else {
    $("#onlychanges").attr("src","css/images/lastchanges-off-icon.png");
    $(".unchanged").css("display", "none");
    // show untranslated elements (having no xlifftarget)
    $("td.xlifftarget:empty").closest("tr").css("display", "table-row");
    if (config)
      $("#status").html(trHtml.xstatus[4]);
    else
      $("#status").html(trHtml.xstatus[3] + " <i>"+origversion+"</i>");
    log("showOnlyChanges on");
  }
  var i = 0;
  $("#xliffovv_tbl tr:visible").each(function(e) {
    var trclass = (i%2 ? "even":"odd");
    $(this).addClass(trclass);
    i++;
  });
  onlyChanges = mode;
}

function
set_editmode(mode) {
  if (mode == editMode)
    return;

  if(mode && config && !isLocked) {
    setLock(1, function(){
      isLocked = true;
      $("#xliffSave, #xliffClose, #closeHelp").css("display","");
      set_editmode(mode);
    });
    return;
  }

  //log("mode="+mode);
  if (!mode) {
    $("#editmode").attr("src","css/images/edit-on-icon.png");
    $("#status").html(trHtml.xstatus[0]);
    // remove textareas (edit)
    $("textarea").each(function(e) {
      var xlifftarget = $(this).closest("tr").find(".xlifftarget");
      var html = $(this).val();
      $(this).remove();
      xlifftarget.html(html);
    });
    $("#xliffSave, #xliffClose, #closeHelp").css("display","none");
    $("#footer").removeClass("editMode");
    log("editMode off");
  } else {
    set_glossary(0);
    $("#editmode").attr("src","css/images/edit-off-icon.png");
    $("#status").html(trHtml.xstatus[1]);
    //$("#status").append("<image src='css/images/edit-icon.png'/>");
    $("#xliffSave, #xliffClose, #closeHelp").css("display","");
    $("#footer").addClass("editMode");
    log("editMode on");
  }
  editMode = mode;
}

function
select_target(el) {
   log("select_target");
   // get user selection for capabilities
   var selObj = getSelected();
   if (!selObj) {
     log("selection not supported");
     return;
   }
   var target = $(el).html(); 
   var start = 0;
   var end;
   if(window.getSelection || document.getSelection){
     // modern browsers
     if (selObj.anchorNode != selObj.extentNode) {
       log("only select text inside target");
       return;
     }
     if (start == end)
       return; 
     var text = $(el).text();
     if (target.length == text.length) {
       start = selObj.baseOffset;
       end = selObj.extentOffset;
     } else {
        var html = "";
        if (selObj.rangeCount) {
            var container = document.createElement("div");
            for (var i = 0, len = selObj.rangeCount; i < len; ++i) {
                container.appendChild(selObj.getRangeAt(i).cloneContents());
            }
            html = container.innerHTML;
        } 
        start = target.indexOf(html);
        end = start + html.length;
     }
     if (start != end) {
       open_glossary_dlg(el, start, end);
     }
   } else {
     // probably IE8
     if (selObj.htmlText == "")
       return;
     var selection = selObj.htmlText.replace(/^\s+|\s+$/,'');
     if (selection.match(/<TR/ig))
       return;
     if (selection.match(/<SPAN/ig))
       return;
     document.selection.empty();
     //log("selection = " + selection);
     //log("target = " + target);
     if (target.indexOf(selection, start) > -1) {
        start = target.indexOf(selection, start);
        end = start + selection.length;
        //log("start:"+start);
        //log("end:"+end);
        if (start != end) {
           open_glossary_dlg(el, start, end);
        }
     }
   }
}

function
set_glossary(mode) {
  if (mode == glossaryMode)
    return;
  log("mode="+mode);
  if (!mode) {
    $("#glmode").attr("src","css/images/glossary-on-icon.png");
    $(".glgreen").addClass("glgreen-disabled").removeClass("glgreen");
    $(".glred").addClass("glred-disabled").removeClass("glred");
    $("#status").html(trHtml.xstatus[0]);
    $(".glremove").remove();
    $(".glflash").remove();
    $(".xlifftarget").unbind("mouseup");
    $(".xlifftarget").unbind("dblclick");
    $(".xliffid").css("display", "none");
    $(".glossary-hide").css("display", "table-row");
    log("glossaryMode off");
  } else {
    set_editmode(0);
    $(".xliffid").css("display", "table-cell");
    $("#glmode").attr("src","css/images/glossary-off-icon.png");
    $(".glgreen-disabled").addClass("glgreen").removeClass("glgreen-disabled");
    $(".glred-disabled").addClass("glred").removeClass("glred-disabled");
    $(".glred").prepend("<img class='glflash' src='css/images/flash-icon.png'/>");
    $(".glossary-hide").css("display", "none");
    $("#status").html(trHtml.xstatus[2]);
    $("#status").append("<image src='css/images/delete-icon.png'/>");
    log("glossaryMode on");
    $(".xlifftarget").mouseup(function() {
       select_target(this);
    });
    $(".xlifftarget").dblclick(function() {
       select_target(this);
    });
    $(".xlifftarget .glossary").append("<img class='glremove' src='css/images/delete-icon.png'/>");
    $(".glremove").click(function(e) {
       remove_glossary(this);           
    });
  }
  var i = 0;
  $("#xliffovv_tbl tr:visible").each(function(e) {
    var trclass = (i%2 ? "even":"odd");
    $(this).removeClass("even odd");
    $(this).addClass(trclass);
    i++;
  });
  glossaryMode = mode;
}

function
add_glossary(el, glid, start, end) {
   log("add glossary");
   var html = $(el).html();
   log("html before:\t\t" + html);
   if (start > end) {
      var tmp = end;
      end = start;
      start = tmp;
   }
   log("start:"+start);
   log("end:"+end);
   var before = html.substr(0, start);
   var sel = html.substr(start, end - start);
   var after = html.substr(end);
   html = before + "<span class='glossary' glid='"+glid+"'>";
   html += sel + "</span>" + after;
   $(el).html(html);
   log("html after:\t\t" + html);
   update_target(el);

   var tr = $(el).closest("tr");
   update_glossary(tr);
   addHover(tr);
}

function
remove_glossary(el) {
    $("#tooltip").dialog("close");
    var xliffid = $(el).closest("tr").find(".xliffid").html();
    log("remove glossary of " + xliffid);
    var glossary = $(el).parent();
    var tr = $(el).closest("tr");
    $(glossary).find(".glflash").remove();
    $(el).remove();
    var html = $(glossary).html();
    var target = $(glossary).parent();
    $(glossary).replaceWith(html);
    update_target(target);
    update_glossary(tr);
}

function
glossary_row(glid,trclass,tdclass)
{
  var text = tgl[glid]?tgl[glid]:gl[glid];
  var gloss = text.split(";",2);
  if (text == "")
    return "";
  return "<tr class='"+trclass+"' glid='"+glid+"'>"+
        "<td class='glossid "+tdclass+" pointer'>"+gloss[0]+"</td>"+
        "<td class='glosstext pointer' glid='"+glid+"'>"+gloss[1]+"</td>"+
      "</tr>";
}

function
open_glossary_dlg(el, start, end) {
    var xliffid = $(el).closest("tr").find(".xliffid").html();
    var html = "<div class='title'>"+trHtml.gloss[0]+"</div>"+
      //"<input type='text' placeholder='"+trHtml.gloss[1]+"'>"+ 
      "<div id='glosscontainer'>"+
      "<table id='gloss'>";
    var glclass = new Object();
    for (var glid in lgl[xliffid]) {
      glclass[glid] = "glred";
    }
    for (var glid in rgl[xliffid]) {
      if (glid in lgl)
        glclass[glid] = "glgreen";
      else
        glclass[glid] = "glred";
    }
    for (var glid in gl) {
       if (!(glid in glclass))
          glclass[glid] = "glblack";
    }
    var sortgl = [];
    for (var glid in glclass)
      sortgl.push([glid, tgl[glid]?tgl[glid]:gl[glid]])
    sortgl.sort(function(a, b) {
      var agl = a[1].split(";",2)[0];
      var bgl = b[1].split(";",2)[0];
      var acl = glclass[a[0]];
      var bcl = glclass[b[0]];
      if (acl != bcl) {
        if (acl == "glblack") return 1;
        if (bcl == "glblack") return -1;
        if (acl == "glred") return 1;
        if (bcl == "glred") return -1;
      }
      if (agl < bgl) return -1;
      if (agl > bgl) return 1;
      return 0; 
    });
    for (var i = 0; i < sortgl.length; i++)
    {
      var glid = sortgl[i][0];
      var trclass = (i%2 ? "even":"odd");
      html+= glossary_row(glid,trclass,glclass[glid]);
    }
    
    html+= "</div></table>";
    $("#dialog").html(html);
    $("#dialog").dialog({
      dialogClass: "no-close", width: "75%", position: {my: "center", at: "center", of: window}, buttons:[
        { text:trHtml.dlg[0], click:function(){
          $(this).dialog("close");
        }},
        { text:trHtml.dlg[1], click:function(){ $(this).dialog("close"); }}]
    });
    $("#dialog #gloss tr").click(function(e){
       var glid = $(this).attr("glid");
       add_glossary(el, glid, start, end);
       $("#dialog").dialog("close");
    });
}

function
update_glossary(root) {
  $(".waiting").show();
  log("update_glossary: creating objects");
  var glfails = "glred-disabled";
  var glok = "glgreen-disabled";
  if (glossaryMode) {
    glfails = "glred";
    glok = "glgreen";
  }

  if(!root) {
    rgl = new Object();
    lgl = new Object();
    root = document;
  }
  $(root).find(".xliffid").each(function(e){
     var xliffid = $(this).html();
     rgl[xliffid] = new Object();
     lgl[xliffid] = new Object();
  });

  log("update_glossary: collecting glossaries");
  if (glossaryMode) {
    $(root).find(".glremove").remove();
    $(root).find(".glflash").remove();
    $(root).find(".xlifftarget .glossary")
          .append("<img class='glremove' src='css/images/delete-icon.png'/>");
    $(root).find(".glremove").click(function(e) { remove_glossary(this); });
  }

  var sCnt=0, tCnt=0;
  $(root).find(".glossary").each(function(e){
     var el = this;
     var xliffid = $(el).closest("tr").find(".xliffid").html();
     var glid = $(el).attr("glid");
     var parentClass = $(el).parent().prop("className");
     if (parentClass == "xliffsource") {
       if (!(glid in lgl[xliffid])) {
         lgl[xliffid][glid] = 1;
         sCnt++;
       }
     }
     if (parentClass == "xlifftarget") {
       if (!(glid in rgl[xliffid])) {
         rgl[xliffid][glid] = 1;
         tCnt++;
       }
     }
     $(el).removeClass(glfails + " " + glok);
  });
  log("update_glossary: source:"+sCnt+" target:"+tCnt+" glossaries");

  var nOk=0, sMis=0, tMis=0;
  $(root).find(".xliffid").each(function(e){
     var el = this;
     var xliffid = $(el).html();
     var xliffsource = $(el).closest("tr").find(".xliffsource");
     var xlifftarget = $(el).closest("tr").find(".xlifftarget");
     for (var l in lgl[xliffid]) {
       for (var r in rgl[xliffid]) {
          if (r == l) {
             $(xliffsource).find(".glossary[glid=\""+l+"\"]").addClass(glok);
             $(xlifftarget).find(".glossary[glid=\""+r+"\"]").addClass(glok);
             nOk++;
          }
       }
       if (!(l in rgl[xliffid])) {
          var gloss = $(xliffsource).find(".glossary[glid=\""+l+"\"]").addClass(glfails);
          if (glossaryMode) {
              gloss.prepend("<img class='glflash' src='css/images/flash-icon.png'/>");
          }
          tMis++;
       }
     }
     for (var r in rgl[xliffid]) {
       if (!(r in lgl[xliffid])) {
          var gloss = $(xlifftarget).find(".glossary[glid=\""+r+"\"]").addClass(glfails);
          if (glossaryMode) {
              gloss.prepend("<img class='glflash' src='css/images/flash-icon.png'/>");
          }
          sMis++;
       }
     }
  });
  log("update_glossary matching: ok "+nOk+
        ", source missing "+sMis+
        ", target missing "+tMis);

  $(".waiting").hide();
}

function
get_xliff_data(file) {
  log("get_xliff_data "); 
  log("file:\t"+ file);
  $.ajaxSetup({cache: false});
  $.get(file, function(data) {
     log(file + " exists, read success"); 
     if (config)
       delete_cfg();
     init_xliff(data);
  }, "xml")
  .error(function(jqXHR, textStatus, errorThrown) {
    error("ajax errorText:\t" + textStatus);
    log("ajax errorThrown:\t" + errorThrown);
  })
  .fail(function() {
     error("Sorry, something went wrong");
     $("#outer-wrapper").remove();
  });
}

function
menu_xliff()
{
  log("menu_xliff");
  var cfg = getUrlParameter("cfg");
  $("[trid=hdrtab_launch]").closest(".hdrtab").addClass("selected");
  if (!cfg) {
    // fold-button only shown for omm
    $("div.title #buttons").append('<img class="fold btn" src="css/images/fold-up.png" title="fold up/down"/>');
    $("div.title #buttons").append('<img id="onlychanges" class="btn" src="css/images/lastchanges-on-icon.png" title="switch show only changes"/>');
  } else
    $("div.title #buttons").append('<img id="onlychanges" class="btn" src="css/images/lastchanges-on-icon.png" title="switch show only untranslated"/>');

  $("div.title #buttons").append('<img id="editmode" class="btn" src="css/images/edit-on-icon.png" title="switch edit mode"/>');
  if (!cfg) {
    // glossary-button only shown for omm
    $("div.title #buttons").append('<img id="glmode" class="btn" src="css/images/glossary-on-icon.png" title="switch glossary mode" />');
  } 
  $("div.title #buttons").append('<button type="button" class="ui-button '+
            'ui-state-default ui-corner-all ui-button-text-only" '+
            'role="button" aria-disabled="false" id="xliffSave">'+
            '<span class="ui-button-text">'+trHtml.dlg[4]+'</span>'+
          '</button>');
  if (cfg) {
    // close-button not shown in omm
    $("div.title #buttons").append('<button type="button" class="ui-button '+
              'ui-state-default ui-corner-all ui-button-text-only" '+
              'role="button" aria-disabled="false" id="xliffClose" style="display:none;">'+
              '<span class="ui-button-text">'+trHtml.dlg[5]+'</span>'+
            '</button>');
    $("#xliffSave").css("display", "none");
  }
  $("div.title #xliffSave").click(save_xliff);
  $("div.title #xliffClose").click(function() {
    if (!saveSuccess && targetUpdated) {
      $("div#dialog").html(trHtml.close[0]);
      $("div#dialog").dialog({
        dialogClass:"no-close", buttons: [
          {text:trHtml.dlg[5], click:function(){
            $(this).dialog("close");
            if(isLocked)
              setLock(0, function(){ window.close(); });
            else
              window.close();

          }},   
          {text:trHtml.dlg[1],click:function(){$(this).dialog("close");}}]
      });  
    } else {
      if(isLocked)
        setLock(0, function(){ window.close(); });
      else
        window.close();
    }
  });
  $("img.fold.btn").unbind("click").click(fold_header);
  $("img#editmode.btn").unbind("click").click(function(e) {
      if (editMode)
        return;
      set_editmode(!editMode);
  });
  $("img#glmode.btn").unbind("click").click(function(e) {
      if (glossaryMode)
        return;
      set_glossary(!glossaryMode);
  });
  $("img#onlychanges.btn").unbind("click").click(function(e) {
      set_onlychanges(!onlyChanges);
  });


  $("div.title").append('<img class="waiting" style="display:none" '+
                             'src="css/images/waiting.gif"/>');

  $("#status").html(trHtml.xstatus[0]);
  $("#title").html(trHtml.xtitle[0]);
  if (!cfg) {
    var html =
      "<div class='title'>"+trHtml.xpref[0]+"</div>"+
      "<table id='xpref'><tr>"+
        "<td class='c1'>"+trHtml.xpref[1]+"</td>"+
        "<td class='c2'><select id='xprefLang'>"+
                  createLanguage_xliff_options("languages_xliff", prefLang)+
        "</select></td>"+
      "</tr>"+
      "</table>";
    $("#dialog").html(html);
    $("#dialog").dialog({
      dialogClass: "no-close", width: "auto", buttons:[
        { text:trHtml.dlg[0], click:function(){
          $(".waiting").show();
          model = $("#xprefLang").val();
          lang = model.replace(/model-.*-/,"");
          lang = lang.replace(/\.xml/,"");
          version = model.replace(/model-/,"");
          version = version.replace(/-.*/,"");
          log("version=" + version); 
          log("lang=" + lang); 
          var betafile = betafolder + "/" + model;
          get_xliff_data(betafile);
          $(this).dialog("close");
        }},
        { text:trHtml.dlg[1], click:function(){ $(this).dialog("close"); }}]
    });
  } else {
    $.ajaxSetup({cache: false});
    $.get(outputfolder+"/"+cfg+".tmp", function(data) {
      config = data;
      lang = config.language;
      // remove dots (security)
      config.source= replaceAll(config.source, "..", "");
      config.projectName = replaceAll(config.projectName, "..", "");
      get_xliff_data(outputfolder+"/"+config.projectName+"_"+config.source);
    }, "json")
    .error(function(jqXHR, textStatus, errorThrown) {
      error("ajax errorText:\t" + textStatus);
      log("ajax errorThrown:\t" + errorThrown);
    })
    .fail(function() {
       error("Sorry, something went wrong");
       $("#outer-wrapper").remove();
    });
  }
}

function prettyxml2str(sourceXml)
{
    var xmlDoc = new DOMParser().parseFromString(sourceXml, 'application/xml');
    var xsltDoc = new DOMParser().parseFromString([
        // describes how we want to modify the XML - indent everything
        '<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform">',
        '  <xsl:strip-space elements="*"/>',
        '  <xsl:template match="para[content-style][not(text())]">', // change to just text() to strip space in text nodes
        '    <xsl:value-of select="normalize-space(.)"/>',
        '  </xsl:template>',
        '  <xsl:template match="node()|@*">',
        '    <xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy>',
        '  </xsl:template>',
        '  <xsl:output indent="yes"/>',
        '</xsl:stylesheet>',
    ].join('\n'), 'application/xml');

    var xsltProcessor = new XSLTProcessor();    
    xsltProcessor.importStylesheet(xsltDoc);
    var resultDoc = xsltProcessor.transformToDocument(xmlDoc);
    var resultXml = new XMLSerializer().serializeToString(resultDoc);
    return resultXml;
};

function xml2str(xmlNode) {
   try {
      // Gecko- and Webkit-based browsers (Firefox, Chrome), Opera.
      var xml = (new XMLSerializer()).serializeToString(xmlNode).replace(/xmlns:xml="http:\/\/www.w3.org\/XML\/1998\/namespace"/g, "");;
      return prettyxml2str(xml);
  }
  catch (e) {
     try {
        // Internet Explorer.
        return xmlNode.xml;
     }
     catch (e) {  
        //Other browsers without XML Serializer
        alert('Xmlserializer not supported');
     }
   }
   return false;
}

function
update_target(el)
{
    var xlifftarget = $(el).closest("tr").find(".xlifftarget");
    var xliffid = replaceAll($(el).closest("tr").find(".xliffid").text(), ".", "\\.");
    log("update " +xliffid);
    var html = $(xlifftarget).html();
    if (xlifftarget.find("textarea").length > 0) {
      html = xlifftarget.find("textarea").val();
      xlifftarget.find("textarea").remove();
    }
    log("target="+html);

    // write to xliffdata
    var tu = $(xliffdata).find("trans-unit#"+xliffid);
    if ($(tu).find("target").length > 0) {
      log("html before:>>"+html+"<<");
      /* IE8 special */
      html = html.replace(/<img class=['"]?glremove[^>]*>/ig,"");
      html = html.replace(/<img class=['"]?glflash[^>]*>/ig,"");
      html = html.replace(/<span class="glossary[^"]*"/ig,"<span class='glossary'");
      html = html.replace(/<span class=glossary/ig,"<span class='glossary'");
      html = html.replace(/span>/ig,"span>");
      html = html.replace(/[\r\n]/g, " "); // RKO

      /* remove classes */
      log("html after :>>"+html+"<<");
      $(tu).find("target").text(html);
    } else {
      log("target does not exist ");
      if (html==undefined)
        html = $(xliffdata).find("trans-unit#"+xliffid).find("source").html();
      $(tu).append("<target xml:lang=\"" + lang + "\"></target>");
      $(tu).find("target").text(html);
      if (config)
        $(el).closest("tr").addClass("unchanged");
    }
    if (config)
      $(xlifftarget).text(html);
    else
      $(xlifftarget).html(html);
    if ((!targetHash[xliffid] && html != "" && targetHash[xliffid] != "") || (targetHash[xliffid] && html != targetHash[xliffid].replace(/glid="([^"]*)"/ig,"glid='$1'"))) {
      $(xlifftarget).addClass("changed");
    }
    targetUpdated = 1;
}

function
setLock(val, nextFn)
{
  log("setLock " + val);
  backendCall("setLock", { 
            lockName:config.projectName+"/"+config.source, 
            lockVal: val,
            as_user: config.as_user },   
  function(res, resultPar) {
    if(typeof(res) == 'object' && res.result == "ok")
      nextFn();
    else
      okDialog(res)
  });
}

function
delete_cfg()
{
  log("delete_cfg");
  backendCall("deleteCfg", { xmlFile:(config?config.projectName+"_"+config.source:betafolder+"/"+model),
                             tmpFile: (config?config.ts+".tmp":null) },
  function(res, resultPar) {
    if (res && res.error)
      okDialog(res.error);
    else
      log("deleted xliff and config file");

  });
}

function b64EncodeUnicode(str) {
    // first we use encodeURIComponent to get percent-encoded UTF-8,
    // then we convert the percent encodings into raw bytes which
    // can be fed into btoa.
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
}

function
save_xliff()
{
  log("save_xliff");
  $("table#xliffovv_tbl textarea").each(function(e){
    update_target(this);
  });

  log("upload_xliff " + model);
  backendCall("uploadFile", { 
               as_user:config?config.as_user:null,
               fileName : (config?config.source:model),
               projectName: (config?config.projectName:null),
               data :  b64EncodeUnicode(xml2str(xliffdata))
               },
  function(res, resultPar) {
    if (res && res.fileName) {
      okDialog(res.fileName + " successfully saved");
      saveSuccess = 1;
    }
    setLock(0, function(){ set_editmode(!editMode); });
  });
}

///////////////////////////////////////
function
resize_window()
{
  if(typeof screenName != 'undefined') {
    var s = $("#xliffovv_scrollarea");
    s.height($(window).height()-s.offset().top-55);
  }
}

function
getUrlParameter(sParam)
{
  var mysearch = document.location.search;
  var sPageURL = (mysearch && mysearch.length > 0 ? mysearch.substring(1):"");
  var sURLVariables = sPageURL.split('&');
  for (var i = 0; i < sURLVariables.length; i++)
  {
    var sParameterName = sURLVariables[i].split('=');
    if (sParameterName[0] == sParam)
    {
      if (sParameterName.length == 1)
         return true;
      else
        return sParameterName[1];
    }
  }
}

function escapeRegExp(string) {
  return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}
function replaceAll(string, find, replace) {
  return string.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}

/////////////////////////////////////
$(window).resize(resize_window);
window.onload = function() {
  prefLang = "EN";
  var cfg = getUrlParameter("cfg");
  if (!cfg) {
    // show header
    $("#header").show();
  }
  log("start xliffedit version: " + svnId);
  translateHtml("xliff", prefLang.toLowerCase(), function(){
    readTranslatedTables();
    readCsvTables(menu_xliff, {tables:["languages_xliff", "changes-"+origversion]});
    $("#hidecol").click(toggle_hide_id_col);
  }, {});
  $("#closeHelp").css("display", "none");
  // remove lock when leaving browser
  if(!navigator.userAgent.match(/MSIE/))
    window.onbeforeunload = function(e) { 
      if(isLocked)
        setLock(0, function(){ window.close(); });
  }
}

function connectionChangedHandler(e) { 
   // Handle change of connection type here. 
   log("connection changed");
   if (!navigator.onLine)
     $("#snackbar").removeClass("fadeout").addClass("fadein");
   else
     $("#snackbar").removeClass("fadein").addClass("fadeout");
} 

// Register for event changes: 
navigator.connection.onchange = connectionChangedHandler; 

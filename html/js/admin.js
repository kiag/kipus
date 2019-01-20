/* Copyright KI-AG 2013-2019, Project KIPUS */
var svnId="$Id: admin.js 3659 2019-01-20 14:03:39Z rko $";
var isIE = (navigator.appVersion.indexOf("MSIE") > 0);
var project,user,roles,pd,pdattr,bd,bdpage,pbooks,pbdef,currProjId,bcRights,
    uprojects,drows,drow,dcols,bookdefs,filenames,external,table2pagetype;
var rightpar, prightpar, rightTableCol={};
var dummyPasswd="DUMMYPASSWORD";
var projDir = "projects";
var mouse = {x: 0, y: 0};
var adminRights = ["DataMaintenanceBooks",
                   "DataMaintenanceLookupTables",
                   "DataMaintenanceRegexp",
                   "Projects",
                   "RoleAdministration",
                   "UserAdministration",
                   "Reports",
                   "AdminAll",
                   "UserFrontend",
                   "Messaging",
                   "LogFiles"];

// must be set in the htmlReplace section of config.js
// possible values: Corrective, Multilang, Score
var feature={};

var paginateTables = true;
var glEdit = "glyphicon-pencil";
var glView = "glyphicon-eye-open";
var colors = [ "#ee4339", "#ee9336", "#eed236", "#d3ee36", "#a7ee70", "#58dccd", "#36abee", "#476cee", "#a244ea", "#e33fc7" ];
var signaturePad;
var gq={}, kps_elevator, kps_geocoder;
var languages = {
  "ID":{name:"Bahasa (Indonesian)"},
  "ZH-CN":{name:"Chinese (Traditional)"},
  "CS":{name:"Czech"},
  "EN":{name:"English"},
  "FI":{name:"Finnish"},
  "FR":{name:"French"},
  "DE":{name:"German"},
  "HU":{name:"Hungarian"},
  "IT":{name:"Italian"},
  "JA":{name:"Japanese"},
  "KO":{name:"Korean"},
  "ZH":{name:"Mandarin"},
  "PL":{name:"Polish"},
  "PT":{name:"BR;Portuguese (Brazilian)"},
  "RU":{name:"Russian"},
  "SK":{name:"Slovak"},
  "ES":{name:"Spanish (European)"},
  "ES-MX":{name:"Spanish (Mexican)"},
  "SV":{name:"Swedish"},
  "TH":{name:"Thai"},
  "TR":{name:"Turkish"},
  "VI":{name:"Vietnamese"},
  }
var debug;
var startDashboardHook=[];
var switch_tabHook={}, userEditHook;
var limitStep = 100;
var defaultLimitDataRowsTable = "0,"+limitStep;
var limitDataRowsTable = defaultLimitDataRowsTable;
var pageOffset = {};
var luTables = {};

function
logout()
{
  log("logout");
  $("#loginmask button").html(trHtml.login_button);
  window.sessionStorage.removeItem('bcUser');
  window.sessionStorage.removeItem('bcPasswd');
  window.sessionStorage.removeItem('prefLang');
  resetLeaveMsg();
  window.location.reload();
}

function
doReload()
{
  resetLeaveMsg();
  window.location.reload();
}

function
get_path(divClass)
{
   var s = "";
   $(".content-"+divClass+" .headtitle ul li .navtitle.pointer").each(function () {
     s+=$(this).html();
   });
   return s;
}

function
saveOffset(divClass)
{
  if(!divClass)
    return;
  if (divClass == "book" || divClass == "page")
     divClass = "project";
  var path = get_path(divClass);
  if (!pageOffset[divClass])
    pageOffset[divClass] = {};
  pageOffset[divClass][path] = { x: window.top.pageXOffset, 
                                 y: window.top.pageYOffset, 
                                 height: $(".content-"+divClass).height() };
}

function
removeOffset(divClass)
{
  if(!divClass)
    return;
  if (divClass == "book" || divClass == "page")
     divClass = "project";
  var path = get_path(divClass);
  if (!pageOffset[divClass] || !pageOffset[divClass][path])
    return;
  delete pageOffset[divClass][path];
}

function
loadOffset(divClass)
{
  if(!divClass)
    return;
  if (divClass == "book" || divClass == "page")
     divClass = "project";
  var path = get_path(divClass);
  if (!pageOffset[divClass] || !pageOffset[divClass][path])
    return;
  var x = pageOffset[divClass][path].x;
  var y = pageOffset[divClass][path].y;
  if ($(".content-"+divClass).height() != pageOffset[divClass][path].height) 
    y = y * $(".content-"+divClass).height()/pageOffset[divClass][path].height;
  window.setTimeout(function() { window.scrollTo(x,y);}, 50);
}

function
push_headtitle(divClass,text)
{
    if (divClass == "book" || divClass == "page")
       divClass = "project";
    $(".content-"+divClass+" .headtitle ul li:last").after("<li><span class='glyphicon glyphicon-arrow-right'></span><span class='navtitle pointer'> " + text + "</span></li>");
    if ($(".content-"+divClass+" .headtitle ul li").length > 2)
      $(".content-"+divClass+" .headtitle ul li:first").css("display", "");
    else
      $(".content-"+divClass+" .headtitle ul li:first").css("display", "none");
    bind_navtitle(divClass);
}

function
pop_headtitle(divClass)
{
//log("pop_headtitle " + divClass);
    if (divClass == "book" || divClass == "page")
       divClass = "project";
    $(".content-"+divClass+" .headtitle ul li:last").remove();
    if ($(".content-"+divClass+" .headtitle ul li").length > 2)
      $(".content-"+divClass+" .headtitle ul li:first").css("display", "");
    else
      $(".content-"+divClass+" .headtitle ul li:first").css("display", "none");
}

function
switch_home(divClass)
{
  if (divClass == "reports")
     return select_reports();
  if (divClass == "book" || divClass == "page")
     divClass = "project";
  $(".content-"+divClass).children().hide();
  $(".content-"+divClass).children().first().show().next().show();
  while ($(".content-"+divClass+" .headtitle ul li").length > 2) {
    pop_headtitle(divClass);
  }
  filter_table($(".table-data"));
}

function
addSwitch_tabHook(divClass,fn)
{
  if(!switch_tabHook[divClass])
    switch_tabHook[divClass] = [];
  switch_tabHook[divClass].push(fn);
}

// if doBlink is set, blink the current tab
// and reset the blink if tab is set active again 
function
switch_tab(divClass, par)
{
  $("ul.sidebar-nav li a").removeClass("blinking");
  if (par && par.doBlink)
    $(".active a").addClass("blinking");
  // save current offset  
  var currTab = $("ul.sidebar-nav li.active").attr("tab");
  saveOffset(currTab);
  if (divClass == "book" || divClass == "page")
     divClass = "project";
  if ($(".content-"+divClass+" .headtitle").is(':empty')) {
    var navtitle = $(".tab-"+divClass + " a").html();
    if (divClass == "geodata") {
      // refresh icon
      navtitle = navtitle.replace("Geo Data</span>", "Geo Data <a href='#' onclick='refresh_geodata()'><i class='fa fa-refresh'></i></a></span>");
    }
    $(".content-" + divClass + " .headtitle").append("<div class='well well-sm'><ul class='list-inline'>"
         + "<li style='display:none'><a href='#' onclick='switch_home(\"" + divClass
         + "\")'><span class='glyphicon glyphicon-home'></span></a></li><li><span class='navtitle pointer'>" + navtitle + "</span></li>"+
    "<span style='display:none; float:right' class='waiting'>"+
        "<img src='css/images/red-hourglass.gif'/></span>"+
    "<span style='display:none; float:right' class='error'>"+
        "<img src='css/images/flash-icon.png'/></span>"+
    "</ul></div>");
  }
  $(".active").removeClass("active");
  $(".tab-"+divClass).addClass("active");
  $(".content").css("display", "none");
  $(".content-"+divClass).css("display", "");
  bind_navtitle(divClass);

  if(switch_tabHook[divClass])
    for(var i1=0; i1<switch_tabHook[divClass].length; i1++)
      switch_tabHook[divClass][i1]();

  // bugfix for loosing filter on tabswitch
  window.setTimeout(function() { filter_table(".table-"+divClass);}, 50);
  loadOffset(divClass);
}

function
bind_navtitle(divClass)
{
  $(".content-"+divClass+" .headtitle .navtitle").unbind("click").bind("click", function (e) {
     var lisize = $(this).closest("ul").find("li").length-1;
     var liindex = $(this).closest("li").index();
     for (var i=lisize; i>liindex;i--) {
       $(".btn.cancel:visible").click();
     }
  });
}

function
check_language(initial, callbackfn)
{
  //log("check_language");
  backendCall("tableSelect", { tableName:"kipus_user", filterCol:"login", filterVal: bcUser },
    function(res0, resultPar) {
  backendCall("tableSelect", { tableName:"kipus_projects", filterCol:"name", filterVal: "ADMIN" },
    function(res1, resultPar) {
    function set_title(title) {
      $("span[trid=nav_brand]").text(title);
      document.title = title;
    }
    var lang = res0.length >0 && res0[0].language ? res0[0].language: (res1.length>0 && res1.length >0 ? res1[0].defaultlang:null);
    if (lang != null && lang.toUpperCase() != prefLang.toUpperCase()) {
      prefLang = lang;
      $("span[trid=nav_brand],#loginmask button").html("<div>loading translation ("+prefLang+")</div><div>please wait ...</div>");
      var cbremember = $('.cbremember').is(':checked');
      if (cbremember)
        window.sessionStorage.setItem('prefLang', prefLang.toUpperCase());
      translateHtml("admin", prefLang.toLowerCase(), function() {
        readTranslatedTables();
        set_title(res1.length>0&&res1[0].title?res1[0].title:trHtml.title[0]);
        if (callbackfn)
          callbackfn();
      }, {}, initial);
    } else {
      set_title(res1.length>0&&res1[0].title?res1[0].title:trHtml.title[0]);
      if (callbackfn)
        callbackfn();
    }
   });
   });
}

function
startDashboard()
{
    function doStartDashboard() {
      log("startDashboard for User:" + bcUser);
      $(".filtertable").each(function() { add_filter(this); });
      $('.tooltip_help').each(function() {
         var className = $(this).attr('class');
         className = className.replace('tooltip_help','');
         className = className.replace(' ','');
         if (className.indexOf("help-",0) == 0) {
            var nr = className.replace("help-","");
            $(this).attr("title", trHtml.tooltip[nr]).tooltip();
         }
      });
      $(".filterfield").keypress(function(event) {
        if (event.which == 13) {
            event.preventDefault();
            filter_table(this);
        }
      });
      $("#logincontainer").remove();
      $("#dashboard").css("display","");
      // all scripts are loaded, init sidebar menu
      var menuClickFn = { "tab-data": function() { switch_tab('data');select_data(); },
                    "tab-upload": function() { switch_tab('upload'); },
                   "tab-project": function() { switch_tab('project'); select_data(select_project()); },
                      "tab-role": function() { switch_tab('role');select_roles(); },
                      "tab-user": function() { switch_tab('user');select_user();},
                 "tab-messaging": function() { switch_tab('messaging');select_messaging();},
                   "tab-reports": function() { 
                        loadScript('js/adminReports.js', function(){
                            switch_tab('reports');select_reports(); 
                        }); },
                      "tab-logs": function() { switch_tab('logs');select_logs(); },
                  "tab-settings": function() { switch_tab('settings');select_settings(); },
                    "tab-logout": function() { logout(); }};

      // init sidebar menu
      $("#dashboard ul.sidebar-nav li a").unbind("click").click(function() {
         var cl = $(this).parent().attr("class");
         if (menuClickFn[cl])
           menuClickFn[cl]();
      });

      if (!hasProjectRight("DataMaintenanceBooks") &&
          !hasProjectRight("DataMaintenanceLookupTables") &&
          !hasProjectRight("DataMaintenanceRegexp") &&
          !hasProjectRight("AdminAll"))
        $(".tab-data").css("display","none");

      if (!hasProjectRight("Projects") &&
          !hasProjectRight("AdminAll"))
        $(".tab-project").css("display","none");

      if (!hasProjectRight("RoleAdministration") &&
          !hasProjectRight("AdminAll"))
        $(".tab-role").css("display","none");

      if (!hasProjectRight("UserAdministration") &&
          !hasProjectRight("AdminAll"))
        $(".tab-user").css("display","none");

      if (!hasProjectRight("Reports") &&
          !hasProjectRight("AdminAll"))
        $(".tab-reports").css("display","none");

      if (!hasProjectRight("LogFiles") &&
          !hasProjectRight("AdminAll"))
        $(".tab-logs").css("display","none");

      $(".content-project .btn.cancel").click(function() {
         // scroll to bottom after clicking back
        window.setTimeout(function() { window.scrollTo(0, $(document).height());}, 100);
      });
      for(var i1=0; i1<startDashboardHook.length; i1++)
        startDashboardHook[i1]();
      if(feature.Messaging)
        $("ul.sidebar-nav li.tab-messaging").show();
      else 
        $("ul.sidebar-nav li.tab-messaging").hide();
    }

    check_language(true, doStartDashboard);
}

/*
 * check if user has all Projects rights for role
 * role: String from adminRights
 * right: read/write (optional)
 */
function
hasAllProjectRight(role, right)
{
 // log("hasAllProjectRight " + role + ","+right);
  if (!role)
    return false;
   var rolesWithAllProjectRights = [];
   for (var i=0; i<roles.length; i++) {
     if (roles[i].projectid)
       continue;
     var rightList = roles[i].admin_rights.split(" ");
     for (var j=0; j<rightList.length; j++) {
       var admin_right = rightList[j].split("=")[0];
       var rw = rightList[j].split("=")[1];
       if (!rw || admin_right != role)
         continue;
//console.log(rw);
       if (right) {
         if (right == rw || rw == "write")
           rolesWithAllProjectRights.push(""+roles[i].id+"");
       }
       else
         rolesWithAllProjectRights.push(""+roles[i].id+"");
     }
   }
//console.log(rolesWithAllProjectRights);
   if (rolesWithAllProjectRights.length == 0)
     return false;
   var rightList = bcRights.split(" ");
//console.log(rightList);
   for (var i=0; i<rightList.length; i++)
   {
     var roleId = rightList[i].split(":")[0];
     if (!roleId)
       continue;
     if ($.inArray(roleId, rolesWithAllProjectRights) != -1) {
       return true;
     }
   }
   return false;
}

/*
 * role: String from adminRights
 * right: read/write (optional)
 * projectid: (optional)
 * if right is not set, right-check is ignored
 */
function
hasProjectRight(role, right, projectid)
{
  // log("hasProjectRight " + role + " " + right + " " + projectid+"/"+stacktrace());
  if (!bcRights || !role)
    return false;
   var rolesWithAdminRights = [];
   for (var i=0; i<roles.length; i++) {
     if (projectid && roles[i].projectid && roles[i].projectid != projectid)
       continue;
     var rightList = roles[i].admin_rights.split(" ");
     for (var j=0; j<rightList.length; j++) {
       var admin_right = rightList[j].split("=")[0];
       var rw = rightList[j].split("=")[1];
       if (!rw || admin_right != role)
         continue;
       if (right) {
         if (right == rw || rw == "write")
           rolesWithAdminRights.push(""+roles[i].id+"");
       }
       else
         rolesWithAdminRights.push(""+roles[i].id+"");
     }
   }
   if (rolesWithAdminRights.length == 0)
     return false;
   var rightList = bcRights.split(" ");
   for (var i=0; i<rightList.length; i++)
   {
     var roleId = rightList[i].split(":")[0];
     if (!roleId)
       continue;
     if ($.inArray(roleId, rolesWithAdminRights) != -1) {
       return true;
     }
   }
   return false;
}

// generic check if user has any adminrights
function
hasAdminRights(rights)
{
   if (!rights)
     return false;
   var rolesWithAdminRights = [];
   for (var i=0; i<roles.length; i++) {
     var admin_right = roles[i].admin_right;
     if (admin_right != "")
       rolesWithAdminRights.push(""+roles[i].id+"");
   }
   var rightList = rights.split(" ");
   for (var i=0; i<rightList.length; i++) {
     var roleId = rightList[i].split(":")[0];
     if (!roleId)
       continue;
     if ($.inArray(roleId, rolesWithAdminRights) != -1)
       return true;
   }
   return false;
}

function
enableInput() { 
  $("#loginmask button,#loginmask input").removeAttr("disabled");
}
function
disableInput() { 
  $("#loginmask button,#loginmask input").attr("disabled", "disabled");
}

function
login(user, password) {
  disableInput();
  log("login pressed!");
  if(!user) {
    bcUser = $("#login").val();
    bcPasswd = $("#password").val();
  }
  else {
    bcUser = user;
    bcPasswd = password;
  }
  bcUser = bcUser.toLowerCase();
  log("bcUser = " + bcUser);
  //log("bcPasswd = " + bcPasswd);
  var cbremember = $('.cbremember').is(':checked');
  backendCall("tableSelect", { tableName:"kipus_roles", orderBy:"name" },
    function(res, resultPar) {
      roles = res;
  backendCall("tableSelect",
    { tableName:"kipus_user", where:"login='"+bcUser+"'" },
    function(res, resultPar) {
      if (res.length == 0) {
        showAlert(trHtml.invalid_login[0], "warning");
        enableInput();
        return;
      }
      if(res[0].login.toLowerCase() == bcUser) {
        if (hasAdminRights(res[0].rights))
          bcRights = res[0].rights;
        else {
          showAlert(trHtml.invalid_login[1], "warning");
          enableInput();
          return;
        }
      }

      if((bcUser == 'public_reports' && bcUser != user) || !bcRights) {
        showAlert(trHtml.invalid_login[0], "warning");
        enableInput();
        return;
      }

      startDashboard();
      $("span.glyphicon-log-out").next("span").html("Logout ("+bcUser+")");
      if (cbremember) {
        log("save credentials");
        window.sessionStorage.setItem('bcUser', bcUser);
        window.sessionStorage.setItem('bcPasswd', bcPasswd);
      }
    }, undefined,
    function(res,resultPar){ log("invalid login");
      showAlert(trHtml.invalid_login[0], "warning");
      enableInput();
    });
  }, undefined,
    function(res,resultPar){ log("invalid login");
      showAlert(res?res:trHtml.invalid_login[3], "warning");
      enableInput();
  });
}



/*
 * Data maintenance
 */

function
toggle_csvimport() {
  if (!$(".form-csvimport").is(":visible")) {
    $(".table-datarows").css("display","none");
    $(".form-csvimport").css("display","");
    $(".form-csvimport :file").val("");
    push_headtitle("data", $("#btn-togglecsvimport").text());
  } else {
    $(".table-datarows").css("display","");
    $(".form-csvimport").css("display","none");
    pop_headtitle("data");
  }
}

function
toggle_data_view(project, tablename, pagetype, searchPrompt) {
  if (!$(".table-datarows").is(":visible")) {
    var par = { project: project, tablename: tablename, pagetype: pagetype, viewOnly: true };
    par.callbackfn = function() {
      $("#btn-data-addrow").hide();
      $("#btn-togglecsvimport").hide();
      
      $(".table-datarows [name=project]").val(project);
      $(".table-datarows [name=tablename]").val(tablename);
      $(".table-datarows [name=pagetype]").val(pagetype);
      $(".table-datarows").css("display","");
      $(".table-data").css("display","none");
      push_headtitle("data",tablename);
    };
    if (searchPrompt)
      show_search_prompt(par, function() { select_datarows(par); }); 
    else
      select_datarows(par);
  } else {
    $(".table-data").css("display","");
    filter_table($(".table-data"));
    $(".table-datarows").css("display","none");
    pop_headtitle("data");
    $(".table-datarows tr").remove();
  }
}

function
show_search_prompt(par, callbackfn) {
   backendCall("tableCols", { tableName:par.tablename },
      function(res, resultPar) {
   function create_col_options(cols, sort) {
     var options = "";
     if (sort) {
       cols.sort(function(a,b) {
         return a.displayname.localeCompare(b.displayname);
       });
     }
     function format_dn(col) {
       return col.displayname + (col.constrainttype?" ("+col.constrainttype+")":"")+" ["+col.COLUMN_NAME+"]";
     } 
     for (var i=0;i<cols.length;i++) {
       options += "<option value='"+cols[i].COLUMN_NAME+"'>"+(cols[i].displayname?format_dn(cols[i]):cols[i].COLUMN_NAME)+"</option>";
     }
     return options;
   }
   $("div#dialog").html('<div class="form-group"><label class="control-label">'+sprintf(trHtml.datarow_filter[0], par.tablename)+'</label></div>'+
    '<div class="form-group row-flex">'+
      '<div class="col-flex"><select class="form-control" id="col_select">'+create_col_options(res)+'</select></div>'+
        '<div class="col-flex"><input class="form-control" placeholder="'+trHtml.datarow_filter[5]+'" type="text" id="col_select_val" /></div>'+
      '</div>'+
    '<div class="form-group">'+
        '<input type="text" class="form-control" id="search_fulltext" placeholder="'+trHtml.datarow_filter[1]+'"/></div>'+
   //'<div class="form-group"><input type="text" class="form-control" id="search_sql_where" placeholder="'+ trHtml.datarow_filter[2]+ '"></input></div>'+
    '</div>');
  
   $("div#dialog").dialog({
     minWidth: 640,
     dialogClass:"no-close", buttons: [
       {text:sprintf(trHtml.datarow_filter[4], trHtml.th_show), click:function(){
          var btnTxt = $(".ui-dialog-buttonset button:first").text();
          if (btnTxt.startsWith(trHtml.th_show)) {
            backendCall("tableSelect", { tableName:"kipus_pagedefinition", filterCol:'tablename', filterVal: par.tablename},
              function(res2, resultPar) {
              backendCall("tableSelect", { tableName:"kipus_pageattributes", filterCol:'pagedefid', filterVal: res2[0].id, orderBy: "columnorder"},
                function(res1, resultPar) {
                  for (var i=0;i<res1.length;i++) {
                    res1[i].COLUMN_NAME = res1[i].columnname;
                  }
                  $("div#dialog #col_select").html(create_col_options(res1, true));
              });
            });
          }
          else {
            $("div#dialog #col_select").html(create_col_options(res));
          }
          $(".ui-dialog-buttonset button:first").text(sprintf(trHtml.datarow_filter[4], btnTxt.startsWith(trHtml.th_show)?trHtml.th_hide:trHtml.th_show));
       }},
       {text:trHtml.dlg[9], click:function(){
          var col_sel = $("div#dialog #col_select").val();
          var col_sel_val = $("div#dialog #col_select_val").val();
          var ft = $("div#dialog #search_fulltext").val();
          var where = $("div#dialog #search_sql_where").val();
          if (!ft && !where && !col_sel_val) {
            okDialog(trHtml.datarow_filter[3]);
            return;
          }
          par.filter = { fulltext: ft, sql_where: where };
          if (col_sel_val && col_sel_val.length > 0) {
            par.filter.filterCol = col_sel;
            par.filter.filterVal = col_sel_val;
          }
          limitDataRowsTable = defaultLimitDataRowsTable;
          if (callbackfn)
            callbackfn();
         $(this).dialog("close");
       }},
       {text:trHtml.dlg[1],click:function(){$(this).dialog("close");}}]
   });
   $(".ui-dialog-buttonpane button:first").css("position","absolute");
   $(".ui-dialog-buttonpane button:first").css("left","25px");
   });
}


function
toggle_data_edit(project, tablename, pagetype, searchPrompt) {
  $("#datarowstable").removeAttr("showEditIcons");
  $("#datarowstable").removeAttr("editColumnIdx");
  $("#datarowstable").removeAttr("editScrollTop");
  $("#datarowstable").removeAttr("editScrollLeft");
  if (!$(".table-datarows").is(":visible")) {
    var par = { project: project, tablename: tablename, pagetype: pagetype, viewOnly: false };
    function do_show_datarows() {
      saveOffset("data");
      $(".headtitle span.waiting").show();
      $("div.table-datarows .btn-toolbar button").attr("disabled", true);
      $("#datarowstable tbody").empty();
      if (pagetype == "BODY" || pagetype == "HEADER")
        $("#btn-data-addrow").css("display", "none");
      else
        $("#btn-data-addrow").css("display", "");
     
      if (pagetype == "BODY" || pagetype == "HEADER")
        // disable csv import for body/header pages
        $("#btn-togglecsvimport").css("display", "none");
      else
        $("#btn-togglecsvimport").css("display", "");
      // enable download table data for all pagetypes
      $("#btn-csvexport").css("display", "");
      $(".table-datarows [name=project]").val(project);
      $(".table-datarows [name=tablename]").val(tablename);
      $(".table-datarows [name=pagetype]").val(pagetype);
      $(".table-data").css("display", "none");
      $(".table-datarows").css("display", "");
      par.callbackfn = function () {
        var title = tablename;
        if (par.filter) {
          if (par.filter.filterCol && par.filter.filterVal)
            title += " ("+par.filter.filterCol + "="+par.filter.filterVal+")";
          if (par.filter.fulltext)
            title += " (fulltext search = " + par.filter.fulltext+")";
          if (par.filter.sql_where)
            title += " (WHERE " + par.filter.sql_where+")";

        }
        push_headtitle("data",title);
        $(".headtitle span.waiting").hide();
        $("div.table-datarows .btn-toolbar button").attr("disabled", false);
      };
      select_datarows(par);
    }
    if (searchPrompt)
      show_search_prompt(par, do_show_datarows);
    else
      do_show_datarows();
  } else {
    // back
    removeOffset("data");
    $(".table-data").css("display", "block");
    $(".table-datarows").css("display", "none");
    filter_table($(".table-data"));
    pop_headtitle("data");
    loadOffset("data");
    $(".table-datarows tr").remove();
    // reset for next time
    limitDataRowsTable = defaultLimitDataRowsTable;
  }
}

function
toggle_datarow_add() {
  var tablename =   $(".table-datarows [name=tablename]").val();
  var sel = ".form-tablerow.details";
  if (!$(sel).is(":visible")) {
    saveOffset("data");
    /* reset cols */
    for (var i = 0; i < dcols.length; i++) {
        $(sel+" .fields [name="+dcols[i]+"]").val("");
    }
    $(".table-datarows").css("display", "none");
    $(sel).css("display", "");
    $(sel+" .fields input").val("");
    $(sel+" .fields textarea").val("");
    $(sel+" .fields select").each(function() {
      if ($(this).attr("default"))
        $(this).val($(this).attr("default"));
      else
        $(this).val("");
    });
    $(sel+" img.db_image").attr("src", "");
    $(sel+" img.db_image").hide();
    $(sel+" .fields [name=_tablename]").val(tablename);
    $(sel+" #btn-addrow").show();
    $(sel+" #btn-updaterow").hide();
    $(sel+" .fields [name=id]").closest(".row-flex").hide();
    $(sel+" .selectpicker").selectpicker("val", "");
    push_headtitle("data", $("#btn-data-addrow").text());
  } else {
    // back
    removeOffset("data");
    $(sel).css("display", "none");
    $(".table-datarows").css("display", "");
    pop_headtitle("data");
    loadOffset("data");
  }
}

function
toggle_datarow_edit(par) {
  var sel = ".form-tablerow.details";
  var tablename = $(".table-datarows [name=tablename]").val();
  function n(x) { if(x != undefined) return x; return ""; } // avoid undefined as string
  if (!$(sel).is(":visible")) {
    saveOffset("data");
    drow = drows[par.rowidx];
    var scrollTop = $(document).scrollTop();
    var scrollLeft = $(document).scrollLeft();
    $(".table-datarows").css("display", "none");
    $(sel).css("display", "");
    $(sel+" #btn-addrow").hide();
    $(sel+" #btn-updaterow").show();
    $(sel+" .fields input").val("");
    $(sel+" img.db_image").attr("src", "");
    $(sel+" img.db_image").hide();
    $(sel+" .fields [name=id]").closest(".row-flex").hide();
    $(sel+" .fields [name=_tablename]").val(tablename);
    $(sel+" [name=id]").closest(".form-group.row").hide();
    $("#datarowstable").attr("showEditIcons", tablename);
    if (par.icon) {
      $("tr.highlighted,td.highlighted").removeClass("highlighted");
      $(par.icon).closest("tr").addClass("highlighted");
      var idx = $(par.icon).closest("td").index();
      if (idx) {
        $(par.icon).closest("td").addClass("highlighted");
        $("#datarowstable").attr("editColumnIdx", idx+1);
        $("#datarowstable").attr("editScrollTop", scrollTop);
        $("#datarowstable").attr("editScrollLeft", scrollLeft);
        var col = $("#datarowstable th:nth-child("+(idx+1)+")").text();
        if (col && col != "id" && col != "modified" && col != "rowid" && col != "bookid" && col != "modifiedby") {
          var group = $(sel+" [name="+col+"]").closest(".form-group");
          if (group) {
            window.scrollTo(0, $(group).offset().top);
            $(group).animate({"color":"#efbe5c"}, 1000).animate({"color":"#333333"}, 5000);
            $(group).find(".form-control").focus();
          }
        }
      }
    }
    if (drow)
    $.each(drow, function( key, value ) {
        var o = $(sel+" .fields [name="+key+"]");
        $(o).attr("readonly", key == "rowid" || key == "rootbookid" || key == "bookid" || par.viewOnly);
        value = ""+n(value)+"";
        if ($(o).hasClass("selectpicker")) {
          var v= value.split(",");
          for (var i=0; i<v.length; i++) {
            v[i] = v[i].replace(/&#44;/g, ","); // Neat trick to embed , into choicelist values
          }
          $(o).selectpicker("val", v);
        }
        else {
          $(o).val(value);
        }
        if(value.indexOf("[deferred:") == 0) {
          image_changed(o);
        }
        if(value.indexOf("[file:") == 0) {
          attach_changed(o);
        }
    });
    if (par.viewOnly)
      $("#btn-updaterow").hide();
    else
      $("#btn-updaterow").show();
    push_headtitle("data",$("#btn-updaterow").text());
    $('.selectpicker').selectpicker('render');
  } else {
    // back
    removeOffset("data");
    $(sel).css("display", "none");
    $(".table-datarows").css("display", "");
    $("#datarowstable").removeAttr("showEditIcons");
    pop_headtitle("data");
  }
  if (par.callbackfn)
    par.callbackfn();
}

function
attach_file_changed(input)
{
  if(!$(input).val())
    return;
  var filename = $(input).val();
  filename = filename.replace(/^.*\\/, "");

  var fr = new FileReader();
  fr.onload = function(e) {
    var result = filename+";"+e.target.result;
    $(input).closest(".form-group").find(".col-flex-2 div").each(function(){
      $(this).val(result);
      attach_changed(this);
    });
  }

  // check maxsize
  var filesize = input.files[0].size;
  var maxsize = $(input).attr("maxsize");
  if (!isNaN(maxsize) && filesize > parseInt(maxsize))
    okDialog('<div>'+sprintf(trHtml.upload_pfile[3], maxsize)+'</div>');
  else
    fr.readAsDataURL(input.files[0]);
}

function
attach_changed(input)
{
  var fileRe = new RegExp("^\\[file:([A-Z0-9_]+/[0-9]+/[A-Z0-9_]+)\\]$");
  var colVal = $(input).val();
  var reRes = fileRe.exec(colVal);
  var link = $("[name="+$(input).attr('id')+"-link]");
  if(reRes !== null) {
    var src = backendPrefix+"/dbFile?fileid="+reRes[1];
    $(link).attr("href", src);
    $(link).text(filenames[reRes[1]]);
    $(link).show();
    $(link).unbind("click").click(function(event) {
       event.preventDefault();
       downloadFile(backendPrefix+"/dbFile?fileid="+reRes[1], true);
    });
  } else {
    $(link).hide();
  }
}

function
update_signature(input)
{
  var filename = $(input).closest(".form-group").find(".col-flex-2 div").attr("id");
  $("#signature .button.save").click(function() {
     if (!signaturePad || signaturePad.isEmpty()) {
         alert("Please provide signature first.");
     } else {
         log("updated signature image");
         var img = new Image();
         img.onload = function() {
          var result = filename+";"+signaturePad.toDataURL();
           $(input).closest(".form-group").find(".col-flex-2 div").each(function(){
             $(this).val(result);
             image_changed(this);
           });
         }
         img.src = signaturePad.toDataURL();
     }
  });
}

function
image_file_changed(input, divEl)
{
  if(!$(input).val())
    return;
  var filename = $(input).val();
  filename = filename.replace(/^.*\\/, "");
  if(!divEl)
    divEl = $(input).closest(".form-group").find(".col-flex-2 div");

  var fr = new FileReader();
  fr.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var result = filename+";"+e.target.result;
      $(divEl).each(function(){
        $(this).val(result);
        image_changed(this);
      });
    }
    img.src = e.target.result;
  }
  fr.readAsDataURL(input.files[0]);
}

function
image_changed(input)
{
  var imgRe = new RegExp("^\\[deferred:([A-Z0-9_]+/[0-9]+/[A-Z0-9_]+)\\]$");
  var colVal = $(input).val();
  var reRes = imgRe.exec(colVal);
  var image = $("#"+$(input).attr('id')+"-img");
  if(reRes !== null) {
    var src = backendPrefix+"/dbImage?imageid="+reRes[1];
    $(image).attr("src", src);
    $(image).closest("a").attr("href", src);
    var rowid = $(".form-tablerow.details .fields [name=rowid]").val();
    var link = $(image).closest("a").attr("download");
    if (link)
      $(image).closest("a").attr("download", link.replace("ROWID", rowid));
  } else {
    imgRe = new RegExp("^([^;]*);data:image/[^;]+;base64,");
    reRes = imgRe.exec(colVal);
    if(reRes !== null) {
      var fName = reRes[1];
      var cv = colVal.substr(fName.length+1);
      $(image).attr("src", cv);
    } else {
      $(image).attr("src", "");
    }
  }
  $(image).show();
}

function
image_hover_enter(el)
{
  var bodyRect = document.body.getBoundingClientRect();
  var srcRect = (el?el.getBoundingClientRect(): null);
  var src = $(el).attr('src');
  src = src.replace("dbImageIcon","dbImage");
  $("#imageView img").remove();
  $("#imageView").append("<img src="+src+"></img>");
  $('#imageView img').load(function(){
    $("#imageView").show();
    if (!srcRect)
       return;
    $(this).center();
    var posX = srcRect.left - bodyRect.left - $(this).width() - 10;
    // collosion-detection, 250px is width of left menu bar
    if (posX - $(document).scrollLeft() < 250)
    {
       var posRight = srcRect.left - bodyRect.left + 10 + $(el).width();
       if (posRight + $(this).width() < $(document).width()) {
          log("reposition right of shortcut");
          posX = posRight;
       }
    }
    var posY;
    // keep small images aligned with shortcut, center big images
    if (srcRect.width + 2 < $(this).width())
      posY = srcRect.top - bodyRect.top - $(el).height();
    else
      posY = srcRect.top - bodyRect.top;
    $(this).css({
        "position": "absolute",
        "left": posX,
        "top":  posY
    });
  });

}

function
image_hover_leave(el)
{
  $("#imageView").hide();
  var element = $(document.elementFromPoint(mouse.x, mouse.y));
  $("#imageView").show();
  if ($(element).hasClass("shownInTable")) {
    window.setTimeout(function() { image_hover_leave();}, 50);
  }
  else {
    $("#imageView").hide();
    $("#imageView img").remove();
  }
}

function get_cellval(row, index) {
  if ($(row).children('td').eq(index).find("div").length == 0)
    return $(row).children('td').eq(index).html();
  else
    return $(row).children('td').eq(index).find("div").html();
}

function comparer(index, textOnly) {
    if (textOnly)
    return function(a, b) {
        var valA = a.cells[index].innerHTML, valB = b.cells[index].innerHTML;
        return valA.localeCompare(valB);
    }
    else
    return function(a, b) {
      var valA = get_cellval(a, index), valB = get_cellval(b, index);
      return $.isNumeric(valA) && $.isNumeric(valB) ? valA - valB : valA.localeCompare(valB);
    }
}

function
sort_tablerows(el, updateOnly, textOnly)
{
  //console.log("sort_tablerows(): on  ");console.log(el);
  var table = $(el).closest("table").eq(0);
  if (!updateOnly) {
    $(".pager").remove();
    $(table).find("th .sortActive").each(function () {
       $(this).removeClass("sortActive");
       $(this).removeClass("glyphicon-sort-by-attributes-alt");
       $(this).addClass("glyphicon-sort-by-attributes");
       if (this != el)
         delete this.asc;
    });
  }
  var th = $(el).closest("th");
  var rows = $(table).find('tbody tr').toArray().sort(comparer($(th).index(), textOnly));
  if (!updateOnly) {
    if (el.asc == undefined)
      el.asc = true;
    el.asc = !el.asc;
  }
  if (el.asc) {
    rows = rows.reverse();
    $(el).addClass("glyphicon-sort-by-attributes-alt");
  }
  $(el).addClass("sortActive");
  var tbody = $("<tbody></tbody>");
  for (var i = 0; i < rows.length; i++)
    $(tbody).append(rows[i]);
  $(table).find("tbody").remove();
  $(table).append(tbody);
  var filterstr = $(el).closest(".filtertable").find("[name=filterinput]").val();
  if (filterstr == undefined || filterstr == "")
    table_pagination(table);
  else
    filter_table(el);
}

function
last_visit_clicked(el)
{
  var is_checked = $(el).is(":checked");
  if (is_checked) {
    $(".form-pdattr [name=defaultvalue]").val("{last}");
    $(".form-pdattr [name=defaultvalue]").attr("disabled", "disabled");
  } else {
    $(".form-pdattr [name=defaultvalue]").val("");
    $(".form-pdattr [name=defaultvalue]").removeAttr("disabled");
  }
}

function
select_datarows(par)
{
  if (!par.status)
    par.status = 0; 
  do_select_datarows(); 

  function do_select_datarows() {
    var status = par.status++;
    if (status == 0) {
      if (par.updatedRowId) {
         return do_select_datarows();
      }
      // retrieve column order (1)
      backendCall("tableSelect", { tableName:"kipus_pagedefinition", filterCol:'tablename', filterVal: par.tablename},
        function(res, resultPar) {
          par.pdef = res;
          if (res.length == 0) 
             return do_select_datarows();
          backendCall("tableSelect", { tableName:"kipus_pageattributes", filterCol:'pagedefid', filterVal: res[0].id, orderBy: "columnorder"},
            function(res1, resultPar) {
           par.pdattr = res1;
           return do_select_datarows();
          });
        });
    }
    if (status == 1) {
      if (par.updatedRowId)
         return do_select_datarows();
      // retrieve attachment filenames
      backendCall("tableSelect", { tableName:"kipus_bigdata", columns: "dataid,comment", where:"dataid like '"+par.tablename+"/%'"},
        function(res, resultPar) {
           filenames = {};
           for (var i=0; i<res.length; i++) {
             var row = res[i];
             filenames[row.dataid] = row.comment;
           }
           return do_select_datarows()
        });
    }
    if (status == 2) {
      if (par.updatedRowId)
         return do_select_datarows();
      if ((par.pagetype == "HEADER" || par.pagetype == "BODY") &&
        (hasAllProjectRight("DataMaintenanceBooks", "read") ||
         hasAllProjectRight("AdminAll", "read")))
         return do_select_datarows();

      if (par.pagetype == "LOOKUP" &&
        (hasAllProjectRight("DataMaintenanceLookupTables", "read") ||
         hasAllProjectRight("AdminAll", "read")))
         return do_select_datarows();

      var par1 = { forUser:bcUser, project:par.project, tablename:par.tablename,
                   includeRowIds:true,
                   roletype: (par.pagetype=="LOOKUP" ? "DataMaintenanceLookupTables" :
                                                   "DataMaintenanceBooks") };
      backendCall("getMyUserData", par1,
        function(res, resultPar) {
           log("getMyUserData returned");
           par.rows = {};
           for (var i=0; i<res.length; i++) {
             if (res[i].tablename != par.tablename)
               continue;
             var rows = res[i].rows;
             for (var j=0; j<rows.length; j++) {
               var key = rows[j]["rowid"]+"/"+rows[j]["bookId"];
               par.rows[key] = 1;
             }
           }
           return do_select_datarows();
        });
    }
    if (status == 3) { // collect multiFromTable/singleFromTable
      backendCall("tableCols", { tableName:par.tablename },
        function(res, resultPar) {
          par.colHash = {};
          var res2=[];
          for(var i=0; i<res.length; i++) // filter deleted
            if(!(par.pagetype=='LOOKUP' && res[i].COLUMN_NAME == 'deleted'))
              res2.push(res[i]);
          res = res2;
          if (par.pdattr) {
            for(var i=0; i<par.pdattr.length; i++)
              par.colHash[par.pdattr[i].columnname] = par.pdattr[i];
          }
          res.sort(function (a,b) {
             var aOrder = (par.colHash[a.COLUMN_NAME] ? par.colHash[a.COLUMN_NAME].columnorder : 0);
             var bOrder = (par.colHash[b.COLUMN_NAME] ? par.colHash[b.COLUMN_NAME].columnorder : 0);
             return (aOrder - bOrder);
          });
          par.tcols = res;
          var tables = {};
          for(var i=0; i<res.length; i++) {
              var colName = res[i].COLUMN_NAME;
              var data = par.colHash[colName];
              if (data && (data.constrainttype == "multiFromTable" ||
                           data.constrainttype == "singleFromTable")) {
                var cpa = data.constraintparam.split(" ");
                tables[cpa[0]] = { sql:cpa[0], col:"DISPLAYNAME" };
                if(table2pagetype[cpa[0]] == "BODY")
                  tables[cpa[0]].sql += ",kipus_rows where rowid=kipus_rows.id";
                if(cpa.length > 2) {
                  var dp = cpa[2].split(":");
                  if(dp[0])
                    tables[cpa[0]].col = dp[0];
                }
              }
          }
          var todo = Object.keys(tables).length;
          if (todo == 0)
             return do_select_datarows();
          par.tables = {};
          var tarr = Object.keys(tables);
          for (var i=0; i<tarr.length; i++) {
              var tbl = tarr[i];
              (function(tbl){
              backendCall("tableSelect", { tableName:tables[tbl].sql },
                function(res, resultPar) {
                  par.tables[tbl] = { rows:res, col:tables[tbl].col };
                  if (--todo == 0)
                     return do_select_datarows();
             });
             })(tbl);
          }

      });
    }
    if (status == 4) {
          var ft = par.filter && par.filter.fulltext;
          backendCall("tableSelect", { tableName:par.tablename,columns:ft?null:"id", 
                                       filterCol:par.filter && par.filter.filterCol? par.filter.filterCol:null,
                                       filterVal:par.filter && par.filter.filterVal? par.filter.filterVal:null,
                                       filterFulltext: (ft? par.filter.fulltext:null),
                                       where: (par.filter && par.filter.sql_where? par.filter.sql_where:null) },
            function(res, resultPar) {
              par.allcount = res.length;
              return do_select_datarows();
         });
    }
    if (status == 5) {
      var showEditIcons = $("#datarowstable").attr("showEditIcons");
      if (!par.updatedRowId) {
        $("#datarowstable >thead tr").remove();
        $(".form-tablerow.details .fields").empty();
        var form = '<div class="form-group row-flex">'+
                     '<label trid="th_tablename" for="_tablename"' +
                       ' class="col-flex control-label">'+trHtml.th_tablename[0]+
                     '</label>'+
                     '<div class="col-flex-2">' +
                       '<input readonly type="text" class="form-control" '+
                          'name="_tablename" />'+
                     ' </div>'+
                   '</div>';
        cols = [];
        var row = "<tr><th trid='th_edit'>Edit</th><th trid='th_delete'>Delete</th>";

        function
        create_constraintparam_options(column, type, param) {
          var options = "";
          if (!param || !type)
            return "";
          if (type == "multiFromTable" || type == "singleFromTable") {
            var cp = param.split(" ");
            var tbl = cp[0];
            var rows = par.tables[tbl].rows;
            var col = par.tables[tbl].col;
            var pt = table2pagetype[tbl];
            var fltr = [];
            if (cp.length > 1)
              fltr = cp[1].split("="); 
            for (var i=0; i<rows.length; i++) {
              var dn = rows[i][col]?rows[i][col]:rows[i]["SHORT_NAME"];
              var sOpt = (pt=="HEADER" ? rows[i].bookid+"/0" :
                         (pt=="BODY"   ? rows[i].bookid+"/"+rows[i].foreignRowId :
                                         rows[i].id));
              var sOpt2 = (sOpt+'').replace(/[^A-Za-z0-9_]/g, '_')
              if (dn == undefined)
                dn = rows[i]["NAME"]?rows[i]["NAME"]:sOpt;
              // commented out filter, since it does not cover all constraintparam filter
              // and filter logic is not specified
              //if (fltr.length > 0 && rows[i][fltr[0]] != fltr[1])
                //continue;
              options  += "<option search='"+sOpt2+"' value='"+sOpt+"'>"+
                                  dn + "</option>";
            }
          } else {
            var params = param.split(",");
            for(var i=0; i<params.length; i++) {
              options  += "<option value='" + params[i] + "'>"+
                                  params[i]+"</option>";
            }
          }
          options += "<option value=''>Nothing selected</option>";
          return options;
        }
        for(var i=0; i<par.tcols.length; i++) {
          var colName = par.tcols[i].COLUMN_NAME;
          var data = par.colHash[colName];
          var displayname = colName;
          if (data && data.constrainttype)
            displayname += " <span style='font-weight: 500; padding-right:5px;'>(" + data.constrainttype+")</span>";
          if (data && data.displayname && data.displayname != "") 
            displayname += " <div style='font-weight: initial'>" + data.displayname+ "</div>";
          row += "<th><span style='padding-right:5px'>"+colName + "</span><i class='btn-link glyphicon glyphicon-sort-by-attributes '" +
                    "onclick='sort_tablerows(this)'></i></th>";
          form += ' <div class="form-group row-flex"> <div class="col-flex"><label class="control-label">' + displayname + '</label></div>';
          if (colName == "IMAGE" || (data && data.constrainttype == "foto")) {
            form += '<div class="col-flex-2" style="display:none">' +
                     ' <div class="form-control" id="'+colName+'" name="' + colName + '" onblur="image_changed(this)"/></div>';
            form += '<div class="col-flex-2">' +
                     ' <input type="file" multiple="false" accept="image/jpeg,image/x-png" id="image_file" name="image_file" onchange="image_file_changed(this)"/>'+
                     ' <a href="#" download="'+par.tablename + '.'+colName+'.'+'ROWID.png"><img id="'+colName+'-img" name="' + colName + '-img" class="db_image" /></a></div></div>';
          } else if (data && (data.constrainttype == "signature")) {
            form += '<div class="col-flex-2" style="display:none">' +
                     ' <div class="form-control" id="' + colName+'" name="' + colName + '" onblur="image_changed(this)"/></div>';
            form += '<div class="col-flex-2">' +
                      '<button id="signature_button" class="btn btn-default update_signature_button" '+
                        'data-toggle="modal" data-target="#signature" onClick="update_signature(this)">Update signature</button>'+
                     ' <img id="' + colName + '-img" name="'+colName+ '-img" class="db_image db_signature" /></div></div>';
          } else if (data && (data.constrainttype == "file")) {
            // check constraint params for file (maxSizeInBytes xls docx pdf AllowDownload)
            var accept = [];
            var maxsize = null;
            if (data.constraintparam) {
               var params = data.constraintparam.split(" ");
               for (var j=0; j<params.length; j++) {
                  var p = params[j];
                  if (!isNaN(p))
                    maxsize=p;
                  else if (p != "AllowDownload")
                    accept.push(p);
               }
            }
            form += '<div class="col-flex-2" style="display:none">' +
                     ' <div class="form-control" name="' + colName + '" onblur="attach_changed(this)"/></div>';
            form += '<div class="col-flex-2">' +
                     ' <input multiple="false" type="file" id="attach_file" onchange="attach_file_changed(this)"'+
                         (accept.length>0?' accept="'+accept.join(",")+'"':'')+
                         (maxsize?' maxsize="'+maxsize+'"':'')+
                     '/>'+
                     '<a name="' + colName + '-link" class="db_link" /></div></div>';

          } else if (data && (data.constrainttype == "multiFromArg" || data.constrainttype == "singleFromArg" ||
                              data.constrainttype == "multiFromTable" || data.constrainttype == "singleFromTable")) {
            form += '<div class="col-flex-2">' +
                     ' <select class="form-control selectpicker" name="'+colName+'"' + (data.defaultvalue?'default="'+data.defaultvalue+'"':'')+
                       (data.constrainttype == "multiFromArg" || data.constrainttype == "multiFromTable"?' multiple':'')+'>'
                          + create_constraintparam_options(colName, data.constrainttype, data.constraintparam)+
                    '</select></div></div>';
          } else if (data && (data.constrainttype == "multiLine")) {
            var colNum=null;
            var rowNum=null;
            if (data.constraintparam) {
              var xy = data.constraintparam.split("x");
              if (xy) {
                colNum = parseInt(xy[0]);
                rowNum = parseInt(xy[1]);
              }
            }
            form += '<div class="col-flex-2">' +
              ' <textarea type="text" '+(rowNum && !isNaN(rowNum)?"rows='"+rowNum+"'":"")+" "+
              (colNum && !isNaN(colNum)?"cols='"+colNum+"'":"")+' class="form-control" name="' + colName + '"/></div></div>';
          } else if (data && (data.constrainttype == "gps")) {
            form += '<div class="col-flex-2">' +
                     '<div class="gpsInput" style="display:inline-block"><input type="text" class="form-control" '+
                     ' name="' + colName + '" param="' + data.constraintparam + '" /></div>';
            form += '<button type="submit" class="gpsGetCurrentLoc" style="cursor: pointer;margin:5px;">Current location</button>';
            form += '<button type="submit" class="gpsGetAddress" style="cursor: pointer;margin:5px;">Compute Address from location</button>';
            form += '<div style="margin:5px;"><span style="white-space:nowrap;margin:5px;">';
            form += '<input id="google_maps" type="checkbox" style="margin:5px;">Use Google-Maps</span>';
            form += '<div class="gpshelp">Note: Google-Maps needs internet connection</div></div>';
            form += '</div></div>';

          } else {
            form += '<div class="col-flex-2">' +
                     ' <input type="text" class="form-control" name="' + colName + '" ';
            if (par.tcols[i].colName == "id" || colName == "id")
              form += " readonly";
            form += '/></div></div>';
          }
          cols.push(colName);
        }
        dcols = cols;
        row += "</tr>";
        $('#datarowstable').find('thead:last').append(row);
        $(".form-tablerow.details .fields").append(form);
        $(".form-tablerow.details button.gpsGetAddress").click(function(){
          log("gpsGetAddress clicked");
          var gpsInput = $(this).closest(".form-group").find(".gpsInput input");
          var cmpCol = kps_gpsArg($(gpsInput).attr("param"), "COMPUTED");
          if (!cmpCol)
            return;
          var latlong = $(gpsInput).val().split(" ");
          if (latlong.length != 2)
            return;
          loadScript('https://maps.googleapis.com/maps/api/js',
                     function(){
              var gPos = new google.maps.LatLng(latlong[0], latlong[1]);
              kps_gpsSetGeoVal($(gpsInput).attr("id"), { latLng:gPos }, 1, $(gpsInput).attr("param"), undefined, undefined, true);
          });
          $(gpsInput).change(function(){
            if ($(".form-tablerow.details input#google_maps").is(":checked"))
               return; // already handled
            log("gps input changed");
            var latlong = $(gpsInput).val().split(" ");
            if (latlong.length != 2)
              return;
            var gPos = new google.maps.LatLng(latlong[0], latlong[1]);
            kps_gpsSetGeoVal($(gpsInput).attr("id"), { latLng:gPos }, 1, $(gpsInput).attr("param"), undefined, undefined, true);
          });
        });
        $(".form-tablerow.details button.gpsGetCurrentLoc").click(function(){
          var gpsInput = $(this).closest(".form-group").find(".gpsInput input");
          var id = $(gpsInput).attr("id");
          var param = $(gpsInput).attr("param");
          function
          gpsGetLocation(id, param) // CurrentLocation button pressed
          {
            navigator.geolocation.getCurrentPosition(
              function(p) {
                if(!gq["map"+id]) {     // No google Map.
                  var lat = Math.round(p.coords.latitude *100000)/100000; // 11meter
                  var long = Math.round(p.coords.longitude*100000)/100000;
                  var val = lat+ " " +long;
                  $(gpsInput).val(val);
                  loadScript('https://maps.googleapis.com/maps/api/js',
                             function(){
                    var gPos = new google.maps.LatLng(lat, long);
                    kps_gpsSetGeoVal(id, { latLng:gPos }, 1, param, undefined, undefined, true);
                  });
                  return;
                }
                var gPos = new google.maps.LatLng(p.coords.latitude, p.coords.longitude);
                kps_gpsSetGeoVal(id, { latLng:gPos }, 1, param);
              },
              function(error) { msg("GPS: "+error.message); },
              { enableHighAccuracy:true, timeout: 180000, maximumAge:300000 });
          }
          gpsGetLocation(id, param);
        });
        $(".form-tablerow.details input#google_maps").click(function() {
          log("use google_maps clicked");
          var isSet = $(this).is(":checked");
          var gpsInput = $(this).closest(".form-group").find(".gpsInput input");
          var cmpCol = kps_gpsArg($(gpsInput).attr("param"), "COMPUTED");
          if(isSet) {
            loadScript('https://maps.googleapis.com/maps/api/js',
                       function(){kps_gpsAddGM(gpsInput); });
            if(cmpCol)
              $(".form-tablerow.details textarea[name="+cmpCol+"]").closest(".form-group").show();

          } else {
            var id = $(gpsInput).attr("id");
            $(this).closest(".form-group").find("#gmap_"+id).remove();
            delete(gq["map"+id]);
            delete(gq["marker"+id]);
            $(this).closest(".form-group").find(".gpshelp").html("Note: Google-Maps needs internet connection");;
            if(cmpCol && !$(".form-tablerow.details textarea[name="+cmpCol+"]").val())
              $(".form-tablerow.details textarea[name="+cmpCol+"]").closest(".form-group").hide();
          }

        });
        $(".form-tablerow.details .fields select").change();
      }

      function htmlEscape(str) {
          return String(str)
                  .replace(/&/g, '&amp;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;');
      }
      function cropString(str) {
         if (str.length > 40)
           return str.substring(0,40) + "...";
         else
           return str;
      }
      function update_limit(drows) {
        $(".table-datarows #btn-data-prev span, .table-datarows #btn-data-next span").text(limitStep);
        if (limitDataRowsTable == null || drows.length == par.allcount)
          txt = drows.length + " rows";
        else {
          var limit = parseInt(limitDataRowsTable.split(",")[0]);
          txt = "rows "+(limit+1)+"-"+(limit+limitStep>par.allcount?par.allcount:limit+limitStep) + " (of max: " + par.allcount+" rows)";
        }
        $("#datarowstable >tfoot").empty().append('<tr><td valign="bottom" align="left" colspan="42">'+txt+'</td></tr>');
        if (limitDataRowsTable == null || drows.length == par.allcount)
          $(".table-datarows #btn-data-prev, .table-datarows #btn-data-next").hide();
        else {
          var limit = parseInt(limitDataRowsTable.split(",")[0]);
          if (limit - limitStep < 0)
            $(".table-datarows #btn-data-prev").hide();
          else
            $(".table-datarows #btn-data-prev").show();
          if (limit + limitStep > par.allcount)
            $(".table-datarows #btn-data-next").hide();
          else
            $(".table-datarows #btn-data-next").show();
        }
      }
      function n(x) { if(x !== null && x !== undefined) return x; return ""; }


      function render_datarows(par) { 
      backendCall("tableSelect", { tableName:par.tablename, limit: limitDataRowsTable, 
                                   filterCol:par.filter && par.filter.filterCol? par.filter.filterCol:null,
                                   filterVal:par.filter && par.filter.filterVal? par.filter.filterVal:null,
                                   filterFulltext: (par.filter && par.filter.fulltext? par.filter.fulltext:null),
                                   where: (par.filter && par.filter.sql_where? par.filter.sql_where:null) },
        function(res, resultPar) {
          drows=res;
          update_limit(drows);
          log(drows.length + " rows found in table " + par.tablename);
          var dropdowns = {};
          $(".form-control.selectpicker").each(function() {
             var id = $(this).attr("name");
             $(this).find("option[search]").each(function() {
               var search = $(this).attr("search");
               if (!dropdowns[id])
                 dropdowns[id] = {};
               dropdowns[id][search] = $(this).text();
             });
          });
          if (!par.updatedRowId)
            $("#datarowstable >tbody").remove();
          var imgRe = new RegExp("^\\[deferred:([A-Z0-9_]+/[0-9]+/[A-Z0-9_]+)\\]$");
          var fileRe = new RegExp("^\\[file:([A-Z0-9_]+/[0-9]+/[A-Z0-9_]+)\\]$");
          var rows = [];
          for(var i=0; i<res.length; i++) {
            var r = res[i];
            if (par.updatedRowId && par.updatedRowId != r.id)
               continue;
            if ((par.pagetype == "HEADER" || par.pagetype == "BODY") && par.rows) {
               var key = r.rowid+"/"+r.bookid;
               // only show rows that user is allowed to see
               if (!par.rows[key])
                 continue;
            }
            var isDel = (par.pagetype == "LOOKUP" && r.deleted == 'YES');
            var editIcon = "<i class='details btn-link glyphicon "+glEdit+"'></i>";
            var hiddenEditIcon = "<i style='display:none' class='details btn-link glyphicon "+glEdit+"'></i>";
            var row = "<tr class='"+
                  (r.id==par.updatedRowId?" highlighted":"")+
                  (isDel ?" trash":"")+"'"+
                  " data-rowidx='"+i+"' "+
                  " tblId='"+r.id+"'>"+
              "<td align='center' class='edit'>"+editIcon+"</td>" +
              "<td align='center' class='delete'>"+
                      "<i class='btn-link glyphicon "+
                      (isDel ? "glyphicon-trash" : "glyphicon-remove red")+"'></i></td>";
            for (var j=0; j<resultPar.length; j++) {
               var colName = resultPar[j];
               var colVal = n(r[colName]);

               var reRes = imgRe.exec(colVal);
               var re1Res = fileRe.exec(colVal);
               if(reRes !== null) {
                 row += "<td data-colName='"+colName+"'>"+(showEditIcons==par.tablename?editIcon:hiddenEditIcon)+"<div>";
                 row += "<img onmouseleave='image_hover_leave(this)' "+
                            "onmouseenter='image_hover_enter(this)' "+
                            "class='shownInTable' "+
                            "src='"+backendPrefix+"/dbImageIcon?imageid="+reRes[1]+"&"+Math.random()+"'>"
                 row += "</div></td>";
               }
               else if (re1Res != null) {
                 row += "<td data-colName='"+colName+"'>"+(showEditIcons==par.tablename?editIcon:hiddenEditIcon);
                 row += "<div><a href='"+backendPrefix+"/dbFile?fileid="+ re1Res[1]
                     +"' onclick='event.preventDefault();downloadFile(\"" + backendPrefix+"/dbFile?fileid="+re1Res[1]+ "\", true)'>"
                     + filenames[re1Res[1]]+"</a>";
                 row += "</div></td>";
               }
               else {
                 // commented out line break after slash, don't know why it is necessary
                 // RKO: do not show HTML code directly (e.g. longhelp videos)
                 colVal = (htmlEscape(colVal)+"").replace(/\//g,"/&#x200B;");

                 // replace val with dropdown if exists
                 var sOpt2 = (colVal+'').replace(/[^A-Za-z0-9_]/g, '_');

                 if (dropdowns[colName]) {
                    if(dropdowns[colName][sOpt2]) {
                      colVal = dropdowns[colName][sOpt2];

                    } else if(colVal.match(/^[0-9,]+$/)) { // probably multipleValuesFromTable
                      var inPut=colVal.split(","), outPut=[];
                      for(var i1=0; i1<inPut.length; i1++)
                        if(dropdowns[colName][inPut[i1]])
                          outPut.push(dropdowns[colName][inPut[i1]]);
                      if(outPut.length)
                        colVal = outPut.join(", ");
                    }
                  }
                 //if ($(".form-control.selectpicker[id="+colName+"] option[search="+sOpt2+"]").length > 0)
                  // colVal = $(".form-control.selectpicker[id="+colName+"] option[search="+sOpt2+"]").text();
                 row+= "<td>"+(showEditIcons==par.tablename?editIcon:hiddenEditIcon)+"<div>" + colVal + "</div></td>";
               }
            }
            if (!par.updatedRowId)
              rows.push(row);
          }

          $('#datarowstable').append('<tbody>'+rows.join()+'</tbody>');
          $('#datarowstable td.delete i').click(delete_datarow);

          if (par.updatedRowId) {
             var tr = $("#datarowstable tr[tblid="+par.updatedRowId+"]");
             if (tr && tr.length > 0) {
                $(tr).replaceWith(row);
                var hiddenEdits = $("#datarowstable .btn-link.glyphicon-pencil:hidden").length;
                if (hiddenEdits > 0)
                  $("#datarowstable .btn-link.glyphicon-pencil").show();
                var editColumnIdx = $("#datarowstable").attr("editColumnIdx");
                if (editColumnIdx) {
                  $("#datarowstable tr[tblid="+par.updatedRowId+"]").find("td:nth-child("+editColumnIdx+")").addClass("highlighted");
                }
             } else {
                $('#datarowstable').find('tbody:last').append(row);
             }
          }

          if(!par.viewOnly) {
            $('#datarowstable').find("td[data-colName] img").click(
            function(e){
              var img = this;
              var colName = $(img).closest("td").attr("data-colname");
              var id = $(img).closest("tr").attr("tblId");

              var s1="Rotate&nbsp;both&nbsp;", s2="Rotate&nbsp;icon&nbsp;";
              dropdownMenu(e, img,
                [s1+"clockwise", s1+"counterclockwise",
                 s2+"clockwise", s2+"counterclockwise", "Download"],
                function(i){
                  if (i == 4) {
                    var src = $(img).attr('src');
                    src = src.replace("dbImageIcon","dbImage");
                    log("src="+src);
                    downloadFile(src, true);
                    return;
                  }
                  var par2 = { dataid:par.tablename+"/"+id+"/"+colName,
                              angle:((i&1)==0 ? 90 : -90) };
                  backendCall("rotateIcon", par, function(){
                    var path = "dbImageIcon?imageid="+par2.dataid+
                                          "&"+(new Date()).getTime();
                    if(i < 2) {
                      par2.bigdata = true;
                      backendCall("rotateIcon", par2, function(){
                        $(img).attr("src", path);
                      });
                    } else {
                      $(img).attr("src", path);
                    }
                  });
              });
            });
          }
          //table_pagination($("#datarowstable"));
          if (par.viewOnly) {
            $("#datarowstable thead th[trid=th_edit]").text("View");
            $("#datarowstable thead th[trid=th_delete]").hide();
            $("#datarowstable tbody td.delete").hide();
            $("#datarowstable tbody td.edit i.glyphicon").removeClass(glEdit).addClass(glView);
          } else {
            $("#datarowstable thead th[trid=th_edit]").text("Edit");
            $("#datarowstable tbody td.edit i.glyphicon").removeClass(glView).addClass(glEdit);
          }
          if (par.pagetype == "BODY" || par.pagetype == "HEADER") {
            // use delete bookdata in projects
            $("#datarowstable thead th[trid=th_delete]").hide();
            $("#datarowstable tbody td.delete").hide();
          }
          $(".form-tablerow.details .form-control[name=modified]").closest(".form-group").hide();
          $(".form-tablerow.details .form-control[name=modifiedby]").closest(".form-group").hide();
          // start selectpicker in background
          //window.setTimeout(function() { $(".selectpicker").selectpicker(); }, 50);
          $(".selectpicker").selectpicker();
          $('#datarowstable i.btn-link.details').unbind("click").click(function(e) {
            function get_htable() {
              var btlist;
              for (var bid in par.bt) {
                for (var i = 0; i<par.bt[bid].length; i++) {
                  if (par.bt[bid][i] == par.tablename) {
                     btlist = par.bt[bid];; 
                     break;
                  }
                }
              }
              if (!btlist)
                return;
              var htable;
              for (var i=0; i<btlist.length; i++) {
                var bt = btlist[i];
                if (!par.pn2b[bt] || !par.pn2b[bt].header)
                  continue;
                if (par.pn2b[bt].header.pagetype == "HEADER")
                  return bt;
              }
              return htable;
            }
            function get_ptable() {
              var ptable;
              var bid = par.pn2b[par.tablename].bookid;
              var pbid = par.parentbooks[bid];
              for (var tbl in par.pn2b) {
                if (par.pn2b[tbl].bookid == pbid)
                  ptable = tbl;
              }
              return ptable; 
            }
            function
            link_to_parentbook(htable, filterCol, filterVal)
            { 
                if (!htable)
                  return;
                limitDataRowsTable = null;
                var par2 = { project: par.project, tablename: htable, 
                             pagetype: par.pn2b[htable].header?par.pn2b[htable].header.pagetype:par.pn2b[htable].pagetype, 
                             viewOnly: par.viewOnly ,  filter: { filterCol : filterCol, filterVal: filterVal}};
                par2.callbackfn = function() {
                  $(".form-tablerow.details").css("display", "none");
                  $(".table-datarows").css("display", "");
                  $(".table-datarows [name=project]").val(par.project);
                  $(".table-datarows [name=tablename]").val(par2.tablename);
                  $(".table-datarows [name=pagetype]").val(par2.pagetype);
                  pop_headtitle("data");
                  pop_headtitle("data");
                  push_headtitle("data",par2.tablename+" ("+par2.filter.filterCol+"="+par2.filter.filterVal+")");
                }
                select_datarows(par2);

            };
            var par1 = { rowidx: $(this).closest("tr").attr("data-rowidx"), 
                         viewOnly: par.viewOnly, icon: $(this), callbackfn: function() {
               if (par.pagetype == "BODY") {
                  var htable = get_htable();
                  if (htable) {
                    $(".form-tablerow.details #btn-parentbook").show();
                    $(".form-tablerow.details #btn-parentbook").unbind("click").click(function() {
                       link_to_parentbook(htable, "bookid", $(".form-tablerow.details [name=bookid]").val());    
                    });
                  }
                  else
                    $(".form-tablerow.details #btn-parentbook").hide();
               } 
               if (par.pagetype == "HEADER") {
                  var ptable = get_ptable();
                  var linkVal;
                  if (par.pdattr) {
                    for (var i=0;i<par.pdattr.length; i++) {
                      var p = par.pdattr[i];
                      if (p.constrainttype == "singleFromTable" && p.constraintparam == ptable)
                         linkVal = $(".form-tablerow.details [name="+p.columnname+"]").val();
                    } 
                  }
                  if (ptable && linkVal) {
                    linkVal = linkVal.replace("/0", "");
                    $(".form-tablerow.details #btn-parentbook").show();
                    $(".form-tablerow.details #btn-parentbook").unbind("click").click(function() {
                       link_to_parentbook(ptable, "bookid", linkVal);
                    });
                  }
                  else
                    $(".form-tablerow.details #btn-parentbook").hide();
               }
            }};
            toggle_datarow_edit(par1);
          });
          return do_select_datarows();
        }, cols);
        }

      render_datarows(par); 
      $(".table-datarows #btn-data-prev").unbind("click").click(function() {
        var limit = parseInt(limitDataRowsTable.split(",")[0]); 
        limitDataRowsTable = limit-limitStep+","+limitStep;
        render_datarows(par); 
      });
      $(".table-datarows #btn-data-next").unbind("click").click(function() {
        var limit = parseInt(limitDataRowsTable.split(",")[0]); 
        limitDataRowsTable = (limit+limitStep>par.allcount?par.allcount:limit+limitStep)+","+limitStep;
        render_datarows(par); 
      });
    }
    if (status == 6) {
      if (par.pagetype == "HEADER" || par.pagetype == "BODY") {
        // get data for link to parent book
        $(".headtitle span.waiting").show();
        var par2 = { status: 0, tablename: par.tablename, callbackfn: function() {
          $(".headtitle span.waiting").hide();
          par.bt = par2.bt;
          par.pn2b = par2.pn2b;
          par.parentbooks = par2.parentbooks;
          if (par.callbackfn)
            par.callbackfn();
        }};
        get_bookdata(par2);
      } else if (par.callbackfn)
        par.callbackfn();
    }
  }
}

function
table_pagination(table)
{
  if (!paginateTables)
    return;
  if (!table || table == undefined)
    return;
  if (table.hasClass("filtertable"))
    return;
  var currentPage = 0;
  var colLength = $(table).find("th").length;
  var numPerPage = Math.round(10000/colLength);
  $(".pager").remove();
  table.bind('repaginate', function() {
      table.find('tbody tr').hide().slice(currentPage * numPerPage, (currentPage + 1) * numPerPage).show();
  });
  table.trigger('repaginate');
  var numRows = table.find('tbody tr').length;
  var numPages = Math.ceil(numRows / numPerPage);
  if (numPages == 1)
    return;
  var $pager = $('<div class="pager"></div>');
  for (var page = 0; page < numPages; page++) {
      $('<span class="page-number"></span>').text(page + 1).bind('click', {
          newPage: page
      }, function(event) {
          currentPage = event.data['newPage'];
          table.trigger('repaginate');
          $(this).addClass('active').siblings().removeClass('active');
      }).appendTo($pager).addClass('clickable');
  }
  $pager.insertAfter(table).find('span.page-number:first').addClass('active');
}

function
select_data(callbackfn)
{
  var filter = [];

  function
  getTblRight(tbl)
  {
    var right = 0;
    for(var i1=0; i1<roles.length; i1++) {
      if(roles[i1].admin_rights.indexOf("DataMaintenanceRegexp") == 0) {
        if(tbl.match(new RegExp(roles[i1].admin_parameters))) {
          var x = (roles[i1].admin_rights.indexOf("=read") > 0 ? 1 : 2);
          if(right < x)
            right = x;
        }
      }
    }
    return right;
  }

  backendCall("tableSelect",
    { tableName:"kipus_userprojects up, kipus_projects p",
      columns:"up.projectid,up.login,p.name,p.rightdef",
      where:"up.login='"+bcUser+"' and up.projectid=p.id" },
    function(res, resultPar) {
      var pname2id = {};
      for (var i=0; i<res.length; i++) {
         pname2id[res[i].name] = res[i].projectid;
      }
      backendCall("getBookTables", {},
        function(tables, resultPar) {
          $("#datatable >tbody tr").remove();
          pbdef = {};
          table2pagetype = {};
          var hasEditButton = false;
          for(var i=0; i<tables.length; i++) {
            var tbl = tables[i];
            if(tbl.pagetype == 'CP_LOOKUP')
              continue;
            pbdef[tbl.bookid] = tbl;
            table2pagetype[tbl.tablename] = tbl.pagetype;

            var project = tbl.projectbook.split(":")[0];
            var pid = pname2id[project];
            var right=[];
            for(var i1=0; i1<2; i1++) {
              var rName = (i1==0 ? "read" : "write");
              right[i1] = false;
              if(getTblRight(tbl.tablename) > i1) {
                right[i1] = true;
              }
              else if(tbl.pagetype == "LOOKUP") {
                if ((!pid && hasAllProjectRight("DataMaintenanceLookupTables", rName)) ||
                 (pid && (hasProjectRight("DataMaintenanceLookupTables", rName, pid)) ||
                 hasProjectRight("AdminAll", rName, pid)))
                right[i1] = true;
              }
              else if (tbl.pagetype != "LOOKUP") {
                if ((!pid && hasAllProjectRight("DataMaintenanceBooks", rName)) ||
                 (pid && (hasProjectRight("DataMaintenanceBooks", rName, pid)) ||
                 hasProjectRight("AdminAll", rName, pid)))
                right[i1] = true;
              }
            }
            if(!right[0])
              continue;

            hasEditButton = hasEditButton || right[1];

            var row = "<tr tableName='"+tbl.tablename+"'><td align='center'><i class='btn-link glyphicon "+(right[1]?glEdit:glView)+"'" +
                      "onclick='toggle_data_"+(right[1]?"edit":"view")+
                       "(\"" + project+"\",\"" + tbl.tablename + "\",\""+tbl.pagetype+"\")"+
                       "'></i></td>" +(right[1] && tbl.pagetype != "BODY" && tbl.pagetype != "HEADER"?
                      "<td align='center'><i class='btn-link glyphicon glyphicon-trash'" +
                      "onclick='truncate_table(\"" + tbl.tablename + "\")'></i></td>":"<td></td>")+
                      "<td align='center'><i class='btn-link glyphicon glyphicon-search' "+
                      "onclick='toggle_data_"+(right[1]?"edit":"view")+
                       "(\"" + project+"\",\"" + tbl.tablename + "\",\""+tbl.pagetype+"\",\""+"true"+ "\")"+ "'></i></td>" +
                      "<td><div>"+ tbl.tablename + "</div></td>" +
                      "<td><div>"+ tbl.pagetype + "</div></td>" +
                      "<td><div>"+ tbl.projectbook + "</div></td>" +
                      "<td><div>"+ tbl.importOverwrite + "</div></td>" +
                      "<td><div>"+ tbl.TABLE_ROWS + "</div></td></tr>";
            $('#datatable').find('tbody:last').append(row);
          }
          if (!hasEditButton)
            $('#datatable thead th[trid=th_edit]').text("View");
          else
            $('#datatable thead th[trid=th_edit]').text("Edit");
          table_pagination($("#datatable"));
          if (callbackfn) {
             callbackfn();
          }
          });
      });
}

function
csvimport_data() {
  log("csvimport_data");
  if (!$("#csvimport_file").val()) {
    showAlert(trHtml.data_csvimport[0], "warning");
    return;
  }
  if ($("#csvimport_datadump").val() && $("#csvimport_datadump").val().indexOf(".datadump.csv") < 1) {
    showAlert(trHtml.data_csvimport[8], "warning");
    return;
  }
  if ($("#csvimport_file").val().indexOf(".csv") < 1) {
    showAlert(trHtml.data_csvimport[7], "warning");
    return;
  }
  if (!$(".table-datarows [name=tablename]").val()) {
    showAlert(trHtml.data_csvimport[3], "warning");
    return;
  }
  var file = $('#csvimport_file').prop('files')[0];
  var reader = new FileReader();
  $("#btn-csvimport").prepend("<img class='waiting'></img>");
  reader.onload = function(event) {
      log("file read done");
      var csv = event.target.result;
      var par = { project: $(".table-datarows [name=project]").val(), tablename: $(".table-datarows [name=tablename]").val(), 
                 pagetype: $(".table-datarows [name=pagetype]").val()};
      if ($("#csvimport_datadump").val()) {
        var reader = new FileReader();
        var file = $('#csvimport_datadump').prop('files')[0];
        reader.onload = function(event) {
            var datadump = event.target.result;
            backendCall("tableCsvImport", {  tableName:par.tablename, csv:csv, datadump:datadump},
              function(res,resultPar){ log("csv imported" );
                                   $("img.waiting").remove();
                                   toggle_csvimport();
                                   select_datarows(par);
                                   showAlert(trHtml.data_csvimport[1], "success");
                                  });


        };
        reader.onerror = function(event) {
            log("file read error: " + event.target.error.code);
            $("img.waiting").remove();
            showAlert(trHtml.data_csvimport[2], "warning");
        };
        reader.readAsText(file);

      } else
      backendCall("tableCsvImport", {  tableName:$(".table-datarows [name=tablename]").val(), csv:csv},
        function(res,resultPar){ log("csv imported" );
                             $("img.waiting").remove();
                             toggle_csvimport();
                             select_datarows(par);
                             showAlert(trHtml.data_csvimport[1], "success");
                            });
  };
  reader.onerror = function(event) {
      log("file read error: " + event.target.error.code);
      $("img.waiting").remove();
      showAlert(trHtml.data_csvimport[2], "warning");
  };
  reader.readAsText(file);
}

function
csvexport_data() {
  log("csvexport_data");
  if (!$(".table-datarows [name=tablename]").val()) {
    showAlert(trHtml.data_csvexport[0], "warning");
    return;
  }
  $("#btn-csvexport").prepend("<img class='waiting'></img>");
  var cols = [];
  $("#datarowstable thead th:not([trid])").each(function() {
     cols.push($(this).text());
  }); 
  backendCall("tableCsvExport", { tableName:$(".table-datarows [name=tablename]").val(), asFile:true, columns:cols,
                                  filter:$(".table-datarows").closest(".filtertable").find("[name=filterinput]").val()},
    function(res,resultPar){ log("table data downloaded" );
                         showAlert(trHtml.data_download[1], "success");
                         var path = location.href.substring(0, location.href.lastIndexOf('/'));
                         // prevent from downloading a cached version
                         downloadFile(path+res.fileName + "?" + now());
                         $("img.waiting").remove();
                         });
}

function
truncate_table(table) {
  log("truncate_data :" + table);
  $("div#dialog").html(trHtml.data_clear[0]);
  $("div#dialog").dialog({
    dialogClass:"no-close", buttons: [
      {text:trHtml.dlg[2], click:function(){
        // drop table
        var sql = "truncate table " + table;
        backendCall("tableCmd", { sql: sql },
          function(res,resultPar){
                 log("truncate done" );
                 select_data(function() {
                   filter_table($("#datatable"));
                 });
                 showAlert(trHtml.data_clear[1], "success");
          });
        $(this).dialog("close");
      }},
      {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
  });
}


function
add_datarow()
{
  if (!$(".form-tablerow.details .fields [name=_tablename]").val()) {
    showAlert(trHtml.datarow_create[0], "warning");
    return;
  }

  var cols = {};
  for (var i = 0; i < dcols.length; i++) {
      var key = dcols[i];
      if(key == "id") //autoinsert col must be 0 or NULL or missing. '' is wrong
        continue;
      cols[key] = $(".form-tablerow.details .fields [name="+key+"]").val();
  }
  backendCall("tableInsert", { tableName:$(".form-tablerow.details .fields [name=_tablename]").val(), columns: cols },
  function(res,resultPar){
      var par = { project: $(".table-datarows [name=project]").val(), tablename: $(".table-datarows [name=tablename]").val(), 
                 pagetype: $(".table-datarows [name=pagetype]").val(), updatedRowId: res.insertId };
      par.callbackfn = function() {
        log("datarow  inserted" );
        var par1 = { viewOnly: false, callbackfn:  function() {
            // scroll to bottom after
            window.scrollTo(0, $("#datarowstable").height());
        }};
        toggle_datarow_edit(par1);
        showAlert(trHtml.datarow_create[1], "success");
      };
      select_datarows(par);
  });
}

function
update_datarow()
{
  if (!$(".form-tablerow.details .fields [name=_tablename]").val() || !drow.id) {
    showAlert(trHtml.datarow_update[1], "warning");
    return;
  }
  var cols = {}
  $.each(drow, function( key, value ) {
      cols[key] = $(".form-tablerow.details .fields [name="+key+"]").val();
      if( Object.prototype.toString.call( cols[key] ) === '[object Array]' ) {
          // handle selectpicker
          var val=[];
          for (var i=0; i<cols[key].length; i++) {
            val.push(cols[key][i].replace(/,/g,"&#44;"));
          }
          cols[key] = val.join(",");
      }
  });
  backendCall("tableUpdate", { tableName:$(".form-tablerow.details .fields [name=_tablename]").val(), columns: cols,
                            filterCol:  "id",
                            filterVal: drow.id},
  function(res,resultPar){ 
      var par = { project: $(".table-datarows [name=project]").val(), tablename: $(".form-tablerow.details .fields [name=_tablename]").val(), 
                 pagetype: $(".table-datarows [name=pagetype]").val(), updatedRowId: drow.id };
       par.callbackfn = function() {
         log("datarow updated" );
         showAlert(trHtml.datarow_update[0], "success");
         var par1= { viewOnly: false, callbackfn: function() {
            loadOffset("data");
         }};
         toggle_datarow_edit(par1);
       };
       select_datarows(par);
                     });
}

function
delete_datarow()
{
  var i  = $(this).closest("tr").attr("data-rowidx");
  var pn = $(".table-datarows [name=project]").val();
  var tn = $(".table-datarows [name=tablename]").val();
  var pt = $(".table-datarows [name=pagetype]").val()

  log("delete_datarow: "+i+" "+tn+" "+pt);

  if (!$(".table-datarows [name=tablename]").val() || !drows[i]) {
    showAlert(trHtml.datarow_delete[0], "warning");
    return;
  }

  if(pt == "LOOKUP" && drows[i].deleted) {          // MARK AS DELETED
    if(drows[i].deleted == 'NO') {
      $(this).removeClass("glyphicon-remove red");
      $(this).addClass("glyphicon-trash");
      $(this).closest("tr").addClass("trash");
      drows[i].deleted = 'YES';
    } else {
      $(this).addClass("glyphicon-remove red");
      $(this).removeClass("glyphicon-trash");
      $(this).closest("tr").removeClass("trash");
      drows[i].deleted = 'NO';
    }
    backendCall("tableUpdate",
      { tableName:tn, columns:{deleted:drows[i].deleted}, filterCol:'id', filterVal:drows[i].id });

  } else {                      // REALLY DELETE
    $("div#dialog").html(trHtml.datarow_delete[0]);
    $("div#dialog").dialog({
      dialogClass:"no-close", buttons: [
        {text:trHtml.dlg[2], click:function(){
          // drop table
          var rowid=drows[i].id;
          backendCall("tableDelete",
            { tableName:tn, filterCol:'id', filterVal:rowid },
            function(res,resultPar){
              backendCall("tableDelete",
                { tableName:"kipus_bigdata", where:"dataid like '"+tn+"/"+rowid+"/%'" });
              log("Delete done" );
              var par = { project: pn, tablename: tn, pagetype: pt};
              select_datarows(par);
              showAlert(trHtml.datarow_delete[1], "success");
            });
          $(this).dialog("close");
        }},
        {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
    });
  }
}

/*
 * END Data maintenance
 */


/*
 * Projects
 */

function
rebuild_indexes()
{
  log("rebuild_indexes");
  backendCall("createTableRowIndexes", {},
   function(res, resultPar) {
     okDialog(JSON.stringify(res));
  });
}

function
project_check()
{
  log("check_project");
  backendCall("checkProject", { projectId:$(".form-project [name=id]").val(), projectName:$(".form-project [name=name]").val()},
    function(res,resultPar){ log("project check" );
                         if (res && res.length > 0)
                           okDialog(res.join("<br>"));
                         else
                           okDialog("No errors or warnings found.");
                         });
}

function
select_project()
{
  var canWrite = hasProjectRight("AdminAll", "write");
  backendCall("tableSelect", { tableName:"kipus_projects", orderBy:"name" },
    function(res, resultPar) {
      project = res;
      if (canWrite) {
        $("#ptable thead th[trid=th_edit]").text("Edit");
        $("#ptable thead th[trid=th_delete]").show();
        $("#btn-toggleCreateProject").show();
        $("#btn-toggleImportProject").show();
      } else {
        $("#ptable thead th[trid=th_edit]").text("View");
        $("#ptable thead th[trid=th_delete]").hide();
        $("#btn-toggleCreateProject").hide();
        $("#btn-toggleImportProject").hide();
      }
      $("#ptable >tbody tr").remove();
      for(var i=0; i<res.length; i++) {
        var prWrite = hasProjectRight("Projects", "write", res[i].id)||
                      hasProjectRight("AdminAll", "write");
        var row = "<tr><td align='center'><i class='btn-link glyphicon "+(prWrite?glEdit:glView)+"'" +
                  "onclick='toggle_project_edit(\"" + i + "\")'></i></td>" +(prWrite?
                  "<td align='center'><i title='Delete project' class='btn-link glyphicon glyphicon-remove red'" +
                  "onclick='delete_project(this, \"" + i + "\")'></i></td>":"<td></td>")+
                  "<td><div>"+ res[i].name + "</div></td>" +
                  "<td><div>"+ res[i].prefix + "</div></td>" +
                  "<td><div>"+ res[i].title + "</div></td>" +
                  "<td><div>"+ res[i].isDefault + "</div></td>" +
                  "<td><div>"+ res[i].isOffline + "</div></td>"+
                  "<td><div>"+ (res[i].created?res[i].created:"") + "</div></td></tr>";
        if (prWrite)
          $("#ptable thead th[trid=th_delete]").show();
        $('#ptable').find('tbody:last').append(row);
      }
      table_pagination($("#ptable"));
    });
}

function
select_project_files(projectid, projName, callbackfn)
{
  function bytesToSize(bytes) {
     var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
     if (bytes == 0) return '0 Byte';
     var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
     return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
  };
  var canWrite = hasProjectRight("Projects", "write", projectid) ||
                 hasProjectRight("AdminAll", "write");
  log("select project files " + projName + " " + canWrite + " " + projectid);
  backendCall("getFiles", { projectName:projName},
    function(res, resultPar) {
      var files = res.files;
      log("files count = " + files.length);
      if (canWrite)
        $("#pfilestable thead th[trid=th_delete]").show();
      else
        $("#pfilestable thead th[trid=th_delete]").hide();
      $("#pfilestable >tbody tr").remove();
      var path = location.href.substring(0, location.href.lastIndexOf('/'));
      for(var i=0; i<files.length; i++) {
          var link = projDir + "/" + projName + "/" + files[i];
          var is_xliff = false;
          if (files[i].dataid.match(/_..\.xml/))
              is_xliff = true;
          var row = "<tr>"+(canWrite?"<td align='center'><i class='btn-link glyphicon glyphicon-remove red'" +
                    "onclick='delete_pfile(\"" + files[i].dataid +  "\")'></i></td>":"")+
                    "<td><div>"+
                    "<a href='"+path+files[i].dataid+"' onclick='event.preventDefault();downloadFile(\"" + path+files[i].dataid + "\", true)'>"
                    + files[i].comment + "</a>"+
                    (is_xliff?" <i class='btn-link glyphicon glyphicon-globe' onclick='translate_file(\"" + files[i].dataid + "\")'></i>":"")+ 
                   (files[i].dataid.match(/\.png$/gi) || files[i].dataid.match(/\.jpg$/gi)?"<img onmouseleave='image_hover_leave(this)' onmouseenter='image_hover_enter(this)' src='"+path+files[i].dataid+"'":"")+
                    "</div></td>"+
                   "<td><div>"+files[i].size_in_bytes + "</div></td>"+
                   "<td><div>"+files[i].comment.substr(files[i].comment.lastIndexOf('.') + 1) + "</div></td>"+
                   "<td><div>"+(canWrite?"<a class='importOverwrite'>"+files[i].importOverwrite+ "</a>":files[i].importOverwrite)+"</div></td>"+
                   "<td style='white-space:nowrap'><div>"+files[i].modified + "</div></td>"+
                   "<td><div>"+files[i].modifiedby + "</div></td>"+
                   "</tr>";
          $('#pfilestable').find('tbody:last').append(row);
          if (files[i].dataid.match(/icon_[0-9]{2,3}\.png/)) {
            // touch icons 
            $("div.dropicon").each(function() {
               if (files[i].dataid.match($(this).attr("target"))) {
                  $(this).find("img").attr("src", path+files[i].dataid);
                  $(this).find("a.upload").hide();
                  $(this).find("button.delete").show();
               }
            });
          }
      }
      $('#pfilestable a.importOverwrite')
        .css("cursor","pointer")
        .click(function(){
          var name = $(this).closest("tr").find("a:first-child").attr("href");
          name = name.substr(name.indexOf("/projects"));
          var val = $(this).html() == 'YES' ? 'NO' : 'YES';
          $(this).html(val);
          backendCall("tableUpdate", {
            tableName:"kipus_bigdata",
            columns:{importOverwrite:val},
            filterCol:"dataid", filterVal:name});
        });

      if (callbackfn)
        callbackfn();
    });
}

function
toggle_project_create() {
  if (!$(".form-project").is(":visible")) {
    $("#externaltable").closest(".form-group").hide();
    $("#prighttable").closest(".form-group").hide();
    $("#btn-rightDef").hide();
    $(".table-project").css("display","none");
    $(".form-project").css("display","");
    $(".form-project input").val("");
    $(".form-project select").prop("selectedIndex", 0);
    $(".form-project [name=id]").closest(".row").hide();
    $(".form-project #pbooktable").closest(".row").hide();
    $(".form-project [name=name]").attr("readonly", false);
    $(".form-project [name=prefix]").attr("readonly", false);
    $("#btn-projectadvanced").closest(".row").nextAll(".row").hide();
    $("#btn-projectadvanced").attr("show", false);
    $(".form-project [name=isdefault]").closest(".row").show();
    $(".form-project [name=isoffline]").closest(".row").show();

    $(".form-project #pfilestable").closest(".row").hide();
    $(".form-project #pfilestable >tbody tr").remove();
    $(".form-project #prighttable >tbody tr").remove();
    $(".form-project #pbooktable >tbody tr").remove();
    $(".form-project #btn-projectadvanced").hide();


    //create_lang_options(".form-project [name=sourcelang]", $(".form-project [name=name]").val());
    //create_lang_options(".form-project [name=defaultlang]", $(".form-project [name=name]").val());
    $("#btn-editProject").hide();
    $("#btn-uploadPfile").hide();
    $("#btn-createbdProject").hide();
    $("#btn-createExternalProject").hide();
    $("#btn-downloadProject").hide();
    $("#btn-checkProject").hide();
    $("#btn-rebuildIndexes").hide();
    $("#btn-xliffgen").hide();
    $("#btn-createProject").show();
    push_headtitle("project", $("#btn-toggleCreateProject").text());
  } else {
    $(".table-project").css("display","");
    $(".form-project").css("display","none");
    $(".form-project #pbooktable").closest(".row").show();
    pop_headtitle("project");
  }
}

function
toggle_project_edit(i) {
  if (!$(".form-project").is(":visible")) {
    var canWrite = hasProjectRight("Projects","write",project[i].id) ||
                   hasProjectRight("AdminAll", "write");
    $(".form-project #btn-projectadvanced").show();
    if ($("#btn-projectadvanced").attr("show") == "true") {
      $("#externaltable").closest(".form-group").show();
      $("#prighttable").closest(".form-group").show();
      $(".form-project #pfilestable").closest(".row").show();
    } else {
      $(".form-project [name=isdefault]").closest(".row").hide();
      $(".form-project [name=isoffline]").closest(".row").hide();
    }
    $("div.dropicon img").attr("src", "");
    $("div.dropicon a.upload").show();
    $("div.dropicon button.delete").hide();

    select_project_files(project[i].id, project[i].name);
    select_external(project[i].id);
    select_pbooks(project[i].id);
    create_lang_options(".form-project [name=sourcelang]", project[i].name, project[i].sourcelang);
    create_lang_options(".form-project [name=defaultlang]", project[i].name, project[i].defaultlang);
    $(".form-project input").attr("readonly", !canWrite);
    $(".form-project select").attr("disabled", !canWrite);

    $(".table-project").css("display","none");
    $(".form-project").css("display","");
    //$(".form-project [name=id]").closest(".row").show();
    $(".form-project [name=id]").attr("readonly", true);
    $(".form-project [name=name]").attr("readonly", true);
    $(".form-project [name=prefix]").attr("readonly", true);
    $(".form-project [name=id]").val(project[i].id);
    $(".form-project [name=name]").val(project[i].name);
    $(".form-project [name=prefix]").val(project[i].prefix);
    $(".form-project [name=title]").val(project[i].title);
    $(".form-project [name=isdefault]").val(project[i].isDefault);
    $(".form-project [name=prightdef]").val(project[i].rightdef);
    $(".form-project [name=isoffline]").val(project[i].isOffline);
    $(".form-project [name=ampasswd]").val(project[i].advancedMenuPw);
    $(".form-project [name=short_name]").val(project[i].short_name);
    $(".form-project [name=description]").val(project[i].description);
    $(".form-project [name=internal_responsible]").val(project[i].internal_responsible);
    $(".form-project [name=external_partner]").val(project[i].external_partner);
    $(".form-project [name=explain_abbreviation]").val(project[i].explain_abbreviation);

    if (canWrite) {
      $("#btn-editProject").show();
      $("#btn-createbdProject").show();
      if ($("#btn-projectadvanced").attr("show") == "true") {
        $("#btn-uploadPfile").show();
        $("#btn-createExternalProject").show();
        $("#btn-rightDef").show();
        $("#btn-xliffgen").show();
      } else {
        $("#btn-uploadPfile").hide();
        $("#btn-createExternalProject").hide();
        $("#btn-rightDef").hide();
        $("#btn-xliffgen").hide();
      }
    } else {
      $("#btn-editProject").hide();
      $("#btn-uploadPfile").hide();
      $("#btn-createbdProject").hide();
      $("#btn-createExternalProject").hide();
      $("#btn-rightDef").hide();
      $("#btn-xliffgen").hide();
    }
    var dmWrite = hasProjectRight("DataMaintenanceBooks","write",project[i].id) ||
                  hasProjectRight("AdminAll", "write");
    if (dmWrite)
      $("#btn-manageBookdata").show();
    else
      $("#btn-manageBookdata").hide();
    $("#btn-downloadProject").show();
    $("#btn-checkProject").show();
    $("#btn-rebuildIndexes").show();
    $("#btn-createProject").hide();
    push_headtitle("project", project[i].name);
    select_pright({pidx:i});
  } else {
    $(".table-project").css("display","");
    $(".form-project").css("display","none");
    pop_headtitle("project");
  }
}

function
toggle_project_import() {
  if (!$(".form-import-project").is(":visible")) {
    $(".table-project").css("display","none");
    $(".form-import-project").css("display","");
    push_headtitle("project", $("#btn-toggleImportProject").text());
  } else {
    select_project();
    $(".table-project").css("display","");
    $(".form-import-project").css("display","none");
    pop_headtitle("project");
  }
}

function
toggle_project_download() {
  if (!$(".form-download-project").is(":visible")) {
    $(".form-project").css("display","none");
    $(".form-download-project").css("display","");
    push_headtitle("project", $("#btn-downloadProject").text());
  } else {
    $(".form-project").css("display","");
    $(".form-download-project").css("display","none");
    pop_headtitle("project");
  }
}

function
toggle_upload_pfile() {
  if (!$(".form-upload-pfile").is(":visible")) {
    $(".form-project").css("display","none");
    $(".form-upload-pfile").css("display","");
    push_headtitle("project", $("#btn-uploadpfile").text());
  } else {
    $(".form-project").css("display","");
    $(".form-upload-pfile").css("display","none");
    pop_headtitle("project");
  }
}

function
update_project() {
  log("update_project");
  if (!$(".form-project [name=name]").val()
      || !$(".form-project [name=id]").val()) {
    showAlert(trHtml.project_update[0], "warning");
    return;
  }
  if ($(".form-project").find(".has-error").length) {
    showAlert(trHtml.regexp[0], "warning");
    return;
  }
  var cols = {
    name:                 $(".form-project [name=name]")     .val(),
    title:                $(".form-project [name=title]")    .val(),
    isDefault:            $(".form-project [name=isdefault]").val(),
    rightdef:             $(".form-project [name=prightdef]").val(),
    isOffline:            $(".form-project [name=isoffline]").val(),
    sourcelang:           $(".form-project [name=sourcelang]").val(),
    defaultlang:          $(".form-project [name=defaultlang]").val(),
    advancedMenuPw:       $(".form-project [name=ampasswd]").val(),
    short_name:           $(".form-project [name=short_name]").val(),
    description:          $(".form-project [name=description]").val(),
    internal_responsible: $(".form-project [name=internal_responsible]").val(),
    external_partner:     $(".form-project [name=external_partner]").val(),
    explain_abbreviation: $(".form-project [name=explain_abbreviation]").val() };
    backendCall("tableUpdate", { tableName:"kipus_projects", columns: cols,
                              filterCol:  "id", filterVal: $(".form-project [name=id]").val() },
    function(res,resultPar){ log("project definition update" ); toggle_project_create(); select_project();
                         showAlert(trHtml.project_update[1], "success");});
}

function
upload_pfile()
{
  log("upload_pfile");
  if (!$("#upload_pfile").val()) {
    showAlert(trHtml.upload_pfile[0], "warning");
    return;
  }
  var file = $('#upload_pfile').prop('files')[0];
  var reader = new FileReader();
  reader.onload = function(event) {
      log("file read done");
      backendCall("uploadFile", { fileName:file.name, projectName:$(".form-project [name=name]").val(), data:event.target.result},
        function(res,resultPar){ log("project file imported" );
                             toggle_upload_pfile();
                             select_project_files($(".form-project [name=id]").val(), $(".form-project [name=name]").val());
                             showAlert(trHtml.upload_pfile[1], "success");
                            });

  };
  reader.onerror = function(event) {
      log("file read error: " + event.target.error.code);
      showAlert(trHtml.upload_pfile[2], "warning");
  };
  reader.readAsDataURL(file);
}

function
delete_pfile(file, callbackfn) {
  log("delete_pfile: " + file);
  $("div#dialog").html(trHtml.pfile_delete[0]);
  $("div#dialog").dialog({
    dialogClass:"no-close", buttons: [
      {text:trHtml.dlg[2], click:function(){
        backendCall("deleteFile", { fileName:file },
          function(res,resultPar){
                 log("Delete pfile done" );
                 showAlert(trHtml.pfile_delete[1], "success");
                 select_project_files($(".form-project [name=id]").val(), $(".form-project [name=name]").val(), function () {
                  log("select project files callback");
                  $("#pfilestable").find("th .sortActive").each(function() { sort_tablerows(this, true); });
                  if (callbackfn)
                    callbackfn();
                });
          });
        $(this).dialog("close");
      }},
      {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
  });
}

function
do_project_delete(status, project) {
   log("do_project_delete " + status);
   if (status == 0) {  // projectbooks
        select_pbooks(project.id, function() {
          if (pbooks.length > 0)
            delete_bd_tables(pbooks[0].bookdefid, pbooks[0].projectid, function () {
              do_project_delete(0, project);
            });
          else
            do_project_delete(1, project);
        });
   }
   if (status == 1) { // userprojects
      backendCall("tableDelete", { tableName:"kipus_userprojects",
        filterCol:'projectid', filterVal:project.id},
            function(res,resultPar){
                 log("Delete userprojects done" );
                 do_project_delete(2, project);
       });
   }
   if (status == 2) { // projects
      backendCall("tableDelete", { tableName:"kipus_projects",
          filterCol:'id', filterVal:project.id},
            function(res,resultPar){
               log("Delete project done" );
               do_project_delete(3, project);
      });
   }
   if (status == 3) { // projectfiles
     var filterVal = "/projects/"+project.name+"/%";
     log("filterVal="+filterVal);
      backendCall("tableDelete", { tableName:"kipus_bigdata",
        filterCol:'dataid', filterVal:filterVal},
        function(res,resultPar){
               log("Delete pfiles done" );
               showAlert(trHtml.project_delete[1], "success");
               select_project();
        });
   }
}

function
delete_project(btn, i) {
  var projectid = project[i].id;
  var ctx = getCtx(project[i], "project");
  log("delete_project :" + projectid);
  $("div#dialog").html(trHtml.project_delete[0]);
  $("div#dialog").dialog({
    dialogClass:"no-close", buttons: [
      {text:trHtml.dlg[2], click:function(){
        backendCall("deleteProject", { projectId:project[i].id, projectName:project[i].name },
          function(res,resultPar){ log("project deleted" );
                               log_sc($(btn).attr("title"), ctx);
                               backendCall("reloadProjects", {}, function(res) { log("project reloaded"); });
                               showAlert(trHtml.project_delete[1], "success");
                               window.setTimeout(select_project, 500);
                               });
        $(this).dialog("close");
      }},
      {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
  });
}

function
download_project() {
  log("download_project");
  if (!$(".form-project [name=id]").val() ) {
    showAlert(trHtml.project_download[0], "warning");
    return;
  }
  $("#btn-downloadproject").prepend("<img class='waiting'></img>");
  backendCall("downloadProject", { projectName:$(".form-project [name=name]").val(),
                                   includeUserdata:$("#include_userdata_cb").is(':checked'),
                                   projectId:$(".form-project [name=id]").val(), asFile:true},
    function(res,resultPar){ log("project downloaded" );
                         showAlert(trHtml.project_download[1], "success");
                         var path = location.href.substring(0, location.href.lastIndexOf('/'));
                         downloadFile(path+res.fileName);
                         $("img.waiting").remove();
                         });
}

function
import_project() {
  log("import_project");
  if (!$("#import_file_project").val()) {
    showAlert(trHtml.project_import[0], "warning");
    return;
  }
  var file = $('#import_file_project').prop('files')[0];
  var reader = new FileReader();
  $("#btn-importproject").prepend("<img class='waiting'></img>");
  reader.onload = function(event) {
      log("file read done");
      backendCall("importProject", { data:event.target.result,
             replaceUserdata:$("#replace_userdata_cb").is(':checked'),
             checkOnly:$("#checkOnly_cb").is(':checked'),
             overwrite:$("#overwrite_cb").is(':checked'),
             changeNameTo:$("#changeNameTo").val() },
        function(res,resultPar){
          if (!$("#checkOnly_cb").is(':checked')) {
            log_sc("Import project", res.join("\n"));
            backendCall("reloadProjects", {}, function(res) { log("project reloaded"); });
          }
          okDialog('<div>'+res.join("</div><div>")+'</div>');
          $("img.waiting").remove();
//          toggle_project_import();
//          select_project();
//          showAlert(trHtml.project_import[1], "success");
        });

  };
  reader.onerror = function(event) {
      log("file read error: " + event.target.error.code);
      showAlert(trHtml.project_import[2], "warning");
      $("img.waiting").remove();
  };
  reader.readAsDataURL(file);
}

function
create_project(btn) {
  log("create_project");
  if (!$(".form-project [name=name]").val() ) {
    showAlert(trHtml.project_create[0], "warning");
    return;
  }
  if (!$(".form-project [name=prefix]").val() || $(".form-project [name=prefix]").val().length > 5) {
    showAlert(trHtml.project_create[2], "warning");
    return;
  }
  if ($(".form-project").find(".has-error").length) {
    showAlert(trHtml.regexp[0], "warning");
    return;
  }
  var cols = {
    name:     $(".form-project [name=name]")     .val(),
    prefix:   $(".form-project [name=prefix]")   .val(),
    title:    $(".form-project [name=title]")    .val(),
    isDefault:$(".form-project [name=isdefault]").val(),
    isOffline:$(".form-project [name=isoffline]").val(),
    created: now()
  };
  backendCall("tableInsert", { tableName:"kipus_projects", columns:cols
    },
    function(res,resultPar){
       log("project added" );
       log_sc($(btn).text(), getCtx(cols, "project"));
       backendCall("reloadProjects", {}, function(res) { log("project reloaded"); });
       toggle_project_create(); select_project();
       showAlert(trHtml.project_create[1], "success");
      });
}

function
select_external(projectid,callbackfn)
{
  var canWrite = hasProjectRight("Projects", "write", projectid) ||
                 hasProjectRight("AdminAll", "write");
  log("select external " + projectid);
  backendCall("tableSelect", { tableName:"kipus_external" , filterCol:'projectid', filterVal:projectid},
    function(res, resultPar) {
      external = res;
      if (canWrite) {
        $("#externaltable thead th[trid=th_edit]").text("Edit");
        $("#externaltable thead th[trid=th_delete]").show();
      } else {
        $("#externaltable thead th[trid=th_edit]").text("View");
        $("#externaltable thead th[trid=th_delete]").hide();
      }
      $("#externaltable >tbody tr").remove();
      for(var i=0; i<external.length; i++) {
          var row = "<tr>"+(canWrite?"<td align='center'><i class='btn-link glyphicon glyphicon-remove red'" +
                    "onclick='delete_external(\"" + i +  "\")'></i></td>":"")+
                    "<td align='center'><i class='btn-link glyphicon "+(canWrite?glEdit:glView)+"'" +
                    "onclick='toggle_external_edit(\"" + i + "\")'></i></td>" +
                   "<td>"+external[i].destination + "</td>"+
                   "<td>"+external[i].src_table + "</td>"+
                   "<td>"+external[i].dst_table + "</td>"+
                   "</tr>";
          $('#externaltable').find('tbody:last').append(row);
      }
      if (res.length == 0 && callbackfn)
        callbackfn();
    });
}

function
select_pbooks(projectid,callbackfn)
{
  currProjId = projectid;
  var canWrite = hasProjectRight("Projects", "write", projectid) ||
                 hasProjectRight("AdminAll", "write");
  log("select pbooks " + projectid + " "+canWrite);
  backendCall("tableSelect", { tableName:"kipus_projectbooks" , filterCol:'projectid', filterVal:projectid},
    function(res, resultPar) {
      pbooks = res;
      if (canWrite) {
        $("#pbooktable thead th[trid=th_edit]").text("Edit");
        $("#pbooktable thead th[trid=th_delete]").show();
      } else {
        $("#pbooktable thead th[trid=th_edit]").text("View");
        $("#pbooktable thead th[trid=th_delete]").hide();
      }
      $("#pbooktable >tbody tr").remove();
      var trHash = {};
      pbdef = {};
      for(var i=0; i<res.length; i++) {
        (function(idx){
          backendCall("tableSelect", { tableName:"kipus_bookdefinition" , filterCol:'id', filterVal:res[idx].bookdefid, orderBy:"title"},
            function(res1, resultPar) {
                pbdef[res[idx].bookdefid] = res1[0];
                var row = "<tr><td align='center'><i class='btn-link glyphicon "+(canWrite?glEdit:glView)+"'" +
                          "onclick='navigate_bd_edit(\"" + res1[0].id + "\")'></i></td>" + (canWrite?
                          "<td align='center'><i title='Delete book' bookname='"+res1[0].name+"' booktitle='"+res1[0].title+"' class='btn-link glyphicon glyphicon-remove red'" +
                          "onclick='delete_bd(this, \"" + resultPar +  "\")'></i></td>":"")+
                          "<td>"+ res1[0].title + "</td></tr>";
                trHash[res1[0].title] = row;
                var trs = Object.keys(trHash);
                if (trs.length == res.length) {
                  var tbody = "";
                  trs.sort(function(a,b) { return a.localeCompare(b) } );
                  for (var i=0; i<trs.length; i++)
                    tbody += trHash[trs[i]];
                  $('#pbooktable tbody').html(tbody);
                }
                if (resultPar==res.length -1 && callbackfn)
                  callbackfn();
            }, idx);
        })(i);
      }
      if (res.length == 0 && callbackfn)
        callbackfn();
    });
}

function
select_pright(par)
{
  if(!par.canWrite)
    par.canWrite =
      hasProjectRight("Projects", "write",project[par.pidx].id) ||
      hasProjectRight("AdminAll", "write");
  if(!par.colHash) {
    backendCall("tableSelect", {        // First the top-level book names
      columns:"pb.bookdefid, bd.title",
      tableName:"kipus_projectbooks pb, kipus_bookdefinition bd",
      where:"pb.projectid='"+project[par.pidx].id+"' and "+
            "bd.id=pb.bookdefid and bd.parentbookid is NULL" },
      function(res){
        par.colHash = {};
        for(var i1=0; i1<res.length; i1++) {
          par.colHash[res[i1].bookdefid] = res[i1].title+": Unique "+res[i1].title;
          par.colHash["OWN."+res[i1].bookdefid] = res[i1].title+": Own"+res[i1].title;
        }

        backendCall("tableSelect", {    // then the columns from the header
          columns:"pa.columnname",
          tableName:"kipus_projectbooks pb, kipus_bookpages bp,"+
                    "kipus_pagedefinition pd, kipus_pageattributes pa,"+
                    "kipus_bookdefinition bd",
          where:"pb.projectid='"+project[par.pidx].id+"' and "+
                "bd.id=pb.bookdefid and bd.parentbookid is NULL and "+
                "pb.bookdefid=bp.bookdefid and bp.pagedefid=pd.id and "+
                "pd.pagetype='HEADER' and pa.pagedefid=pd.id and "+
                "pa.constrainttype='singleFromTable'" },
          function(res){
            for(var i1=0; i1<res.length; i1++)
              par.colHash[res[i1].columnname] = res[i1].columnname;
            select_pright(par);
          });
      });
    return;
  }

  prightpar = par;
  var a = hashKeysAsArray(par.colHash).sort(), h="";
  for(var i1=0; i1<a.length; i1++)
    h+= '<option value="'+a[i1]+'">'+par.colHash[a[i1]]+'</option>';
  par.options = h;
  par.idx=0;

  var rd = $("[name=prightdef]").val().split(",").sort();
  if (par.canWrite)
    $("#prighttable thead th[trid=th_delete]").show();
  else
    $("#prighttable thead th[trid=th_delete]").hide();
  $("#prighttable>tbody>tr").remove();
  if(rd.length && rd[0].length) // empty string
    for(var i1=0; i1<rd.length; i1++)
      add_prightdef(rd[i1], project[par.pidx].id);
}

function
add_prightdef(def, projectid)
{
  var canWrite = hasProjectRight("Projects", "write", projectid) ||
                 hasProjectRight("AdminAll", "write");
  var p = prightpar;
  var idx = p.idx++;
  var h = "<tr row='"+idx+"'>"+
            "<td align='center'>"+
             "<i class='btn-link glyphicon glyphicon-remove red'></i></td>"+
           "<td data='col2'><select></select></td>"+
         "</tr>";
  $("#prighttable>tbody").append(h);

  function
  save()
  {
    var v=[];
    $("#prighttable>tbody>tr").each(function(){
      v.push($(this).find("select").val())
    });
    $("[name=prightdef]").val(v.join(","));
  }

  $("#prighttable>tbody>tr[row="+idx+"]").each(function(){
    $(this).find("select").html(p.options).change(save);
    if(def)
      $(this).find("select").val(def);
    $(this).find(" .glyphicon-remove").click(function(){
      $(this).closest("tr").remove();
      save();
    });
  });
  $("#prighttable input").attr("readonly", !canWrite);
  $("#prighttable select").attr("disabled", !canWrite);
  if (!canWrite)
    $("#prighttable i.glyphicon-remove").closest("td").hide();
  if(!def && canWrite)
    save();
}

/*
 * END Projects
 */

/*
 * role administration
 */

function
delete_role(roleid) {
  log("delete_role :" + roleid);
  function do_delete_role() {
    var roleUsedByUsers = [];
    for (var i=0; i<user.length; i++) {
      var used = false;
      if (!user[i].rights)
          continue;
      var ur = user[i].rights.split(" ");
      for (var j=0; j<ur.length; j++) {
        var x = ur[j].split(":");
        if (x && x.length > 1 && x[0] == roleid)
          used = true;
      }
      if (used)
        roleUsedByUsers.push(user[i].login);
    }
    if (roleUsedByUsers.length == 0)
      $("div#dialog").html(trHtml.role_delete[0]);
    else
      $("div#dialog").html(sprintf(trHtml.role_delete[2], roleUsedByUsers.join(", ")));
    $("div#dialog").dialog({
      dialogClass:"no-close", buttons: [
        {text:trHtml.dlg[2], click:function(){
          backendCall("tableDelete", { tableName:"kipus_roles",
                filterCol:'id', filterVal:roleid},
            function(res,resultPar){
               log("Delete roles done" );
               showAlert(trHtml.role_delete[1], "success");
               select_roles();
               // role was deleted, home user
               switch_home("user");
               switch_tab("role");
            });
          $(this).dialog("close");
        }},
        {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
    });
  }

  if (!user)
    select_user(do_delete_role);
  else
    do_delete_role();
}

function
create_role() {
  log("create_role");
  if (!$(".form-role [name=rolename]").val() || !$(".form-role [name=roletitle]").val() || !$(".form-role [name=project]").val()) {
    showAlert(trHtml.role_create[0], "warning");
    return;
  }
  var project = $(".form-role [name=project]").val();

  var bookdef_rights = "";
  $("#bdrighttable tbody tr:visible").each(function() {
     var bookdef = $(this).find("div.bookdef").attr("bookdefid");
     var right = $(this).find("select.right").val();
     if (right)
       bookdef_rights += (bookdef_rights!=""?" ":"")+bookdef+"="+right;
  });
  var admin_rights = $("#adminrighttable select.adminright").val()+"="+
                     $("#adminrighttable select.right").val();
  backendCall("tableInsert", { tableName:"kipus_roles", columns:{
    name:$(".form-role [name=rolename]").val(),
    displayname:$(".form-role [name=roletitle]").val(),
    projectid:(project == "*"? null: project),
    bookdef_rights: bookdef_rights,
    admin_rights: admin_rights,
    admin_parameters: $(".form-role [name=admin_parameters]").val(),
    }},
    function(res,resultPar){ log("role created" ); toggle_role_create(); select_roles();
      // role was created, home user
      switch_home("user");
      switch_tab("role");
      showAlert(trHtml.role_create[1], "success");});
}

function
update_role() {
  log("update_role");
  if (!$(".form-role [name=rolename]").val() || !$(".form-role [name=roletitle]").val() ||
      !$(".form-role [name=id]").val() || !$(".form-role [name=project]").val()) {
    showAlert(trHtml.role_create[0], "warning");
    return;
  }
  var project = $(".form-role [name=project]").val();
  var bookdef_rights = "";
  $("#bdrighttable tbody tr:visible").each(function() {
     var bookdef = $(this).find("div.bookdef").attr("bookdefid");
     var right = $(this).find("select.right").val();
     if (right)
       bookdef_rights += bookdef+"="+right+" ";
  });
  var admin_rights = "";
  $("#adminrighttable tbody tr").each(function() {
     var adminright = $(this).find("select.adminright").val();
     var right = $(this).find("select.right").val();
     admin_rights += adminright+"="+right+" ";
  });
  var cols = {
    name:$(".form-role [name=rolename]").val(),
    displayname:$(".form-role [name=roletitle]").val(),
    projectid:(project == "*"?null:project),
    bookdef_rights: bookdef_rights,
    admin_rights: admin_rights,
    admin_parameters: $(".form-role [name=admin_parameters]").val()
  };
  backendCall("tableUpdate", { tableName:"kipus_roles", columns: cols,
                               filterCol:  "id", filterVal: $(".form-role [name=id]").val()},
  function(res,resultPar){ log("role update" ); toggle_role_create(); select_roles();
                       showAlert(trHtml.role_update[0], "success");});
}

function
toggle_role_create() {
  if (!$(".form-role").is(":visible")) {
    $(".table-role").css("display","none");
    $(".form-role").css("display","");
    $(".form-role input").val("");
    $("#btn-editRole").hide();
    $("#btn-createRole").show();
    $(".form-role [name=rolename]").attr("disabled", false);
    $("#bdrighttable >tbody tr").remove();
    $("#adminrighttable >tbody tr").remove();
    create_project_options(".form-role [name=project]", function() {
     add_adminright();
     $(".form-role #bdrighttable").closest(".row").hide();
    });
    push_headtitle("role", $("#btn-togglecreaterole").text());
  } else {
    $(".table-role").css("display","");
    $(".form-role").css("display","none");
    pop_headtitle("role");
  }
}


function
toggle_role_edit(i) {
  var role = roles[i];
  var canWrite = hasProjectRight("RoleAdministration", "write") ||
                 hasProjectRight("AdminAll", "write");
  if (!$(".form-role").is(":visible")) {
    $(".table-role").css("display","none");
    $(".form-role").css("display","");
    $("#bdrighttable >tbody tr").remove();
    $("#adminrighttable >tbody tr").remove();
    $("#btn-createRole").hide();
    $(".form-role [name=id]").val(role.id);
    $(".form-role [name=rolename]").val(role.name);
    $(".form-role [name=rolename]").attr("disabled", true);
    $(".form-role [name=roletitle]").val(role.displayname);
    $(".form-role [name=admin_parameters]").val(role.admin_parameters);
    create_project_options(".form-role [name=project]", function() {
      if (role.projectid) {
         $(".form-role [name=project]").val(role.projectid);
      } else {
         $(".form-role [name=project]").val("*");
      }
      if (canWrite) {
        $("#btn-editRole").show();
        $("#btn-addadminRight").show();
        $("#bdrighttable thead th[trid=th_delete]").show();
        $("#adminrighttable thead th[trid=th_delete]").show();
      } else {
        $("#btn-editRole").hide();
        $("#btn-addadminRight").hide();
        $("#bdrighttable thead th[trid=th_delete]").hide();
        $("#adminrighttable thead th[trid=th_delete]").hide();
      }
      push_headtitle("role", role.name);
      add_bdrights(role.bookdef_rights.split(" "), canWrite);
      var adminrights = role.admin_rights.split(" ");
      for (var i=0; i<adminrights.length; i++) {
        var adminright = adminrights[i].split("=")[0];
        var right = adminrights[i].split("=")[1];
        if (adminright && right)
          add_adminright(adminright, right, canWrite);
      }
      if (adminrights.length == 0 || adminrights[0] == "") {
        // workaround for old roles without rights
       add_adminright();
      }

      if (role.admin_rights.indexOf("UserFrontend") == 0) {
         $(".form-role #adminrighttable .select").hide();
         $(".form-role #bdrighttable").closest(".row").show();
      }
      else {
         $(".form-role #adminrighttable .select").show();
         $(".form-role #bdrighttable").closest(".row").hide();
      }

      if(role.admin_rights.indexOf("Regexp") >= 0) {
        $(".form-role [name=admin_parameters]").closest(".row").show();
      } else {
        $(".form-role [name=admin_parameters]").closest(".row").hide();
      }

      function update_ulist() {
        $(".form-role #uroletable >tbody tr").remove();
        for (var i1=0; i1<user.length; i1++) {
          var used = false;
          if (!user[i1].rights)
              continue;
          var ur = user[i1].rights.split(" ");
          for (var i2=0; i2<ur.length; i2++) {
            var x = ur[i2].split(":");
            if (x && x.length > 1 && x[0] == role.id)
              used = true;
          }
          if (used) {
            $('.form-role #uroletable').find('tbody:last').append("<tr>"+(canWrite?
                      "<td align='center'><i class='btn-link glyphicon glyphicon-remove red'" +
                      "user_id='"+ i1 + "'></i></td>":"")+
                      "<td>"+ user[i1].login + "</td></tr>");
          }
          $("#uroletable .glyphicon-remove").unbind("click").click(function(){ // Delete
            var el = $(this);
            var uid = $(this).attr("user_id");
            log("roleid="+role.id);
            $("div#dialog").html(trHtml.role_delete[3]);
            $("div#dialog").dialog({
              dialogClass:"no-close", buttons: [
                {text:trHtml.dlg[2], click:function(){
                  $(this).dialog("close");
                  var u = user[uid];
                  var ra = u.rights.split(" ");
                  var nr = [];
                  for (var i1=0; i1<ra.length; i1++) {
                    var rh = ra[i1].split(":");
                    if(!ra[i1] || rh.length != 2 || rh[0] == role.id)
                      continue;
                    nr.push(ra[i1]);
                  }
                  backendCall("tableUpdate", { tableName:"kipus_user", columns: { rights: nr.join(" ") },
                                               filterCol:'login', filterVal: u.login },
                  function(res,resultPar){
                    log("removed user " +u.login + " from role "+ role.name);
                    select_user(update_ulist);
                  });
                }},
                {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
            });
          });
        }
      }
      if (!user)
        select_user(update_ulist);
      else
        update_ulist();
    });

  } else {
    $(".table-user").css("display","");
    $(".form-user").css("display","none");
    pop_headtitle("user");
  }
}

function
getBookDefName(bookdefid)
{
  for(var i=0; i<bookdefs.length; i++) {
    if (bookdefid==bookdefs[i].id)
      return bookdefs[i].title;
  }
  return "Unknown name for bookdefid " + bookdefid;
}

function
bookdef_options(bookdefid) {
  var options = "";
  var projname = get_projname($(".form-role [name=project]").val(), bookdefs);
  for(var i=0; i<bookdefs.length; i++) {
    if (!bookdefid && bookdefs[i].projname != projname)
       continue;
    options  += "<option "+(bookdefid==bookdefs[i].id?"selected ":"")+
       " value='" + bookdefs[i].id +  "'>" + bookdefs[i].title + "</option>";
  }
  return options;
}

function
adminright_options(adminright) {
  var options = "";
  var selectedProject = $(".form-role [name=project]").val();
  for(var i=0; i<adminRights.length; i++) {
    options += "<option "+
        (adminright==adminRights[i]?"selected ":"")+
        (selectedProject == "*" && i == 7?"style='display:none' ":"")+
        ">" + adminRights[i] + "</option>";
  }
  return options;
}

function
delete_row(event) {
 $(event).closest("tr").remove();
}

function add_bdrights(bdrights, canWrite) {
  var projectid = $(".form-role [name=project]").val();
  var bdHash = {};
  for (var i=0; i<bdrights.length; i++) {
    var bookdefid = bdrights[i].split("=")[0];
    var right = bdrights[i].split("=")[1];
    bdHash[bookdefid] = right;
  }
  backendCall("tableSelect", { tableName:"kipus_projectbooks" , filterCol:'projectid', filterVal:projectid},
    function(res, resultPar) {
    res.sort(function(a,b) {
      var n1 = getBookDefName(a.bookdefid);
      if (!n1)
        return -1;
      var n2 = getBookDefName(b.bookdefid);
      if (!n2)
        return 1;
      return n1.localeCompare(n2);
    });
    for (var i=0; i<res.length; i++) {
      var bookdefid = res[i].bookdefid;
      add_bdright(bookdefid, bdHash[bookdefid], canWrite);
    }
  });
}

function
add_bdright(bookdefid, right, canWrite) {
  //log("add_bdright: " + bookdefid + " " + right);
  if (!bookdefid && !right)
    canWrite = hasProjectRight("RoleAdministration", "write") ||
               hasProjectRight("AdminAll", "write");
  var row = "<tr><td><div bookdefid='"+bookdefid+"' class='bookdef'>"+getBookDefName(bookdefid)+"</div></td>"+
      "<td>"+(canWrite?"<select class='right form-control'>"+
            "<option value='read' "+(right == "read"?"selected":"")+">read</option>"+
            "<option value='write' "+(right =="write"?"selected":"")+">write</option>"+
            "<option value='' "+(!right || right ==""?"selected":"")+">none</option>"+
      "</select>":right)+"</td>"+
    "</tr>";
  $('#bdrighttable').find('tbody:last').append(row);
}

function
add_adminright(adminright, right, canWrite) {
  if (!adminright && !right)
    canWrite = hasProjectRight("RoleAdministration", "write") ||
               hasProjectRight("AdminAll", "write");
  var row = "<tr><td>"+(canWrite?"<select class='adminright form-control' onchange='update_bdrights()'>"+adminright_options(adminright)+"</select>":adminright)+"</td>"+
      "<td>"+(canWrite?"<select class='right form-control'><option "+(right != "write"?"selected":"")+">read</option><option "+(right =="write"?"selected":"")+">write</option></select>":right)+"</td>"+
    "</tr>";
  $('#adminrighttable').find('tbody:last').append(row);
  if (adminright == "UserFrontend")
    $("#adminrighttable select.right").hide();

  $(".form-role [name=admin_parameters]").closest(".row").hide();
}

function
format_bookdef_rights(admin_rights, bookdef_rights) {
  var result = "";
  var bdrights = bookdef_rights.split(" ");
  var bnameHash = {};
  for (var i=0; i< bookdefs.length; i++) {
    bnameHash[bookdefs[i].id] = bookdefs[i].title;
  }

  var ar = format_admin_rights(admin_rights);
  for (var i=0; i< bdrights.length; i++) {
    var bookdefid = bdrights[i].split("=")[0];
    if (!bookdefid)
      continue;
    var right = bdrights[i].split("=")[1];
    result += (result != ""?", ":"")+bnameHash[bookdefid] + (ar != "UserFrontend"?"":" ("+right+")");
  }
  return result;
}

function
format_admin_rights(admin_rights) {
  var result = "";
  var adminrights = admin_rights.split(" ");
  for (var i=0; i< adminrights.length; i++) {
    var adminright = adminrights[i].split("=")[0];
    if (!adminright)
      continue;
    var right = adminrights[i].split("=")[1];
    result += (result != ""?", ":"")+ adminright + (adminright == "UserFrontend"?"":" ("+right+")");
  }
  return result;
}

function get_projname(projectid, data) {
  if (!projectid || !data)
    return "";
  for(var i=0; i<data.length; i++) {
    if (data[i].projectid == projectid)
      return data[i].projname;
  }
  return "";
}

function
select_roles()
{
    var canWrite = hasProjectRight("RoleAdministration", "write") ||
                   hasProjectRight("AdminAll", "write");
    backendCall("tableSelect",
      { tableName:"kipus_bookdefinition bd,kipus_projectbooks pb, kipus_projects p",
        columns: "bd.id,bd.title,p.name projname,p.id projectid",
        where:"bd.id=pb.bookdefid and p.id=pb.projectid",
        orderBy:"projname,title" },
      function(res, resultPar) {
        bookdefs = res;
    backendCall("tableSelect", {
                tableName:"kipus_roles as r left join kipus_projects as p on r.projectid = p.id",
                columns:"r.*,p.name as project",
                orderBy:"r.displayname" },
      function(res, resultPar) {
        res.sort(function(a,b) {
          // sort by project, displayname
          if (!a.projectid)
            return -1;
          if (!b.projectid)
            return 1;
          if (!a.project && !b.project)
            return a.displayname.localeCompare(b.displayname);
          return a.project.localeCompare(b.project);
        });
        roles = res;
        if (!canWrite) {
          $("#rtable thead th[trid=th_edit]").text("View");
          $("#rtable thead th[trid=th_delete]").hide();
          $("#btn-togglecreaterole").hide();
        } else {
          $("#rtable thead th[trid=th_edit]").text("Edit");
          $("#rtable thead th[trid=th_delete]").show();
          $("#btn-togglecreaterole").show();
        }
        $("#rtable >tbody tr").remove();
        for(var i=0; i<res.length; i++) {
          var r = res[i];
          var bf = r.admin_parameters ? r.admin_parameters : 
                   format_bookdef_rights(r.admin_rights, r.bookdef_rights);
          var row = "<tr><td align='center'><i class='btn-link glyphicon "+(canWrite?glEdit:glView)+"'" +
                    "onclick='toggle_role_edit(\"" + i + "\")'></i></td>" +(canWrite?
                    "<td align='center'><i class='btn-link glyphicon glyphicon-remove red'" +
                    "onclick='delete_role(\"" + r.id + "\")'></i></td>":"")+
                    "<td><div>"+ (!r.projectid?"*":r.project) + "</div></td>" +
                    "<td><div>"+ r.displayname + "</div></td>" +
                    "<td><div>"+ format_admin_rights(r.admin_rights) + "</div></td>" +
                    "<td>"+ bf + "</td></tr>";
          $('#rtable').find('tbody:last').append(row);
        }
        table_pagination($("#rtable"));
      });
    });
}

/*
 * user administration
 */
function
delete_user(login, callback) {
  log("delete_user :" + login);
  $("div#dialog").html(sprintf(trHtml.user_delete[0], login));
  $("div#dialog").dialog({
    dialogClass:"no-close", buttons: [
      {text:trHtml.dlg[2], click:function(){
        var cmds=[];
        cmds.push({ fn:"tableDelete", tableName:"kipus_usertopics",
                    filterCol:'login', filterVal:login });
        cmds.push({ fn:"tableDelete", tableName:"kipus_pushtoken",
                    filterCol:'login', filterVal:login });
        cmds.push({ fn:"tableDelete", tableName:"kipus_userprojects",
                    filterCol:'login', filterVal:login });
        cmds.push({ fn:"tableDelete", tableName:"kipus_generateduserbookids",
                    filterCol:'login', filterVal:login });
        cmds.push({ fn:"tableDelete", tableName:"kipus_user",
                    filterCol:'login', filterVal:login });
        backendCall("tableBatch", { commands:cmds },
        function(res,resultPar){
          log("Delete done" );
          showAlert(trHtml.user_delete[1], "success");
          if(callback)
            callback();
          else
            select_user();
        });
        $(this).dialog("close");
      }},
      {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
  });
}

function
update_user(prefix, callbackfn)
{
  if(!prefix)
    prefix = ".form-user";
  log("update_user:"+prefix+"<");
  if($(prefix+" [name=passwd]").val() != $(prefix+" [name=passwd2]").val()) {
    showAlert(trHtml.user_update[1], "warning");
    return;
  }
  if($(prefix+"urights li.parent.red").length > 0) {
    showAlert(trHtml.user_update[2], "warning");
    return;
  }

  var cols = {
    login:        $(prefix+" [name=login]").val(),
    displayname:  $(prefix+" [name=displayname]").val(),
    address:      $(prefix+" [name=address]").val(),
    email:        $(prefix+" [name=email]").val(),
    phonenumber:  $(prefix+" [name=phonenumber]").val(),
    messengerid:  $(prefix+" [name=messengerid]").val(),
    zalo:         $(prefix+" [name=zalo]").val(),
    alwaysLogin:  $(prefix+" [name=alwaysLogin]").val(),
    usertype:     $(prefix+" [name=usertype]").val(),
    password:     $(prefix+" [name=passwd]").val(),
    project:      $(prefix+" [name=project]").val(),
    language:     $(prefix+" [name=language]").val(),
    rights:       $(prefix+" [name=rights]").val() };

  if (prefix == ".form-settings") {
    var locale = { language: $(prefix+" [name=language]").val(),
                   country:   $(prefix+" [name=country]").val(),
                   currency: $(prefix+" [name=currency]").val(),
                   currencyDisplay: $(prefix+" [name=currencyDisplay]").val() };
    cols.locale = JSON.stringify(locale);
  }

  if(userEditHook)
    userEditHook(undefined, cols);

  if($(prefix+" [name=passwd]").val() == dummyPasswd) {
     log("password is dummy pwd");
     log($(prefix+" [name=passwd]").val());
     delete(cols.password);
  }

  backendCall("userUpdate", 
    { tableName:"kipus_user", columns: cols, filterCol:  "login",
      filterVal: $(prefix+" [name=login]").val() },
    function(res,resultPar){
      log("user update "  + prefix);
      if($(prefix+" [name=passwd]").val() != dummyPasswd &&
         $(prefix+" [name=login]").val().toLowerCase() == bcUser) {
        log("password of current user was changed");
        bcPasswd = $(prefix+" [name=passwd]").val();
        if(window.sessionStorage.bcPasswd)
          window.sessionStorage.setItem('bcPasswd', bcPasswd);
      }
      if(callbackfn)
        callbackfn();
      else
        select_user(toggle_user_edit);
      showAlert(trHtml.user_update[0], "success");});
}

function
create_user(prefix, nextFn)
{
  if(!prefix)
    prefix = ".form-user";

  log("create_user:"+prefix+"<");
  if (!$(prefix+" [name=passwd]").val() ||
      !$(prefix+" [name=displayname]").val() ||
      !$(prefix+" [name=login]").val()) {
    showAlert(trHtml.user_create[0], "warning");
    return;
  }
  if ($(prefix+" [name=passwd]").val() != $(prefix+" [name=passwd2]").val()) {
    showAlert(trHtml.user_create[1], "warning");
    return;
  }

  backendCall("userCreate", { tableName:"kipus_user", columns:{
    login:$(prefix+" [name=login]").val(),
    displayname:  $(prefix+" [name=displayname]").val(),
    address:      $(prefix+" [name=address]").val(),
    email:        $(prefix+" [name=email]").val(),
    phonenumber:  $(prefix+" [name=phonenumber]").val(),
    messengerid:  $(prefix+" [name=messengerid]").val(),
    zalo:         $(prefix+" [name=zalo]").val(),
    usertype:     $(prefix+" [name=usertype]").val(),
    alwaysLogin:  $(prefix+" [name=alwaysLogin]").val(),
    password:     $(prefix+" [name=passwd]").val(),
    project:      $(prefix+" [name=project]").val(),
    rights:       $(prefix+" [name=rights]").val(),
    }},
    function(res,resultPar){ 
      log("user created" );
      if(nextFn) {
        nextFn();
      } else {
        toggle_user_create();
        select_user();
      }
      showAlert(trHtml.user_create[2], "success");
    });
}

function
toggle_user_edit(i)
{
  var canWrite = hasProjectRight("UserAdministration", "write") ||
                 hasProjectRight("AdminAll", "write");
  if (!$(".form-user").is(":visible")) {
    select_userprojects(user[i].login, function() {
      select_userrights({rights:user[i].rights});
    });
    $(".table-user").css("display","none");
    $(".form-user").css("display","");
    $(".form-user [name=login]").prop("readonly", true);
    create_lang_options(".form-user [name=language]", "ADMIN", user[i].language);

    if(userEditHook)
      userEditHook(i);

    $(".form-user :input").each(function() {
      var tagname = $(this).prop('tagName');
      if (tagname.toLowerCase() != "input" &&
          tagname.toLowerCase() != "textarea" &&
          tagname.toLowerCase() != "select")
      return;
      var key = $(this).attr("name");
      var val = user[i][key];
      if (key == "passwd" || key == "passwd2") {
         $(this).val(dummyPasswd);
      } else {
        if (val != undefined)
          $(this).val(val);
        else
          $(this).val("");
      }
    });
    $("#uprojecttable").closest(".row").show();
    $(".form-user [name=project]").val(user[i].project);
    $("#btn-createUser").hide();
    if (canWrite) {
      $("#btn-addUserProject").show();
      $("#btn-editUserPermission").show();
      $("#btn-updateUser").show();
    }
    else {
      $("#btn-addUserProject").hide();
      $("#btn-editUserPermission").hide();
      $("#btn-updateUser").hide();
    }
    push_headtitle("user", user[i].login);
  } else {
    $(".table-user").css("display","");
    $(".form-user").css("display","none");
    pop_headtitle("user");
  }
}

function
toggle_user_create() {
  if (!$(".form-user").is(":visible")) {
    $("#uprojecttable").closest(".row").hide();
    $(".table-user").css("display","none");
    $(".form-user").css("display","");
    $(".form-user input").val("");
    $(".form-user [name=login]").prop("readonly", false);
    $("#btn-updateUser").hide();
    $("#btn-createUser").show();
    $("#btn-addUserProject").hide();
    $("#btn-editUserPermission").hide();
    $("#urights").empty();
    push_headtitle("user", $("#btn-togglecreateuser").text());
    $(".form-user [name=project]").val("");
  } else {
    $(".table-user").css("display","");
    $(".form-user").css("display","none");
    pop_headtitle("user");
  }
}

function
select_user(callbackfn)
{
    log("select_user");
    var canWrite = hasProjectRight("UserAdministration", "write") ||
                   hasProjectRight("AdminAll", "write");
    if (!canWrite) {
      $("#btn-togglecreateuser").hide();
      $("#utable thead th[trid=th_edit]").text("View");
      $("#utable thead th[trid=th_delete]").hide();
    } else {
      $("#btn-togglecreateuser").show();
      $("#utable thead th[trid=th_edit]").text("Edit");
      $("#utable thead th[trid=th_delete]").show();
    }
    backendCall("tableSelect", { tableName:"kipus_user", orderBy:"login" },
      function(res, resultPar) {
        function format_status(u) {
          var str = "";
          
          if (u.status == "LOCKED")
            str += "<i class='btn-link fa fa-lock fa-lg red'></i>";
          else
            str += "<i class='btn-link fa fa-unlock-alt fa-lg green'></i>";
          str += "<span> ";
          if (u.status == "LOCKED")
            str += trHtml.sync_status[1];
          else
            str += trHtml.sync_status[0];
          if (u.lastSync == null || u.lastSync < u.statusModified)
            str += trHtml.sync_status[2];
          str += "</span>"
          return str;
        }
        function e(a) {return a == undefined ? ""  : a; }
         
        user = res;
        $("#utable >tbody tr").remove();
        for(var i=0; i<res.length; i++) {
          var row = "<tr login='"+res[i].login+"'><td align='center'><i class='btn-link glyphicon "+(canWrite?glEdit:glView)+"'" +
                    "onclick='toggle_user_edit(\"" + i + "\")'></i></td>" +(canWrite?
                    "<td align='center'><i class='btn-link glyphicon glyphicon-remove red'" +
                    "onclick='delete_user(\"" + res[i].login + "\")'></i></td>":"")+
                    "<td><div>"+ res[i].login + "</div></td>" +
                    "<td><div>" + res[i].displayname + "</div></td>" +
                    "<td><div>" +(res[i].email ? res[i].email:"")+"</div></td>"+
                    "<td><div>" + (res[i].phonenumber?res[i].phonenumber:"") + "</div></td>" +
                    "<td><div>" + (res[i].zalo?res[i].zalo:"") + "</div></td>" +
                    "<td><div>" + e(res[i].lastSync) + "</div></td>" +
                    "<td><div>" + format_status(res[i]) + "</div></td>" +
                    "</tr>";
          $('#utable').find('tbody:last').append(row);
        }
        $("#utable i.btn-link.fa-lock").click(function() {
          var btn = this;
          var login=$(this).closest("tr").attr("login");
          log("unlock user " + login);
          backendCall("tableUpdate", { tableName:"kipus_user",columns: {status:'DEFAULT', statusModified: now()},
                                       filterCol:'login', filterVal: login},
          function() {
             select_user(); 
          });
          
        });
        $("#utable i.btn-link.fa-unlock-alt, #utable i.btn-link.fa-unlock").click(function() {
          var btn = this;
          var login=$(this).closest("tr").attr("login");
          log("lock user " +login);
          backendCall("tableUpdate", { tableName:"kipus_user",columns: {status:'LOCKED', statusModified: now()},
                                       filterCol:'login', filterVal: login},
          function() {
             select_user(); 
          });
        });
        table_pagination($("#utable"));
        if (callbackfn)
          callbackfn();
      });
}

function
check_lang_and_select_settings()
{
  check_language(false, select_settings);
}

function
toggle_settings_advanced() {
  if (!$(".form-settings [name=country]").closest(".row").is(":visible")) {
    log("show advanced");
    $("#btn-settingsadvanced").closest(".row").nextAll(".row").show(500);
    $("#btn-settingsadvanced").attr("show", true);
  }
  else {
    log("hide advanced");
    $("#btn-settingsadvanced").closest(".row").nextAll(".row").hide(500);
    $("#btn-settingsadvanced").attr("show", false);
  }
}


function
select_settings()
{
  log("select settings tab");
  backendCall("tableSelect", { tableName:"kipus_user", filterCol:"login", filterVal:bcUser },
    function(res, resultPar) {
    if (res.length == 0) {
      log("no user found");
      showAlert(trHtml.settings_not_found);
      return;
    }
    function doSelectSettings() {
      function setOutputs(init) {
        if (!init) {
          res[0].language = $(".form-settings [name=language]").val();
          res[0].country = $(".form-settings [name=country]").val();
          res[0].currency = $(".form-settings [name=currency]").val();
          res[0].currencyDisplay = $(".form-settings [name=currencyDisplay]").val();
        }
        var value = 400500.50,
          currencyCode = $(".form-settings [name=currency]").val(),
          props = {
              style: "currency",
              currency: currencyCode,
              minimumFractionDigits: 0,
              maximumFractionDigits: currencyCode=="VND"?0:2,
              currencyDisplay: $(".form-settings [name=currencyDisplay]").val()
          };
        var loc;
        if (!res[0].country || !res[0].language)
          loc = navigator.language;
        else {
          if (res[0].country.indexOf("-") == -1)
            loc = res[0].language+"-"+res[0].country;
          else
            loc = res[0].country;
        }
        $(".form-settings [name=formattedCurrency]").text(value.toLocaleString(loc, props));
        $(".form-settings [name=formattedDate]").text((new Date()).toLocaleString(loc));
      }
      var locale = res[0].locale?JSON.parse(res[0].locale):null;
      res[0].language = locale && locale.language?locale.language:res[0].language;
      res[0].country = locale && locale.country?locale.country:navigator.language.toUpperCase();
      if (locale && locale.country)
        res[0].country = locale.country;
      else {
        res[0].country = navigator.language.toUpperCase();
        var pos = res[0].country.indexOf("-");
        if (pos > 0)
          res[0].country = res[0].country.substring(pos+1);
      }
      res[0].currency = locale && locale.currency?locale.currency:"EUR";
      res[0].currencyDisplay = locale && locale.currencyDisplay?locale.currencyDisplay:"symbol";
      $(".form-settings [name=language], .form-settings [name=country], .form-settings [name=currency], .form-settings [name=currencyDisplay]").change(function() {
         setOutputs();
      });
      $(".form-settings :input").each(function() {
        var tagname = $(this).prop('tagName');
        if (tagname.toLowerCase() != "input" &&
            tagname.toLowerCase() != "textarea" &&
            tagname.toLowerCase() != "select")
        return;
        var key = $(this).attr("name");
        var val = res[0][key];
        if (key == "passwd" || key == "passwd2") {
           $(this).val(dummyPasswd);
        } else {
          if (val != undefined)
            $(this).val(val);
          else
            $(this).val("");
        }
      });
      setOutputs(true);
    }
    create_lang_options(".form-settings [name=language]", "ADMIN", res[0].language, doSelectSettings);
  });
}

// update bdrights
function
update_bdrights()
{
  var projectid = $(".form-role [name=project]").val();
  $(".form-role #bdrighttable >tbody tr").remove();
  if (projectid == "*") {
    $(".form-role .adminright option:last").hide();
    $(".form-role #bdrighttable").closest(".row").hide();
  }
  else {
    $(".form-role .adminright option").show();
    backendCall("tableSelect",
      { tableName:"kipus_projectbooks" , 
        filterCol:'projectid', 
        filterVal:projectid },
      function(res, resultPar) {
        var bdrights = [];
        for (var i=0; i<res.length; i++) {
          bdrights.push(res[i].bookdefid+"=read");
        }
        add_bdrights(bdrights, true);
      });
  }

  var right = $(".form-role .adminright").val();
  if (right == "UserFrontend") {
    $(".form-role #bdrighttable").closest(".row").show();
    $(".form-role #adminrighttable .right").hide();
  }
  else {
    $(".form-role #bdrighttable").closest(".row").hide();
    $(".form-role #adminrighttable .right").show();
  }

  if (right == "DataMaintenanceRegexp") {
    $(".form-role [name=admin_parameters]").closest(".row").show();
  } else {
    $(".form-role [name=admin_parameters]").closest(".row").hide();
  }
}

// uproject options changed, load values from table
function
uproject_options_changed() {
  log("selected projectid=" + $(".form-uproject [name=selprojectid]").val());
  if(!$(".form-uproject [name=login]").val()) {
    $(".form-uproject [name=projectid]").val("");
    $(".form-uproject [name=projectname]").val("");
    return;
  }
  backendCall("tableSelect", { tableName:"kipus_projects" , filterCol:'id', filterVal:$(".form-uproject  [name=selprojectid]").val()},
    function(res, resultPar) {
      $(".form-uproject [name=projectid]").val(res[0].id);
      $(".form-uproject [name=projectname]").val(res[0].name);
      $(".form-uproject [name=title]").val(res[0].title);
    });
}

// create options for selecting userprojects
function
create_project_options(sel, callbackfn) {
  var options = "";
  var projects = [];
  if (uprojects && sel.indexOf(".form-uproject") == 0)
  $.each(uprojects, function(){
    log("projectid: <" + this.projectid+">");
    projects.push(this.projectid);
  });
  log("create_project_options");
  $(sel + " option").remove();
  backendCall("tableSelect", { tableName:"kipus_projects" },
    function(res, resultPar) {
      for(var i=0; i<res.length; i++) {
        if ($.inArray(res[i].id, projects) == -1 && res[i].name != "ADMIN") {
          options  += "<option value='" + res[i].id +  "'>" + res[i].name + "</option>";
        }
      }
      $(sel).append(options);
      if (sel.indexOf(".form-role") == 0)
        $(sel).prepend("<option value='*'>All Projects</option>");
      if (callbackfn)
        callbackfn();
    });
}

function
toggle_uproject_add() {
  if (!$(".form-uproject").is(":visible")) {
    $(".form-user").css("display","none");
    $(".form-uproject").css("display","");
    $(".form-uproject [name=login]").val($(".form-user [name=login]").val());
    create_project_options(".form-uproject [name=selprojectid]", uproject_options_changed);
    $("#btn-adduproject").show();
    push_headtitle("user", $("#btn-addUserProject").text());
  } else {
    select_userprojects($(".form-uproject [name=login]").val());
    $(".form-user").css("display","");
    $(".form-uproject").css("display","none");
    pop_headtitle("user");
  }
}

function
dbError(res,resultPar)
{
  log("tableSelect Error");
  showAlert(trHtml.bc_error[0] + res, "error");
}

function
select_userprojects(login, callbackfn)
{
  var canWrite = hasProjectRight("UserAdministration", "write") ||
                 hasProjectRight("AdminAll", "write");
  log("select userprojects " + login);
  backendCall("tableSelect",
    { tableName:"kipus_userprojects up, kipus_projects p",
      columns:"up.projectid,up.login,p.name,p.name as projname,p.rightdef",
      where:"up.login='"+login+"' and up.projectid=p.id" },
    function(res, resultPar) {
      uprojects = res;
      if (!canWrite)
        $("#uprojecttable thead th[trid=th_delete]").hide();
      else
        $("#uprojecttable thead th[trid=th_delete]").show();
      $("#uprojecttable >tbody tr").remove();
      for(var i=0; i<res.length; i++) {
        var row =
          "<tr>"+(canWrite?
            "<td align='center'>"+
              "<i class='btn-link glyphicon glyphicon-remove red'" +
                  "onclick='delete_uproject(\""+i+"\")'></i></td>":"")+
            "<td>"+res[i].name+"</td>"+
          "</tr>";
        $('#uprojecttable').find('tbody:last').append(row);
      }
      if (callbackfn)
        callbackfn();
    },
    dbError);
}

function
add_uproject() {
  log("add_uproject");
  if (!$(".form-uproject [name=login]").val() ||
        !$(".form-uproject [name=selprojectid]").val()) {
    showAlert(trHtml.uproject_add[0], "warning");
    return;
  }
  backendCall("tableInsert", { tableName:"kipus_userprojects", columns:{
    login:$(".form-uproject [name=login]").val(),
    projectid:$(".form-uproject [name=selprojectid]").val()
    }},
    function(res,resultPar){ log("uproject added" );
                         toggle_uproject_add(); select_user();
                         select_userprojects($(".form-uproject [name=login]").val(), function() {
                           // update rightpar
                           delete(rightpar.roles);
                           delete(rightpar.roles2Cond);
                           delete(rightpar.colsArr);
                           select_userrights(rightpar);
                         });
                         showAlert(trHtml.uproject_add[0], "success");});
}

function
delete_uproject(i) {
  var projectid = uprojects[i].projectid;
  var login = uprojects[i].login;
  $("div#dialog").html(trHtml.uproject_delete[0]);
  $("div#dialog").dialog({
    dialogClass:"no-close", buttons: [
      {text:trHtml.dlg[2], click:function(){
        backendCall("tableDelete", { tableName:"kipus_userprojects",
              filterCol:['login','projectid'], filterVal:[ login, projectid ]},
          function(res,resultPar){
                 log("Delete userprojects done" );
                 select_userprojects(uprojects[i].login);
                 showAlert(trHtml.uproject_delete[1], "success");
          });
        $(this).dialog("close");
      }},
      {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
  });
}

function
select_userrights(par)
{
  rightpar = par;
  if(!par.roles) {
    backendCall("tableSelect", { tableName:"kipus_roles", columns:"id,projectid,displayname,bookdef_rights,admin_rights" },
    function(res) {
      par.roles = {};
      par.rolesArr = [];
      par.roles2books = {};
      par.rolesReports = {};
      for(var i1=0; i1<res.length; i1++) {
        if (!res[i1].projectid)
          par.roles[res[i1].id] = "All Projects: "+res[i1].displayname;
        else {
          var projname = get_projname(res[i1].projectid, uprojects);
          if (!projname)
            continue;
          par.roles[res[i1].id] = projname + ": "+res[i1].displayname;
        }
        if (res[i1].admin_rights.indexOf("Reports=")==0) {
          par.rolesReports[res[i1].id] = par.roles[res[i1].id];
        }
        par.rolesArr.push(res[i1].id);
        if (res[i1].bookdef_rights) {
          var a = [];
          var r = res[i1].bookdef_rights.split(" ");
          for(var i2=0; i2<r.length; i2++) {
            var bid = r[i2].split("=")[0];
            if (bid)
              a.push(bid);
          }
          par.roles2books[res[i1].id] = a;
        }
      }
      select_userrights(par);
    });
    return;
  }

  if(!par.roles2Cond) {
    par.roles2Cond = {};
    for(var i1=0; i1<par.rolesArr.length; i1++) {
      (function(idx){
      if(par.roles2books[par.rolesArr[idx]]) {
        var sql = "SELECT rightdef FROM kipus_projects "+
            "WHERE id in (select distinct projectid from kipus_projectbooks where bookdefid in ('" + par.roles2books[par.rolesArr[idx]].join("','")+"'))";
        backendCall("tableCmd", { sql:sql },
          function(res) {
            par.roles2Cond[par.rolesArr[idx]] = res[0];
            if (idx == par.rolesArr.length - 1)
              select_userrights(par);
          });
      } else {
          if (idx == par.rolesArr.length - 1)
            select_userrights(par);
      }
      })(i1);
    }
    return;
  }

  if(!par.colsArr) {
    par.col2tblName = {}; par.col2dpyName = {}; par.col2data = {}; par.hierHash = {}; par.col2bookid = {};
    for(var i1=0; i1<uprojects.length; i1++) {
      if(!uprojects[i1].rightdef)
        continue;
      var ra = uprojects[i1].rightdef.split(",");
      for(var i2=0; i2<ra.length; i2++)
        par.col2tblName[ra[i2]] = 1;
    }

    par.colsArr = hashKeysAsArray(par.col2tblName);
    par.colIdx = par.condIdx = 0;
    var bids = [];
    for (var roleid in par.roles2books)
      bids.push(par.roles2books[roleid]);
    backendCall("tableSelect", {
      tableName:"kipus_pageattributes pa, kipus_pagedefinition pd,"+
                "kipus_bookpages bp, kipus_bookdefinition bd, "+
                "kipus_projectbooks pb",
      columns:"pa.displayname,bd.title as booktitle,columnname,constraintparam, bd.id as bookid",
      where:"bd.parentbookid is NULL and "+
            "pb.bookdefid=bp.bookdefid and "+
            "bd.id=pb.bookdefid and "+
            "bp.pagedefid=pd.id and "+
            "pa.pagedefid=pd.id and "+
            "pd.pagetype='HEADER' and "+
            "bd.id in ('"+bids.join("','")+"') and "+
            "columnname in ('"+par.colsArr.join("','")+"') and "+
            "constrainttype='singleFromTable'" },
      function(res) {
        for(var i1=0; i1<res.length; i1++) {
          var r = res[i1];
          par.col2tblName[r.columnname] = r.constraintparam;
          par.col2bookid[r.columnname] = r.bookid;
          par.col2dpyName[r.columnname] = r.booktitle +": "+r.displayname;
        }

        backendCall("tableSelect", {
          columns:"bookdefid,pd.tablename,bd.title",
          tableName:"kipus_pagedefinition pd,kipus_bookpages bp,"+
                    "kipus_bookdefinition bd",
          where:"bp.bookdefid in ('"+par.colsArr.join("','")+"') and "+
                "bd.id=bp.bookdefid and pd.pagetype='HEADER' and "+
                "pd.id=bp.pagedefid" },
          function(res) {
            for(var i1=0; i1<res.length; i1++) {
              var r = res[i1];
              par.col2tblName[r.bookdefid] = r.tablename;
              par.col2dpyName[r.bookdefid] = r.title+": Unique "+r.title;
            }
            select_userrights(par);
          });
      });
    return;
  }

  if(par.colsArr && par.colIdx < par.colsArr.length) {
    var colName = par.colsArr[par.colIdx++]+"";
    var tblName = par.col2tblName[colName];

    if(colName.match(/^OWN.\d+$/)) {
      if(!par.bookName)
        par.bookName = {}
      backendCall("tableSelect", { tableName:"kipus_pageattributes pa, kipus_bookpages bp, kipus_pagedefinition pd, kipus_bookdefinition bd",
                                   columns:"pa.displayname, pa.columnname, bd.title",
                                   where:"bp.bookdefid=bd.id and bp.pagedefid=pd.id and bd.id="+colName.substr(4)+" and pa.defaultvalue='{userData.username}' "+
                                        " and pd.pagetype='HEADER' and pa.pagedefid=pd.id and pa.constrainttype='text'" },
      function(res) {
        if (res.length>0) {
          par.bookName[colName] = res[0].title;
          par.col2data[colName] = {}
          for (var i=0; i<res.length; i++) {
            par.col2data[colName][res[i].columnname] = res[i].displayname;
          }
        }
        select_userrights(par);
      });
      return;
    }

    var dpy = rightTableCol[tblName] ? rightTableCol[tblName] : "DISPLAYNAME";
    var columns = (colName.match(/^\d+$/) ? "bookid id":"id")+","+dpy;
    if(tblName == 1) {
      log("bad COLNAME="+colName);
      return select_userrights(par);
    }
    tblName = tblName.split(" ")[0];
    backendCall("tableCols", { tableName:tblName },
      function(cols, resultPar) {
      for (var i=0; i<cols.length; i++) {
        if (cols[i].COLUMN_NAME == "PARENT")
          columns+= ",PARENT";
      }
      backendCall("tableSelect", { tableName:tblName, columns:columns },
      function(res) {
        var obj = {};
        if (columns.indexOf(",PARENT") != -1)
          computeHier(par, colName, res);
        for(var i1=0; i1<res.length; i1++)
          obj[res[i1].id] = res[i1][dpy];
        par.col2data[colName] = obj;
        select_userrights(par);
      });
    });
    return;
  }
  if (!par.projects2reports) {
    backendCall("tableSelect", { tableName:"kipus_reports r inner join kipus_projects p on p.id = r.projectid", 
                                 columns:"p.name,r.projectid,r.id,r.category,r.reportname,r.displayname,r.reportnumber" },
    function(res) {
      par.projects2reports = {};
      for (var i1=0; i1<res.length;i1++) {
        if (!par.projects2reports[res[i1].name])
          par.projects2reports[res[i1].name] = [];
        par.projects2reports[res[i1].name].push(res[i1]);
      } 
      select_userrights(par);
    });
    return;
  }
  var canWrite = hasProjectRight("UserAdministration", "write") ||
                 hasProjectRight("AdminAll", "write");
  render_urights(par, canWrite);
}

function
render_urights(par, canWrite)
{
  function makeSelect(key, value) {
    var options = "";
    if (par.col2data["hier:"+key]) {
      var vals = par.col2data["hier:"+key];
      vals.sort(function(a,b) { return a.ORDERBY - b.ORDERBY; } );
      for(var i1=0; i1<vals.length; i1++) {
        options += "<option value='"+vals[i1].id+"' " + (vals[i1].id==value?"selected":"")+">"+vals[i1].DISPLAYNAME+"</option>"; 
      }
    } else {
      var valHash = par.col2data[key];
      if(valHash) {
        var vals = Object.keys(valHash);
        vals.sort(function(a,b) { return valHash[a].localeCompare(valHash[b]) } );
        for(var i1=0; i1<vals.length; i1++) {
          options += "<option value='"+vals[i1]+"' " + (vals[i1]==value?"selected":"")+">"+valHash[vals[i1]]+"</option>"; 
        }
      }
    }
    return "<select>"+options+"</select>";
  }
  function makeRow(roleid, ridx=0, withplus) {
    var li = "<li class='parent"+(par.roles2Cond[roleid]?"":" nocond")+(withplus?" red":"")+"' roleid='"+roleid+"'>"+
             "<span class='glyphicon glyphicon glyphicon-plus-sign'/>"+
             "<span class='empty glyphicon' style='width: 16px;'/>"+
             "<i class='glyphicon glyphicon glyphicon-"+(rHash[roleid] || withplus?"check":"unchecked")+"'/>"+
                  par.roles[roleid];
    if (par.roles2Cond[roleid] && par.roles2Cond[roleid].rightdef) {
      var ca = par.roles2Cond[roleid].rightdef.split(",");
      ca.sort(function(a,b) { 
        if (a.indexOf("OWN.") == 0)
          return -1;
        if (b.indexOf("OWN.") == 0)
          return 1;
        return par.col2dpyName[a].localeCompare(par.col2dpyName[b]);
      } );
      var ul = "<ul>";
      if (ca.length > 1)
        ul += "<span trid='th_auth_cond' style='font-size: 12px; opacity: 0.9; font-weight: lighter;'>Authorization considers the intersection of the following conditions</span>";
      for(var i1=0; i1<ca.length; i1++) {
        var col = ca[i1];
        var colName = par.col2dpyName[col];
        var found = false;
        if (ca[i1].indexOf("OWN.") == 0 || colName.indexOf("Unique") > -1)
          // unique and own farms
          found = true;
        else
          // skip if permission col is not in roles2books
          for (var i3=0; i3<par.roles2books[roleid].length; i3++) {
            var bid = par.roles2books[roleid][i3];
            if (par.col2bookid[col] == bid) {
              found = true;
              break;
            }
          }
        if (!found)
          continue;
        var dpy = ca[i1].indexOf("OWN.") ?  par.col2dpyName[ca[i1]] : par.bookName[ca[i1]]+": Own " + par.bookName[ca[i1]];
        //log(roleid+","+ca[i1]+","+dpy);
        var rights = rHash[roleid] && rHash[roleid].length > ridx?rHash[roleid][ridx].split(","):["",""];
        var rh = {};
        for(var i2=0; i2<rights.length; i2++) {
          var sp = rights[i2].split("=");
          rh[sp[0]] = sp[1];
        }
        ul += "<li part='"+ca[i1]+"'><span><i class='glyphicon glyphicon glyphicon-"+(rHash[roleid] && rh[ca[i1]] && !withplus?"check":"unchecked")+"'/>"+
            dpy + "</span>"+ makeSelect(ca[i1], rh[ca[i1]])+"</li>";
      }
      ul += "</ul>";
      if (ca.length > 0)
        li += ul;
    } else if (par.rolesReports[roleid]) {
      var proj = par.rolesReports[roleid];
      for (var project in par.projects2reports) {
        if (proj.indexOf("All Projects:") != 0 && proj.indexOf(project) != 0)
          continue;

        var rights = rHash[roleid] && rHash[roleid].length > ridx?rHash[roleid][ridx].split(","):["",""];
        var rh = {}; // hash of authorized report-ids
        for(var i2=0; i2<rights.length; i2++) {
          rh[rights[i2]] = 1;
        }

        var plist = par.projects2reports[project];
        plist.sort(function(a,b) {
          return a.reportnumber.localeCompare(b.reportnumber);
        });
        var ul = "<ul>";
        var rli = "";
        var count = 0;
        for (var i1=0; i1<plist.length; i1++) {
          var p = plist[i1];
          var rid = p.projectid+"/"+p.reportname; // Was: plist[i1].id
          rli += "<li reportid='"+rid+"'>"+
                  "<span class='report'>"+
                    "<i class='glyphicon glyphicon glyphicon-"+(rh[rid]?"check":"unchecked")+"'/>"+
                    "<span>"+
                      p.reportnumber + ": "+p.displayname+
                    "</span>"+
                  "</span>"+
                "</li>";
          if (rh[rid])
            count++;
        }
        ul += '<div class="selectall"><ul><li><i class="glyphicon glyphicon-'+(plist.length == count?"check":"unchecked")+'"></i>Select All</li></ul></div>';
        ul += rli;
        ul += "</ul>";
        if (plist.length > 0)
          li += ul;
      }
    }
    li  += "</li>";
    return li; 
  }

  $("#urights").empty();
  var html="<ul "+(!canWrite?"class='readonly'":"")+">";
  var rHash = {};
  var ra = par.rights ? par.rights.split(" ") : [];
  for(var i1=0; i1<ra.length; i1++) {
    if(!ra[i1])
      continue;
    var rh = ra[i1].split(":");
    if (!rHash[rh[0]]) 
      rHash[rh[0]] = [];
    rHash[rh[0]].push(rh[1]);
  }
  var roleArr = Object.keys(par.roles);
  roleArr.sort(function(a,b) { return par.roles[a].localeCompare(par.roles[b]) } );
  for (var i0=0; i0<roleArr.length;i0++) {
    var roleid = roleArr[i0];
    html+= makeRow(roleid);
    if (rHash[roleid] && rHash[roleid].length > 1)
      for (var i1=1; i1<rHash[roleid].length;i1++) {
        html+= makeRow(roleid, i1);
      }
  }
  html+="</ul>";
  $("#urights").html(html);
  $("#urights li.parent.nocond:last").css("margin-bottom", "20px");
  $("#urights i.glyphicon-unchecked").closest("li").children("ul").hide();
  function show_hide_plus() {
    $("#urights li.parent").each(function() {
      if ($(this).hasClass("red") || $(this).hasClass("nocond") || 
          $(this).find("i.glyphicon:first").hasClass("glyphicon-unchecked") || 
          $(this).children("ul").length == 0) {
        $(this).find("span.glyphicon-plus-sign").hide();
        $(this).find("span.empty").show();
      } else {
        $(this).find("span.glyphicon-plus-sign").show();
        $(this).find("span.empty").hide();
      }
    }); 
  }
  show_hide_plus();
  if (!canWrite)
     return;
  function update_rights() {
    show_hide_plus();
    if($("#urights li.parent.red").length > 0)
      return;
    var perms = [];
    $("#urights li.parent").each(function() {
      if ($(this).find("i.glyphicon:first").hasClass("glyphicon-unchecked"))
        return;
      var roleid = $(this).attr("roleid");
      var rights = [];
      $(this).find("ul li .glyphicon-check").each(function() {
         if ($(this).closest("div").hasClass("selectall"))
           return;
         if ($(this).parent().hasClass("report"))
           rights.push($(this).closest("li").attr("reportid")); 
         else
           rights.push($(this).closest("li").attr("part")+"="+$(this).closest("li").find("select").val()); 
      });
      perms.push(roleid+":"+rights.join(",")); 
    });
    par.rights = perms.join(" ");
    $(".form-user [name=rights]").val(par.rights);
  }

  function checkConsistency(glyph) {
      // check consistency
      var p = $(glyph).closest("li.parent");
      if ($(p).find("ul").length != 0 && $(p).find("ul li .glyphicon-check").length == 0 
          && $(p).find("i.glyphicon:first").hasClass("glyphicon-check"))
        $(glyph).closest("li.parent").addClass("red");
      else
        $(glyph).closest("li.parent").removeClass("red");
  }
  function bindClicksAndDropdowns() {
    $("#urights select").unbind("change").change(function() {
      log("select changed");
      update_rights();
    });
    $("#urights i.glyphicon-check,#urights i.glyphicon-unchecked").unbind("click").click(function() {
      if ($(this).closest("div").hasClass("selectall"))
        return;
      var checked = $(this).hasClass("glyphicon-check");
      if (checked) {
        $(this).removeClass("glyphicon-check");
        $(this).addClass("glyphicon-unchecked");
        $(this).closest("li").children("ul").hide(500);
      } else {
        $(this).removeClass("glyphicon-unchecked");
        $(this).addClass("glyphicon-check");
        $(this).closest("li").children("ul").show(500);
      }
      checkConsistency(this);
      update_rights();
    });
    $("#urights span.glyphicon-plus-sign").unbind("click").click(function() {
       var roleid = $(this).closest("li.parent").attr("roleid");
       var html = makeRow(roleid,0,true);
       $(this).closest("li.parent").after(html);
       show_hide_plus();
       // list changed, have to rebind clicks and dropdowns
       bindClicksAndDropdowns();
    });
    // selectall of reports
    $("#urights div.selectall li i").unbind("click").click(function () {
      if ($(this).hasClass("glyphicon-check")) {
        $(this).removeClass("glyphicon-check");
        $(this).addClass("glyphicon-unchecked");
      }
      else {
        $(this).addClass("glyphicon-check");
        $(this).removeClass("glyphicon-unchecked");
      }
      $(this).closest("li.parent").find("span.report i.glyphicon").attr("class", $(this).attr("class"));
      checkConsistency(this);
      update_rights();
      // list changed, have to rebind clicks
      bindClicksAndDropdowns();
    });
  }
  bindClicksAndDropdowns();
}

function
computeHier(par, col, tbl)
{
  var h={}, lastfnd=0;
  if(tbl.length == 0)
    return;

  log("Compute hierarchy for "+col);
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
  par.hierHash[col] = h;

  if(!tbl[0].DISPLAYNAME)
    return;

  // Shadow table for dropdown/select
  var tbl2=[];
  for(var i1=0; i1<tbl.length; i1++) {
    var r = tbl[i1];
    var d = r.DISPLAYNAME;
    if(h[r.id].level)
      d = Array(h[r.id].level+1).join("&nbsp;&nbsp;")+d;
    tbl2.push({ id:r.id, DISPLAYNAME:d });
  }
  tbl2.sort(function(a,b) { return h[a.id].orderby.localeCompare(
                                   h[b.id].orderby)} );
  for(var i1=0; i1<tbl2.length; i1++)
    tbl2[i1].ORDERBY = i1;
  par.col2data["hier:"+col] = tbl2;
}

/*
 * END user administration
 */

/*
 * PAGE definition
 */
function
toggle_subpageparam(pi, selDone)
{
  if(!selDone) {
    backendCall("tableSelect",
      {
      tableName:
        "kipus_pagedefinition pd, kipus_projectbooks pb, kipus_bookpages bp",
      columns:"tablename,displayname",
      where:
        "pb.bookdefid=bp.bookdefid AND bp.pagedefid=pd.id AND "+
        "projectid!="+currProjId+" AND tablename not in "+
        "(SELECT tablename FROM kipus_pagedefinition pd,kipus_projectbooks pb,"+
        "kipus_bookpages bp WHERE pb.bookdefid=bp.bookdefid AND "+
        "bp.pagedefid=pd.id AND projectid="+currProjId+")"
      },
      function(res){
        var html="";
        if(pi && pi.tablename)
          res.unshift({tablename:pi.tablename, displayname:pi.displayname});
        for(var i1=0; i1<res.length; i1++)
          html += '<option value="'+res[i1].tablename+'">'+res[i1].tablename+
          " / "+res[i1].displayname+'</option>';
        $("[name=cp_tablename]").html(html);
        toggle_subpageparam(pi, true);
      });
    return;
  }

  var pt = $(".form-page [name=pagetype]").val();

  function
  display(el, yn)
  {
    if(yn)
      $(".form-page [name="+el+"]").closest(".row").show();
    else
      $(".form-page [name="+el+"]").closest(".row").hide();
  }

  var isCpl = (pt == "CP_LOOKUP");
  var isL   = (pt == "LOOKUP" || pt == "QUIZ" || pt == "EXTERNAL" || isCpl);
  display("id",       false);
  display("tablename",       !isCpl);
  display("cp_tablename",     isCpl);
  display("displayname",     !isCpl);
  display("helptext",        !isL);
  display("subpageparam",    pt == "BODY");
  display("longtitle",       !isL);
  display("shorttitle",      !isL);
  display("uniquecols",      !isL);
  display("sortby",          !isL);
  if(pi && isCpl) {
    $(".form-page [name=cp_tablename]").val(pi.tablename);
    $(".form-page [name=cp_tablename]").prop("disabled", true);
  } else {
    $(".form-page [name=cp_tablename]").prop("disabled", false);
  }

  if (pt == "QUIZ") {
    $(".form-page [name=tablename]").val("QUIZ_");
  }
}

function
move_pd2book()
{
  var pagedefid = $(".form-page [name=id]").val();
  var bookid = $(".form-book [name=id]").val();
  log("move pd " + pagedefid + " to book");
  if (!pagedefid || !bookid)
    return;
  function create_pbook_options() {
    var options = "";
    for (var i=0; i<pbooks.length; i++) {
      if (pbooks[i].bookdefid == bookid)
        continue;
      for (var i1=0; i1<bd.length; i1++) {
        if (pbooks[i].bookdefid != bd[i1].id)
          continue;
        options += '<option value="'+bd[i1].id+'">'+bd[i1].title+'</option>';
      }
    }
    return options;
  }
  $("div#dialog").html('<label class="control-label">Choose Book</label><select class="form-control" id="pbookselect"> ' + create_pbook_options() + '</select>');
  $("div#dialog").dialog({
    dialogClass:"no-close", modal:true, buttons: [
      {text:trHtml.dlg[1], click:function(){ $(this).dialog("close"); }},
      {text:trHtml.dlg[6],click:function(){
          var destbookid = $(this).find("#pbookselect").val();
          var cols = { bookdefid: destbookid, pagedefid: pagedefid };
          backendCall("tableUpdate", { tableName:"kipus_bookpages",columns: cols,
                                       filterCol:['bookdefid','pagedefid'], filterVal: [bookid, pagedefid]},
          function(res,resultPar){ log("page move done" ); select_pd(toggle_pd_create);
                               showAlert(trHtml.pd_update[0], "success");});
          $(this).dialog("close");
      }}]
  });
}

function
toggle_pd_edit(i) {
  select_pdattr(pd[i].id);
  if (!$(".form-page").is(":visible")) {
    $(".form-book").css("display","none");
    $(".form-page").css("display","");
    $(".form-page [name=id]").prop("readonly", true);
    $(".form-page [name=tablename]").prop("readonly", true);
    // remove input group (prefix)
    $(".form-page [name=tablename]").parent().find("span.input-group-addon").remove();
    $(".form-page [name=tablename]").parent().removeClass("input-group");
    $(".form-page [name=pagetype]").prop("disabled", true);
    $(".form-page [name=id]").closest(".row").show();
    $(".form-page :input").each(function() {
      var tagname = $(this).prop('tagName');
      if (tagname.toLowerCase() != "input" &&
          tagname.toLowerCase() != "select")
      return;
      var key = $(this).attr("name");
      var val = pd[i][key];
      if (key == "id") {
         $(this).val(pd[i].id);
      } else {
        if (val != undefined)
          $(this).val(val);
        else
          $(this).val("");
      }
    });
    toggle_subpageparam(pd[i]);
    if(pd[i].pagetype == 'CP_LOOKUP') {
      $("#btn-addattrpd").hide();
      $("#btn-addattrs-from-page-pd").hide();
      $("#btn-renumber").hide();
      $("#pd_attrlist").hide();
    } else {
      $("#btn-addattrpd").show();
      $("#btn-addattrs-from-page-pd").show();
      $("#btn-renumber").show();
      $("#pd_attrlist").show();
    }

    $("#btn-updatepd").show();
    $("#btn-createpd").hide();

    if ((hasProjectRight("Projects", "write", $(".form-project [name=id]").val())
        || hasProjectRight("AdminAll", "write")) && (pd[i].pagetype == "LOOKUP" || pd[i].pagetype == "EXTERNAL"))
      $("#btn-movepd2book").show();
    else
      $("#btn-movepd2book").hide();
    push_headtitle("page", pd[i].displayname);
  }
  else {
    $(".form-book").css("display","");
    $(".form-page").css("display","none");
  }
}

function
navigate_pd_edit(pagedefid, skipClickOne) 
{
  saveOffset("page");
  select_pd(function () {
      select_pdattr(pagedefid);
      for(var i=0; i<pd.length; i++) {
        if (pd[i].id != pagedefid)
          continue;
        toggle_pd_edit(i);
        break;
      }
  });
}

function
referenced_tables(array) {
  var referencedTables = [];
  for(var i=0; i<array.length; i++) {
    if ($.inArray(array[i].tablename, referencedTables) == -1) {
       referencedTables.push(array[i].tablename);
    }
  }
  return referencedTables;
}

function
toggle_pd_create() {
  if (!$(".form-page").is(":visible")) {
    saveOffset("page");
    $(".form-book").css("display","none");
    $(".table-pdattr").closest(".row").hide();
    $(".form-page").css("display","");
    $(".form-page [name=id]").closest(".row").hide();
    $(".form-page [name=tablename]").prop("readonly", false);
    $(".form-page [name=pagetype]").prop("disabled", false);
    $(".form-page input").val("");
    var prefix = $(".form-project [name=prefix]").val().toUpperCase();
    if (prefix) {
      $(".form-page [name=tablename]").parent().prepend("<span class='input-group-addon'>"+prefix+"_</span>");
      $(".form-page [name=tablename]").parent().addClass("input-group");
    }
    $(".form-page select").prop("selectedIndex", 0);
    $("#btn-updatepd").hide();
    $("#btn-addattrpd").hide();
    $("#btn-addattrs-from-page-pd").hide();
    $("#btn-renumber").hide();
    $("#btn-movepd2book").hide();
    $("#btn-createpd").show();
    toggle_subpageparam();
    push_headtitle("page", $("#btn-createpagebook").text());
  } else {
    // back
    removeOffset("page");
    $(".form-book").css("display","");
    $(".table-pdattr").closest(".row").show();
    $(".form-page").css("display","none");
    $(".form-page [name=pagetype]").prop("disabled", true);
    $(".form-page [name=tablename]").parent().find("span.input-group-addon").remove();
    $(".form-page [name=tablename]").parent().removeClass("input-group");
    $(".form-page [name=tablename]").parent().removeClass("has-error has-success");
    $(".form-page [name=tablename]").parent().find(".glyphicon").tooltip('destroy').removeClass("glyphicon-warning-sign glyphicon-ok");
    pop_headtitle("page");
    select_bdpage($(".form-book [name=id]").val(), function() {
      loadOffset("page");
    });
  }
}

function
toggle_pdattr_view(i) {
  saveOffset("page");
  log("toggle_pdattr_edit " + i);
  $(".form-pdattr input, .form-pdattr textarea").attr("readonly", true);
  $(".form-pdattr select").attr("disabled", true);
  $(".form-page").css("display","none");
  $(".form-pdattr").css("display","");
  $(".form-pdattr [name=columnname]").prop("readonly", true);
  $("#btn-createpdattr").hide();
  $("#btn-renamepdattr").hide();
  $("#btn-updatepdattr").hide();
  push_headtitle("page", pdattr[i].columnname);

}

function
toggle_pdattr_edit(i) {
  saveOffset("page");
  log("toggle_pdattr_edit " + i);
  $(".form-page").css("display","none");
  $(".form-pdattr").css("display","");
  $(".form-pdattr input, .form-pdattr textarea").attr("readonly", false);
  $(".form-pdattr select").attr("disabled", false);
  $(".form-pdattr [name=id]").prop("readonly", true);
  $(".form-pdattr [name=columnname]").prop("readonly", true);
  $(".form-pdattr :input").each(function() {
    var tagname = $(this).prop('tagName');
    if (tagname.toLowerCase() != "input" &&
        tagname.toLowerCase() != "select" &&
        tagname.toLowerCase() != "textarea")
    return;
    var key = $(this).attr("name");
    var val = pdattr[i][key];
    if (key == "id") {
       $(this).val(pdattr[i].pagedefid);
    } else {
      if (val != undefined) {
        if (tagname.toLowerCase() == "select" && $(this).attr("multiple"))
          $(this).val(val.split(","));
        else
          $(this).val(val);
        $(this).attr("oldval", val);
      } else
        $(this).val("");
    }
    if (key == "defaultvalue") {
       if (val == "{last}") {
          $(".form-pdattr [name=lastvisit]").prop("checked", true);
          $(this).attr("disabled", "disabled");
       } else {
          $(".form-pdattr [name=lastvisit]").prop("checked", false);
          $(this).removeAttr("disabled");
       }
    }
  });
  constrainttype_changed($(".form-pdattr [name=constrainttype]"));
  var pagetype = $(".form-page [name=pagetype]").val();
  if ($(".form-pdattr [name=helptext]").closest(".row").is(":visible")) {
    if (pagetype == "HEADER" || pagetype == "BODY")
      $(".form-pdattr [name=bi_params]").closest(".row").show();
    else
      $(".form-pdattr [name=bi_params]").closest(".row").hide();
  }
  if (pagetype == "BODY") {
    $(".form-pdattr #lastvisit").parent().show();
    $(".form-pdattr [name=defaultvalue]").parent().removeClass("col-lg-8").addClass("col-lg-7");
  } else {
    $(".form-pdattr #lastvisit").parent().hide();
    $(".form-pdattr [name=defaultvalue]").parent().removeClass("col-lg-7").addClass("col-lg-8");
  }
  $("#btn-updatepdattr").show();
  $("#btn-renamepdattr").show();
  $("#btn-createpdattr").hide();
  push_headtitle("page", pdattr[i].columnname);

}

function
toggle_show_datatable() {
  if (!$("#datarowstable").is(":visible")) {
    $("#datarowstable").css("display","");
  } else {
    $("#datarowstable").css("display","none");
  }
}

function
toggle_pdattr_advanced() {
  if (!$(".form-pdattr [name=helptext]").closest(".row").is(":visible")) {
    $("#btn-pdattradvanced").closest(".row").nextAll(".row").show(500);
    var pagetype = $(".form-page [name=pagetype]").val();
    if (pagetype == "HEADER" || pagetype == "BODY")
      $(".form-pdattr [name=bi_params]").closest(".row").show();
    else
      $(".form-pdattr [name=bi_params]").closest(".row").hide();

    if(feature.Corrective)
      $(".form-pdattr label[trid=th_corrective]").parent().show();
    else
      $(".form-pdattr label[trid=th_corrective]").parent().hide();

    if(feature.Score)
      $(".form-pdattr label[trid=th_scoretype]").parent().show();
    else
      $(".form-pdattr label[trid=th_scoretype]").parent().hide();

    if(feature.Multilang)
      $(".form-pdattr label[trid=th_i18n]").parent().show();
    else
      $(".form-pdattr label[trid=th_i18n]").parent().hide();

  }
  else
    $("#btn-pdattradvanced").closest(".row").nextAll(".row").hide(500);
}

function
toggle_project_advanced() {
  if (!$(".form-project #pfilestable").closest(".row").is(":visible")) {
    log("show advanceded")
    $("#btn-projectadvanced").closest(".row").nextAll(".row").show(500);
    $("#btn-projectadvanced").attr("show", true);
    var canWrite = hasProjectRight("Projects", "write", $(".form-project [name=id]").val()) || hasProjectRight("AdminAll", "write");
    if (canWrite) {
      $("#btn-uploadPfile").show();
      $("#btn-createExternalProject").show();
      $("#btn-rightDef").show();
      $("#btn-xliffgen").show();
    }
  }
  else {
    log("hide advanceded")
    $("#btn-projectadvanced").closest(".row").nextAll(".row").hide(500);
    $("#btn-projectadvanced").attr("show", false);
    $("#btn-uploadPfile").hide();
    $("#btn-createExternalProject").hide();
    $("#btn-rightDef").hide();
    $("#btn-xliffgen").hide();
  }
}

function
check_tablename(input)
{
  check_regexp(input, '^[A-Z_][A-Z_0-9]*$', $(".form-project [name=prefix]").val().toUpperCase());
}

function
create_pdattrs_from_page() {
  var pagedefid = $(".form-page [name=id]").val();
  var bookid = $(".form-book [name=id]").val();
  var bpages = null;
  log("create_pdattrs_from_page pd " + pagedefid);
  if (!pagedefid || !bookid)
    return;
  backendCall("tableSelect",
    { tableName:"kipus_pagedefinition pd, kipus_bookpages bp, kipus_bookdefinition bd",
      columns:"pd.id pdid, bd.id bdid, pd.displayname pddisplayname, bd.title bdtitle",
      where:"pd.id = bp.pagedefid AND bd.id = bp.bookdefid"},
    function(res, resultPar) {
    bpages = res;
    doCreatePdattrsFromPage();
  });
  function doCreatePdattrsFromPage() {
    function create_pbook_options() {
      var options = "";
      var haveit={};
      for (var i=0; i<bpages.length; i++) {
        if(haveit[bpages[i].bdid])
          continue;
        options += '<option value="'+bpages[i].bdid+'">'+bpages[i].bdtitle+'</option>';
        haveit[bpages[i].bdid] = true;
      }
      return options;
    }

    function create_page_options(bookid) {
      $("#dialog #pageselect").empty();
      var options = "";
      if (!bookid)
        return;
      for (var i=0; i<bpages.length; i++) {
        if (bpages[i].bdid != bookid)
          continue;
        options += '<option value="'+bpages[i].pdid+'">'+bpages[i].pddisplayname+'</option>';
      }
      $("#dialog #pageselect").append(options);
    }

    var html = '<label class="control-label">Choose Book</label><select class="form-control" id="pbookselect"> ' + create_pbook_options() + '</select>'+
               '<label class="control-label">Choose Page</label><select class="form-control" id="pageselect"></select><br>'+
               '<label class="control-label">New Prefix</label><input class="form-control" name="newprefix"></input><br>'+
               '<label class="control-label">Old Prefix</label><input class="form-control" name="oldprefix"></input>';
    $("div#dialog").html(html);
    create_page_options($("#dialog #pbookselect").val());
    $("#dialog #pbookselect").change(function() {
      create_page_options($(this).val());
    });
    $("div#dialog").dialog({
      dialogClass:"no-close", modal:true, buttons: [
        {text:trHtml.dlg[1], click:function(){ $(this).dialog("close"); }},
        {text:trHtml.dlg[7], click:function(){
            var srcbookid = $(this).find("#pbookselect").val();
            var srcpageid = $(this).find("#pageselect").val();

            var newprefix = $(this).find("[name=newprefix]").val();
            var oldprefix = $(this).find("[name=oldprefix]").val();
            log("copyattrfrompage book:"+srcbookid+" Prefix:"+oldprefix+"=>"+newprefix+" pageid:"+srcpageid);
            if (!newprefix || srcbookid == null)
               return showAlert(trHtml.pdattr_create[2], "error");
            if(oldprefix == undefined)
              oldprefix = "";
            backendCall("tableSelect", { tableName:"kipus_pageattributes", filterCol:'pagedefid', filterVal:srcpageid },
              function(res, resultPar) {
                var todo = res.length;
                log_sc("Copy attributes from page", 
                       "Source book: " + $(this).find("#pbookselect option:selected").text()+
                       ",Source page: " + $(this).find("#pageselect option:selected").text()+
                       ",Destination book: " + $(".form-book [name=title]").val()+
                       ",Destination page: " + $(".form-page [name=displayname]").val()+
                       ",Old prefix: " + oldprefix+ ",New prefix: " + newprefix);
                for(var i=0; i<res.length; i++) {
                  var cols = res[i];
                  cols.columnname = newprefix + cols.columnname.replace(oldprefix,"");
                  cols.pagedefid = $(".form-page [name=id]").val();;
                  var colType = dbcoltype(cols.constrainttype);
                  (function(colName, colType){
                    backendCall("tableInsert", { tableName:"kipus_pageattributes", columns:cols },
                      function(res,resultPar){
                       // alter table add column
                       var sql = "alter table " + $(".form-page [name=tablename]").val() +
                                " add " + colName + " "+colType;
                       backendCall("tableCmd", { sql: sql }, function(res,resultPar){
                         if (--todo == 0)
                            select_pdattr($(".form-page [name=id]").val());

                       });
                    });
                  })(cols.columnname, colType);
               }
            });
            $(this).dialog("close");
        }}]
    });
  }
}

function
toggle_pdattr_create() {
  if (!$(".form-pdattr").is(":visible")) {
    saveOffset("page");
    $(".form-page").css("display","none");
    $(".form-pdattr").css("display","");
    $(".form-pdattr input,.form-pdattr textarea").val("");
    $(".form-pdattr [name=id]").val($(".form-page [name=id]").val());
    $(".form-pdattr [name=columnname]").prop("readonly", false);
    $(".form-pdattr select").prop("selectedIndex", 0);
    $(".form-pdattr select[name=constrainttype] option[value=text]").attr("selected", true);
    constrainttype_changed($(".form-pdattr [name=constrainttype]"));
    $("#btn-updatepdattr").hide();
    $("#btn-renamepdattr").hide();
    $("#btn-createpdattr").show();
    push_headtitle("page", $("#btn-addattrpd").text());
  } else {
    // back
    removeOffset("page");
    $(".form-page").css("display","");
    $(".form-pdattr").css("display","none");
    pop_headtitle("page");
    select_pdattr($(".form-page [name=id]").val(), function() { 
      loadOffset("page");
    });
  }
}

function
rename_pdattr() {
   var pagedefid =  $(".form-page [name=id]").val();
   var tablename = $(".form-page [name=tablename]").val();
   var colname = $(".form-pdattr [name=columnname]").val();
   var constrainttype = $(".form-pdattr [name=constrainttype]").val();
   var coltype = dbcoltype(constrainttype);
   $("div#dialog").html('<div class="form-group"><label class="control-label">'+trHtml.pdattr_rename[4]+'</label></div>'+
                    '<div class="form-group row">'+
                    '<label for="rename_pdattr_readonly" class="control-label">Old Column Name</label>'+
                    '<div>'+
                        '<input readonly type="text" class="form-control" name="rename_pdattr_readonly" />'+
                    '</div></div>'+
    '<div class="form-group has-feedback row"><label class="control-label">New Column Name</label>'+
    '<div><input type="text" class="form-control" name="rename_pdattr_input" '+
    ' onchange="this.value = this.value.toUpperCase();" onblur="check_regexp(this, \'^[A-Z_][A-Z_0-9]*$\')"'+
    '></input><span class="glyphicon form-control-feedback"></span></div></div>');
   $("div#dialog [name=rename_pdattr_readonly]").val(colname);
  
   $("div#dialog").dialog({
     minWidth: 350,
     dialogClass:"no-close", buttons: [
       {text:trHtml.dlg[8], click:function(){
          var new_colname = $("div#dialog [name=rename_pdattr_input]").val();
          if (!new_colname) {
            okDialog(trHtml.pdattr_rename[1]);
            return;
          }
          if (new_colname == colname) {
            okDialog(trHtml.pdattr_rename[3]);
            return;
          }
          if ($("div#dialog ").find(".has-error").length) {
            showAlert(trHtml.regexp[0], "warning");
            return;
          }
          if (reserved_keyword_used(new_colname)) {
            showAlert(sprintf(trHtml.pdattr_create[4], new_colname), "warning");
            return;
          }
          var par = { tablename: tablename, pagedefid: pagedefid, coltype: coltype, colname : colname, new_colname: new_colname };
          doRename_pdattr(par, function() {
            okDialog(trHtml.pdattr_rename[0], toggle_pdattr_create);
          });
         $(this).dialog("close");
       }},
       {text:trHtml.dlg[1],click:function(){$(this).dialog("close");}}]
   });
}

function
doRename_pdattr(par, callbackfn) {
  if (!par.status)
    par.status = 0;
  if (par.status == 0) {
    backendCall("checkProject", {
      checkOnlyColumn: par.new_colname,
      projectId:$(".form-project [name=id]").val(),
      projectName:$(".form-project [name=name]").val()},
      function(res,resultPar){
                if (res && res.length > 0) {
                  okDialog(trHtml.pdattr_rename[2]);
                  return;
                }
                par.status++;
                doRename_pdattr(par, callbackfn);
                           });
  }
  if (par.status == 1) {
    log("rename page attribute (pagedefid="+par.pagedefid+") " + par.colname + " -> " + par.new_colname);
    var sql = "UPDATE kipus_pageattributes SET columnname='" + par.new_colname + "'"+
             " WHERE columnname='" + par.colname +"' and pagedefid="+par.pagedefid;
    backendCall("tableCmd", { sql: sql },
      function(res,resultPar){ 
                par.status++;
                doRename_pdattr(par, callbackfn);
      });
  }
  if (par.status == 2) {
    log("rename table col  " + par.tablename + "."+par.colname + " -> " + par.tablename+"."+par.new_colname);
    var sql = "ALTER TABLE " + par.tablename + " CHANGE " + par.colname + " " + par.new_colname + " " + par.coltype;
    backendCall("tableCmd", { sql: sql },
      function(res,resultPar){ 
                par.status++;
                doRename_pdattr(par, callbackfn);
      });

  }
  if (par.status == 3) {
    if (callbackfn)
      return callbackfn();
    return;
  }
}

function
renumber_pdattr() {
   log("renumber_pdattr");
   var pagedefid =  $(".form-page [name=id]").val();
   // renumber order in table
   var sql = "set @neworder=0; update kipus_pageattributes set columnorder = (@neworder := @neworder + 10) "+
             "where pagedefid = " + pagedefid + " order by columnorder";
   backendCall("tableCmd", { sql: sql },
     function(res,resultPar){ log("table renumberd" );  select_pdattr(pagedefid); });
}

function
delete_pd_tables(pdi, callbackfn, executeLater) {
  var cmds = [];
  cmds.push({ fn:"tableUpdate", tableName:"kipus_bookdefinition", columns: { modified: now(), modifiedby: bcUser }, 
              whereStmt: " WHERE id in (select bookdefid from kipus_bookpages where pagedefid="+pdi.id+")" ,
              filterCol: "unused"});
  cmds.push({ fn: "tableDelete", tableName:"kipus_pageattributes",
              filterCol:'pagedefid', filterVal:pdi.id});
  cmds.push({ fn: "tableDelete", tableName:"kipus_bookpages",
              filterCol:'pagedefid', filterVal: pdi.id});
  cmds.push({ fn: "tableDelete", tableName:"kipus_pagedefinition",
              filterCol:'id', filterVal: pdi.id});
  cmds.push({ fn: "tableDelete", tableName:"kipus_pagedefinition",
              filterCol:'id', filterVal: pdi.id});
  // drop table if no reference on it exists
  backendCall("tableSelect", { tableName:"kipus_pagedefinition",
                               where:"tablename='"+pdi.tablename+"' and id != "+pdi.id },
    function(res, resultPar) {
      if (res.length == 0)
        cmds.push({ fn: "tableCmd", sql:"drop table if exists " + pdi.tablename });;
      if (executeLater)
        return callbackfn(cmds);
      backendCall("tableBatch", {commands:cmds },
        function(){
          log("pd_tables deleted");   
          select_pd(callbackfn);
      });
    });
}

function
delete_pd(btn, i) {
  log("delete_pd :" + pd[i].id);
  var ctx = getCtx(pd[i], "page");
  $("div#dialog").html(trHtml.pd_delete[0]);
  $("div#dialog").dialog({
    dialogClass:"no-close", buttons: [
      {text:trHtml.dlg[2], click:function(){
          log_sc($(btn).attr("title"), ctx);
          delete_pd_tables(pd[i]);
        $(this).dialog("close");
      }},
      {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
  });
}

function
update_pd() {
  log("update_pd");
  if (!$(".form-page [name=displayname]").val()) {
    showAlert(trHtml.pd_update[1], "warning");
    return;
  }
  if ($(".form-page").find(".has-error").length) {
    showAlert(trHtml.regexp[0], "warning");
    return;
  }
  var cols = {
    tablename:$(".form-page [name=tablename]").val(),
    displayname: $(".form-page [name=displayname]").val(),
    helptext:    $(".form-page [name=helptext]").val(),
    pagetype:    $(".form-page [name=pagetype]").val(),
    subpageparam:$(".form-page [name=subpageparam]").val(),
    uniquecols:  $(".form-page [name=uniquecols]").val(),
    longtitle:   $(".form-page [name=longtitle]").val(),
    shorttitle:  $(".form-page [name=shorttitle]").val(),
    importOverwrite:$(".form-page [name=importOverwrite]").val(),
    sortby:      $(".form-page [name=sortby]").val()
  };
  if($(".form-page [name=pagetype]").val() == 'CP_LOOKUP')
    cols = { importOverwrite:$(".form-page [name=importOverwrite]").val() };
  backendCall("tableUpdate", { tableName:"kipus_pagedefinition", columns: cols,
                              filterCol:  "id", filterVal: $(".form-page [name=id]").val() },
    function(res,resultPar){ log("page definition update" ); select_pd(toggle_pd_create);
                         showAlert(trHtml.pd_update[0], "success");});
}

function
cp_displayname()
{
  var txt = $(".form-page [name=cp_tablename] option:selected").text();
  return txt.substr(txt.indexOf(" / ")+3);
}

function
create_pd_tables(stat,pageInsertId,attr, insertfinished)
{
  function getTablename() {
    var pt = $(".form-page [name=pagetype]").val();
    if(pt == 'CP_LOOKUP')
      return $(".form-page [name=cp_tablename]").val();

    var tableName = $(".form-page [name=tablename]").val();
    var prefix = $(".form-project [name=prefix]").val().toUpperCase();
    if (prefix)
      tableName = prefix + "_" + tableName;
    return tableName;
  }

  if (stat == 0) {
    if($(".form-page [name=pagetype]").val() == 'CP_LOOKUP')
      return create_pd_tables(1);

    // stop if page already exists
    backendCall("tableSelect", { tableName:"kipus_pagedefinition" },
    function(res) {
      var found;
      for(var i1=0; i1<res.length; i1++)
        if(res[i1].tablename.toUpperCase() == getTablename())
          found = true;
      if(found)
        showAlert(trHtml.pd_create[2], "error");
      else
        create_pd_tables(1);
    });
  } else if (stat == 1) {
      // insert pagedefinition
      var pagetype = $(".form-page [name=pagetype]").val();
      if (pagetype == "QUIZ")
        pagetype = "LOOKUP";
      backendCall("tableInsert", { tableName:"kipus_pagedefinition", columns:{
        tablename: getTablename(),
        displayname: (pagetype=='CP_LOOKUP') ? cp_displayname() : $(".form-page [name=displayname]").val(),
        helptext:    $(".form-page [name=helptext]").val(),
        pagetype:    pagetype,
        subpageparam:$(".form-page [name=subpageparam]").val(),
        uniquecols:  $(".form-page [name=uniquecols]").val(),
        longtitle:   $(".form-page [name=longtitle]").val(),
        shorttitle:  $(".form-page [name=shorttitle]").val(),
        importOverwrite:$(".form-page [name=importOverwrite]").val(),
        sortby:      $(".form-page [name=sortby]").val()
        }},
        function(res,resultPar){
            log("page definition created" );
            log(" bookdefid:" + $(".form-book [name=id]").val());
            log(" pagedefid:" + res.insertId);
            backendCall("tableInsert", { tableName:"kipus_bookpages", columns:{
              bookdefid:$(".form-book [name=id]").val(),
              pagedefid:res.insertId
              }},
              function(res1,resultPar){
                log("bdpage created" );
                if(pagetype != 'CP_LOOKUP') {
                  create_pd_tables(stat+1,res.insertId);
                  create_pd_tables(4);
                }
                select_bdpage($(".form-book [name=id]").val(), function() {
                  toggle_pd_create();
                });
                showAlert(trHtml.pd_create[1], "success");
              });
            });

  } else if (stat == 2) {
    if ($(".form-page [name=pagetype]").val() == "LOOKUP" || $(".form-page [name=pagetype]").val() == "QUIZ") {
        var ord=0;
        // create lookup tables
        create_pd_tables(stat+1, pageInsertId, {columnname:"DISPLAYNAME",displayname:"Display Text",constrainttype:'text',columnorder:++ord}, false);
        create_pd_tables(stat+1, pageInsertId, {columnname:"HELPTEXT",displayname:"Short Help Text",constrainttype:'text',columnorder:++ord}, false);
        create_pd_tables(stat+1, pageInsertId, {columnname:"IMAGE",displayname:"Image",columnorder:++ord, constrainttype:'foto'}, $(".form-page [name=pagetype]").val() != "QUIZ");
        create_pd_tables(stat+1, pageInsertId, {columnname:"ORDERBY",displayname:"Order By",columnorder:++ord, constrainttype:'num'}, false);
        create_pd_tables(stat+1, pageInsertId, {columnname:"CODE",displayname:"Code",columnorder:++ord, constrainttype:'text'}, false);
        if ($(".form-page [name=pagetype]").val() == "QUIZ") {
           // create quiz tables
          create_pd_tables(stat+1, pageInsertId, {columnname:"QUESTION_TYPE",displayname:"Question Type",columnorder:++ord,
                           helptext: 'Options with single correct answer,Options with multiple correct answers,Free text with single correct answer,Image Map with single correct answer',
                           constrainttype:'singleFromArg', constraintparam:'optionsSingleAnswer,optionsMultiAnswer,text,map', inputtype:"mandatory", defaultvalue:'multi'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"ICON",displayname:"Icon",columnorder:++ord, constrainttype:'foto'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"QUESTION",displayname:"Question",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"ANSWER_1",displayname:"Answer 1",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"ANSWER_2",displayname:"Answer 2",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"ANSWER_3",displayname:"Answer 3",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"ANSWER_4",displayname:"Answer 4",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"ANSWER_5",displayname:"Answer 5",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"CORRECT_ANSWER",displayname:"Correct Answer",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"SOLUTION_TEXT_1",displayname:"Solution Text 1",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"SOLUTION_TEXT_2",displayname:"Solution Text 2",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"SOLUTION_TEXT_3",displayname:"Solution Text 3",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"SOLUTION_TEXT_4",displayname:"Solution Text 4",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"SOLUTION_TEXT_5",displayname:"Solution Text 5",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"IMAGE_MAP",displayname:"Image Map",columnorder:++ord, constrainttype:'multiLine'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"IMAGE_1",displayname:"Image 1",columnorder:++ord, constrainttype:'foto'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"IMAGE_2",displayname:"Image 2",columnorder:++ord, constrainttype:'foto'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"IMAGE_3",displayname:"Image 3",columnorder:++ord, constrainttype:'foto'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"IMAGE_4",displayname:"Image 4",columnorder:++ord, constrainttype:'foto'}, false);
          create_pd_tables(stat+1, pageInsertId, {columnname:"IMAGE_5",displayname:"Image 5",columnorder:++ord, constrainttype:'foto'}, true);
        }
    }
  } else if (stat == 3) {
      log("columnname="+attr.columnname);
      backendCall("tableInsert", { tableName:"kipus_pageattributes", columns:{
                pagedefid:          pageInsertId,
                columnname:         attr.columnname,
                orderby:            attr.orderby,
                displayname:        attr.displayname,
                helptext:           attr.helptext,
                columnorder:        attr.columnorder,
                suffix:             attr.suffix,
                columnmaxlength:    attr.columnmaxlength,
                constrainttype:     attr.constrainttype,
                constraintparam:    attr.constraintparam,
                inputtype:          attr.inputtype,
                defaultvalue:       attr.defaultvalue,
                placeholder:        attr.placeholder,
                javascriptonchange: attr.javascriptonchange,
                javascriptonsave:   attr.javascriptonsave,
                showif:             attr.showif,
                gluewithnext:       attr.gluewithnext,
                corrective:         attr.corrective,
                scoretype:          attr.scoretype,
                longhelp:           attr.longhelp
                }},
                function(res,resultPar){
                         log("pd attribute created" );
                         if (insertfinished) {
                            select_data(function() { select_pdattr(pageInsertId); });
                            // after pd attribute creation, reset pd attr page
                            $(".form-page [name=tablename]").parent().find("span.input-group-addon").remove();
                            $(".form-page [name=tablename]").parent().removeClass("input-group");
                            $(".form-page [name=tablename]").parent().removeClass("has-error has-success");
                            $(".form-page [name=tablename]").parent().find(".glyphicon").tooltip('destroy').removeClass("glyphicon-warning-sign glyphicon-ok");
                         }
                });


  } else if (stat == 4) {
      // create table
      var sql = " create table if not exists " + getTablename() +
                "( id int primary key auto_increment, modified char(19), modifiedby varchar(255)";
      if ($(".form-page [name=pagetype]").val() == "LOOKUP")
         sql += ",deleted enum('YES','NO') DEFAULT 'NO' NOT NULL"+
                ",ORDERBY int,DISPLAYNAME varchar(255) NOT NULL, HELPTEXT varchar(255), IMAGE longtext, CODE varchar(255)";
      else if ($(".form-page [name=pagetype]").val() == "QUIZ") {
         sql += ",DISPLAYNAME varchar(255) NOT NULL, HELPTEXT varchar(255), IMAGE longtext, "+
                  "QUESTION_TYPE varchar(255) NOT NULL DEFAULT 'multi', ICON longtext,"+
                  "QUESTION longtext, ANSWER_1 longtext, ANSWER_2 longtext, ANSWER_3 longtext, ANSWER_4 longtext, ANSWER_5 longtext,"+
                  "SOLUTION_TEXT_1 longtext, SOLUTION_TEXT_2 longtext, SOLUTION_TEXT_3 longtext, SOLUTION_TEXT_4 longtext, SOLUTION_TEXT_5 longtext,"+
                  "CORRECT_ANSWER longtext, IMAGE_MAP longtext, IMAGE_1 longtext, IMAGE_2 longtext, IMAGE_3 longtext, IMAGE_4 longtext, IMAGE_5 longtext";
      }
      else {
         sql += ",rowid varchar(32) NOT NULL";
         sql += ",bookid varchar(32) NOT NULL";
         sql += ",rootbookid varchar(32) NOT NULL";
      }
      sql += ");";
      backendCall("tableCmd", { sql: sql }, //3
      function(res,resultPar){ log("table created" ); });
  }
}

function
create_pd(btn) {
  log("create_pd");
  var pt = $(".form-page [name=pagetype]").val();
  var tn = $(".form-page [name=tablename]").val();
  var dn = $(".form-page [name=displayname]").val();
  var prefix = $(".form-project [name=prefix]").val().toUpperCase();

  if(pt == "CP_LOOKUP") {
    dn = tn = $(".form-page [name=cp_tablename]").val();
  }

  if(!tn || !dn) {
    showAlert(trHtml.pd_create[0], "warning");
    return;
  }
  if (pt == "QUIZ" && tn.indexOf("QUIZ_") != 0) {
    showAlert(trHtml.pd_create[3], "warning");
    return;
  }
  if ($(".form-page").find(".has-error").length) {
    showAlert(trHtml.regexp[0], "warning");
    return;
  }
  create_pd_tables(0,undefined,undefined);
  log_sc($(btn).text(), getCtx({ pagetype: pt, tablename: prefix?prefix+"_"+tn:tn, displayname: dn}, "page"));
}

function
dbcoltype(t)
{
  if(t == "foto")             return "longtext";
  if(t == "signature")        return "longtext";
  if(t == "file")             return "longtext";
  if(t == "date")             return "date";
  if(t == "dateTime")         return "datetime";
  if(t == "num")              return "double";
  if(t == "multiLine")        return "longtext";
  if(t == "gps")              return "varchar(64) character set latin1";
  if(t == "singleFromTable")  return "varchar(20) character set latin1";
  if(t == "tableRows")        return "varchar(20) character set latin1";
  if(t == "tableCopy")        return "varchar(20) character set latin1";
  if(t == "groupheader")      return "varchar(1)  character set latin1";
  return "varchar(255)";
}

function 
reserved_keyword_used(str)
{
  var mysql_reserved_keywords= ['ACCESSIBLE','ADD','ALL','ALTER','ANALYZE','AND','AS','ASC','ASENSITIVE','BEFORE','BETWEEN','BIGINT','BINARY','BLOB','BOTH','BY','CALL','CASCADE','CASE','CHANGE','CHAR','CHARACTER','CHECK','COLLATE','COLUMN','CONDITION','CONSTRAINT','CONTINUE','CONVERT','CREATE','CROSS','CURRENT_DATE','CURRENT_TIME','CURRENT_TIMESTAMP','CURRENT_USER','CURSOR','DATABASE','DATABASES','DAY_HOUR','DAY_MICROSECOND','DAY_MINUTE','DAY_SECOND','DEC','DECIMAL','DECLARE','DEFAULT','DELAYED','DELETE','DESC','DESCRIBE','DETERMINISTIC','DISTINCT','DISTINCTROW','DIV','DOUBLE','DROP','DUAL','EACH','ELSE','ELSEIF','ENCLOSED','ESCAPED','EXISTS','EXIT','EXPLAIN','FALSE','FETCH','FLOAT','FLOAT4','FLOAT8','FOR','FORCE','FOREIGN','FROM','FULLTEXT','GRANT','GROUP','HAVING','HIGH_PRIORITY','HOUR_MICROSECOND','HOUR_MINUTE','HOUR_SECOND','IF','IGNORE','IN','INDEX','INFILE','INNER','INOUT','INSENSITIVE','INSERT','INT','INT1','INT2','INT3','INT4','INT8','INTEGER','INTERVAL','INTO','IS','ITERATE','JOIN','KEY','KEYS','KILL','LEADING','LEAVE','LEFT','LIKE','LIMIT','LINEAR','LINES','LOAD','LOCALTIME','LOCALTIMESTAMP','LOCK','LONG','LONGBLOB','LONGTEXT','LOOP','LOW_PRIORITY','MASTER_SSL_VERIFY_SERVER_CERT','MATCH','MAXVALUE','MEDIUMBLOB','MEDIUMINT','MEDIUMTEXT','MIDDLEINT','MINUTE_MICROSECOND','MINUTE_SECOND','MOD','MODIFIES','NATURAL','NOT','NO_WRITE_TO_BINLOG','NULL','NUMERIC','ON','OPTIMIZE','OPTION','OPTIONALLY','OR','ORDER','OUT','OUTER','OUTFILE','PRECISION','PRIMARY','PROCEDURE','PURGE','RANGE','READ','READS','READ_WRITE','REAL','REFERENCES','REGEXP','RELEASE','RENAME','REPEAT','REPLACE','REQUIRE','RESIGNAL','RESTRICT','RETURN','REVOKE','RIGHT','RLIKE','SCHEMA','SCHEMAS','SECOND_MICROSECOND','SELECT','SENSITIVE','SEPARATOR','SET','SHOW','SIGNAL','SMALLINT','SPATIAL','SPECIFIC','SQL','SQLEXCEPTION','SQLSTATE','SQLWARNING','SQL_BIG_RESULT','SQL_CALC_FOUND_ROWS','SQL_SMALL_RESULT','SSL','STARTING','STRAIGHT_JOIN','TABLE','TERMINATED','THEN','TINYBLOB','TINYINT','TINYTEXT','TO','TRAILING','TRIGGER','TRUE','UNDO','UNION','UNIQUE','UNLOCK','UNSIGNED','UPDATE','USAGE','USE','USING','UTC_DATE','UTC_TIME','UTC_TIMESTAMP','VALUES','VARBINARY','VARCHAR','VARCHARACTER','VARYING','WHEN','WHERE','WHILE','WITH','WRITE','XOR','YEAR_MONTH','ZEROFILL','RESIGNAL','SIGNAL'];
  for (var i=0; i<mysql_reserved_keywords.length; i++) {
    if (str == mysql_reserved_keywords[i])
      return true; 
  }
  return false; 
}

function
create_pdattr(btn) {
  log("create_pdattr");
  if (!$(".form-pdattr [name=columnname]").val()
      || !$(".form-pdattr [name=displayname]").val()
      || !$(".form-pdattr [name=columnorder]").val()) {
    showAlert(trHtml.pdattr_create[0], "warning");
    return;
  }
  if ($(".form-pdattr").find(".has-error").length) {
    showAlert(trHtml.regexp[0], "warning");
    return;
  }
  if (reserved_keyword_used($(".form-pdattr [name=columnname]").val())) {
    showAlert(sprintf(trHtml.pdattr_create[4], $(".form-pdattr [name=columnname]").val()), "warning");
    return;
  }
  if ($(".form-page [name=pagetype]").val() == "LOOKUP")
    doCreate_pdattr();
  else
    backendCall("checkProject", {
      checkOnlyColumn: $(".form-pdattr [name=columnname]").val(),
      projectId:$(".form-project [name=id]").val(),
      projectName:$(".form-project [name=name]").val()},
      function(res,resultPar){ log("check same column name" );
                           if (res && res.length > 0) {
                             okDialog(res.join("<br>"));
                             return;
                           }
                           doCreate_pdattr();
                           });

  function doCreate_pdattr() {
      log_sc($(btn).text(), getCtx({ 
                  constrainttype : $(".form-pdattr [name=constrainttype]").val(),
                  columnname     : $(".form-pdattr [name=columnname]").val(),
                  displayname    : $(".form-pdattr [name=displayname]").val()}, "attribute"));
      // create pagedefid in all tables tablename and columnname
      backendCall("tableSelect", { tableName:"kipus_pagedefinition" ,
        where:"pagetype <> 'CP_LOOKUP' and tablename='"+$(".form-page [name=tablename]").val()+"'" },
        function(res, resultPar) {
        var cmds = [];
        for(var j=0; j<res.length; j++) {
           var constrainttype = $(".form-pdattr [name=constrainttype]").val();
           var columnname     = $(".form-pdattr [name=columnname]").val();
           var colType = dbcoltype(constrainttype);
           cmds.push({ fn:"tableInsert", tableName:"kipus_pageattributes", columns:{
                 pagedefid:res[j].id,
                 columnname:      columnname,
                 displayname:     $(".form-pdattr [name=displayname]").val(),
                 helptext:        $(".form-pdattr [name=helptext]").val(),
                 columnorder:     $(".form-pdattr [name=columnorder]").val(),
                 suffix:          $(".form-pdattr [name=suffix]").val(),
                 columnmaxlength: $(".form-pdattr [name=columnmaxlength]").val(),
                 constrainttype:  constrainttype,
                 constraintparam: $(".form-pdattr [name=constraintparam]").val(),
                 inputtype:       $(".form-pdattr [name=inputtype]").val(),
                 defaultvalue:    $(".form-pdattr [name=defaultvalue]").val(),
                 placeholder:     $(".form-pdattr [name=placeholder]").val(),
                 javascriptonchange:$(".form-pdattr [name=javascriptonchange]").val(),
                 javascriptonsave:$(".form-pdattr [name=javascriptonsave]").val(),
                 showif:          $(".form-pdattr [name=showif]").val(),
                 gluewithnext:    $(".form-pdattr [name=gluewithnext]").val(),
                 corrective:      $(".form-pdattr [name=corrective]").val(),
                 scoretype:       $(".form-pdattr [name=scoretype]").val(),
                 longhelp:        $(".form-pdattr [name=longhelp]").val() }
          });
        }
        cmds.push({ fn:"tableCmd", sql: "alter table " + $(".form-page [name=tablename]").val() + " add " + columnname + " "+colType });
        var defaultvalue = $(".form-pdattr [name=defaultvalue]").val();
        if (defaultvalue != "") {
          var colName = $(".form-pdattr [name=columnname]").val();
          var cols = {};
          cols[colName] = defaultvalue;
          cmds.push({ fn:"tableUpdate", tableName: $(".form-page [name=tablename]").val(), columns: cols, filterCol: colName, filterVal:undefined });
        }
        if (constrainttype == "tableRows") {
           // create index
           var cp = $(".form-pdattr [name=constraintparam]").val().split(" "), ch={};
           for(var i1=0; i1<cp.length; i1++) {
             var o = cp[i1].indexOf(':');
             if(o > 0)
               ch[cp[i1].substr(0,o)] = cp[i1].substr(o+1);
           }
           var sql = `
              CREATE index IX_${ch.prefix}TARGETID ON ${ch.target} ( ${ch.prefix}TARGETID );`
           cmds.push({ fn:"tableCmd", sql: sql });
           // drop index and ignore drop error
           backendCall("tableCmd", { ignoreError: true, sql:`DROP INDEX IX_${ch.prefix}TARGETID ON ${ch.target}` },
             function(res) {
              backendCall("tableBatch", { commands:cmds },
                function(){
                   select_pd(toggle_pdattr_create);
                   showAlert(trHtml.pdattr_update[0], "success");
                });
           });
        } else
        backendCall("tableBatch", { commands:cmds },
          function(){
             select_pd(toggle_pdattr_create);
             showAlert(trHtml.pdattr_update[0], "success");
          });
     });
   }
}


function
update_pdattr() {
  log("update_pdattr");
  if (!$(".form-pdattr [name=id]").val()
      || !$(".form-pdattr [name=columnname]").val()
      || !$(".form-pdattr [name=displayname]").val()
      || !$(".form-pdattr [name=columnorder]").val()) {
    showAlert(trHtml.pdattr_update[1], "warning");
    return;
  }

  var oldct = $(".form-pdattr [name=constrainttype]").attr("oldval");
  var newct = $(".form-pdattr [name=constrainttype]").val();
  if(dbcoltype(oldct) != dbcoltype(newct)) {
    showAlert(trHtml.pdattr_update[2], "warning");
    return;
  }

  var cols = {
    columnname:         $(".form-pdattr [name=columnname]").val(),
    displayname:        $(".form-pdattr [name=displayname]").val(),
    helptext:           $(".form-pdattr [name=helptext]").val(),
    columnorder:        $(".form-pdattr [name=columnorder]").val(),
    suffix:             $(".form-pdattr [name=suffix]").val(),
    columnmaxlength:    $(".form-pdattr [name=columnmaxlength]").val(),
    constrainttype:     $(".form-pdattr [name=constrainttype]").val(),
    constraintparam:    $(".form-pdattr [name=constraintparam]").val(),
    inputtype:          $(".form-pdattr [name=inputtype]").val(),
    defaultvalue:       $(".form-pdattr [name=defaultvalue]").val(),
    placeholder:        $(".form-pdattr [name=placeholder]").val(),
    javascriptonchange: $(".form-pdattr [name=javascriptonchange]").val(),
    javascriptonsave:   $(".form-pdattr [name=javascriptonsave]").val(),
    showif:             $(".form-pdattr [name=showif]").val(),
    gluewithnext:       $(".form-pdattr [name=gluewithnext]").val(),
    corrective:         $(".form-pdattr [name=corrective]").val(),
    scoretype:          $(".form-pdattr [name=scoretype]").val(),
    i18n:               $(".form-pdattr [name=i18n]").val(),
    bi_params:          $(".form-pdattr [name=bi_params]").val() ?
                            $(".form-pdattr [name=bi_params]").val().join(","): null,
    longhelp:           $(".form-pdattr [name=longhelp]").val(),
    };
    backendCall("tableUpdate", { tableName:"kipus_pageattributes", columns: cols,
                              filterCol:  ["pagedefid","columnname"],
                              filterVal: [$(".form-pdattr [name=id]").val(), $(".form-pdattr [name=columnname]").val()] },
    function(res,resultPar){ log("pd attribute updated" ); select_pd(toggle_pdattr_create);
                         showAlert(trHtml.pdattr_create[1], "success");});
}

function
delete_pdattr(btn, i) 
{
  $("div#dialog").html(trHtml.pdattr_delete[0]);
  $("div#dialog").dialog({
    dialogClass:"no-close", buttons: [
      {text:trHtml.dlg[2], click:function(){
      var ctx = getCtx(pdattr[i], "attribute");
      var cmds = [];
      cmds.push({ fn:"tableDelete", tableName:"kipus_pageattributes",
              filterCol:['pagedefid','columnname'], filterVal:[pdattr[i].pagedefid, pdattr[i].columnname]});
      cmds.push({ fn:"tableDelete", tableName:"kipus_pageattributes",
              filterCol:['pagedefid','columnname'], filterVal:[pdattr[i].pagedefid, pdattr[i].columnname]});
      cmds.push({ fn:"tableUpdate", tableName:"kipus_pagedefinition", columns: { modified: now(), modifiedby: bcUser }, 
              filterCol:  "id", filterVal: pdattr[i].pagedefid});
      cmds.push({ fn:"tableCmd", sql:"alter table " + $(".form-page [name=tablename]").val() + " drop column " + pdattr[i].columnname});

      backendCall("tableSelect", { tableName:"kipus_pagedefinition" , filterCol:'tablename', filterVal:$(".form-page [name=tablename]").val() },
        function(res, resultPar) {
           for(var j=0; j<res.length; j++) {
              cmds.push({ fn: "tableDelete", tableName:"kipus_pageattributes" , filterCol:['pagedefid', 'columnname'], filterVal:[res[j].id , pdattr[i].columnname] });
           }
        backendCall("tableBatch", {commands:cmds },
          function(){
             log("Delete pdattr done" );
             log_sc($(btn).attr("title"), ctx);
             select_pdattr(pdattr[i].pagedefid);
             select_pd();
             showAlert(trHtml.pdattr_delete[1], "success");
          });
        });
        $(this).dialog("close");
      }},
      {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
  });
}

function
select_pd(callbackfn)
{
  var canWrite = hasProjectRight("Projects", "write", $(".form-project [name=id]").val()) || hasProjectRight("AdminAll", "write");
  log("select page definition canWrite="+canWrite);
  backendCall("tableSelect", { tableName:"kipus_pagedefinition", orderBy:"tablename, displayname" },
    function(res, resultPar) {
      pd = res;
      if (canWrite) {
        $("#btn-updatepd").show();
        $("#btn-addattrpd").show();
        $("#btn-addattrs-from-page-pd").show();
        $("#btn-renumber").show();
      } else {
        $("#btn-updatepd").hide();
        $("#btn-addattrpd").hide();
        $("#btn-addattrs-from-page-pd").hide();
        $("#btn-renumber").hide();
      }
      $(".form-page input").attr("readonly", !canWrite);
      $(".form-page select").attr("disabled", !canWrite);
      $("#pdtable >tbody tr").remove();
      for(var i=0; i<res.length; i++) {
        var row = "<tr><td align='center'><i class='btn-link glyphicon "+(canWrite?glEdit:glView)+"'" +
                  "onclick='toggle_pd_edit(\"" + i + "\")'></i></td>" +(canWrite?
                  "<td align='center'><i title='Delete page' class='btn-link glyphicon glyphicon-remove red'" +
                  "onclick='delete_pd(this, \"" + i + "\")'></i></td>":"")+
                  "<td>"+ res[i].tablename + "</td>" +
                  "<td>"+ res[i].displayname + "</td>" +
                  "<td>"+ res[i].pagetype + "</td>" +
                  "<td>"+ res[i].subpageparam + "</td>" +
                  "<td>"+ res[i].modified + "</td>" +
                  "<td>"+ res[i].modifiedby + "</td></tr>";
        $('#pdtable').find('tbody:last').append(row);
      }
      table_pagination($("#pdtable"));
      if (callbackfn) {
         callbackfn();
      }
    });
}

function
switch_to_maintenance(tableName)
{
  log("switch to maintenance " + tableName);
  switch_tab('data', { doBlink: true }); 
  var project = $(".form-project [name=name]").val();
  toggle_data_edit(project, tableName, table2pagetype[tableName]);
  if (!$(".table-datarows").is(":visible"))
    $("table#datatable tr[tableName="+tableName+"] td:first .btn-link").trigger("click");
}

function
select_pdattr(pagedefid, callbackfn)
{
  var canWrite = hasProjectRight("Projects", "write", $(".form-project [name=id]").val()) || hasProjectRight("AdminAll", "write");
  log("select attributes " + pagedefid);
  backendCall("tableSelect", { tableName:"kipus_pageattributes" , filterCol:'pagedefid', filterVal:pagedefid, orderBy:'columnorder asc'},
    function(res, resultPar) {
      pdattr = res;
      if (canWrite) {
        $("#btn-updatepd").show();
        var pagetype = null;
        for (var i=0; i<pd.length; i++) {
          if (pd[i].id != pagedefid)
            continue;
          pagetype = pd[i].pagetype;
        }
        if(pagetype == 'CP_LOOKUP') {
          $("#btn-addattrpd").hide();
          $("#btn-addattrs-from-page-pd").hide();
          $("#btn-renumber").hide();
          $("#pd_attrlist").hide();
        } else {
          $("#btn-addattrpd").show();
          $("#btn-addattrs-from-page-pd").show();
          $("#btn-renumber").show();
          $("#pd_attrlist").show();
        }
        $("#pdattrtable thead th[trid=th_edit]").text("Edit");
        $("#pdattrtable thead th[trid=th_delete]").show();
      } else {
        $("#btn-updatepd").hide();
        $("#btn-addattrpd").hide();
        $("#btn-addattrs-from-page-pd").hide();
        $("#btn-renumber").hide();
        $("#pdattrtable thead th[trid=th_edit]").text("View");
        $("#pdattrtable thead th[trid=th_delete]").hide();
      }
      $("#pdattrtable >tbody tr").remove();
      function format_displayname(attr) {
        var str = "";
        if (attr.inputtype == "mandatory" || attr.inputtype == "mandatory_modifiablehdrcol")
          str += "<span class='red'>*</span>";
        if (attr.inputtype == "hidden")
          str += "<i class='page_attr_hidden glyphicon glyphicon-eye-close black'></i>";
        if (attr.inputtype == "readonly")
          str += "<i class='page_attr_readonly glyphicon glyphicon-lock black'></i>";
        str += "<span>"+attr.displayname+"</span>";
        if (attr.showif && attr.showif.length > 0)
          str += "<i class='page_attr_showif glyphicon glyphicon-question-sign black' rel='tooltip' title='"+attr.showif+"'></i>";
        return str;
      }
      var luTodo = {};
      for(var i=0; i<res.length; i++) {
        var refTable="";
        if (res[i].constrainttype == "singleFromTable" || 
           res[i].constrainttype == "multiFromTable") {
           refTable = res[i].constraintparam.split(" ")[0];
        }
        if (res[i].constrainttype == "tableRows") {
           if (res[i].constraintparam.indexOf("target:") == 0) {
              var cp = res[i].constraintparam.split(" ");
              var ch={};
              for(var i2=0; i2<cp.length; i2++) {
                var o = cp[i2].indexOf(':');
                if(o > 0)
                  ch[cp[i2].substr(0,o)] = cp[i2].substr(o+1);
              }
              cp = ch.target;
           }
           refTable = cp;
        }
        if (refTable)
          luTodo[refTable] = 1;
        var row = "<tr><td align='center'><i class='btn-link glyphicon "+(canWrite?glEdit:glView)+"'" +
                  "onclick='"+(canWrite?"toggle_pdattr_edit":"toggle_pdattr_view")+"(\"" + i + "\")'></i></td>" +(canWrite?
                  "<td align='center'><i title='Delete attribute' class='btn-link glyphicon glyphicon-remove red'" +
                  "onclick='delete_pdattr(this, \"" + i +  "\")'></i></td>":"")+
                  "<td>"+ res[i].columnorder + "</td>" +
                  "<td>"+ res[i].columnname + "</td>" +
                  "<td>"+ format_displayname(res[i])+ "</td>" +
                  "<td>"+ (res[i].constrainttype?res[i].constrainttype:"") + "</td>" +
                  (refTable?
                  "<td class='refTable' tableName='"+refTable+"'><span class='tooltiptext'></span><span class='fa fa-table'></span><span class='td'></span></a></td>":"<td></td>")
                   + "</tr>";
        $('#pdattrtable').find('tbody:last').append(row);
      }
      function renderTable(tn, max) {
        var html = "<ul>";
        luTables[tn].sort(function(a,b) {
          return a.ORDERBY - b.ORDERBY;
        });
        var all = 0;
        for (var i=0; i<luTables[tn].length; i++) {
          if(luTables[tn][i].deleted == "YES")
            continue;
          all++;
        }
        var cnt = 0;
        for (var i=0; i<luTables[tn].length; i++) {
          var r = luTables[tn][i];
          if(r.deleted == "YES")
            continue;
          if(!r.DISPLAYNAME) {
            var cnt = luTables[tn].length;
            html += " ... " + cnt+(cnt==1?" entry":" entries");
            break;
          }
          if (++cnt>max) {
            var more = (all - cnt + 1);
            html += " ... "+more+" more "+(more==1?"entry":"entries");
            break;
          }
          html += "<li>"+r.DISPLAYNAME+"</li>";
        }
        html += "</ul>";
        return html;
      }
      function doRenderTable() {
        $("#pdattrtable td.refTable").each(function() {
          var tn = $(this).attr("tableName");
          var el = $(this);
          var html = "<span class='btn-link'><a tableName='"+tn+"' class='maintain'>"+tn+"</a></span>"+ renderTable(tn, 20);
          $(el).find("span.tooltiptext").html(html);
          $(el).find("span.td").html(renderTable(tn, 5));
          $("#pdattrtable [rel=tooltip]").tooltip({placement: 'right'});
          $("span.tooltiptext").find("a.maintain").unbind("click").click(function() {
            switch_to_maintenance($(this).attr("tableName"));
          });
        });
      }
      // get ref lu tables
      var todo = Object.keys(luTodo).length;
      for (var tn in luTodo) {
        if (luTables[tn]) {
          if (--todo == 0) {
            doRenderTable();
            break;
          }
          continue;
        }
        (function(tn) {
        backendCall("tableSelect", { tableName:tn },
            function(res, resultPar) {
              luTables[tn] = res;
              if (--todo == 0)
                doRenderTable();
        });
        })(tn);
      }
      table_pagination($("#pdattrtable"));
      if (callbackfn)
        callbackfn(); 
    });
}

function
constrainttype_changed(select) {
  var constrainttype = $(select).val();
  log("constrainttype_changed to: "+constrainttype);
  var placeholder = "";
  $(".tooltip_help.help-6").hide();
  $(".tooltip_help.help-15").hide();
  $(".tooltip_help.help-17").hide();
  $(".tooltip_help.help-18").hide();
  $(".tooltip_help.help-19").hide();
  if (constrainttype == "foto" || constrainttype == "signature") { 
    placeholder = trHtml.constraintparam[0];
  }
  if (constrainttype == "foto") { $(".tooltip_help.help-18").show(); }
  if (constrainttype == "file") { placeholder = trHtml.constraintparam[8]; }
  if (constrainttype == "tableCopy") {
     placeholder = trHtml.constraintparam[9];
     $(".tooltip_help.help-15").show();
  }
  if (constrainttype == "tableRows") {
     placeholder = trHtml.constraintparam[10];
     $(".tooltip_help.help-17").show();
  }
  if (constrainttype == "singleFromArg" || constrainttype == "multiFromArg") {
     placeholder = trHtml.constraintparam[1];
  }
  if (constrainttype == "singleFromTable" || constrainttype == "multiFromTable") {
    placeholder = trHtml.constraintparam[2];
    $(".form-pdattr [name=constraintparam]").attr("placeholder", placeholder);
    $(".tooltip_help.help-6").show();
  }
  $(".form-pdattr [name=constraintparam]").off('keyup');
  $(".form-pdattr span.table-add, .form-pdattr span.table-edit").remove();
  function check_tn(cp, doBlink) {
     $(".form-pdattr span.table-add, .form-pdattr span.table-edit").remove();
     var tn;
     var trp;
     if (constrainttype == "tableRows") {
        if (cp.indexOf("target:") == 0) {
          // tableRows special treatment
          cp = cp.split(" ");
          var ch={};
          for(var i2=0; i2<cp.length; i2++) {
            var o = cp[i2].indexOf(':');
            if(o > 0)
              ch[cp[i2].substr(0,o)] = cp[i2].substr(o+1);
          }
          tn = ch.target;
          trp = ch.prefix;
        } else {
          tn = cp.split(" ")[0];
        }
     } else {
       tn = cp.split(" ")[0];
     }
     if (tn) { 
       if(table2pagetype[tn])
         $(".form-pdattr label[for=constraintparam]").append("<span style='cursor:pointer' class='table-edit glyphicon glyphicon-pencil'></span>");
       else 
         $(".form-pdattr label[for=constraintparam]").append("<span style='cursor:pointer' class='table-add glyphicon glyphicon-plus-sign green'></span>");
       if (doBlink) {
         $(".form-pdattr span.table-edit").animate({opacity:0}, "slow", "linear", function(){
             $(".form-pdattr span.table-edit").animate({opacity:1}, "slow", function(){
             });
         });
       }
       $(".form-pdattr label[for=constraintparam] span.table-edit").click(function() {
          switch_to_maintenance(tn);
       });
       $(".form-pdattr label[for=constraintparam] span.table-add").click(function() {
         var type = constrainttype == "tableRows"?"BODY":"LOOKUP";
          log("add "+type+" table dialog " + tn);
           $("div#dialog").html(
            '<div style="padding-top: 40px;" class="form-group row has-feedback"><label trid="th_tablename" for="tablename" class="col-lg-4 control-label">Table Name</label>'+
              '<div class="col-lg-5 has-success">'+
                  '<input value="'+tn.toUpperCase()+'" type="text" class="form-control ui-autocomplete-input" name="tablename" onchange="this.value = this.value.toUpperCase();" '+
                   'placeholder="Mandatory field">'+
                      '<span class="glyphicon form-control-feedback glyphicon-ok"></span></div></div>'+
              '<div class="form-group row">'+
                            '<label trid="th_displayname" for="displayname" class="col-lg-4 control-label">Display Text</label>'+
                            '<div class="col-lg-5">'+
                                '<input type="text" class="form-control" name="displayname" placeholder="Mandatory field">'+
                            '</div></div>'+
              '<div class="form-group row" style="display:none">'+
                            '<label trid="th_prefix" for="prefix" class="col-lg-4 control-label">Prefix</label>'+
                            '<div class="col-lg-5">'+
                                '<input type="text" class="form-control" name="prefix" placeholder="Mandatory field">'+
                            '</div></div>'+
              '<div class="form-group row">'+
                  '<label trid="th_importOverwrite" class="col-lg-4 control-label">Overwrite by Import</label>'+
                  '<div class="col-lg-5">'+
                     '<select class="form-control" name="importOverwrite">'+
                        '<option trid="yes" value="YES">YES</option>'+
                        '<option trid="no" value="NO">NO</option>'+
                      '</select></div></div>');
          var prefix = $(".form-project [name=prefix]").val().toUpperCase();
          if (prefix) {
              $("div#dialog [name=tablename]").parent().prepend("<span class='input-group-addon'>"+prefix+"_</span>");
              $("div#dialog [name=tablename]").parent().addClass("input-group");
           }
           $("div#dialog [name=tablename]").on('blur', function(e) {
              log("check tablename");
              check_tablename(this);
           });
           if (constrainttype == "tableRows") {
              $("div#dialog [name=prefix]").closest(".row").show();
              if(trp)
                $("div#dialog [name=prefix]").val(trp);
           }
           $("div#dialog").dialog({
             minWidth: 640,
             modal: true,
             title: "Add "+type+" page",
             dialogClass:"no-close add-luPage", buttons: [
               {text:"Add page", click:function(){
                  var dlg = $(this);
                  var tn = $("div#dialog [name=tablename]").val();
                  var dn = $("div#dialog [name=displayname]").val();
                  var iOv = $("div#dialog [name=importOverwrite]").val();
                  var trp = $("div#dialog [name=prefix]").val();
                  if(!tn || !dn) {
                    showAlert(trHtml.pd_create[0], "warning");
                    return;
                  }
                  if (constrainttype == "tableRows" && !trp) {
                    showAlert(trHtml.pd_create[4], "warning");
                    return;
                  }
                  if ($("div#dialog").find(".has-error").length) {
                    showAlert(trHtml.regexp[0], "warning");
                    return;
                  }
                  if (prefix)
                    tn = prefix + "_" + tn;
                  // get all column names to check unique column-names
                  var sql = "select pd.tablename, pa.columnname from kipus_projectbooks pb inner join kipus_bookdefinition bd on bd.id=pb.bookdefid "+
                            "inner join kipus_pagedefinition pd inner join kipus_bookpages bp on bp.bookdefid=bd.id and bp.pagedefid=pd.id "+
                            "inner join kipus_pageattributes pa on pa.pagedefid = pd.id "+
                            "where pb.projectid="+$(".form-project input[name=id]").val()+" and pd.pagetype in ('BODY','HEADER')";
                  backendCall("tableCmd", { sql: sql }, 
                  function(res,resultPar){ 
                    // check if columnnames are alreay used in project
                    for (var i=0; i<res.length; i++) {
                      if (res[i].columnname == trp+"TARGETID" ||
                          res[i].columnname == trp+"INDEX") {
                        showAlert(sprintf(trHtml.pd_create[5], res[i].tablename), "warning");
                        return;
                      }
                    }
                    var cols =  {
                      tablename: tn,
                      displayname: dn,
                      pagetype:    type,
                      importOverwrite: iOv,
                      subpageparam: constrainttype=="tableRows"?trp+"INDEX=hidden":""
                    }
                    backendCall("tableInsert", { tableName:"kipus_pagedefinition", columns: cols },
                      function(res,resultPar){
                          log("page definition created" );
                          log(" bookdefid:" + $(".form-book [name=id]").val());
                          log(" pagedefid:" + res.insertId);
                          backendCall("tableInsert", { tableName:"kipus_bookpages", columns:{
                            bookdefid:$(".form-book [name=id]").val(),
                            pagedefid:res.insertId
                            }},
                            function(res1,resultPar){
                                 log("bdpage created" );
                                var ord=0;
                                if (constrainttype == "tableRows") {
                                  // table rows
                                  create_pd_tables(3, res.insertId, {columnname:trp+"TARGETID",displayname:"Target ID",columnorder:++ord, constrainttype:'text',inputtype:"hidden"}, false);
                                  create_pd_tables(3, res.insertId, {columnname:trp+"INDEX",displayname:"Index",columnorder:++ord, constrainttype:'num',inputtype:"hidden"}, false);
                                } else {
                                  // create lookup tables
                                  create_pd_tables(3, res.insertId, {columnname:"DISPLAYNAME",displayname:"Display Text",constrainttype:'text',columnorder:++ord}, false);
                                  create_pd_tables(3, res.insertId, {columnname:"HELPTEXT",displayname:"Short Help Text",constrainttype:'text',columnorder:++ord}, false);
                                  create_pd_tables(3, res.insertId, {columnname:"IMAGE",displayname:"Image",columnorder:++ord, constrainttype:'foto'}, false); 
                                  create_pd_tables(3, res.insertId, {columnname:"ORDERBY",displayname:"Order By",columnorder:++ord, constrainttype:'num'}, false);
                                  create_pd_tables(3, res.insertId, {columnname:"CODE",displayname:"Code",columnorder:++ord, constrainttype:'text'}, false);
                                }
                                // create table
                                var sql = " create table if not exists " + tn +
                                          "( id int primary key auto_increment, modified char(19), modifiedby varchar(255)";
                                if (constrainttype == "tableRows")
                                   sql += ",rowid varchar(32) NOT NULL,bookid varchar(32) NOT NULL,rootbookid varchar(32) NOT NULL,"+trp+"TARGETID varchar(255), "+trp+"INDEX double)";
                                else
                                   sql += ",deleted enum('YES','NO') DEFAULT 'NO' NOT NULL"+
                                          ",ORDERBY int,DISPLAYNAME varchar(255) NOT NULL, HELPTEXT varchar(255), IMAGE longtext, CODE varchar(255))";
                                backendCall("tableCmd", { sql: sql }, 
                                function(res,resultPar){ 
                                   log("table created: " +tn); 
                                   table2pagetype[tn] = type;
                                   if (constrainttype == "tableRows")
                                     // set constraintparam
                                     $(".form-pdattr [name=constraintparam]").val("target:"+tn+" prefix:"+trp);
                                   else
                                     $(".form-pdattr [name=constraintparam]").val(tn);
                                   check_tn($(".form-pdattr [name=constraintparam]").val(), true);
                                   log_sc("Add page", getCtx(cols, "page"));
                                   $(dlg).dialog("close");
                                });
                            });
                    });
                  });
               }},
               {text:trHtml.dlg[1],click:function(){$(this).dialog("close");}}]
           });
          
       });
     }
  }
  if (constrainttype == "singleFromTable" || constrainttype == "multiFromTable" ||
      constrainttype == "tableRows") {
    check_tn($(".form-pdattr [name=constraintparam]").val());
    // key listener on constraintparam input to check table
    $(".form-pdattr [name=constraintparam]").on('keyup', function(e) {
      check_tn($(this).val());
    });
  }
  
  if (constrainttype == "regexp")   { placeholder = trHtml.constraintparam[3]; }
  if (constrainttype == "num")      { placeholder = trHtml.constraintparam[4]; }
  if (constrainttype == "multiLine"){ placeholder = trHtml.constraintparam[5]; }
  if (constrainttype == "gps")      { $(".tooltip_help.help-19").show(); }
  if (constrainttype == "groupheader"){placeholder= trHtml.constraintparam[7]; }
  $(".form-pdattr [name=constraintparam]").attr("placeholder", placeholder);
  // bi_params
  $(".form-pdattr [name=bi_params] option").each(function() {
    var value = $(this).attr("value");
    if (constrainttype == "num") {
      if (value != "dimension" || value == "none")
         $(this).show();
      else
         $(this).hide();
    } else {
      if (value == "none")
         $(this).show();
      else
        if (value == "dimension" && constrainttype != "foto"
            && constrainttype != "multiLine" && constrainttype != "groupheader"
            && constrainttype != "groupend" && constrainttype != "signature")
           $(this).show();
        else
           $(this).hide();
    }
  });
}

/*
 * END page definition
 */

/*
 * Book definition
 */

function
toggle_bd_edit(i) {
  if (!$(".form-book").is(":visible")) {
    saveOffset("book");
    select_bdpage(bd[i].id);
    $(".form-project").css("display","none");
    $(".form-book").css("display","");
    $(".form-book [name=id]").val(bd[i].id);
    $(".form-book [name=id]").closest(".row").show();
    $(".form-book [name=name]").val(bd[i].name);
    $(".form-book [name=title]").val(bd[i].title);
    $(".form-book [name=helptext]").val(bd[i].helptext);
    $(".form-book [name=hidden]").val(bd[i].hidden);
    $(".form-book [name=autocreate]").val(bd[i].autocreate);
    $(".form-book [name=bi_params]").val(bd[i].bi_params);
    $(".form-book [name=bshowif]").val(bd[i].showif);
    create_parentbook_options(function () {
      $(".form-book [name=parentbookid]").val(bd[i].parentbookid);
    });
    push_headtitle("book", bd[i].title);
  } else {
    // back
    removeOffset("book");
    $(".form-project").css("display","");
    $(".form-book").css("display","none");
    pop_headtitle("book");
  }
}

function
navigate_bd_edit(bookdefid) 
{
  saveOffset("book");
  select_bd(function () {
    select_bdpage(bookdefid, function () {
      for(var i=0; i<bd.length; i++) {
        if (bd[i].id != bookdefid)
          continue;
        toggle_bd_edit(i);
        break;
      }
    });
  });
}

function
toggle_bd_create() {
  if (!$(".form-bookcreate").is(":visible")) {
    $(".form-project").css("display","none");
    $(".form-bookcreate").css("display","");
    $(".form-bookcreate input").val("");
    push_headtitle("book", $("#btn-createbdProject").text());
  } else {
    $(".form-project").css("display","");
    $(".form-bookcreate").css("display","none");
    pop_headtitle("book");
  }
}

function
bind_compareBookdata()
{
   $("#manageBookdataContent table").attr("compare", "yes");
   $("#manageBookdataContent table tbody tr").unbind("click").click(function() {
     var cleft = $("#manageBookdataContent table").attr("compare_bookid_left");
     var cright = $("#manageBookdataContent table").attr("compare_bookid_right");

     function add_sel(tr, rl) {
       $("#manageBookdataContent table").attr("compare_bookid_"+rl, $(tr).attr("data-bookid"));
       $("#manageBookdataContent tfoot td").text("Select "+(rl == "left"?"right":"left")+" side for compare");
       $(tr).addClass("selected selected_"+rl);
     }
     function remove_sel(tr, rl) {
       $(tr).removeClass("selected selected_"+rl);
       $("#manageBookdataContent table").removeAttr("compare_bookid_"+rl);
       $("#manageBookdataContent tfoot td").text("Select "+(rl == "left"?"left":"right")+" side for compare");
     }
     function start_compare() {
         // start compare
         $("#manageBookdataContent tfoot td").text("Compare");
         cleft = $("#manageBookdataContent table").attr("compare_bookid_left");
         $("#manageBookdataContent tbody tr[data-bookid="+cleft+"] td a").trigger("click");
     }
     if (cright && cleft) {
       if (cright == $(this).attr("data-bookid"))
         remove_sel($(this), "right");
       if (cleft == $(this).attr("data-bookid")) {
         remove_sel($(this),"left");
       } 
     } else {
       if (cleft) {
         if (cleft == $(this).attr("data-bookid"))
           remove_sel($(this), "left");
         else {
           add_sel($(this), "right");
           if (cleft)
             start_compare();
         }
       } else {
         if (cright == $(this).attr("data-bookid"))
           remove_sel($(this), "right");
         else {
           add_sel($(this), "left");
           if (cright)
             start_compare();
         }
       }
     }
   });
   $("#manageBookdataContent tfoot").show();
   $(".form-manageBookdata .btn-compare").text("End compare mode");
}

function
toggle_compareBookdata() 
{
  if ($("#manageBookdataContent table").attr("compare")) {
     $("#manageBookdataContent table").removeAttr("compare compare_bookid_left compare_bookid_right");
     $("#manageBookdataContent table tbody tr").removeClass("selected selected_right selected_left");
     $("#manageBookdataContent table tbody tr").unbind("click");
     $("#manageBookdataContent tfoot").hide();
     $("#manageBookdataContent tfoot td").text("Select left side for compare");
     $(".form-manageBookdata .btn-compare").text("Start compare mode");
  } else {
     bind_compareBookdata();
  }
}

function
toggle_manageBookdata()
{
  if (!$(".form-manageBookdata").is(":visible")) {
    push_headtitle("book", $("#btn-manageBookdata").text());
    $(".form-project").css("display","none");
    $(".form-manageBookdata").css("display","");
    select_pbooks($(".form-project [name=id]").val(), display_manageBookdata);
  } else {
    $(".form-manageBookdata").css("display","none");
    $(".form-project").css("display","");
    $(".form-manageBookdata .btn-compare").hide();
    pop_headtitle("book");
  }
}

function
get_bookdata(par, callbackfn)
{
  par.status++;
  if(par.status == 1) {
    if (Object.keys(pbdef).length == 0)
       return okDialog("booklist is empty", function() {
      toggle_manageBookdata();
       });
    par.rootbook=[];
    backendCall("tableSelect",
      { tableName:"kipus_pagedefinition pd, kipus_bookpages bp",
        where:"pd.id = bp.pagedefid AND "+
              "bp.bookdefid in ("+hashKeysAsArray(pbdef).join(',')+")" ,
        orderBy:"pagetype desc" },
      function(res, resultPar) {
        par.pdidHash={}; par.pn2b={}; par.lookupCols = {}; par.bt={};
        par.idlev={}, par.hdrlev={};
        par.tableNames=[]; par.tableData={}; par.bodyTables={};
        par.pdattrHash={};
        par.pn2b2={};
        for(var i1=0; i1<res.length; i1++) {
          var r = res[i1];
          if(r.pagetype != "HEADER" && r.pagetype != "BODY")
            continue;
          if(!par.bt[r.bookdefid])
            par.bt[r.bookdefid] = [ r.tablename];
          else
            par.bt[r.bookdefid].push(r.tablename);

          if(r.pagetype == "HEADER") {
            pbdef[r.bookdefid].header = r;
            par.pdidHash[r.pagedefid] = r.tablename;
            par.pn2b[r.tablename] = pbdef[r.bookdefid];
            par.tableNames.push(r.tablename);
            if(pbdef[r.bookdefid].parentbookid == null) {
              par.rootbook.push(pbdef[r.bookdefid]);
              par.idlev[r.bookdefid] = par.hdrlev[r.tablename] = 0;
            }
            var st = r.shorttitle;
            st.replace(/{([^}.]*)\.([^}.]*)}/g, function(all, s1, s2) { // {{
              par.lookupCols[s1] = 1; return "";
            });
          }
           
          if(r.pagetype == "BODY" && r.subpageparam == '') {
            par.bodyTables[r.tablename] = 1;
            par.tableNames.push(r.tablename);
            par.pn2b2[r.tablename] = r;
            par.pdidHash[r.pagedefid] = r.tablename;
            var st = r.shorttitle;
            st.replace(/{([^}.]*)\.([^}.]*)}/g, function(all, s1, s2) { // {{
              par.lookupCols[s1] = 1; return "";
            });
          }
        }

        for(var i0=0; i0<10; i0++) {  // compute the book depth for insert
          var missing = false;
          for(var i1=0; i1<res.length; i1++) {
            var r = res[i1];
            if(r.pagetype != "HEADER")
              continue;
            var pbid = pbdef[r.bookdefid].parentbookid;
            if(pbid == null)
              continue;
            if(typeof par.idlev[pbid] == "undefined") {
              missing=true;
            } else {
              par.hdrlev[r.tablename] =
              par.idlev[r.bookdefid] = par.idlev[pbid]+1;
            }
          }
          if(!missing)
            break;
        }

        par.tableIdx = 0;
        get_bookdata(par);
      });
    return;
  }

  if(par.status == 2) { // lookup table metadata
    par.lookupArr = []; par.lookupTbl = {}; par.lookupTblRowid = {}; par.lookupIdx = 0;
    par.tableRowTargetCol = {}; par.tableRowLookup = {};
    var la = hashKeysAsArray(par.lookupCols);
    if(!la.length)
      return get_bookdata(par);
    backendCall("tableSelect",
      { tableName:"kipus_pageattributes",
        where:"pagedefid in ("+Object.keys(par.pdidHash).join(',')+") AND "+
              "columnname in ('"+la.join("','")+"')" },
      function(res, resultPar) {
        for(var i1=0; i1<res.length; i1++) {
          var r = res[i1];
          var cp = r.constraintparam.replace(/ .*/,'');
          if (r.constrainttype == "tableRows") {
            if (cp.indexOf("target:") == 0) {
              // tableRows special treatment
              cp = r.constraintparam.split(" ");
              var ch={};
              for(var i2=0; i2<cp.length; i2++) {
                var o = cp[i2].indexOf(':');
                if(o > 0)
                  ch[cp[i2].substr(0,o)] = cp[i2].substr(o+1);
              }
              cp = ch.target;
              par.tableRowTargetCol[ch.target] = ch.prefix+"TARGETID";
            }
          }
          par.lookupArr.push(cp);
          par.lookupCols[r.columnname] = cp;
        }
        get_bookdata(par);
      });
    return;
  }
  if(par.status == 3) { // lookup display names of page attributes
    if (Object.keys(par.pdidHash).length == 0)
       return get_bookdata(par);
    backendCall("tableSelect",
      { tableName:"kipus_pageattributes",
        where:"pagedefid in ("+Object.keys(par.pdidHash).join(',')+")" },
      function(res, resultPar) {
        for(var i1=0; i1<res.length; i1++) {
          var r = res[i1];
          var table = par.pdidHash[r.pagedefid];
          if (!par.pdattrHash[table])
            par.pdattrHash[table] = {};
          par.pdattrHash[table][r.columnname] = r;
        }
        get_bookdata(par);
      });
    return;
  }

  if(par.status == 4) { // get the table content
    if (par.tableNames.length == 0)
      return get_bookdata(par);
    var tbl = par.tableNames[par.tableIdx++];
    if (par.tablename) {
      var idx = null;
      for(var id in par.bt) {
        for (var i=0; i<par.bt[id].length; i++) {
           if (par.bt[id][i] == par.tablename)
             idx = id;
        } 
      }
      var found = false; 
      if (idx) {
        for (var i=0; i<par.bt[idx].length; i++) {
          if (par.bt[idx][i] == tbl) {
            found = true; 
          }
        }
      }
      if (!found) {
        log("skipping " + tbl);
        return get_bookdata(par);
      }
    }
    backendCall("tableSelect", { tableName:tbl },
      function(res, resultPar) {
        par.tableData[tbl] = res;
        if(par.tableIdx < par.tableNames.length)
          par.status--;
        get_bookdata(par);
      });
    return;
  }

  if(par.status == 5) {
    if(par.lookupArr.length == par.lookupIdx)
      return get_bookdata(par);
    par.status--;
    var tbl = par.lookupArr[par.lookupIdx++];
    backendCall("tableSelect", { tableName:tbl },
      function(res, resultPar) {
        var hash = {};
        var hash2 = {};
        for(var i1=0; i1<res.length; i1++) {
          hash[res[i1].id] = res[i1];
          var idx = par.tableRowTargetCol[tbl] ?  
                    res[i1][par.tableRowTargetCol[tbl]] :
                    res[i1].rowid;
          if(idx)
            hash2[idx] = res[i1];
        }
        par.lookupTbl[tbl] = hash;
        par.lookupTblRowid[tbl] = hash2;
        
        get_bookdata(par);
      });
  }
  if(par.status == 6) {
    var sql = "SELECT bd.id as bookid, bd.parentbookid FROM "+
        "kipus_projectbooks pb, kipus_bookdefinition bd "+
        "WHERE bd.id=pb.bookdefid";
    backendCall("tableCmd", { sql:sql },
          function(res){
            var hash = {}
            for(var i1=0; i1<res.length; i1++)
              hash[res[i1].bookid] = res[i1].parentbookid;
             par.parentbooks = hash;
             get_bookdata(par);
        });
  }
  if(par.status == 7) {
    var sql = "select concat(bookid, '/',foreignRowId) as clientid, id from kipus_rows";
    backendCall("tableCmd", { sql:sql },
          function(res){
            var hash = {}
            for(var i1=0; i1<res.length; i1++)
              hash[res[i1].clientid] = res[i1].id;
             par.client2rowid = hash;
             get_bookdata(par);
        });
  }
  if(par.status == 8) { // lookup tableRow page attributes
    if (Object.keys(par.tableRowTargetCol).length == 0)
       return get_bookdata(par);
    var sql = "select d.tablename, a.columnname, a.constrainttype, a.constraintparam from kipus_pageattributes a "+
              "inner join kipus_pagedefinition d on d.id=a.pagedefid "+
              "where a.pagedefid in (select id from kipus_pagedefinition where tablename in ('"+Object.keys(par.tableRowTargetCol).join("','")+"')) "+
              " and a.constrainttype='singleFromTable' ";
    backendCall("tableCmd", { sql:sql },
          function(res){
             for(var i1=0; i1<res.length; i1++) {
               var r = res[i1];
               if (!par.tableRowLookup[r.tablename])
                 par.tableRowLookup[r.tablename] = {};
               par.tableRowLookup[r.tablename][r.columnname] = r.constraintparam.split(" ")[0];
             }
             get_bookdata(par);
        });
  }
  if(par.status == 9) {
    if (par.callbackfn)
      return par.callbackfn();
    return;
  }
}


function
display_manageBookdata()
{
  var par = { status: 0, callbackfn: do_display_manageBookdata };
  get_bookdata(par);
  function do_display_manageBookdata() {
    var html = '';
    par.tableNames.sort(function(a,b) {
      var at = par.pn2b[a]?par.pn2b[a].title:a;
      var bt = par.pn2b[b]?par.pn2b[b].title:b;
      return at.localeCompare(bt);
    });
    for(var i0 = 0; i0<par.rootbook.length; i0++) {
      var rbh = par.rootbook[i0].header;
      var rbd = par.tableData[rbh.tablename];
      rbd.sort(function(a,b) {
        if (!a.DISPLAYNAME || !b.DISPLAYNAME)
          return a.id - b.id;
        return a.DISPLAYNAME.localeCompare(b.DISPLAYNAME);
      });

      par.bodyCount={};
      for(var bt in par.bodyTables) {
        var td = par.tableData[bt];
        for(var i1=0; i1<td.length; i1++) {
          var bookId = td[i1].bookid;
          if(par.bodyCount[bookId]) {
            par.bodyCount[bookId].count++
          }
          else
            par.bodyCount[bookId] = { count: 1, tn: bt };
        }
      }
      for(var i1=0; i1<rbd.length; i1++) {
        var r = rbd[i1];
        var st = (rbh.shorttitle ? rbh.shorttitle : par.rootbook[i0].title);
        st = doReplace(st, r);

        html += makeRow(rbh.tablename, 0, r, st, par.rootbook[i0].title);
        for(var i2=0; i2<par.tableNames.length; i2++) {
          var tbl = par.tableNames[i2];
          if(tbl == rbh.tablename)
            continue;
          var b = par.pn2b[tbl];
          if(!b)  // body table
            continue;
          var bh = b.header;
          var bd = par.tableData[tbl];
          for(var i3=0; i3<bd.length; i3++) {
            var sr = bd[i3];
            if(sr.rootbookid != r.bookid)
              continue;
            var st = (bh.shorttitle ? bh.shorttitle : b.title);
            st = doReplace(st, sr);
            html += makeRow(bh.tablename, par.hdrlev[bh.tablename],
                                sr, st, b.title);

          }
        }
      }
    }
    $("#manageBookdataContent tbody").html(html);
    
    $("#manageBookdataContent .btn-link.remove").click(function() {
        var tr = $(this).closest("tr");
        $("div#dialog").html(trHtml.bookdata_delete[0]);
        $("div#dialog").dialog({
          dialogClass:"no-close", buttons: [
            {text:trHtml.dlg[2], click:function(){
                doDelete({ tbl:$(tr).attr("data-table"),
                           bookid:$(tr).attr("data-bookid"),
                           rootbookid:$(tr).attr("data-rootbookid"),
                           status:0 });
              $(this).dialog("close");
            }},
            {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
        });
    });
    if ($("#manageBookdataContent table").attr("compare")) {
       bind_compareBookdata();
    }
    $("#manageBookdataContent td a.btLink").unbind("click").click(function(event) {
      function
      display_bodyTables(p)
      {
         log("display bodyTables");
         saveOffset("project");
         push_headtitle("project", "Body Tables");
         $("div.form-manageBookdata").hide();
         $("div.form-bodyTables").show();
         var html = "";
         for (var i=0; i<p.table.length; i++) {
           var r = p.table[i];
           if (r.bookid != p.bookid || r.rootbookid != p.rootbookid)
             continue;
           var st = (p.bd.shorttitle ? p.bd.shorttitle : p.bd.title);
           st = doReplace(st, r);
           html+= '<tr rowid="'+r.rowid+'" id="'+r.id+'">'+
                  '<td align="center"><i class="btn-link remove glyphicon glyphicon-remove red"></i></td>'+
                  '<td><span>'+st+'</span></td>'+
                  '<td>'+p.bd.displayname+'</td>'+
                '</tr>';
         }
         $("div.form-bodyTables table tbody").html(html);
         $("div.form-bodyTables table tbody td i.remove").click(function() {
           var tr = $(this).closest("tr");
           log("delete book");
           var rowid = $(tr).attr("rowid");
           var id = $(tr).attr("id");
           var cmds = [];
           cmds.push({ fn: "tableDelete", tableName:"kipus_rows",
                        filterCol:'id', filterVal: rowid });
           cmds.push({ fn: "tableDelete", tableName:p.bd.tablename,
                        filterCol:'id', filterVal: id });
           backendCall("tableBatch", {commands:cmds },
             function(){
              log("deleted book and kps_rows");
              $(tr).remove();
              if (par.bodyCount[p.bookid].count>0) {
                par.bodyCount[p.bookid].count--;
                // update bodyCount in table and in par.tableData 
                $(p.span).html(par.bodyCount[p.bookid].count);
                for (var i=0; i<par.tableData[p.bd.tablename].length; i++) {
                  var r = par.tableData[p.bd.tablename][i];
                  if (r.id == id) {
                    // remove element from array
                    par.tableData[p.bd.tablename].splice(i, 1); 
                    break;
                  }
                } 
              }
           });
  
         });
         
         $("div.form-bodyTables .btn.cancel").unbind("click").click(function() {
             // back clicked
             $("div.form-bodyTables").hide();
             $("div.form-manageBookdata").show();
             removeOffset("project");
             pop_headtitle("project");
             loadOffset("project");
         });
      }
      var bookid = $(this).closest("tr").attr("data-bookid");
      var rootbookid = $(this).closest("tr").attr("data-rootbookid");
      var table = $(this).attr("table");
      display_bodyTables({ bookid: bookid, rootbookid: rootbookid, table: par.tableData[table], bd: par.pn2b2[table], span: $(this).find("span.bodyCount") });
    });
    $("#manageBookdataContent td a.details").unbind("click").click(function(event) {
       var copyClicked = {};
       var compare = $("#manageBookdataContent table").attr("compare");
       var cleft =  $("#manageBookdataContent table").attr("compare_bookid_left");
       var cright =  $("#manageBookdataContent table").attr("compare_bookid_right");
       if (!cleft || !cright)
         compare = false; 
       if (compare)
         $(".form-manageBookdataDetails").addClass("compare");
       else
         $(".form-manageBookdataDetails").removeClass("compare");
       event.stopPropagation();
       function
       pointer2image(val)
       {
         var imgRe = new RegExp("^\\[deferred:([A-Z0-9_]+/[0-9]+/[A-Z0-9_]+)\\]$");
         var reRes = imgRe.exec(val);
         if(reRes != null)
           return backendPrefix+"/dbImage?imageid="+reRes[1];

         imgRe = new RegExp("^([^;]*);data:image/[^;]+;base64,");
         reRes = imgRe.exec(val);
         if(reRes !== null)
           return val.substr(reRes[1].length+1);
         return "";
       }
       var table = $(this).attr("data-table");
       var id = $(this).attr("data-id");
       // bookid and rootbookid needed delete in details
       var bookid = $(this).closest("tr").attr("data-bookid");
       var rootbookid = $(this).closest("tr").attr("data-rootbookid");
       log("show details of " + table + " " +id);
       var row;
       for (var i=0; i<par.tableData[table].length; i++) {
          var r = par.tableData[table][i];
          if (r.id == id) 
            row = r;
       }
       var colKeys = Object.keys(row);
      
       colKeys.sort(function(a,b) {
         var colordera = par.pdattrHash[table][a]?par.pdattrHash[table][a].columnorder:0;
         var colorderb = par.pdattrHash[table][b]?par.pdattrHash[table][b].columnorder:0;
         return colordera - colorderb;
       });
       function n(a) {return a == undefined ? "0" : a; }
       function e(a) {return a == undefined ? ""  : a; }
       function
       luDpyCol(c, cp, cVal)
       {
         var r = { i:"id" };
         if(cp.length == 3)               r.n = cp[2].split(" ")[0];
         else                             r.n = "DISPLAYNAME";
         return r;
       }
       function getLuTable(tableName, nextFn) {
          backendCall("tableSelect", { tableName: tableName },
          function(res){
            par.lookupTbl[tableName] = res; 
            if (--par.luTodoIdx==0)
              nextFn();
          });
       }
       par.luTodo = {};
       for (var i=0; i<colKeys.length; i++) {
         // load lookup tables for details
         var col=colKeys[i];
         var pdattr = par.pdattrHash[table][col];
         if (pdattr == undefined)
           continue;
         if (pdattr.constrainttype == "singleFromTable" || pdattr.constrainttype == "multiFromTable") {
           var cp = pdattr.constraintparam.split(" ");
           var tableName = cp[0];
           if (!par.lookupTbl[tableName]) {
             par.luTodo[tableName] = 1;
           }
         }
       }
       if (Object.keys(par.luTodo).length == 0)
         showDetailsPage();
       else {
         par.luTodoIdx = Object.keys(par.luTodo).length;
         for (var tbl in par.luTodo) {
           getLuTable(tbl, showDetailsPage)
         }
       }
       
       function showDetailsPage() {
         var html = "";
         for (var i=0; i<colKeys.length; i++) {
           var col=colKeys[i];
           var pdattr = par.pdattrHash[table][col];
           if (pdattr == undefined) {
             html += "<tr col='"+col+"' rowidx='"+i+"'>"+
               (compare?"<td class='copy'></td>":"")+"<td style='font-weight:bold'>"+col +"</td>";
             html += "<td>"+row[col]+"</td></tr>";
           } else {
             html += "<tr col='"+col+"' rowidx='"+i+"'>"+
               (compare?"<td class='copy'></td>":"")+"<td style='font-weight:bold'>"+pdattr.displayname +"</td>";
             if (pdattr.constrainttype == "foto" || pdattr.constrainttype == "signature")
               html += "<td><img class='db_image' src='"+ pointer2image(row[col])+"'></td>";
             else if (pdattr.constrainttype == "num")
               html += "<td> "+n(row[col])+"</td></tr>";
             else if (pdattr.constrainttype == "singleFromTable" || pdattr.constrainttype == "multiFromTable") {
                var cp = pdattr.constraintparam.split(" ");
                var cVal = row[col];
                var iVals = (cVal ? cVal.split(",") : []), iHash={}, ret=[];

                for(var i2=0; i2<iVals.length; i2++)
                  iHash[iVals[i2]] = 1;
                var ci = luDpyCol(pdattr, cp, cVal);
                var tbl = par.lookupTbl[cp[0]];
                if (!(tbl instanceof Array)) {
                  tbl = [];
                  for (var i in par.lookupTbl[cp[0]])
                    tbl.push(par.lookupTbl[cp[0]][i]);
                }
                for(var i2=0; i2<tbl.length; i2++) {
                  var key = tbl[i2][ci.i];
                  if(ci.i == "bookid")
                    key += "/0";
                  if(iHash[key])
                    ret.push(tbl[i2][ci.n]);
                }
                html += "<td>" +  ret.join("<br>") + "</td></tr>";
             }
             else
               html += "<td> "+e(row[col])+"</td></tr>";
           }
         }
         if (compare && cright == bookid) {
           $("div.form-manageBookdataDetails table.compare-right").show();
           var left = {};
           $("div.form-manageBookdataDetails table tbody tr").each(function() {
              var col = $(this).attr("col");
              var val = $(this).find("td:nth-child(3)").html();
              left[col] = val;
           });
           $("div.form-manageBookdataDetails table.compare-right tbody").empty().append(html);
           $("div.form-manageBookdataDetails table.compare-right").attr("data-id", id);
           $("div.form-manageBookdataDetails table.compare-right").attr("data-bookid", bookid);
           $("div.form-manageBookdataDetails table.compare-right").attr("data-rootbookid", rootbookid);
           $("div.form-manageBookdataDetails table.compare-right").attr("data-table", table);
           // show diffs in compare view
           $("div.form-manageBookdataDetails table.compare-right tbody tr").each(function() {
              var col = $(this).attr("col");
              var val = $(this).find("td:nth-child(3)").html();
              if (left[col] != val) {
                $(this).addClass("cmp-diff");
                if ($.inArray(col, ["id","modified","bookid","rootbookid","modifiedby","rowid"]) == -1 &&
                  table == $("div.form-manageBookdataDetails table:first").attr("data-table")) {
                  $(this).find("td:first").html("<i class='glyph glyphicon glyphicon-arrow-left'></i>");
                  $("div.form-manageBookdataDetails table:first tbody tr[rowidx="+$(this).attr("rowidx")+"] td:first")
                    .html("<i class='glyph glyphicon glyphicon-arrow-right'></i>");
                }
              }
           });
           $("div.form-manageBookdataDetails table tbody td.copy i").click(function() {
             var rowidx = $(this).closest("tr").attr("rowidx");
             var col = $(this).closest("tr").attr("col");
             var val = $(this).closest("tr").find("td:nth-child(3)").html();
             copyClicked[rowidx] = { id: $(this).closest("table").attr("data-id"),
                                     col: col };
             $("div.form-manageBookdataDetails table tbody tr[rowidx="+rowidx+"]").removeClass("cmp-diff");
             $("div.form-manageBookdataDetails table tbody tr[rowidx="+rowidx+"] td.copy").empty();
             $("div.form-manageBookdataDetails table tbody tr[rowidx="+rowidx+"] td:nth-child(3)").html(val);
           });
           // align row heights of both table rows
           $("div.form-manageBookdataDetails table:first tbody tr").each(function() {
              var col = $(this).attr("col"); 
              if ($("div.form-manageBookdataDetails table.compare-right tbody tr[col="+col+"]").length) {
                var rh = $(this).height();
                var lh = $("div.form-manageBookdataDetails table.compare-right tbody tr[col="+col+"]").height();
                if (rh != lh) {
                  $(this).height(Math.max(rh, lh));
                  $("div.form-manageBookdataDetails table.compare-right tbody tr[col="+col+"]").height(Math.max(rh, lh));
                }
              }
           });
         } else {
           $("div.form-manageBookdataDetails table.compare-right").hide();
           saveOffset("project");
           push_headtitle("project", "Details");
           $("div.form-manageBookdata").hide();
           $("div.form-manageBookdataDetails table tbody").empty().append(html);
           $("div.form-manageBookdataDetails table").attr("data-id", id);
           $("div.form-manageBookdataDetails table").attr("data-bookid", bookid);
           $("div.form-manageBookdataDetails table").attr("data-rootbookid", rootbookid);
           $("div.form-manageBookdataDetails table").attr("data-table", table);
         } 
         function go_back() {
           function do_go_back() {
             $("div.form-manageBookdataDetails").hide();
             $("div.form-manageBookdata").show();
             removeOffset("project");
             pop_headtitle("project");
             loadOffset("project");
           }
           if (compare) {
              // reset compare
              $("#manageBookdataContent table").removeAttr("compare_bookid_left compare_bookid_right");
              $("#manageBookdataContent table tbody tr").removeClass("selected selected_left selected_right");
              $("#manageBookdataContent tfoot td").text("Select left side for compare");
              if (Object.keys(copyClicked).length > 0) {
                 // changes detected
                 var ids = {};
                 for (var el in copyClicked) {
                   ids[copyClicked[el].id] = 1;
                 }
                 var dataid = { right: $("div.form-manageBookdataDetails table.compare-right").attr("data-id"),
                                left: $("div.form-manageBookdataDetails table:first").attr("data-id") };
                 if (!ids[dataid.left] && !ids[dataid.right]) {
                   return do_go_back();
                 } 
                 var html = sprintf(trHtml.bookdata_delete[2], ids[dataid.left]?"right":"left");
                 if (ids[dataid.left] && ids[dataid.right]) {
                   html =  '<div class="form-group"><label class="control-label">'+trHtml.bookdata_delete[1]+'</label></div>'+
                            '<div class="form-group row">'+
                            '<label>'+
                              '<input type="checkbox" checked="true" id="copy_left_side" /> Left side'+
                            '</label></div>'+
                  '<div class="form-group row"><label>'+
                  '<input type="checkbox" checked="true" id="copy_right_side"></input> Right side</label></div>';
                 }
                 $("div#dialog").html(html);
                 $("div#dialog").dialog({
                   dialogClass:"no-close", buttons: [
                     {text:trHtml.dlg[2], click:function(){
                       var cmds = [];
                       for (var i in copyClicked) {
                         var from = copyClicked[i].id;
                         var col = copyClicked[i].col;
                         var to = from == dataid.left ? dataid.right: dataid.left; 
                         cmds.push({ fn:"tableCmd", sql: "UPDATE " + table + " SET " + col + " = " + 
                                     "( SELECT " + col + " FROM  ( SELECT * FROM "+ table +") AS B  WHERE id = " + from + ") " +
                                     "WHERE id = " + to });
                       }
                       backendCall("tableBatch", {commands:cmds },
                         function(){
                            log("commited changes");
                            backendCall("tableSelect", { tableName:table },
                              function(res, resultPar) {
                                par.tableData[table] = res;
                                do_go_back();
                              });
                       });
                       $(this).dialog("close");
                     }},
                     {text:trHtml.dlg[3], click:function(){
                       do_go_back();
                       $(this).dialog("close");
                     }},
                     {text:trHtml.dlg[1],click:function(){$(this).dialog("close");}}]
                 });
              } else
                do_go_back();
           } else 
             do_go_back();
         }
         if (compare && cright == bookid && $("div.form-manageBookdataDetails table:first").attr("data-table") == 
                        $("div.form-manageBookdataDetails table.compare-right").attr("data-table")) {
           // right called
           var btn = "<span><i style='font-size:1.3em' class='glyph glyphicon glyphicon-arrow-{1}'></i>"+
                     " Delete and assign bookdata to {1} side </span>";
           $("div.form-manageBookdataDetails table[data-bookid="+cleft+"] tfoot button.btn-delete").html(sprintf(btn, "right"));
           $("div.form-manageBookdataDetails table[data-bookid="+cright+"] tfoot button.btn-delete").html(sprintf(btn, "left"));
         } else {
           $("div.form-manageBookdataDetails table tfoot button.btn-delete").text("Delete");
           $("div.form-manageBookdataDetails table tfoot button.btn-delete").show();
         }

         $("div.form-manageBookdataDetails table tfoot button.btn-delete").unbind("click").click(function() {
            var bid = $(this).closest("table").attr("data-bookid");
            var rbid = $(this).closest("table").attr("data-rootbookid");
            var doAssign = compare && $("div.form-manageBookdataDetails table:first").attr("data-table") == 
                                 $("div.form-manageBookdataDetails table.compare-right").attr("data-table");
            $("div#dialog").html(doAssign ? sprintf(trHtml.bookdata_delete[3], (cleft == bid?"right":"left")): trHtml.bookdata_delete[0]);
            $("div#dialog").dialog({
              dialogClass:"no-close", buttons: [
                {text:trHtml.dlg[2], click:function(){
                  if (compare && $("div.form-manageBookdataDetails table:first").attr("data-table") == 
                                 $("div.form-manageBookdataDetails table.compare-right").attr("data-table")) {
                    var tgt_tbl = (cright == bid ?  $("div.form-manageBookdataDetails table:first") :
                         $("div.form-manageBookdataDetails table.compare-right"));
                    doDeleteAndAssign({ tbl:table,
                                       copy: copyClicked,
                                       bookid:{ src: bid, tgt: $(tgt_tbl).attr("data-bookid") },
                                       rootbookid: { src: rbid, tgt: $(tgt_tbl).attr("data-rootbookid") },
                                       status:0, nextfn: function() {
                                         go_back();
                                         // reload bookdata table
                                         select_pbooks($(".form-project [name=id]").val(), display_manageBookdata);
                                       }});
                  }
                  else
                    doDelete({ tbl:table,
                               bookid:bookid,
                               rootbookid:rootbookid,
                               status:0, nextfn: go_back});

                  $(this).dialog("close");
                }},
                {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
            });
         }); 
         $("div.form-manageBookdataDetails").show();
         $("div.form-manageBookdataDetails .btn.cancel").unbind("click").click(go_back);
         if (compare && cleft == bookid) {
           // call right
           $("#manageBookdataContent tbody tr[data-bookid="+cright+"] td a").trigger("click");
         }
         if (compare) 
           $("div.form-manageBookdataDetails table tfoot").show();
         else
           $("div.form-manageBookdataDetails table tfoot").hide();
       }
    });
    $(".form-manageBookdata .btn-compare").show();
  }

  function
  makeRow(tablename, level, row, text, type)
  {
    while(level--)
      text = '&nbsp;&nbsp;&nbsp;&nbsp;'+text;
    var bc = par.bodyCount[row.bookid]?par.bodyCount[row.bookid].count:0;
    var ret =
          '<tr data-table="'+tablename+'" data-bookid="'+row.bookid+
            '" data-rootbookid="'+row.rootbookid+'">'+
            "<td align='center'><i class='btn-link remove glyphicon glyphicon-remove red'></i></td>"+
            '<td><span>'+text+'</span><a class="details" data-table="'+tablename+'" data-id="'+row.id+'" style="cursor: pointer;"> Details</a></td>'+
            '<td>'+type+'</td>'+
            '<td>'+(bc ? '<a class="btLink" data-id="'+row.id+'" table="'+par.bodyCount[row.bookid].tn+'" style="cursor: pointer;"><span class="bodyCount">'+bc +"</span></a>": 0)+'</td>'+
          '</tr>';
    return ret;
  }

  function
  doDeleteAndAssign(dp)
  {
    dp.status++;
    if(dp.status == 1) {
       // execute cmp-diff changes first
       dp.cmds = [];
       var ids = {};
       for (var el in dp.copy) {
         ids[dp.copy[el].id] = 1;
       }
       var dataid = { right: $("div.form-manageBookdataDetails table.compare-right").attr("data-id"),
                      left: $("div.form-manageBookdataDetails table:first").attr("data-id") };
       for (var i in dp.copy) {
         var from = dp.copy[i].id;
         var col = dp.copy[i].col;
         var to = from == dataid.left ? dataid.right: dataid.left; 
         dp.cmds.push({ fn:"tableCmd", sql: "UPDATE " + dp.tbl + " SET " + col + " = " + 
                     "( SELECT " + col + " FROM  ( SELECT * FROM "+ dp.tbl +") AS B  WHERE id = " + from + ") " +
                     "WHERE id = " + to });
       }
      doDeleteAndAssign(dp);
      return;
    }
    if(dp.status == 2) {
      // kipus_rows
      backendCall("tableSelect", { tableName:"kipus_rows", filterCol:'bookid', filterVal: dp.bookid.tgt},
        function(res, resultPar) {
          var foreignRowId = 0;
          for (var i=0; i<res.length; i++) {
            foreignRowId = Math.max(foreignRowId, res[i].foreignRowId);
          }
          backendCall("tableSelect", { tableName:"kipus_rows", filterCol:'bookid', filterVal: dp.bookid.src},
          function(res, resultPar) {
            for (var i=0; i<res.length; i++) {
              if (res[i].foreignRowId == 0) {
                dp.cmds.push({ fn: "tableDelete", tableName:"kipus_rows",
                            filterCol:'id', filterVal: res[i].id });
              } else {
                dp.cmds.push({ fn:"tableUpdate", tableName:"kipus_rows", 
                              columns: { foreignRowId: ++foreignRowId,  bookid: dp.bookid.tgt, rootbookid: dp.rootbookid.tgt }, 
                              filterCol: "id", filterVal: res[i].id });
              }
            }
            doDeleteAndAssign(dp);
          });
        });
      return;
    }
    if(dp.status == 3) {
      // reassign bookdata (body pages)
      var id = par.pn2b[dp.tbl].id;
      var bt = par.bt[id];
      dp.tblIdx = 0;
      for (var i=0; i<bt.length; i++) {
        if (bt[i] == dp.tbl) {
          dp.cmds.push({ fn: "tableDelete", tableName:dp.tbl,
                      filterCol:'bookid', filterVal: dp.bookid.src });
        } else {
          dp.cmds.push({ fn:"tableUpdate", tableName:bt[i],
                        columns: { bookid: dp.bookid.tgt, rootbookid: dp.rootbookid.tgt }, 
                        filterCol: "bookid", filterVal: dp.bookid.src});
        } 
      }
      doDeleteAndAssign(dp);
      return;
    }
    if(dp.status == 4) {
      // update bookids via constraintparams
      backendCall("tableSelect",
        { tableName:"kipus_pageattributes",
          where:"constraintparam like '"+dp.tbl+"%'" },
        function(res_pa, resultPar) {
          var pdidHash = {};
          for (var i=0; i<res_pa.length; i++) {
            pdidHash[res_pa[i].pagedefid] = res_pa[i].columnname;
          }
          if (res_pa.length == 0)
            return doDeleteAndAssign(dp);
          backendCall("tableSelect",
            { tableName:"kipus_pagedefinition",
              where:"id in ("+Object.keys(pdidHash).join(',')+")"},
          function(res_pd, resultPar) {
            for (var i=0; i<res_pd.length; i++) {
              var col = pdidHash[res_pd[i].id];
              var cols = {};
              cols["rootbookid"] = dp.rootbookid.tgt;
              cols[col] = dp.rootbookid.tgt+"/0"; 
              dp.cmds.push({ fn:"tableUpdate", tableName:res_pd[i].tablename,
                            columns: cols,
                            filterCol: col, filterVal: dp.rootbookid.src+"/0"});
              if (res_pd[i].pagetype == "HEADER") {
                 // also update rootbookid in body pages
                 var id = par.pn2b[res_pd[i].tablename].id;
                 var bt = par.bt[id];
                 for (var j=0; j<bt.length; j++) {
                    dp.cmds.push({ fn:"tableUpdate", tableName:bt[j],
                                  columns: { rootbookid: dp.rootbookid.tgt },
                                  filterCol: "rootbookid", filterVal: dp.rootbookid.src+"/0"});
                 }
              }
            }
            return doDeleteAndAssign(dp);
          });
      });
      return;
    }
    if(dp.status == 5) {
       backendCall("tableBatch", {commands:dp.cmds },
         function(){
          log("commited changes");
          if (dp.nextfn)
             dp.nextfn();
          return;
       });
    }
  }

  function
  doDelete(dp)
  {
    dp.status++;
//log("doDelete " + dp.status);
    if(dp.status == 1) {
      var b = par.pn2b[dp.tbl];
      dp.isRoot = false;
      for(var i1=0; i1<par.rootbook.length; i1++)
        if(par.rootbook[i1] == b)
          dp.isRoot = true;
      dp.tblArr = [ 'kipus_rows' ];
      if(dp.isRoot) {
        for(var b in par.bt)
          dp.tblArr = dp.tblArr.concat(par.bt[b]);
      } else {
        dp.tblArr = par.bt[b.id];
      }
      dp.tblIdx = 0;
      doDelete(dp);
      return;
    }
    if(dp.status == 2) {
      if (dp.tblArr.length == 0) {
        doDelete(dp);
        return;
      }
      dp.bigdataCmds = [];
      dp.bdtodo = dp.tblArr.length;
      for(var i0=0; i0<dp.tblArr.length; i0++) {
        (function(idx){
          backendCall("tableSelect", { tableName:dp.tblArr[idx], columns: "id",
                       filterCol: dp.isRoot ? "rootbookid":"bookid", filterVal: dp.bookid},
            function(res, resultPar) {
                if (dp.tblArr[idx] != "kipus_rows" && res.length > 0) {
                  for (var i1=0; i1<res.length; i1++) {
                    var where = "dataid like '"+dp.tblArr[idx]+"/"+res[i1].id+"/%'";
                    log("delete from kipus_bigdata WHERE "+where);
                    dp.bigdataCmds.push({fn:"tableDelete", tableName:"kipus_bigdata", where:where});
                  }
                }
                if (--dp.bdtodo == 0) { 
                  backendCall("tableBatch", { commands:dp.bigdataCmds },
                  function(r) {
                    doDelete(dp);
                  });
                }
            }, idx);
        })(i0);
      }
      return; 
    }
    if(dp.status == 3) {
      if (dp.tblArr.length == 0) {
        doDelete(dp);
        return;
      }
      var cmds = [];
      for (var i=0; i<dp.tblArr.length; i++) {
         cmds.push({ fn: "tableDelete", tableName:dp.tblArr[i],
              filterCol: dp.isRoot ? "rootbookid":"bookid", filterVal: dp.bookid});
      }
      //log("delete "+tbl+" where "+dp.where);
      backendCall("tableBatch", { commands:cmds },
      function(r) {
        doDelete(dp);
      });
      return;
    }

    if(dp.status == 4) {
      $("#manageBookdataContent tr[data-"+(dp.isRoot?"rootbookid":"bookid")+"="+dp.bookid+"]").remove();
      if (dp.nextfn)
         dp.nextfn();
      return;
    }
  }

  function
  doReplace(fmt, row)
  {
    fmt = fmt.replace(/{([^}]*)}/g, function(all, s) { // {
      var m = s.match(/^([^.]+)\.([^.]+)$/);
      if(m) {
        var rCol=m[1], luCol=m[2];
        var tblName = par.lookupCols[rCol];
        if(!tblName)
          return okDialog("Title fmt cannot resolve: "+rCol+" ("+s+", 1) (errcode=1)");
        if(!par.lookupTbl[tblName])
          return okDialog("Title fmt cannot resolve: "+tblName+" ("+s+", 2) (errcode=2)");
        if(row[rCol] == undefined) {
          return "Title cannot be resolved (UNDEFINED: "+rCol+" is empty in this row) (errcode=3)";
        }
        if(par.lookupTbl[tblName][row[rCol]] == undefined) {
          if (par.lookupTblRowid[tblName]) {
            if (par.tableRowTargetCol[tblName]) {
              if (par.lookupTblRowid[tblName][row[rCol]]) {
                var val = par.lookupTblRowid[tblName][row[rCol]][luCol];
                if (par.tableRowLookup[tblName] && par.tableRowLookup[tblName][luCol] && 
                    par.lookupTbl[par.tableRowLookup[tblName][luCol]]) {
                  // try to resolve displayname from lookup table
                  val = par.lookupTbl[par.tableRowLookup[tblName][luCol]][val].DISPLAYNAME;
                }
                return val;
              }
            } else {
              if (par.lookupTblRowid[tblName][par.client2rowid[row[rCol]]]) {
                return par.lookupTblRowid[tblName][par.client2rowid[row[rCol]]][luCol];
              }
            }
          } 
          return "Title cannot be resolved ("+row[rCol]+" not found in table "+tblName+" ) (errcode=4)";
        }
        if(par.lookupTbl[tblName][row[rCol]] == undefined) {
          return "Title cannot be resolved ("+row[rCol]+" not found in table "+tblName+" ) (errcode=5)";
        }
        return par.lookupTbl[tblName][row[rCol]][luCol];
      }
      return row[s] ? row[s] : '';
    });
    return fmt;
  }
}

function
toggle_external_create() {
  if (!$(".form-externalcreate").is(":visible")) {
    $(".form-project").css("display","none");
    $(".form-externalcreate").css("display","");
    $(".form-externalcreate input").val("");
    $(".form-externalcreate [name=columns]").val("rowid,bookid,modified,modifiedby");
    $("#btn-updateexternal").hide();
    $("#btn-createexternal").show();
    create_external_src_table_options();
    push_headtitle("project", $("#btn-createExternalProject").text());
  } else {
    $(".form-project").css("display","");
    $(".form-externalcreate").css("display","none");
    pop_headtitle("project");
  }
}

function
toggle_external_edit(i) {
  log("toggle external edit " +id);
  if (!$(".form-externalcreate").is(":visible")) {
    var canWrite = hasProjectRight("Projects", "write", $(".form-project [name=id]").val()) || hasProjectRight("AdminAll", "write");
    $(".form-project").css("display","none");
    $(".form-externalcreate").css("display","");
    $(".form-externalcreate input").val("");
    if (canWrite)
      $("#btn-updateexternal").show();
    else
      $("#btn-updateexternal").hide();
    $("#btn-createexternal").hide();
    $(".form-externalcreate [name=id]").val(external[i].id);
    $(".form-externalcreate [name=destination]").val(external[i].destination);
    $(".form-externalcreate [name=direction]").val(external[i].direction);
    $(".form-externalcreate [name=dst_table]").val(external[i].dst_table);
    $(".form-externalcreate [name=columns]").val(external[i].columns);
    $(".form-externalcreate [name=filter]").val(external[i].filter);
    create_external_src_table_options(function () {
      $(".form-externalcreate [name=src_table]").val(external[i].src_table);
    });
    push_headtitle("project", $("#btn-updateexternal").text());
  } else {
    $(".form-project").css("display","");
    $(".form-externalcreate").css("display","none");
    pop_headtitle("project");
  }
}

function
toggle_bd_import() {
  if (!$(".form-import-bd").is(":visible")) {
    $(".form-project").css("display","none");
    $(".form-import-bd").css("display","");
  } else {
    $(".form-project").css("display","");
    $(".form-import-bd").css("display","none");
    pop_headtitle("book");
  }
}

// book page options changed, load values from table
function
bdpage_options_changed() {
  log("bdp oc selected pagedefid=" + $(".form-bdpage [name=pageid]").val());
  if(!$(".form-bdpage [name=pageid]").val()) {
    $(".form-bdpage #pagedefid").val("");
    $(".form-bdpage [name=tablename]").val("");
    $(".form-bdpage [name=displayname]").val("");
    $(".form-bdpage [name=helptext]").val("");
    $(".form-bdpage [name=pagetype]").val("");
    $(".form-bdpage [name=subpageparam]").val("");
    $(".form-bdpage [name=uniquecols]").val("");
    $(".form-bdpage [name=longtitle]").val("");
    $(".form-bdpage [name=shorttitle]").val("");
    $(".form-bdpage [name=importOverwrite]").val("");
    $(".form-bdpage [name=sortby]").val("");
    return;
  }
  backendCall("tableSelect", { tableName:"kipus_pagedefinition" , filterCol:'id', filterVal:$(".form-bdpage [name=pageid]").val()},
    function(res, resultPar) {
      $(".form-bdpage #pagedefid").val(res[0].id);
      $(".form-bdpage [name=tablename]").val(res[0].tablename);
      $(".form-bdpage [name=displayname]").val(res[0].displayname);
      $(".form-bdpage [name=helptext]").val(res[0].helptext);
      $(".form-bdpage [name=pagetype]").val(res[0].pagetype);
      $(".form-bdpage [name=subpageparam]").val(res[0].subpageparam);
      $(".form-bdpage [name=uniquecols]").val(res[0].uniquecols);
      $(".form-bdpage [name=longtitle]").val(res[0].longtitle);
      $(".form-bdpage [name=shorttitle]").val(res[0].shorttitle);
      $(".form-bdpage [name=importOverwrite]").val(res[0].importOverwrite);
      $(".form-bdpage [name=sortby]").val(res[0].sortby);

    });

}

// create bookpage options for selecting pagedefinition
function
create_bdpage_options() {
  var options = "";
  var pages = [];
  $.each(bdpage, function(){
    log("pagedefid: <" + this.pagedefid+">");
    pages.push(this.pagedefid);
  });
  log("create_bdpage_options");
  $(".form-bdpage [name=pageid] option").remove();
  backendCall("tableSelect", { tableName:"kipus_pagedefinition" },
    function(res, resultPar) {
      for(var i=0; i<res.length; i++) {
        if ($.inArray(res[i].id, pages) == -1) {
          options  += "<option value='" + res[i].id +  "'>" + res[i].displayname + " ("+res[i].tablename+")" +"</option>";
          log("page.id=<"+res[i].id + ">");
        }
      }
      $(".form-bdpage [name=pageid]").append(options);
      bdpage_options_changed();
    });
}

// create src_table options for selecting source table for external project tables
function
create_external_src_table_options(callbackfn) {
  var options = "";
  log("create_external_src_table_options");
  $(".form-externalcreate [name=src_table] option").remove();
  var sql = "SELECT pd.tablename, pd.displayname FROM "+
      "kipus_pagedefinition pd, kipus_bookpages bp, kipus_bookdefinition bd, kipus_projectbooks pb "+
      "WHERE pd.id=bp.pagedefid AND (pd.pagetype = 'HEADER' OR pd.pagetype = 'BODY') AND bp.bookdefid =bd.id AND bd.id=pb.bookdefid AND pb.projectid='" + $(".form-project [name=id]").val() + "' ORDER BY pd.tablename";
  backendCall("tableCmd", { sql:sql },
    function(res, resultPar) {
      log("table has rows="+res.length);
      for(var i=0; i<res.length; i++) {
          options  += "<option value='" + res[i].tablename +  "'>" + res[i].tablename + "</option>";
      }
      $(".form-externalcreate [name=src_table]").append(options);
      if (callbackfn)
        callbackfn();
    });
}

// create parentbookid options for selecting book
function
create_parentbook_options(callbackfn) {
  var options = "";
  log("create_parentbook_options");
  $(".form-book [name=parentbookid] option").remove();
  var sql = "SELECT bd.id, bd.title FROM "+
      "kipus_projectbooks pb, kipus_bookdefinition bd "+
      "WHERE bd.id=pb.bookdefid AND pb.projectid='" + $(".form-project [name=id]").val() + "'";
  backendCall("tableCmd", { sql:sql },
    function(res, resultPar) {
      log("table has rows="+res.length);
      options  += "<option value='NULL'></option>";
      for(var i=0; i<res.length; i++) {
          if (res[i].id != $(".form-book [name=id]").val())
            options  += "<option value='" + res[i].id +  "'>" + res[i].title + "</option>";
      }
      $(".form-book [name=parentbookid]").append(options);
      if (callbackfn)
        callbackfn();
    });
}

function
toggle_bdpage_add() {
  if (!$(".form-bdpage").is(":visible")) {
    $(".form-book").css("display","none");
    $(".form-bdpage").css("display","");
    $(".form-bdpage [name=bookid]").val($(".form-book [name=id]").val());
    create_bdpage_options();
    $("#btn-addbdpage").show();
    push_headtitle("book", $("#btn-addbdpage").text());
  } else {
    select_bdpage($(".form-bdpage [name=bookid]").val());
    $(".form-book").css("display","");
    $(".form-bdpage").css("display","none");
    pop_headtitle("book");
  }
}

function
select_bd(callbackfn)
{
  var canWrite = hasProjectRight("Projects", "write", $(".form-project [name=id]").val()) || hasProjectRight("AdminAll", "write");
  log("select book definition");
  backendCall("tableSelect", { tableName:"kipus_bookdefinition" , orderBy:"title"},
    function(res, resultPar) {
      bd = res;
      if (canWrite) {
        $("#btn-updatebd").show();
        $("#btn-createpagebook").show();
      } else {
        $("#btn-updatebd").hide();
        $("#btn-createpagebook").hide();
      }
      $("#bdtable >tbody tr").remove();
      for(var i=0; i<res.length; i++) {
        var row = "<tr><td align='center'><i class='btn-link glyphicon "+(canWrite?glEdit:glView)+"'" +
                  "onclick='toggle_bd_edit(\"" + i + "\")'></i></td>" + (canWrite?
                  "<td align='center'><i title='Delete book' bookname='"+res[i].name+"' booktitle='"+res[i].title+"' class='btn-link glyphicon glyphicon-remove red'" +
                  "onclick='delete_bd(this, \"" + i + "\")'></i></td>":"")+
                  "<td>"+ res[i].title + "</td>" +
                  "<td>"+ res[i].modified + "</td>" +
                  "<td>"+ res[i].modifiedby + "</td></tr>";
        $('#bdtable').find('tbody:last').append(row);
      }
      table_pagination($("#bdtable"));
      if (callbackfn) {
         callbackfn();
      }
    });
}

function
create_external() {
  log("create_external");
  var destination = $(".form-externalcreate [name=destination]").val();
  var direction = $(".form-externalcreate [name=direction]").val();
  var projectid = $(".form-project [name=id]").val();
  var src_table = $(".form-externalcreate [name=src_table]").val();
  var dst_table = $(".form-externalcreate [name=dst_table]").val();
  var columns = $(".form-externalcreate [name=columns]").val();
  var filter = $(".form-externalcreate [name=filter]").val();
  if (!destination||!projectid||!src_table||!dst_table) {
    showAlert(trHtml.external_create[0], "warning");
    return;
  }
  backendCall("tableInsert", { tableName:"kipus_external",
    columns:{ destination:destination, projectid:projectid, direction:direction, src_table:src_table,
              dst_table:dst_table, columns:columns, filter:filter }},
    function(res,resultPar){
        backendCall("externalUpdate", { externalid:res.insertId },
            function(res,resultPar){
               log("external created");
               select_external(projectid); toggle_external_create();
               showAlert(trHtml.external_create[1], "success");
            });
         });
}

function
update_external() {
  log("update_external");
  var externalid=$(".form-externalcreate [name=id]").val();
  var destination = $(".form-externalcreate [name=destination]").val();
  var direction = $(".form-externalcreate [name=direction]").val();
  var projectid = $(".form-project [name=id]").val();
  var src_table = $(".form-externalcreate [name=src_table]").val();
  var dst_table = $(".form-externalcreate [name=dst_table]").val();
  var columns = $(".form-externalcreate [name=columns]").val();
  var filter = $(".form-externalcreate [name=filter]").val();
  var cols = { destination:destination, projectid:projectid, direction:direction, src_table:src_table,
              dst_table:dst_table, columns:columns, filter:filter };
  do_update();
  function do_update() {
    backendCall("tableUpdate", { tableName:"kipus_external", columns: cols,
                                filterCol:  "id", filterVal: externalid},
      function(res,resultPar){
        backendCall("externalUpdate", { externalid:externalid },
            function(res,resultPar){ log("external update" ); toggle_external_edit(); select_external();
                                 showAlert(trHtml.external_update[0], "success");});
      });
  }
}

function
delete_external(i) {
  var externalid = external[i].id;
  var projectid = external[i].projectid;
  $("div#dialog").html(trHtml.external_delete[0]);
  $("div#dialog").dialog({
    dialogClass:"no-close", buttons: [
      {text:trHtml.dlg[2], click:function(){
        backendCall("tableDelete", { tableName:"kipus_external",
              filterCol:'id', filterVal: externalid},
          function(res,resultPar){
                 log("Delete external done" );
                 select_external(projectid);
          });
          $(this).dialog("close");
      }},
      {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
  });
}

function
create_bd(btn) {
  log("create_bd");
  var projectid = $(".form-project [name=id]").val();
  var cols = {
    name : $(".form-bookcreate [name=name]").val(),
    title : $(".form-bookcreate [name=title]").val(),
    helptext : $(".form-bookcreate [name=helptext]").val(),
    hidden : $(".form-bookcreate [name=hidden]").val(),
    autocreate : $(".form-bookcreate [name=autocreate]").val(),
    bi_params : $(".form-bookcreate [name=bi_params]").val()
  }
  if (!cols.name||!projectid) {
    showAlert(trHtml.bd_create[0], "warning");
    return;
  }
  backendCall("tableInsert", { tableName:"kipus_bookdefinition",
    columns:cols},
    function(res,resultPar){
        backendCall("tableInsert", { tableName:"kipus_projectbooks", columns:{
          projectid:projectid,
          bookdefid:res.insertId
          }},
          function(res,resultPar){ log("pbook added" ); 
             log_sc($(btn).text(), getCtx(cols, "book"));
             select_project();
             select_pbooks(projectid);
             log("book definition created" ); toggle_bd_create(); select_bd();
             showAlert(trHtml.bd_create[1], "success");});

         });
}

function
download_bd() {
  log("download_bd");
  if (!$(".form-book [name=id]").val()) {
    showAlert(trHtml.bd_download[0], "warning");
    return;
  }
  backendCall("getBookDefinition", { bookdefid:$(".form-book [name=id]").val(), asFile:true },
    function(res,resultPar){ log("book definition download" );
                         showAlert(trHtml.bd_download[1], "success");
                         var path = location.href.substring(0, location.href.lastIndexOf('/'));
                         downloadFile(path+res.fileName);
                         });
}

function
recomputeScore() {
  if (!$(".form-book [name=id]").val()) {
    showAlert(trHtml.bd_download[0], "warning");
    return;
  }
  backendCall("recomputeScore", { bdefid:$(".form-book [name=id]").val() },
    function(res){
      okDialog("Recomputed scores: "+res.rows+
                (res.err.length ? '<br>'+res.err.join('<br>') : ''));
    });
}

function
check_autocreated(par, callbackfn) {
  if (!par) {
    par = { status: 0 };
  }
  var status = par.status++;
  log("check_autocreated step " + status);
  if (status == 0) {     // Parent-Book has to exist
    var parentbookid=$(".form-book [name=parentbookid]").val();
    if (!parentbookid) {
      showAlert("Parent book has to exist (if autocreated = YES)", "error");
      return;
    }
    par.parentbookid = parentbookid;
    return check_autocreated(par, callbackfn);
  }
  if (status == 1) {     // Header Page has to exist
    var pagedefid = null;
    for (var i=0; i<pd.length; i++) {
      if (pd[i].pagetype != "HEADER")
        continue;
      pagedefid = pd[i].id;
    }
    if (!pagedefid) {
      showAlert("Header page has to exist (if autocreated = YES)", "error");
      return;
    }
    par.pagedefid = pagedefid;
    return check_autocreated(par, callbackfn);
  }
  if (status == 2) {     // Header page should only have one attribute, and from type singleFromTable
    return backendCall("tableSelect", { tableName:"kipus_pageattributes", where: "pagedefid="+par.pagedefid},
      function(res, resultPar) {
          if (res.length != 1) {
             showAlert("Header page should only have one attribute (if autocreated = YES)", "error");
             return
          }
          if (res[0].constrainttype != "singleFromTable") {
             showAlert("Header page attribute 'Display Type' has to be 'Single value from table' (if autocreated = YES)", "error");
             return
          }
          par.constraintparam = res[0].constraintparam;
          return check_autocreated(par, callbackfn);
        });
  }
  if (status == 3) {    // Header page attribute 'Display Parameters' has to match parent book header table
    return backendCall("tableSelect", {
      columns:"pd.tablename",
      tableName:"kipus_bookpages bp, kipus_pagedefinition pd",
      where:"bp.bookdefid='"+par.parentbookid+"' and "+
            "bp.pagedefid=pd.id and pd.pagetype='HEADER'" },
      function(res, resultPar) {
        if (res.length != 1 || res[0].tablename != par.constraintparam) {
           showAlert("Header page attribute 'Display Parameters' has to match parent book header tablename (if autocreated = YES)", "error");
           return
        }
        log("check_autocreated YES ok");
        return callbackfn();
    });
  }
}

function
update_bd() {
  log("update_bd");
  var bookid=$(".form-book [name=id]").val();
  var title=$(".form-book [name=title]").val();
  var helptext=$(".form-book [name=helptext]").val();
  var hidden=$(".form-book [name=hidden]").val();
  var autocreate=$(".form-book [name=autocreate]").val();
  var parentbookid=$(".form-book [name=parentbookid]").val();
  var bshowif=$(".form-book [name=bshowif]").val();
  var bi_params=$(".form-book [name=bi_params]").val();
  var cols = { title:title, helptext:helptext, hidden:hidden,
               autocreate:autocreate, parentbookid: parentbookid,
               showif:bshowif, bi_params: bi_params  };
  if (autocreate == "YES") {
    check_autocreated(undefined, do_update);
  } else
    do_update();
  function do_update() {
    backendCall("tableUpdate",
      { tableName:"kipus_bookdefinition", columns: cols,
        filterCol:  "id", filterVal: bookid, nullCol: "parentbookid" },
      function(res,resultPar){
        log("book definition update" );
        toggle_bd_edit();
        select_bd();
        showAlert(trHtml.bd_update[0], "success");
      });
  }
}

function
delete_bd_tables(bookdefid, projectid, callbackfn) {
      function doDeleteBd(cmds) {
       backendCall("tableBatch", {commands:cmds },
          function(){
             log("Delete book definition done" );
             select_bd();
             select_pbooks(projectid);
             showAlert(trHtml.bd_delete[1], "success");
             if (callbackfn)
               callbackfn();
        });
     }
     select_bdpage(bookdefid, function () {
        var cmds = [];
        var pd2delete = pd;
        var todo = pd2delete.length;
        cmds.push({ fn:"tableUpdate", tableName:"kipus_projects", columns: { modified: now(), modifiedby: bcUser }, 
                    filterCol: "id", filterVal: projectid});
        cmds.push({ fn: "tableDelete", tableName:"kipus_projectbooks",
                    filterCol:['projectid','bookdefid'], filterVal:[ projectid, bookdefid ]});
        cmds.push({ fn: "tableDelete", tableName:"kipus_bookpages",
                       filterCol:'bookdefid', filterVal:bookdefid});
        cmds.push({ fn: "tableDelete", tableName:"kipus_bookdefinition",
                       filterCol:'id', filterVal: bookdefid});
        if (todo == 0)
          return doDeleteBd(cmds);
        for (var i=0; i<pd2delete.length; i++) {
           log("delete pd " + pd2delete[i].id + " ("+pd2delete[i].tablename+")");
           delete_pd_tables(pd2delete[i], function (res) {
             // add cmds to beginning of array
             for (var j=res.length-1; j>=0; j--)
               cmds.unshift(res[j]);
             if (--todo == 0)
                doDeleteBd(cmds); 
           }, true);
        }
     });
}

function
delete_bd(btn, i) {
  var bookdefid = pbooks[i].bookdefid;
  var projectid = pbooks[i].projectid;
  $("div#dialog").html(trHtml.bd_delete[0]);
  $("div#dialog").dialog({
    dialogClass:"no-close", buttons: [
      {text:trHtml.dlg[2], click:function(){
        log_sc($(btn).attr("title"), getCtx({ bookname:$(btn).attr("bookname"), booktitle:$(btn).attr("booktitle") }, "book"));
        delete_bd_tables(bookdefid, projectid);
        $(this).dialog("close");
      }},
      {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
  });
}

function
add_bdpage() {
  log("add_bdpage");
  if (!$(".form-bdpage [name=bookid]").val()
      || !$(".form-bdpage [name=pageid]").val()) {
    showAlert(trHtml.bdpage_add[0], "warning");
    return;
  }
  backendCall("tableInsert", { tableName:"kipus_bookpages", columns:{
    bookdefid:$(".form-bdpage [name=bookid]").val(),
    pagedefid:$(".form-bdpage [name=pageid]").val()
    }},
    function(res,resultPar){ log("bdpage created" ); toggle_bdpage_add(); select_bd();
                         showAlert(trHtml.bdpage_add[0], "success");});
}

function
delete_bdpage(btn, i) {
  var bookdefid = $(".form-book [name=id]").val();
  if (!pd[i] || !bookdefid) {
    showAlert(trHtml.bdpage_delete[2], "warning");
    return;
  }
  var ctx = getCtx(pd[i], "page");
  $("div#dialog").attr("title", "delete");
  $("div#dialog").html(trHtml.bdpage_delete[0]);
  $("div#dialog").dialog({
    dialogClass:"no-close", modal:true, buttons: [
      {text:trHtml.dlg[2], click:function(){
       delete_pd_tables(pd[i], function() {
           log("Delete bdpage done" );
           log_sc($(btn).attr("title"), ctx);
           select_data(function() { select_bdpage(bookdefid) });
           showAlert(trHtml.bdpage_delete[1], "success");
       });
        $(this).dialog("close");
        select_bd();
      }},
      {text:trHtml.dlg[3],click:function(){$(this).dialog("close");}}]
  });
}


function
select_bdpage(bookdefid, callbackfn)
{
  var canWrite = hasProjectRight("Projects", "write", $(".form-project [name=id]").val()) || hasProjectRight("AdminAll", "write");
  log("select bookpages " + bookdefid);
  backendCall("tableSelect", { tableName:"kipus_bookpages" , filterCol:'bookdefid', filterVal:bookdefid},
    function(res, resultPar) {
      bdpage = res;
      pd = [];
      if (canWrite) {
        $("#bdpagetable thead th[trid=th_edit]").text("Edit");
        $("#bdpagetable thead th[trid=th_delete]").show();
      } else {
        $("#bdpagetable thead th[trid=th_edit]").text("View");
        $("#bdpagetable thead th[trid=th_delete]").hide();
      }
      $(".form-book input").attr("readonly", !canWrite);
      $(".form-book select").attr("disabled", !canWrite);
      $(".form-book [name=id], .form-book [name=name]").attr("readonly", true);
      var dmWrite = hasProjectRight("DataMaintenanceBooks", "write", $(".form-project [name=id]").val()) ||
                    hasProjectRight("AdminAll", "write");
      if (dmWrite)
        $("#btn-recomputeScore").show();
      else
        $("#btn-recomputeScore").hide();
      $("#bdpagetable >tbody tr").remove();
      for(var i=0; i<res.length; i++) {
          backendCall("tableSelect", {
                tableName:"kipus_pagedefinition",
                filterCol:'id',
                filterVal:res[i].pagedefid },
            function(res1, resultPar) {
                pd.push(res1[0]);
                if (pd.length == res.length) {
                  var tHash = { HEADER:0, BODY:1, LOOKUP:2, CP_LOOKUP:3, EXTERNAL:4 };
                  pd.sort(function (a,b) {
                     aStr = tHash[a.pagetype]+"/"+a.tablename;
                     bStr = tHash[b.pagetype]+"/"+b.tablename;
                     return (aStr < bStr) ? -1: (aStr > bStr) ? 1: 0;
                  });
                  for (var i=0; i<pd.length; i++) {
                    var row = "<tr><td align='center'><i class='btn-link glyphicon "+(canWrite?glEdit:glView)+"'" +
                              "onclick='navigate_pd_edit(\"" + pd[i].id + "\")'></i></td>" +(canWrite?
                              "<td align='center'><i title='Delete page' class='btn-link glyphicon glyphicon-remove red'" +
                              "onclick='delete_bdpage(this, \"" + i +  "\")'></i></td>":"")+
                              "<td>"+ pd[i].tablename + "</td>" +
                              "<td>"+ pd[i].displayname + "</td>" +
                              "<td>"+ pd[i].pagetype + "</td>" +
                              "<td>"+ (pd[i].subpageparam?pd[i].subpageparam:"") + "</td></tr>";
                    $('#bdpagetable').find('tbody:last').append(row);
                  }
                }
                if (pd.length == bdpage.length) {
                  table_pagination($("#bdpagetable"));
                  if (callbackfn)
                    callbackfn();
                }

            });
      }
    if (res.length == 0 && callbackfn)
      callbackfn();

    });
}

function
import_bd() {
  log("import_bd");
  if (!$("#import_file_bd").val()) {
    showAlert(trHtml.bd_import[0], "warning");
    return;
  }
  var file = $('#import_file_bd').prop('files')[0];
  var reader = new FileReader();
  $("#btn-importbd").prepend("<img class='waiting'></img>");
  reader.onload = function(event) {
      log("file read done");
      var importbd=null;
      try {
        importbd=JSON.parse(event.target.result);
      } catch (e) {
        showAlert(trHtml.bd_import[3], "warning");
        $("img.waiting").remove();
        return;
      }
      if (!importbd || !importbd.bookdefinition) {
        showAlert(trHtml.bd_import[3], "warning");
        $("img.waiting").remove();
        return;
      }
      backendCall("importBookDefinition", { bookdefinition:importbd.bookdefinition, bookpages:importbd.bookpages,
                                  pagedefinition:importbd.pagedefinition, pageattributes:importbd.pageattributes},
        function(res,resultPar){ log("book definitions imported " +res.insertIds.length);
                            var projectId=$(".form-project [name=id]").val();
                            for (var rIdx=0; rIdx<res.insertIds.length;rIdx++) {
                              (function(rIdx){
                              var sql = "INSERT INTO kipus_projectbooks VALUES ('"+projectId+"','"+res.insertIds[rIdx]+"','"+
                                         now() + "','"+bcUser+"') " +
                                        "ON DUPLICATE KEY UPDATE projectid='"+projectId+"',bookdefid='"+res.insertIds[rIdx]+"'";
                              backendCall("tableCmd", { sql: sql },
                                function(res1,resultPar){
                                     if (rIdx == res.insertIds.length -1) {
                                       $("img.waiting").remove();
                                       toggle_bd_import();
                                       select_bd();
                                       select_pbooks($(".form-project [name=id]").val());
                                       showAlert(trHtml.bd_import[1], "success");
                                     }
                                 });
                                })(rIdx);
                            }
                            });

  };
  reader.onerror = function(event) {
      log("file read error: " + event.target.error.code);
      showAlert(trHtml.bd_import[2], "warning");
      $("img.waiting").remove();
  };
  reader.readAsText(file);
}

function
translate_file(dataid)
{
  log("translate_file "+dataid);
  if (!$(".form-project [name=id]").val() ||
      !$(".form-project [name=name]").val() ) {
    showAlert(trHtml.xliffgen[0], "warning");
    return;
  }
  if (!dataid)
    return;
  var lang = dataid.substring(dataid.lastIndexOf("_")+1, dataid.lastIndexOf("."));
  backendCall("openXliff", { language: lang, projectId:$(".form-project [name=id]").val(),
                             dataid: dataid, projectName: $(".form-project [name=name]").val() },
    function(res,resultPar){ log("xliff open" );
                         downloadFile(res.xliff_url, true);
                         });
}

function
xliffgen_bd()
{
  log("xliffgen_bd");
  if (!$(".form-project [name=id]").val() ||
      !$(".form-project [name=name]").val() ) {
    showAlert(trHtml.xliffgen[0], "warning");
    return;
  }
  $("div#dialog").html('<label class="control-label">Choose Language</label><select class="form-control" name="plangselect"></select>');
  create_lang_options("div#dialog [name=plangselect]");
  $("div#dialog").dialog({
    dialogClass:"no-close", modal:true, buttons: [
      {text:trHtml.dlg[1], click:function(){ $(this).dialog("close"); }},
      {text:trHtml.dlg[0],click:function(){
          var language = $(this).find("[name=plangselect]").val();
          var fileName = "project_"+language+".xml";
          backendCall("genXliff", { language: language, fileName: fileName, projectId:$(".form-project [name=id]").val(),
                                    projectName:$(".form-project [name=name]").val() },
            function(res,resultPar){ log("xliff download" );
                                 showAlert(trHtml.xliffgen[1], "success");
                                 downloadFile(res.xliff_url, true);
                                 });
          $(this).dialog("close");
      }}]
  });



}

/*
 * END book definition
 */

function
create_lang_options(div, projName, selectedLang="en", callbackfn) {
  if (!projName) {
    var options = "";
    for (var lang in languages) {
      options += '<option value="'+lang.toLowerCase()+'"'+(lang.toLowerCase()==selectedLang?" selected='selected'":"")+'>'+languages[lang].name+'</option>';
    }
    $(div).empty().append(options);
    if (callbackfn)
      callbackfn();
  }
  else
  backendCall("getFiles", { projectName:projName},
    function(res, resultPar) {
    var files = {};
    for (var i=0;i<res.files.length;i++) {
      var fname = res.files[i].dataid.replace("/projects/"+projName+"/","");
      var pos = fname.indexOf(".xml");
      if (pos > 2) {
        fname = fname.substr(pos-2,2);
        files[fname] = 1;
      }
    }
    var options = "";
    for (var lang in languages) {
      if (lang == "EN" || files[lang.toLowerCase()])
        options += '<option value="'+lang.toLowerCase()+'"'+(lang.toLowerCase()==selectedLang?" selected='selected'":"")+'>'+languages[lang].name+'</option>';
    }
    $(div).empty().append(options);
    if (callbackfn)
      callbackfn();
  });
}

function
setLeaveMsg()
{
  if(!navigator.userAgent.match(/MSIE/))
    window.onbeforeunload = function(e) { return trHtml.leave[0] }
}

function
resetLeaveMsg()
{
  if(!navigator.userAgent.match(/MSIE/))
    window.onbeforeunload = undefined;
}

function
downloadFile(url, newWindow)
{
   resetLeaveMsg();
   if (newWindow) {
     var newWin = window.open(url);
     if(!newWin || newWin.closed || typeof newWin.closed=='undefined')
     {
       okDialog('<div>Popup was blocked by your browser. Please enable Popups for '+window.location.origin+'</div>');
     }
   }
   else
     window.location=url;
   window.setTimeout(setLeaveMsg, 500);
}

function
show_filter_row(row, filterstr)
{
  if (filterstr == undefined || filterstr == "")
    return true;
  if (row == undefined)
    return false;
  filterstr = filterstr.toLowerCase();
  var parts = filterstr.split(" ");
  var tds = $(row).children();
  var textfound = 0;
  for (var i=0; i<parts.length; i++)
  {
    if (parts[i] == "") {
      textfound++;
      continue;
    }
    $(tds).each(function() {
        var text = $(this).text().toLowerCase().replace("<200b>","");
        var fltr = parts[i];
        if (fltr.indexOf("/") > -1) {
          // escape slash for match
          fltr = fltr.replace(/\//g, "\\/");
        }
        if (text.match(fltr)) {
          textfound++;
          return false;
        }
    });
  }
  return (textfound==i);
}

function
clear_filter_table(el)
{
  $(el).closest(".filtertable").find("[name=filterinput]").val("");
  filter_table(el);
  table_pagination($(el).closest(".filtertable").children("table"));
}

function
filter_table(el)
{
  var filterstr = $(el).closest(".filtertable").find("[name=filterinput]").val();
  if (filterstr == undefined)
    return;
  $(".pager").remove();
  if (filterstr.length > 0) {
    $(el).closest(".filtertable").find(".filterfooter").text(trHtml.filter[3] + "'" +filterstr + "'");
    $(el).closest(".filtertable").find("table >tfoot").show();
  }
  else
    $(el).closest(".filtertable").find("table >tfoot").hide();
  $(el).closest(".filtertable").find("table >tbody tr").each(function () {
    if (show_filter_row(this, filterstr))
      $(this).show();
    else {
      $(this).hide();
    }
  });
}

function
now()
{
  return (new Date()).toISOString().substring(0,19).replace("T", " ");
}

function
add_filter(el)
{
  $(el).prepend('<div class="filtertitle"><div class="form-group row"><div class="col-lg-5">' +
              '<input type="text" class="filterfield form-control" name="filterinput" placeholder="' + trHtml.filter[2]+'"></div>' +
              '<div class="btn btn-link"><a href="#" class="filterbutton" onclick="filter_table(this)">' +
              '<span class="glyphicon glyphicon-filter"></span><span>' + trHtml.filter[0]+ '</span></a></div>' +
              '<div class="btn btn-link"><a href="#" class="clearfilterbutton" onclick="clear_filter_table(this)">' +
              '<span class="glyphicon glyphicon-remove"></span><span>' + trHtml.filter[1]+ '</span></a></div>' +
              '</div></div>');
  $(el).children("table").append('<tfoot style="display:none"><tr><td align="center" colspan="42" class="filterfooter"></td></tr></tfoot>');
}

$(document).ready(function() {
  log(svnId);
  /*if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker
             .register('./js/service-worker.js')
             .then(function() { console.log('Service Worker Registered'); });
  }*/
  if (!trSave["en"]) {
    trSave["en"] = {};
    $("[trid]").each(function() {
      var id = $(this).attr("trid");
      var html = $(this).html().replace(/&amp;/g, "&");
      trSave["en"][id] = html;
    });
  }
  prefLang = window.sessionStorage.prefLang?window.sessionStorage.prefLang:"EN";
  translateHtml("admin",
      prefLang.toLowerCase(),
      function(){
          readTranslatedTables();
          $("#login").attr("placeHolder", trHtml.login[0]);
          $("#loginmask input").val("");
          $("#loginmask button").show();
          $("#password").attr("placeHolder", trHtml.password[0]);
          $("#menu-toggle").click(function(e) {
              e.preventDefault();
              $("#wrapper").toggleClass("active");
          });
          jQuery.fn.center = function() {
              this.css({
                  "position": "absolute",
                  "top": ((($(window).height() - this.outerHeight()) / 2) + $(window).scrollTop() + "px"),
                  "left": ((($(window).width() - this.outerWidth()) / 2) + $(window).scrollLeft() + "px")
              });
              return this;
          }
          // Firefox bugfix: Syntax error for ajax-Calls
          // http://stackoverflow.com/questions/335409/jquery-getjson-firefox-3-syntax-error-undefined
          $.ajaxSetup({'beforeSend': function(xhr){
              if (xhr.overrideMimeType)
                  xhr.overrideMimeType("text/plain");
              }
          });
          // End Firefox bugfix
          setLeaveMsg();
          // add mandatory placeholder
          var mandatories = {};
          mandatories["project"] = ["name", "prefix"];
          mandatories["book"] = ["name"];
          mandatories["page"] = ["tablename", "displayname"];
          mandatories["pdattr"] = ["columnname", "displayname", "columnorder"];
          mandatories["user"] = ["login", "displayname", "passwd", "passwd2"];
          var selector = "";
          for(var form in mandatories)
          {
             for (var i=0; i<mandatories[form].length; i++)
             {
               selector += ",.form-"+form+" [name="+mandatories[form][i]+"]";
             }
          }
          selector = selector.substring(1, selector.length);
          $(selector).each(function() {
            $(this).attr("placeholder", trHtml.mandatory[0]);
          });
          // end mandatory placeholder
          document.addEventListener('mousemove', function(e){
              mouse.x = e.clientX || e.pageX;
              mouse.y = e.clientY || e.pageY
          }, false);


          if (window.sessionStorage.bcUser && window.sessionStorage.bcPasswd) {
            bcUser = window.sessionStorage['bcUser'];
            bcPasswd = window.sessionStorage['bcPasswd'];
            backendCall("tableSelect", { tableName:"kipus_roles", orderBy:"name" },
              function(res, resultPar) {
                roles = res;
                backendCall("tableSelect", { tableName:"kipus_user" },
                  function(res, resultPar) {
                    for(var i1=0; i1<res.length; i1++) {
                      if(res[i1].login.toLowerCase() == bcUser)
                        if (hasAdminRights(res[i1].rights)) {
                          bcRights = res[i1].rights;
                          startDashboard();
                        }
                        else {
                          showAlert(trHtml.invalid_login[1], "warning");
                          return;
                        }
                    }
                  });
            });
          } else
          $("#loginmask input").keypress(function(event) {
            if (event.which == 13) {
                event.preventDefault();
                login();
            }
          });
          // signature modal events
          $('#signature').on('shown.bs.modal', function (event) {
            log("shown signature");
            var wrapper = document.getElementById("signature-pad"),
              clearButton = wrapper.querySelector("[data-action=clear]"),
              saveButton = wrapper.querySelector("[data-action=save]"),
              canvas = wrapper.querySelector("canvas");

              // Adjust canvas coordinate space taking into account pixel ratio,
              // to make it look crisp on mobile devices.
              // This also causes canvas to be cleared.
              function resizeCanvas() {
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

              clearButton.addEventListener("click", function (event) {
                  log("clear clicked");
                  signaturePad.clear();
              });

          });
      },
      {});
  disabled_backbutton();
});

function
toggle_structchangeslog() {
  backendCall("tableSelect", { tableName:"kipus_structChanges_history", columns:"modified,modifiedby,action,context" },
    function(res, resultPar) {
      $('.content-logs #logrowstable >tbody tr').remove();
      var html = "";
      for (var i=0; i< res.length; i++)
        html += "<tr><td style='white-space:nowrap;'><div>"+res[i].modified+"</div></td>"+
                "<td><div>"+res[i].modifiedby+"</div></td>"+
                "<td><div>"+res[i].action+"</div>"+"<div>"+res[i].context+"</div></td></tr>";
       
      $('.content-logs #logrowstable').find('tbody').append(html);
    });
  $(".content-logs #logrowstable").css("display","");
  $(".content-logs #logtables").css("display","none");
  $('.content-logs .cancel').show();
}

function
toggle_serverlog() {
  backendCall("tableSelect", { tableName:"kipus_serverErrors", columns:"modified,modifiedby,data" },
    function(res, resultPar) {
      $('.content-logs #logrowstable >tbody tr').remove();
      var html = "";
      for (var i=0; i< res.length; i++)
        html += "<tr><td style='white-space:nowrap;'><div>"+res[i].modified+"</div></td>"+
                "<td><div>"+res[i].modifiedby+"</div></td>"+
                "<td><div>"+res[i].data+"</div></td></tr>";
       
      $('.content-logs #logrowstable').find('tbody').append(html);
    });
  $(".content-logs #logrowstable").css("display","");
  $(".content-logs #logtables").css("display","none");
  $('.content-logs .cancel').show();
}

function
toggle_clientlog() {
  backendCall("tableSelect", { tableName:"kipus_debugInfo", columns:"modified,modifiedby,data" },
    function(res, resultPar) {
      $('.content-logs #logrowstable >tbody tr').remove();
      var html = "";
      for (var i=0; i< res.length; i++)
        html += "<tr><td style='white-space:nowrap;'><div>"+res[i].modified+"</div></td>"+
                "<td><div>"+res[i].modifiedby+"</div></td>"+
                "<td><div>"+res[i].data+"</div></td></tr>";
      $('.content-logs #logrowstable').find('tbody').append(html);
    });
  $(".content-logs #logrowstable").css("display","");
  $(".content-logs #logtables").css("display","none");
  $('.content-logs .cancel').show();
}

function
toggle_clientinfo() {
  backendCall("tableSelect", { tableName:"kipus_clientinfo", columns:"clientinfo,modified,modifiedby" },
    function(res, resultPar) {
      $('.content-logs #logrowstable >tbody tr').remove();
      var html = "";
      for (var i=0; i< res.length; i++)
        html += "<tr><td style='white-space:nowrap;'><div>"+res[i].modified+"</div></td>"+
                "<td><div>"+res[i].modifiedby+"</div></td>"+
                "<td><div>"+res[i].clientinfo+"</div></td></tr>";
      $('.content-logs #logrowstable').find('tbody').append(html);
    });
  $(".content-logs #logrowstable").css("display","");
  $(".content-logs #logtables").css("display","none");
  $('.content-logs .cancel').show();
}

function
select_messaging() {
  log("selected messaging");
  var uNames = {};
  backendCall("tableSelect", { tableName:"kipus_user", orderBy:"login" },
    function(res0, resultPar) {
      user = res0;
    for (var i=0; i<res0.length; i++)
      uNames[res0[i].login] = res0[i].displayname;
  backendCall("tableSelect", { tableName:"kipus_pushtoken", columns:"login,token,clientinfo,modified" },
    function(res, resultPar) {
      function update_topics() { 
        backendCall("tableSelect", { tableName:"kipus_pushtopics" },
          function(res1, resultPar) {
          backendCall("tableSelect",
            { tableName:"kipus_usertopics" },
          function(res2,resultPar){
          var ut = {};
          for (var i=0; i< res2.length; i++) {
            if (!ut[res2[i].topic])
              ut[res2[i].topic] = [];
            ut[res2[i].topic].push(res2[i].login);
          } 
          $('.content-messaging ul.topics').empty();
          function format_userlist(ulist) {
            if (!ulist || ulist.length == 0)
              return "";
            var str = [];
            for (var i=0; i<ulist.length; i++) 
              str.push(sprintf("{2} ({1})", ulist[i], uNames[ulist[i]])); 
            return str.sort().join(", ");
          }
          for (var i=0; i< res1.length; i++) {
            var topic = res1[i].topic;
            var name = res1[i].displayname?res1[i].displayname:topic;
            $('.content-messaging ul.topics').append('<li topic="'+topic+'"><span class="col"><span class="topic">' + name+
                                                     '<span class="tooltiptext">'+(res1[i].description?res1[i].description:'No info')+'</span>'+ '</span></span>'+
                                                     '<span class="col"><span class="users">' + format_userlist(ut[topic])+ '</span></span>'+
                                                     '</li>');
          }

        $(function() {
            function menu_clicked(key, el) {
              var topic = $(el).closest("li").attr("topic");
              if (key == "users")
                manage_users(topic);
              if (key == "message")
                send_push_to_topic(topic); 
              if (key == "info")
                set_topic_info(topic); 
              if (key == "remove")
                delete_topic(topic);
            }
            $.contextMenu({
                selector: '.content-messaging ul.topics li span.topic', 
                trigger: 'left',
                callback: function(key, options) {
                    var m = "clicked: " + key;
                    window.console && console.log(m) || alert(m); 
                },
                items: {
                        users: {name: "Manage users", icon: "fa-users", callback: function(key, opt){ menu_clicked(key, this); }},
                        message: {name: "Send message to group", icon: "fa-comment", callback: function(key, opt){ menu_clicked(key, this); }},
                        info: {name: "Info", icon: "fa-info", callback: function(key, opt){ menu_clicked(key, this); }},
                        remove: {name: "Remove", icon: "fa-remove", callback: function(key, opt){ menu_clicked(key, this); }}
                    }
            });
        });
        function manage_users(topic) {
           if (topic && topic.length > 0)
              backendCall("tableCmd", { sql:"select distinct login from kipus_pushtoken" },
                function(res, resultPar) {
              backendCall("tableSelect",
                { tableName:"kipus_usertopics", filterCol:'topic', filterVal:topic },
              function(res1,resultPar){
                 var logins = {};
                 var tokens = {};
                 for (var i0=0; i0<res1.length; i0++) {
                    logins[res1[i0].login] = res1[i0];
                    logins[res1[i0].login].member = true;
                 }
                 for (var i0=0; i0<res.length; i0++) {
                    tokens[res[i0].login] = 1;
                    if (!logins[res[i0].login])  {
                      logins[res[i0].login] = { login: res[i0].login, member: false };
                    }
                 }
                 var html = '<label class="control-label">'+sprintf(trHtml.messaging[5],topic)+'</label>'+
                            '<div><span>'+trHtml.messaging[8]+'</span></div>'+
                            '<div class="selectall"><ul><li><i class="glyphicon glyphicon-unchecked"></i>Select all</li></ul></div>'+
                            '<hr style="margin:5px;"><div class="usertopics"><ul>';
                 for (var i=0; i<user.length; i++) {
                     var u = user[i];
                     var isMember = logins[u.login]?logins[u.login].member:false;
                     var tokenMissing = typeof (tokens[u.login]) == "undefined";
                     html += '<li login="'+u.login+'"><i class="glyphicon glyphicon-'+(isMember?'check':'unchecked')+(tokenMissing?' tokenMissing':'')+'"></i>'+
                             sprintf("{1} ({2})", uNames[u.login], u.login)+'</li>';
                 }
                 
                 html += '</ul></div>';
                 $("div#dialog").html(html);
                 $("div#dialog div.usertopics li i, div.selectall li i").click(function () {
                   if ($(this).hasClass("glyphicon-check")) {
                     $(this).removeClass("glyphicon-check");
                     $(this).addClass("glyphicon-unchecked");
                   }
                   else {
                     $(this).addClass("glyphicon-check");
                     $(this).removeClass("glyphicon-unchecked");
                   }
                   if ($(this).closest("div").hasClass("selectall")) {
                     $("div#dialog div.usertopics li i").attr("class", $(this).attr("class"));
                   }
                 });
                 $("div#dialog").dialog({
                   dialogClass:"no-close", 
                      width: $(window).width()*0.8,
                      height: $(window).height()*0.8,
                      buttons: [
                     {text:trHtml.dlg[4], click:function(){
                       $(this).dialog("close");
                       var cmds=[];
                       var subscribe = { del : [], add: [] };
                       $("div#dialog div.usertopics li i.glyphicon").each(function () {
                         var login =  $(this).closest("li").attr("login");
                         var isMember = logins[login]?logins[login].member:false;
                         if ($(this).hasClass("glyphicon-check") && !isMember) {
                           cmds.push({ fn:"tableInsert", tableName:"kipus_usertopics", columns:{
                                 topic:topic,
                                 login:login
                                 }
                           });
                           subscribe.add.push(login);
                         } 
                         if ($(this).hasClass("glyphicon-unchecked") && isMember) {
                           cmds.push({ fn:"tableDelete", tableName:"kipus_usertopics",
                                       filterCol:['login','topic'], filterVal:[ login, topic ] });
                           subscribe.del.push(login);
                         }
                       });
                       if (!cmds.length)
                         return;
                       backendCall("tableBatch", { commands:cmds },
                       function(res,resultPar){
                          // refresh userlist
                          backendCall("tableSelect", { tableName:"kipus_usertopics", filterCol:"topic", filterVal: topic },
                            function(res, resultPar) {
                              var users = [];
                              for (var i=0; i<res.length; i++) 
                                users.push(res[i].login);
                              $('.content-messaging ul.topics li[topic='+topic+'] span.users').html(format_userlist(users));
                          log("manage user done, send subscription to google");
                          if (subscribe.add.length) 
                            backendCall("subscribeUserToTopic", { users: subscribe.add,
                                                                  topic: topic,
                                                                  batchFn: "batchAdd"
                                                               },
                              function(res,resultPar){
                            });
                          if (subscribe.del.length) 
                            backendCall("subscribeUserToTopic", { users: subscribe.del,
                                                                  topic: topic,
                                                                  batchFn: "batchRemove"
                                                               },
                              function(res,resultPar){
                            });
                       });
                       });
                       
                     }},
                     {text:trHtml.dlg[1],click:function(){$(this).dialog("close");}}]
                 });

              });
              });
        }

        function delete_topic(topic) {
           log("delete_topic " + topic);
           if (topic && topic.length > 0) {
              backendCall("tableSelect", { tableName:"kipus_usertopics", filterCol:"topic", filterVal: topic },
                function(res, resultPar) {
                  var users = [];
                  for (var i=0; i<res.length; i++) 
                    users.push(res[i].login);
                  if (users.length == 0)
                    return doDeleteTopic(topic);
                  // unsubscribe
                  backendCall("subscribeUserToTopic", { users: users,
                                                      topic: topic,
                                                      batchFn: "batchRemove"
                                                   },
                  function(res,resultPar){
                    doDeleteTopic(topic); 
                });
              });


              function doDeleteTopic(topic) {
                backendCall("tableDelete",
                  { tableName:"kipus_usertopics", filterCol:'topic', filterVal:topic },
                function(res,resultPar){
                backendCall("tableDelete",
                  { tableName:"kipus_pushtopics", filterCol:'topic', filterVal:topic },
                function(res,resultPar){
                   update_topics();
               });
               });
             }
           }
        }
        function send_push_to_topic(topic) {
           if (topic && topic.length > 0) {
              var rowid = $(this).closest("tr").attr("data-rowid");
              $("div#dialog").html('<label class="control-label">'+sprintf(trHtml.messaging[0], topic)+'</label>'+
                                   '<div class="form-group"><label class="control-label">'+trHtml.messaging[1]+
                                   '</label><input type="text" class="title form-control"></div>'+
                                   '<div class="form-group"><label class="control-label">'+trHtml.messaging[2]+
                                   '</label><textarea rows="5" autofocus class="message form-control"></textarea></div>');
              $("div#dialog input.title").val(topic);
              $("div#dialog").dialog({
                dialogClass:"no-close", buttons: [
                  {text:trHtml.dlg[10], click:function(){
                    var title   = $("div#dialog input.title").val();
                    var message = $("div#dialog textarea.message").val();
                    if (!title || !message)
                      return okDialog(trHtml.messaging[6]);
                    backendCall("sendPushMessage", {       to: "/topics/"+topic,
                                                        title: title,
                                                      message: message },
                      function(res,resultPar){
                        backendCall("tableInsert", { tableName:"kipus_pushmessage_history", columns: { topic: topic , message: message, title: title } },
                          function(res,resultPar){
                          log("sent push message to topic " + topic);
                        });
                      });
                    $(this).dialog("close");
                  }},
                  {text:trHtml.dlg[1],click:function(){$(this).dialog("close");}}]
              });
           }
        }

        function set_topic_info(topic) {
           if (topic && topic.length > 0) {
              backendCall("tableSelect", { tableName:"kipus_pushtopics", filterCol:"topic", filterVal: topic },
                function(res, resultPar) {
              var rowid = $(this).closest("tr").attr("data-rowid");
              $("div#dialog").html('<label class="control-label">'+sprintf(trHtml.messaging[7], topic)+'</label>'+
                                   '<div class="form-group"><textarea rows="5" class="displayname form-control"></textarea></div>'+
                                   '<label class="control-label">'+sprintf(trHtml.messaging[4], topic)+'</label>'+
                                   '<div class="form-group"><textarea rows="5" class="description form-control"></textarea></div>');
              if (res[0].displayname)
                $("div#dialog textarea.displayname").val(res[0].displayname);
              if (res[0].description)
                $("div#dialog textarea.description").val(res[0].description);
              $("div#dialog").dialog({
                dialogClass:"no-close", buttons: [
                  {text:trHtml.dlg[4], click:function(){
                    var displayname = $("div#dialog textarea.displayname").val();
                    var desc = $("div#dialog textarea.description").val();
                    backendCall("tableUpdate", { 
                                              tableName:"kipus_pushtopics", columns: { displayname: displayname, description: desc },
                                              filterCol:  "topic",
                                              filterVal: topic },
                      function(res,resultPar){
                          $('.content-messaging ul.topics li[topic='+topic+'] span.tooltiptext').text(desc);
                          $('.content-messaging ul.topics li[topic='+topic+'] span.topic').text(displayname);
                      });
                    $(this).dialog("close");
                  }},
                  {text:trHtml.dlg[1],click:function(){$(this).dialog("close");}}]
              });
             });
           }
        }
      });
      });
      }
      update_topics();
      function topic_is_valid(topic) {
        if (topic && topic.length > 0) {
          var tst = topic.replace(/[^a-zA-Z0-9-_.~%]/gi,'');
          if (topic != tst) {
            return false;
          }
          return true;
        }
        return true;
      }
      $('.content-messaging div.add_topic').unbind("click").click(function() {
        $('.content-messaging ul.topics').append('<li><input type="text"></li>');
        $('.content-messaging ul.topics li input').focus();
        $('.content-messaging ul.topics li input').on('blur', function(e) {
          var topic = $(this).val();
          if (!topic_is_valid(topic))
            return okDialog(trHtml.messaging[3]);
          if (topic && topic.length > 0)
          backendCall("tableInsert", { tableName:"kipus_pushtopics", columns: { topic: topic } },
            function(res,resultPar){
               update_topics();
           });
           $(this).parent().remove();
        });
        $('.content-messaging ul.topics li input').on('keyup', function(e) {
           if (e.keyCode == 13) {
             var topic = $(this).val();
             if (!topic_is_valid(topic))
              return okDialog(trHtml.messaging[3]);
             if (topic && topic.length > 0)
             backendCall("tableInsert", { tableName:"kipus_pushtopics", columns: { topic: topic } },
              function(res,resultPar){
                 update_topics();
             });
             $(this).parent().remove();
           }
           if (e.keyCode == 27) {
             // escape clicked
             $(this).parent().remove();
           }
        });
      });
      
      var lastclick = null;
      $('.content-messaging #mtable >tbody tr').remove();
      var html = "";
      for (var i=0; i< res.length; i++)
        html += "<tr data-rowid='"+i+"'><td align='center'><i class='btn-link glyphicon glyphicon-comment'></i></td>"+
                "<td><div>"+res[i].login+"</div></td>"+
                "<td><div class='clientinfo wrapword'><div class='clientinfo-div'>"+res[i].clientinfo.substr(0,80)+"<span class='dotdot'>...</span></div></div></td>"+
                "<td class='token wrapword'><div class='token-div'>"+res[i].token.substr(0,80)+"<span class='dotdot'>...</span></div></td>"+
                "<td><div>"+res[i].modified+"</div></td></tr>";
      $('.content-messaging #mtable ').find('tbody').append(html);
      $('.content-messaging #mtable .token').click(function() {
        var rowid = $(this).closest("tr").attr("data-rowid");
        $(this).find(".token-div").html(res[rowid].token);
      });
      $('.content-messaging #mtable .clientinfo').click(function() {
        var rowid = $(this).closest("tr").attr("data-rowid");
        $(this).find(".clientinfo-div").html(res[rowid].clientinfo);
      });
      $('.content-messaging #mtable .glyphicon-comment').click(function() {
        var rowid = $(this).closest("tr").attr("data-rowid");
        $("div#dialog").html('<label class="control-label">'+sprintf(trHtml.messaging[0], res[rowid].login)+'</label>'+
                             '<div class="form-group"><label class="control-label">'+trHtml.messaging[1]+
                             '</label><input type="text" class="title form-control"></div>'+
                             '<div class="form-group"><label class="control-label">'+trHtml.messaging[2]+
                             '</label><input type="text" class="message form-control"></div>');
        $("div#dialog").dialog({
          dialogClass:"no-close", buttons: [
            {text:trHtml.dlg[10], click:function(){
              // send message
              backendCall("sendPushMessage", { username: res[rowid].login, 
                                                     to: res[rowid].token, 
                                                  title: $("div#dialog input.title").val(),
                                                message: $("div#dialog input.message").val() },
                function(res,resultPar){
                });
              $(this).dialog("close");
            }},
            {text:trHtml.dlg[1],click:function(){$(this).dialog("close");}}]
        });
      });
  });
  });
}

function
select_logs() {
  $(".content-logs #logtables >tbody tr").remove();
  var tableWrite = false;
  // decide if table is writeable
  if(hasAllProjectRight("DataMaintenanceBooks", "write") ||
     hasAllProjectRight("AdminAll", "write"))
    tableWrite = true;
  var row = "<tr><td align='center'><i class='btn-link glyphicon "+glView+"'" +
            "onclick='toggle_clientinfo()'></i></td>"+(tableWrite?
                      "<td align='center'><i class='btn-link glyphicon glyphicon-trash'" +
                      "onclick='clear_clientinfo()'></i></td>":"<td></td>")+
             "<td><div>kipus_clientInfo</div></td>";
  $('.content-logs #logtables').find('tbody:last').append(row);
  row = "<tr><td align='center'><i class='btn-link glyphicon "+glView+"'" +
            "onclick='toggle_clientlog()'></i></td>"+(tableWrite?
                      "<td align='center'><i class='btn-link glyphicon glyphicon-trash'" +
                      "onclick='clear_clientlog()'></i></td>":"<td></td>")+
             "<td><div>kipus_debugInfo</div></td>";
  $('.content-logs #logtables').find('tbody:last').append(row);
  row = "<tr><td align='center'><i class='btn-link glyphicon "+glView+"'" +
            "onclick='toggle_serverlog()'></i></td>"+(tableWrite?
                      "<td align='center'><i class='btn-link glyphicon glyphicon-trash'" +
                      "onclick='clear_serverlog()'></i></td>":"<td></td>")+
             "<td><div>kipus_serverErrors</div></td>";
  $('.content-logs #logtables').find('tbody:last').append(row);
  row = "<tr><td align='center'><i class='btn-link glyphicon "+glView+"'" +
            "onclick='toggle_structchangeslog()'></i></td>"+(tableWrite?
                      "<td align='center'><i class='btn-link glyphicon glyphicon-trash'" +
                      "onclick='clear_structchangeslog()'></i></td>":"<td></td>")+
             "<td><div>kipus_structChanges_history</div></td>";
  $('.content-logs #logtables').find('tbody:last').append(row);
  $(".content-logs #logrowstable").css("display","none");
  $(".content-logs #logtables").css("display","");
  $('.content-logs .cancel').hide();

}

function
clear_structchangeslog() {
  var sql = "truncate table kipus_structChanges_history";
  backendCall("tableCmd", { sql: sql },
    function(res,resultPar){
       select_logs();
    });
}

function
clear_serverlog() {
  var sql = "truncate table kipus_serverErrors";
  backendCall("tableCmd", { sql: sql },
    function(res,resultPar){
       select_logs();
    });
}

function
clear_clientlog() {
  var sql = "truncate table kipus_debugInfo";
  backendCall("tableCmd", { sql: sql },
    function(res,resultPar){
       select_logs();
    });
}

function
clear_clientinfo() {
  var sql = "truncate table kipus_clientinfo";
  backendCall("tableCmd", { sql: sql },
    function(res,resultPar){
       select_logs();
    });
}

function
stacktrace()
{
  var x = arguments.callee.caller, s="", n=0;
  while(x && n < 20) {
    s += " <= "+ x.name;
    x = x.caller;
    n++;
  }
  return s;
}

/* GPS stuff */

///////////////////////////
// Add Google Maps to a div
function
kps_gpsAddGM(input)
{
  var id = $(input).attr("id");
  //log("kps_gpsAddGM " + input + " " + id);
  if(typeof(google) == "undefined" ||
     typeof(google.maps) == "undefined" ||
     typeof(google.maps.LatLng) == "undefined") { // could not load scripts
    return;
  }
  var gpshelp = $(input).closest(".form-group").find(".gpshelp");
  $(gpshelp).after(
    '<div id="gmap_'+id+'" style="width:100%;height:320px"/>');
  $(gpshelp).html("Drag the pin and drop it to the desired location");

  $(input).change(function(){
    kps_gpsSetGeoAddr(id, $(input).attr("param"), $(this).val(), 3);
  });

  var gmParam = {zoom:11, mapTypeId:google.maps.MapTypeId.ROADMAP };
  var ll = $(input).val().split(" ");
  if(ll.length != 2) {
    ll[0] = 50.93659;
    ll[1] =  6.95780; // Koeln, Guerzenich Str. 21
  }
  var cp = $(input).attr("param");
  gmParam.center = new google.maps.LatLng(ll[0], ll[1]);
  var map = new google.maps.Map(document.getElementById("gmap_"+id), gmParam);
  var marker = new google.maps.Marker({ position:gmParam.center,
                        draggable:true, map: map, id:'mk_'+id });
  google.maps.event.addListener(map, 'rightclick',
    function(event) { kps_gpsSetGeoVal(id, event, 1, cp); });
  google.maps.event.addListener(marker, 'dragend',
    function(event) { kps_gpsSetGeoVal(id, event, 0, cp) });
  gq["map"+id]=map;
  gq["marker"+id]=marker;

  kps_gpsSetGeoVal(id, { latLng:gmParam.center }, 1, cp);
}

function
kps_gpsSetGeoAddr(id, cp, str, eType)
{
  log("kps_gpsSetGeoAddr " + str);
  if(typeof(google)=="undefined" || !gq["map"+id])
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
              eType, cp, results, status);
    } else {
      msg("Geocoding failed:" + status);
    }
  });
}

function
kps_gpsSetGeoVal(id, e, eType, cp, results, status, skipGm)
{
  // eType: 0:dragEnd, 1:getCurrentPosition/click, 2:address, 3:latlong
  log("kps_gpsSetGeoVal "+id+" type "+eType + " cp " +cp);

  var div = $(".form-tablerow.details input"+id);
  if(eType != 3) {
    $(div).val(
        Math.round(e.latLng.lat()*10000)/10000 + " " +
        Math.round(e.latLng.lng()*10000)/10000);
  }

  if(!gq["map"+id] && !skipGm)     // No google Map.
    return;

  if(eType != 0 && !skipGm) {
    gq["map"+id].panTo(e.latLng);
    gq["marker"+id].setPosition(e.latLng);
  }

  var addCol = kps_gpsArg(cp, "ADDRESS");
  var cmpCol = kps_gpsArg(cp, "COMPUTED");
  var elvCol = kps_gpsArg(cp, "ELEVATION");
  var ad = addCol ? $(".form-tablerow.details input#"+addCol):"";
  var cad = cmpCol ? $(".form-tablerow.details textarea#"+cmpCol):"";
  if(ad && cad) {
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

  var ee = elvCol? $(".form-tablerow.details input#"+elvCol):"";
  if(ee) {
    if(!kps_elevator)
      kps_elevator = new google.maps.ElevationService();

    var pReq = { 'locations': [ e.latLng ] }
    kps_elevator.getElevationForLocations(pReq, function(results, status) {
      if (status == google.maps.ElevationStatus.OK) {
        if (results[0]) {
          $(ee).val(Math.round(results[0].elevation));
        } else {
          msg("Elevation service found no results");
        }
      } else {
        msg("Elevation service failed due to:" + status);
      }
    });
  }

}

function
kps_gpsIgnoreComputed(cmpCol)
{
  //log("kps_gpsIgnoreComputed");
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

function
kps_gpsArg(from, src)
{
  //log("kps_gpsArg " + from + " " + src);
  if(typeof from == "undefined")
    return "";
  var re = new RegExp(src+":([^ ]+)", "i");
  var res = re.exec(from);
  if(res && res.length > 0)
    return res[1];
  return "";
}
////// END of GPS functions


//////////////////////////
// start of script functions
function
loadScript(sname, callback)
{
  var h = document.head || document.getElementsByTagName('head')[0];
  var arr = h.getElementsByTagName("script");
  for(var i1=0; i1<arr.length; i1++)
    if(sname == arr[i1].getAttribute("src")) {
      if(arr[i1].getAttribute("loading") == "yes")
        return;
      if(callback)
        callback();
      return;
    }
  var script = document.createElement("script");
  script.src = sname;
  script.async = script.defer = false;
  script.type = "text/javascript";
  script.setAttribute("loading", "yes");


  log("Loading "+sname);
  if(isIE) {
    script.onreadystatechange = function() {
      if(script.readyState == 'loaded' || script.readyState == 'complete') {
        script.onreadystatechange = null;
        script.removeAttribute("loading");
        if(callback)
          callback();
      }
    }
  } else {
    script.onload = function(){ 
      log("Loading "+sname + " done");
      script.removeAttribute("loading");
      if(callback) callback(); 
    }

  }

  h.appendChild(script);
}

/// END of script functions

window.onerror = function(errMsg, url, lineno, colno, error){
  var d = new Date();
  var fArr = url.split("/");
  var errMsg = fArr[fArr.length-1]+" line "+lineno+": "+errMsg;
  var dlgMsg = "Internal error occured:<br>"+errMsg+"<br><br>"+
               "Development is notifed.";
  var uplMsg = d.toTimeString().substring(0,8)+"."+
               (d.getMilliseconds()%1000)+" "+errMsg+" (user:"+bcUser+")<br>";
  var rows = [uplMsg];
  if (error.stack)
    rows.push("Stacktrace: "+error.stack);
  backendCall("uploadDebugInfo", { rows:rows },
        function(){}, undefined, function(){}); // Ignore error message
  okDialog(dlgMsg, doReload);
}

function connectionChangedHandler(e) { 
   // Handle change of connection type here. 
   log("connection changed");
   $("#snackbar").text("Network not available");
   $("#snackbar").toggleClass("fadeout", navigator.onLine).toggleClass("fadein", !navigator.onLine);
} 

// Register for event changes: 
navigator.connection.onchange = connectionChangedHandler; 

//////////////////////////////////
// Disable the back button
function
disabled_backbutton()
{
  location.href += "#";
  window.onhashchange = function () {
    if(location.hash != "#!") {
      location.hash = "#!";
      $(".btn.cancel:visible").click();
    }
  };
}


// upload icons (for home screen)
function
delete_upload_icon(el)
{
  var file = "/projects/"+  $(".form-project [name=name]").val() + "/"+ $(el).closest(".dropicon").attr("target");
  log("delete_upload_icon file="+file);
  delete_pfile(file, function() {
    var di = $(el).closest(".dropicon");
    $(di).find("img").attr("src", "");
    $(di).find("input").val("");
    $(di).find("a.upload").show();
    $(di).find("button.delete").hide();
  });
}

function
upload_icon_changed(input)
{
  log("upload_icon_changed");
  if(!$(input).val())
    return;
  var val = $(input).val();
  var target = $(input).closest(".dropicon").attr("target");
  var fr = new FileReader();
  fr.onload = function(e) {
    log("icon loaded");
    var result = e.target.result;
    backendCall("uploadFile", { fileName:target, projectName:$(".form-project [name=name]").val(), data:result },
      function(res,resultPar){ 
        log("icon file uploaded" );
        $(input).closest(".dropicon").find("img").attr("src", result);
        $(input).closest(".dropicon").find("a.upload").hide();
        $(input).closest(".dropicon").find("button.delete").show();
       select_project_files($(".form-project [name=id]").val(), $(".form-project [name=name]").val());
    });
  }
  fr.readAsDataURL(input.files[0]);
}

function
trigger_upload_icon(el)
{
  log("trigger_upload_icon");
  $(el).closest("div").find("input").trigger("click");
}

// log struct changes
function
log_sc(action,context) {
  backendCall("logStructChanges", { action:action, context:context},
    function(res, resultPar) {
    });
}

// format object to context for logStructChanges
function
getCtx(obj, type) {
  var str = [];
  var lu = { projectname: $(".form-project [name=name]").val(),
             projecttitle: $(".form-project [name=title]").val() };
  if (type == "page" || type == "attribute") {
    lu["bookname"] = $(".form-book [name=name]").val();
    lu["booktitle"] = $(".form-book [name=title]").val();
  }
  if (type == "attribute") {
    lu["tablename"] = $(".form-page [name=tablename]").val();
    lu["pagename"] = $(".form-page [name=displayname]").val();
  }
  var keys = [ "projectname", "projecttitle", "bookname", "booktitle", "tablename", "pagename", "name", "title", "columnname", "displayname", "pagetype", "constrainttype" ];
  for (var i=0; i<keys.length; i++) {
    var k = keys[i];
    var val = obj && obj[k]?obj[k]:lu[k];
    if (!val)
      continue;
    str.push(k+": "+val);
  }
  return str.join(", ");
}

// extract function name from arguments.callee
function 
fname(callee) {
  if (!callee)
     return "";
  var str = callee.toString();
  str = str.substr('function '.length);
  str = str.substr(0, str.indexOf('('));
  return str;
}

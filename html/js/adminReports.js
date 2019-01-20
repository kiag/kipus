/* Copyright KI-AG 2013-2019, Project KIPUS */

/* global trHtml, glView */
var reportCodeDate = "$Date: 2019-01-20 15:03:39 +0100 (Sun, 20 Jan 2019) $".substr(7,10);
var reportScriptLoaded = false;
var colorHash;
// Helper functions
function countDecimalPlace(value) {
    if (Math.floor(value) !== value)
        return value.toString().split(".")[1].length || 0;
    return 0;
}
function get_sum(array) {
   var val = array.reduce(function(pv, cv) { return pv + cv; }, 0);
   if (countDecimalPlace(val) > 0)
     val = val.toFixed(2);
   return val;
}
function get_avg_num(array) {
  var sum = array.reduce(function(pv, cv) { return pv + cv; }, 0);
  if (array.length == 0)
    return "";
  var val = sum/array.length;
  if (countDecimalPlace(val) > 0)
    val = val.toFixed(2);
  return val;
}

// $Id: adminReports.js 2914 2018-04-12 13:36:02Z dba $
function getQueryVariable(variable) {
  var query = window.location.hash.substring(1);
  var vars = query.split('?');
  for (var i = 0; i < vars.length; i++) {
      var pair = vars[i].split('=');
      if (decodeURIComponent(pair[0]) == variable) {
          return decodeURIComponent(pair[1]);
      }
  }
  console.log('Query variable %s not found', variable);
}

function
select_reports()
{
  if (reportScriptLoaded)
    return;
  $(".headtitle span.waiting").show();
  loadScript('js/c3.min.js', function(){ 
    log("c3-version: "+(typeof c3 == 'undefined'?"undefined":c3.version));
    loadScript('js/d3.v3.min.js', function(){ 
      reportScriptLoaded=true;
      if (hasProjectRight("AdminAll"))
        do_select_reports();
      else { 
        var roleHash = {};
        backendCall("tableCmd", { sql: "select id from kipus_roles where admin_rights like 'Reports=%';" },
          function(res,myPar){
          for (var i1=0; i1<res.length;i1++) {
            roleHash[res[i1].id] = 1;
          } 
        backendCall("tableCmd", { sql: "select rights from kipus_user where login='"+bcUser+"'" },
          function(res,myPar){
            var rHash = {};
            var rights = res[0].rights.split(" ");
            for (var i1=0; i1<rights.length; i1++) {
              var ca = rights[i1].split(":");
              if (roleHash[ca[0]]) {
                var rids = ca[1].split(",");
                for (var i2=0; i2<rids.length; i2++) {
                   rHash[rids[i2]] = 1;
                } 
              }
            }
            do_select_reports(rHash);
        });
        });
      }
    });
  });
}

function
do_select_reports(rHash)
{
  while ($("#btn-cancelreports").is(":visible"))
    toggle_rproject_back();

  // display projects for which the user is permitted to access, and which have reports defined
  var cmdSql = "SELECT up.projectid, p.name, p.title, rp.modified "
              +"FROM kipus_userprojects up "
              +"INNER JOIN kipus_projects p ON up.projectid = p.id  "
              +"INNER JOIN (SELECT DISTINCT projectid, modified FROM kipus_reports) rp ON up.projectid = rp.projectid "
              +"WHERE up.login = '"+bcUser+"'";
  backendCall("tableCmd", { sql: cmdSql},
    function(res,myPar){
      uprojects = res;
      $("#reportprojects >tbody tr:not(.external)").remove();
      for (var i=0; i<uprojects.length; i++) {
        var row = "<tr idx='"+i+"'><td align='center'><i class='btn-link glyphicon "+glView+"'" +
                  "></i></td>"+
                  "<td><div>"+ uprojects[i].name + "</div></td>" +
                  "<td><div>"+ uprojects[i].title + "</div></td>"+
                  "<td><div>"+ uprojects[i].modified + "</div></td></tr>";
        $('#reportprojects').find('tbody:last').append(row);
      }
      $("#reportprojects i.btn-link").click(function() {
         var idx = $(this).closest("tr").attr("idx");
         toggle_rproject_view(idx, rHash);
      });
      if (uprojects.length == 1) // select the only entry available
        toggle_rproject_view(0, rHash);
    });
}


function
hide_report_tags()
{
  $("#reportparams").hide();
  $("#reportheader").hide();
  $("#chart-bar-line").hide();
  $("#chart-pie").hide();
  $("#reportbody").hide();
  $(".c3").hide();
  $("#btn-report-csvexport").hide();
  $("#btn-report-svgexport").hide();
  $("#btn-report-hide-empty").hide();
}

function
toggle_rproject_back() {
  hide_report_tags();
  if ($("#reportstable").is(":visible")) {
    $("#reportstable").hide();
    $("#reportprojects").show();
    $("#btn-report-csvexport").hide();
    $("#btn-report-svgexport").hide();
    $("#btn-report-hide-empty").hide();
    $("#btn-cancelreports").hide();
  }
  else {
    $("#reportstable").show();
  }
  $("#chart-pie,#chart-bar-line").empty();
  $(".zoom.time").hide();
  pop_headtitle("reports");
}

function
toggle_rproject_view(idx, rHash)
{
  var selected_report_row,
      selected_year = 0,
      selected_quarter = 0,
      selected_month = 0,
      selected_year_from = 0,
      selected_quarter_from = 0,
      selected_month_from = 0,
      selected_year_to = 0,
      selected_quarter_to = 0,
      selected_month_to = 0,
      selected_country = 0,
      selected_regions = [],
      selected_organisations = [],
      selected_farms = [],
      selected_fields = [],
      selected_crop = 0,   // single choice
      selected_crops = [], // multiple choice
      selected_crop_variety = 0,
      selected_market = 0,
      selected_product = 0,
      selected_educational_level = 0,
      selected_target_group = 0,
      selected_gender = 0,
      selected_trade_area = 0,
      selected_view,
      selected_aggregated_by;

  var reportState_Table = 5,
      reportState_Bar_Line = 6,
      reportState_Pie = 7;

  var reportAppendTotals = false;
  var reportHideFilter   = { 'stackedbar': false, 'bar': false, 'line': false, 'pie': false, 'table': false };
  var reportDisableFilter = { 'stackedbar': false, 'bar': false, 'line': false, 'pie': false, 'table': false };
  var reportState = 0,
      paramState = 0,
      filterTimeState = 0,
      filterHierarchyState = 0,
      filterMiscState = 0;

  var paramSql = {},
      paramJson = {};

  var filter_year_list = [],
      filter_year_from_list = [],
      filter_year_to_list = [],
      filter_country_list = [];
      filter_region_list = [],
      filter_organisation_list = [],
      filter_farm_list = [],
      filter_field_list = [],
      filter_crop_list = [],
      filter_croplist_list = [],
      filter_crop_variety_list = [],
      filter_market_list = [],
      filter_product_list = [],
      filter_educational_level_list = [],
      filter_target_group_list = [],
      filter_gender_list = [],
      filter_trade_area_list = [];

  var chart_data = {},
      pie_charts = {},
      report_data = [];

  var p = uprojects[idx];
  $("#reportstable").show();
  $("#btn-cancelreports").show();
  $("#reportprojects").hide();
  $("#reportheader").hide();
  $("#reportbody").hide();
  push_headtitle("reports", p.name + " (report code version "+ reportCodeDate+(typeof ppReportCodeDate != 'undefined' && ppReportCodeDate != reportCodeDate?' / postprocess code version '+ppReportCodeDate:'')+")");
  backendCall("tableSelect", { tableName:"kipus_reports", where: "projectid = "+p.projectid+" AND language='"+prefLang.toLowerCase()+"'", orderBy:"category,reportnumber,displayname" },
    function(res, myPar) {
      $("#reportstable >thead tr").remove();
      var row = "<tr><th trid='th_reportnumber'><span>"+trHtml.reportstable_header[2]+"</span></th>" +
                "    <th trid='th_reportname'><span style='padding-right:5px'>"+trHtml.reportstable_header[0]+"</span></th>" +
                "    <th trid='th_reportdesc'><span style='padding-right:5px'>"+trHtml.reportstable_header[1]+"</span></th>" +
                "    <th trid='th_reportmodified'><span style='padding-right:5px'>"+trHtml.reportstable_header[3]+"</span></th>" +
                "</tr>";
      $('#reportstable').find('thead:last').append(row);
      $("#reportstable >tbody tr").remove();
      var cats = {};
      for(var i=0; i<res.length; i++) {
        var r = res[i];
        if (bcUser == 'public_reports' && r.access_type != 'public')
          continue;
        var rid = r.projectid+"/"+r.reportname;
        if (rHash && !rHash[rid])
          continue;
        if (r.category && !cats[r.category]) {
          $('#reportstable').find('tbody:last').append("<tr class='reportcategory'><td colspan='42'>"+r.category+"</td>");
          cats[r.category] = 1;
        }
        var row = "<tr rowid='"+i+"'>"+
                    "<td>"+ r.reportnumber + "</td>" +
                    "<td class='reportnamesitem pointer'>"+ r.displayname + "</td>" +
                    "<td>"+r.description+"</td>"+
                    "<td>"+r.modified+"</td>"+
                  "</tr>";
        $('#reportstable').find('tbody:last').append(row);
      }
      function reportClicked(selectedrow) {
        hide_report_tags();
        $("#reportstable").hide();

        // display selected report
        push_headtitle("reports", res[selectedrow].displayname);

        reportState = 0;
        reset_report_selectors();
        selected_report_row = res[selectedrow];
        switch (selected_report_row.report_type) {
          case 'Javascript':      if (selected_report_row.postprocessfn) 
                                     eval(selected_report_row.postprocessfn); break;
          case 'Scores':          // fall-through to next case ('Table')
          case 'Table':           report_showReport(); break;
          case 'Ringchart':       report_showRingchart(selectedrow, res); break;
          default: break;         // do nothing
        }
      }
      $(".reportnamesitem").click(function () {
        // display selected report
        var selectedrow = $(this).closest("tr").attr("rowid");
        reportClicked(selectedrow);
      });
      table_pagination($("#reportstable"));
      if (window.location.hash) { // window.location.hash can select a report
        var reportid = getQueryVariable("reportid");
        if (reportid)
          reportClicked(reportid);
      }
    });

  function
  set_view_selector() {
    var charttypes = [];
    if ('y_type' in paramJson)
      charttypes = paramJson['y_type'];
    if (charttypes.length == 0) {
      // no need for selector (only table view needed)
      $("#view-selector").empty();
      $("#btn-report-hide-empty").show();
      selected_view = null;
      reportState = reportState_Table;
      report_showReport();
      return;
    }
    var optionList = 'optionList<option value="table" ' + (charttypes.length == 0?'selected="true"':'')+'>'+trHtml.chart_type[1]+'</option>' // table
                    +(charttypes.indexOf('bar')        == -1 ? '' : 'optionList<option value="bar" '        + (charttypes.length>0 && charttypes[0]=="bar"?       'selected="true"':'')+'>'  +trHtml.chart_type[2]+'</option>')
                    +(charttypes.indexOf('line')       == -1 ? '' : 'optionList<option value="line" '       + (charttypes.length>0 && charttypes[0]=="line"?      'selected="true"':'')+'>'  +trHtml.chart_type[3]+'</option>')
                    +(charttypes.indexOf('pie')        == -1 ? '' : 'optionList<option value="pie" '        + (charttypes.length>0 && charttypes[0]=="pie"?       'selected="true"':'')+'>'  +trHtml.chart_type[4]+'</option>')
                    +(charttypes.indexOf('stackedbar') == -1 ? '' : 'optionList<option value="stackedbar" ' + (charttypes.length>0 && charttypes[0]=="stackedbar"?'selected="true"':'')+'>'  +trHtml.chart_type[6]+'</option>');

    var sel =   '<div class="form-group row">'
              + '  <label for="select-view" class="col-lg-1 control-label">'+trHtml.chart_type[0]+'</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-view" >'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
    if (!selected_view) {
      $("#view-selector").empty();
      $("#view-selector").append(sel);
    }

    $("#select-view").change(function() { viewSelected($(this).val()); });
    viewSelected($("#select-view").val());

    function viewSelected(view) {
      function showHideClicked() {
        var hide = $("#view-selector .showhide a").text() == trHtml.filter[4];
        for (var key in reportHideFilter) {
          // manually override reportHideFilter, user wants to show/hide filter regardless of config
          reportHideFilter[key] = hide;
        }
        if (hide)
          $("div.filter-sel").hide();
        else
          $("div.filter-sel").show();

        $("#view-selector .showhide").remove();
        $("#view-selector div.row").append("<div class='col-lg-1 showhide'><div><a style='cursor:pointer;'>"
                                           +(reportHideFilter[view]?trHtml.filter[5]:trHtml.filter[4])+"</a></div></div>");
        $("#view-selector .showhide a").click(showHideClicked);
      }

      selected_view = view;
      $("#view-selector .showhide").remove();
      $("#view-selector div.row").append("<div class='col-lg-1 showhide'><div><a style='cursor:pointer;'>"
                                         +(reportHideFilter[view]?trHtml.filter[5]:trHtml.filter[4])+"</a></div></div>");
      $("#view-selector .showhide a").click(showHideClicked);
      show_view();
    }

    function show_view() {
      switch (selected_view) {
        case 'table':
          $("#chart-aggregation-selector").hide();
          $("#chart-bar-line").hide();
          $("#chart-pie").hide();
          $("#btn-report-svgexport").hide();
          $("#btn-report-hide-empty").show();
          reportState = reportState_Table;
          report_showReport();
          break;

        case 'stackedbar': // fall through to next case
        case 'bar': // fall through to next case
        case 'line':
          $(".c3").show();
          $("#chart-aggregation-selector").show();
          $("#chart-bar-line").show();
          $("#chart-pie").hide();
          $("#btn-report-svgexport").show();
          $("#btn-report-hide-empty").hide();
          reportState = reportState_Bar_Line;
          report_showReport();
          break;

        case 'pie':
          $(".c3").show();
          $("#chart-aggregation-selector").show();
          $("#chart-bar-line").hide();
          $("#chart-pie").show();
          $("#btn-report-svgexport").show();
          $("#btn-report-hide-empty").hide();
          reportState = reportState_Pie;
          report_showReport();
          break;

        default: break; // do nothing
      } // switch
    }
  }

  function
  reset_time_period_selectors() {
    $("#time-selector-period").empty();
    selected_year = 0;
    selected_quarter = 0;
    selected_month = 0;
  }

  function
  setup_time_period_filters()
  {
    var cmdSql, sel, optionList;

    var filterState = filterTimeState++;
    if (filterState == 0) {
      cmdSql = paramSql['@year_list'];
      if (!cmdSql) {
        filterTimeState = 3; // no time period filters to setup
        reset_time_period_selectors();

        setup_time_period_filters();
        return;
      }

      // select Year
      if (filter_year_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_year_list.push(res[i]);

            set_year_selector();
          });
      }
      else
        set_year_selector();

      function set_year_selector() {
        optionList = 'optionList<option value="0" selected="true">'+trHtml.all[0]+'</option>';
        for (var i=0; i<filter_year_list.length; i++)
          optionList += '<option value="'+filter_year_list[i].id+'">'+filter_year_list[i].Year+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-year" class="col-lg-2 control-label">'+trHtml.hierarchy_time[0]+'</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-year" >'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#time-selector-range").empty();
        $("#time-selector-period").empty();
        $("#time-selector-period").append(sel);

        $("#select-year").change(function() {yearSelected($(this).val()); });
        selected_year = $("#select-year").val();

        setup_time_period_filters();

        function yearSelected(yr) {
          selected_year = yr;
          if (selected_year == 0) {
            selected_quarter = 0;
            selected_month = 0;
          }

          filterTimeState = 1;
          setup_time_period_filters();
        }
      }
    }

    if (filterState == 1) {
      if (selected_quarter == 0) {
        // select Quarter
        optionList = 'optionList<option value="0" selected="true">'+trHtml.all[0]+'</option>';
        if (selected_year != 0)
          for (var i=1; i<=4; i++)
            optionList += 'optionList<option value="'+i+'">'+trHtml.quarter_list[i]+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-quarter" class="col-lg-2 control-label">'+trHtml.hierarchy_time[1]+'</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-quarter" >'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        if ($("#time-selector-period").find("#select-quarter").length != 0)
          $("#time-selector-period").find("#select-quarter").closest(".form-group").replaceWith(sel);
        else
          $("#time-selector-period").append(sel);

        $("#select-quarter").change(function() {quarterSelected($(this).val()); });
        selected_quarter = $("#select-quarter").val();

        function quarterSelected(qtr) {
          selected_quarter = qtr;
          selected_month = 0;
          filterTimeState = 2;
          setup_time_period_filters();
        }
      }

      setup_time_period_filters();
    }

    if (filterState == 2) {
      if (selected_month == 0) {
        // select Month
        optionList = 'optionList<option value="0" selected="true">'+trHtml.all[0]+'</option>';
        if (selected_quarter != 0) {
          var startIndex = (+selected_quarter - 1)*3 + 1;
          for (var i=startIndex; i<startIndex+3; i++)
            optionList += 'optionList<option value="'+i+'">'+trHtml.month_list[i]+'</option>';
        }

        sel =   '<div class="form-group row">'
              + '  <label for="select-month" class="col-lg-2 control-label">'+trHtml.hierarchy_time[2]+'</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-month" >'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        if ($("#time-selector-period").find("#select-month").length != 0)
          $("#time-selector-period").find("#select-month").closest(".form-group").replaceWith(sel);
        else
          $("#time-selector-period").append(sel);

        function monthSelected(mnth) {
          selected_month = mnth;
          filterTimeState = 3;
          setup_time_period_filters();
        }
        $("#select-month").change(function() {monthSelected($(this).val()); });
        selected_month = $("#select-month").val();
      }
      setup_time_period_filters();
    }

    if (filterState == 3) {
      filterTimeState = 0;

      report_showReport();
    }
  }

  function
  reset_time_range_selectors() {
    $("#time-selector-range").empty();
    selected_year_from = 0;
    selected_quarter_from = 0;
    selected_month_from = 0;
    selected_year_to = 0;
    selected_quarter_to = 0;
    selected_month_to = 0;
  }

  function
  setup_time_range_filters()
  {
    var cmdSql, sel, optionList;

    var filterState = filterTimeState++;
//console.log("setup_time_range_filters(): filterTimeState = "+filterState);
    if (filterState == 0) {
      cmdSql = paramSql['@year_list_from'];
      if (!cmdSql) {
        filterTimeState = 6; // no time range filters to setup
        reset_time_range_selectors();

        setup_time_range_filters();
        return;
      }

      // select Year from
      if (filter_year_from_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_year_from_list.push(res[i]);

            set_year_from_selector();
          });
      }
      else
        set_year_from_selector();

      function set_year_from_selector() {
        optionList = 'optionList<option value="0" selected="true">'+trHtml.all[0]+'</option>';
        for (var i=0; i<filter_year_from_list.length; i++)
          optionList += '<option value="'+filter_year_from_list[i].id+'">'+filter_year_from_list[i].Year+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-year-from" class="col-lg-2 control-label">'+trHtml.hierarchy_time[3]+'</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-year-from" >'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#time-selector-period").empty();
        $("#time-selector-range").empty();
        $("#time-selector-range").append(sel);

        $("#select-year-from").change(function() {yearFromSelected($(this).val()); });
        selected_year_from = $("#select-year-from").val();

        setup_time_range_filters();

        function yearFromSelected(yr) {
          selected_year_from = yr;
          if (selected_year_from == 0)
          {
            selected_quarter_from = 0;
            selected_month_from = 0;
          }
          filterTimeState = 1;
          setup_time_range_filters();
        }
      }
    }

    if (filterState == 1) {
      if (selected_quarter_from == 0) {
        // select Quarter from
        optionList = 'optionList<option value="0" selected="true">'+trHtml.all[0]+'</option>';
        if (selected_year_from != 0)
          for (var i=1; i<=4; i++)
            optionList += 'optionList<option value="'+i+'">'+trHtml.quarter_list[i]+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-quarter-from" class="col-lg-2 control-label">'+trHtml.hierarchy_time[4]+'</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-quarter-from" >'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        if ($("#time-selector-range").find("#select-quarter-from").length != 0)
          $("#time-selector-range").find("#select-quarter-from").closest(".form-group").replaceWith(sel);
        else
          $("#time-selector-range").append(sel);

        $("#select-quarter-from").change(function() {quarterFromSelected($(this).val()); });
        selected_quarter_from = $("#select-quarter-from").val();

        function quarterFromSelected(qtr) {
          selected_quarter_from = qtr;
          selected_month_from = 0;
          filterTimeState = 2;
          setup_time_range_filters();
        }
      }

      setup_time_range_filters();
    }

    if (filterState == 2) {
      if (selected_month_from == 0) {
        // select Month from
        optionList = 'optionList<option value="0" selected="true">'+trHtml.all[0]+'</option>';
        if (selected_quarter_from != 0) {
          var startIndex = (+selected_quarter_from - 1)*3 + 1;
          for (var i=startIndex; i<startIndex+3; i++)
            optionList += 'optionList<option value="'+i+'">'+trHtml.month_list[i]+'</option>';
        }

        sel =   '<div class="form-group row">'
              + '  <label for="select-month-from" class="col-lg-2 control-label">'+trHtml.hierarchy_time[5]+'</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-month-from" >'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        if ($("#time-selector-range").find("#select-month-from").length != 0)
          $("#time-selector-range").find("#select-month-from").closest(".form-group").replaceWith(sel);
        else
          $("#time-selector-range").append(sel);

        $("#select-month-from").change(function() {monthFromSelected($(this).val()); });
        selected_month_from = $("#select-month-from").val();

        function monthFromSelected(mnth) {
          selected_month_from = mnth;
          filterTimeState = 3;
          setup_time_range_filters();
        }
      }

      setup_time_range_filters();
    }

    if (filterState == 3) {
      // select Year to
      filter_year_to_list.length = 0;
      var reset_selected_year_to = true;
      if (selected_year_from != 0)
        for (var i=0; i<filter_year_from_list.length; i++) {
          if (filter_year_from_list[i].id >= selected_year_from) {
            filter_year_to_list.push(filter_year_from_list[i]);
            if (filter_year_from_list[i].id == selected_year_to)
              reset_selected_year_to = false;
          }
        }

      if (reset_selected_year_to)
        selected_year_to = 0;

      optionList = '';
      if (filter_year_to_list.length == 0)
        optionList += 'optionList<option value="0" selected="true">'+trHtml.all[0]+'</option>';
      else
        for (var i=0; i<filter_year_to_list.length; i++)
          optionList += '<option value="'+filter_year_to_list[i].id+ (selected_year_to==filter_year_to_list[i].id ? '" selected="true' : '') +'">'+filter_year_to_list[i].Year+'</option>';

      sel =   '<div class="form-group row">'
            + '  <label for="select-year-to" class="col-lg-2 control-label">'+trHtml.hierarchy_time[6]+'</label>'
            + '  <div class="col-lg-5">'
            + '    <select class="form-control" id="select-year-to" >'+ optionList +'</select>'
            + '  </div>'
            + '</div>';
      if($("#time-selector-range").find("#select-year-to").length != 0)
        $("#time-selector-range").find("#select-year-to").closest(".form-group").replaceWith(sel);
      else
        $("#time-selector-range").append(sel);

      $("#select-year-to").change(function() {yearToSelected($(this).val()); });
      selected_year_to = $("#select-year-to").val();

      function yearToSelected(yr) {
        selected_year_to = yr;
        filterTimeState = 4;
        setup_time_range_filters();
      }

      setup_time_range_filters();
    }

    if (filterState == 4) {
      optionList = '';
      // select Quarter to
      if (selected_quarter_from != 0) {
        for (var i=1; i<=4; i++)
          if (selected_year_from != selected_year_to || i >= selected_quarter_from)
            optionList += 'optionList<option value="'+i+ (i==selected_quarter_to ? '" selected="true' : '') +'">'+trHtml.quarter_list[i]+'</option>';
      }
      else
        optionList += 'optionList<option value="0" selected="true">'+trHtml.all[0]+'</option>';

      sel =   '<div class="form-group row">'
            + '  <label for="select-quarter-to" class="col-lg-2 control-label">'+trHtml.hierarchy_time[7]+'</label>'
            + '  <div class="col-lg-5">'
            + '    <select class="form-control" id="select-quarter-to" >'+ optionList +'</select>'
            + '  </div>'
            + '</div>';
      if ($("#time-selector-range").find("#select-quarter-to").length != 0)
        $("#time-selector-range").find("#select-quarter-to").closest(".form-group").replaceWith(sel);
      else
        $("#time-selector-range").append(sel);

      $("#select-quarter-to").change(function() {quarterToSelected($(this).val()); });
      selected_quarter_to = $("#select-quarter-to").val();

      function quarterToSelected(qtr) {
        selected_quarter_to = qtr;
        selected_month_to = 0;
        filterTimeState = 5;
        setup_time_range_filters();
      }

      setup_time_range_filters();
    }

    if (filterState == 5) {
      optionList = '';
      // select Month to
      if (selected_month_from != 0) {
        minMonth = 1;
        if (selected_year_from == selected_year_to && selected_quarter_from == selected_quarter_to)
          minMonth = selected_month_from;

        if (selected_quarter_to != 0) {
          var startIndex = (+selected_quarter_to - 1)*3 + 1;
          for (var i=Math.max(startIndex, minMonth); i<startIndex+3; i++)
            optionList += 'optionList<option value="'+i+'">'+trHtml.month_list[i]+'</option>';
        }
      }
      else
        optionList += 'optionList<option value="0" selected="true">'+trHtml.all[0]+'</option>';

      sel =   '<div class="form-group row">'
            + '  <label for="select-month-to" class="col-lg-2 control-label">'+trHtml.hierarchy_time[8]+'</label>'
            + '  <div class="col-lg-5">'
            + '    <select class="form-control" id="select-month-to" >'+ optionList +'</select>'
            + '  </div>'
            + '</div>';
      if ($("#time-selector-range").find("#select-month-to").length != 0)
        $("#time-selector-range").find("#select-month-to").closest(".form-group").replaceWith(sel);
      else
        $("#time-selector-range").append(sel);

      $("#select-month-to").change(function() {monthToSelected($(this).val()); });
      selected_month_to = $("#select-month-to").val();

      function monthToSelected(mnth) {
        selected_month_to = mnth;
        filterTimeState = 6;
        setup_time_range_filters();
      }

      setup_time_range_filters();
    }

    if (filterState == 6) {
      filterTimeState = 0;

      report_showReport();
    }

  }

  function
  reset_hierarchy_selectors() {
    $("#region-selector").empty();
    selected_regions = [];
    $("#organisation-selector").empty();
    selected_organisations = [];
    $("#farm-selector").empty();
    selected_farms = [];
    $("#field-selector").empty();
    selected_fields = [];
  }

  function
  setup_hierarchy_filters()
  {
    var cmdSql, sel, optionList;

    var filterState = filterHierarchyState++;
//console.log("setup_hierarchy_filters(): filterState = "+filterState);
    if (filterState == 0) {
      cmdSql = paramSql['@region_list'];
      if (!cmdSql) {
        filterHierarchyState = 4; // no further hierarchy filters to setup
        setup_hierarchy_filters();
        return;
      }

      // select Region
      if (filter_region_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            res.sort(function(a,b){
                      if ( a.HIERARCHYPATH < b.HIERARCHYPATH ) return -1;
                      if ( a.HIERARCHYPATH > b.HIERARCHYPATH ) return 1;
                      return 0;
                    });
            for (var i=0; i<res.length; i++) {
              var indent = '';
              for (var j=1; j<res[i].HIERARCHYPATH.split(',').length; j++)
                indent += '&nbsp;&nbsp;&nbsp;&nbsp;';
              res[i].Region = indent + res[i].Region;
              filter_region_list.push(res[i]);
            }

            set_region_selector();
          });
      }
      else
        set_region_selector();

      function set_region_selector() {
        optionList = '';
        for (var i=0; i<filter_region_list.length; i++)
          optionList += '<option value="'+filter_region_list[i].HIERARCHYPATH+ (filter_region_list[i].HIERARCHYPATH.split(",").length == 1 ? '" selected="true':'') + '">'+filter_region_list[i].Region+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-region" class="col-lg-2 control-label">'+trHtml.hierarchy_1[0]+'</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-region" multiple>'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#region-selector").empty();
        $("#region-selector").append(sel);

        $("#select-region").change(function() {
          if (!$(this).val()) {
            $(this).val(selected_regions); // set the previous selections
            okDialog(trHtml.selection[0]+" "+trHtml.hierarchy_1[0].toLowerCase()+".");
          }
          else
            regionsSelected($(this).val());
        });
        selected_regions = $("#select-region").val();
        if (!selected_regions)
          selected_regions = [];

        setup_hierarchy_filters();

        function regionsSelected(regions) {
          selected_regions = regions;
          selected_organisations = [];
          selected_farms = [];
          selected_fields = [];

          filterHierarchyState = 1;
          setup_hierarchy_filters();
        }
      }
    }

    if (filterState == 1) {
      cmdSql = paramSql['@organisation_list'];
      if (!cmdSql) {
        filterHierarchyState = 4; // no further hierarchy filters to setup
        setup_hierarchy_filters();
        return;
      }

      // select Organisation
      if (filter_organisation_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_organisation_list.push(res[i]);

            set_organisation_selector();
          }
        );
      }
      else
        set_organisation_selector();

      function set_organisation_selector() {
        var rlist = selected_regions.length ?
                    selected_regions[0].split(",") : [];
        orgHash = {};
        for (var i=0; i<filter_organisation_list.length; i++) {
          org_region_id = filter_organisation_list[i].region_id;
          for (var j=0; j<filter_region_list.length; j++) {
            if (filter_region_list[j].id == org_region_id) {
              r = filter_region_list[j].HIERARCHYPATH.split(",");
              for (var k=0; k<r.length; k++) {
                if (rlist.indexOf(r[k]) != -1) {
                  orgHash[filter_organisation_list[i].id] = filter_organisation_list[i].Organisation;
                }
              }
              break; // for j<filter_region_list.length loop
            }
          }
        }
        orgHashSorted = [];
        for (var item in orgHash)
          orgHashSorted.push([item, orgHash[item]]);
          orgHashSorted.sort(function(a,b){
                              if ( a[1] < b[1] ) return -1;
                              if ( a[1] > b[1] ) return 1;
                              return 0;
                            });

        optionList = '';
        for (var i=0; i<orgHashSorted.length; i++) {
          id = orgHashSorted[i][0];
          for (var j=0; j<filter_organisation_list.length; j++)
            if (filter_organisation_list[j].id == id) {
              optionList += '<option value="'+filter_organisation_list[j].id+'" selected="true">'+filter_organisation_list[j].Organisation+'</option>';
              break;
            }
        }

        sel =   '<div class="form-group row">'
              + '  <label for="select-organisation" class="col-lg-2 control-label">'+trHtml.hierarchy_1[1]+'</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-organisation" multiple>'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#organisation-selector").empty();
        $("#organisation-selector").append(sel);

        $("#select-organisation").change(function() {
          if (!$(this).val()) {
            $(this).val(selected_organisations); // set the previous selections
            okDialog(trHtml.selection[0]+" "+trHtml.hierarchy_1[1].toLowerCase()+".");
          }
          else
            organisationsSelected($(this).val());
        });
        selected_organisations = $("#select-organisation").val();
        if (!selected_organisations)
          selected_organisations = [];

        setup_hierarchy_filters();

        function organisationsSelected(organisations) {
          selected_organisations = organisations;
          selected_farms = [];

          filterHierarchyState = 2;
          setup_hierarchy_filters();
        }
      }
    }

    if (filterState == 2) {
      cmdSql = paramSql['@farm_list'];
      if (!cmdSql) {
        filterHierarchyState = 4; // no further hierarchy filters to setup
        setup_hierarchy_filters();
        return;
      }

      // select Farm
      if (filter_farm_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_farm_list.push(res[i]);

            set_farm_selector();
          }
        );
      }
      else
        set_farm_selector();

      function set_farm_selector() {
        optionList = '';
        for (var i=0; i<filter_farm_list.length; i++)
          if (selected_organisations.indexOf(filter_farm_list[i].organisation_id) != -1)
            optionList += '<option value="'+filter_farm_list[i].id+'" selected="true">'+filter_farm_list[i].Farm+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-farm" class="col-lg-2 control-label">'+trHtml.hierarchy_1[2]+'</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-farm" multiple>'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#farm-selector").empty();
        $("#farm-selector").append(sel);

        $("#select-farm").change(function() {
          if (!$(this).val()) {
            $(this).val(selected_farms); // set the previous selections
            okDialog(trHtml.selection[0]+" "+trHtml.hierarchy_1[2].toLowerCase()+".");
          }
          else
            farmsSelected($(this).val());
        });
        selected_farms = $("#select-farm").val();
        if (!selected_farms)
          selected_farms = [];

        setup_hierarchy_filters();

        function farmsSelected(farms) {
          selected_farms = farms;

          filterHierarchyState = 3;
          setup_hierarchy_filters();
        }
      }
    }

    if (filterState == 3) {
      cmdSql = paramSql['@field_list'];
      if (!cmdSql) {
        filterHierarchyState = 4; // no further hierarchy filters to setup
        setup_hierarchy_filters();
        return;
      }
      // select Field
      if (filter_field_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_field_list.push(res[i]);

            set_field_selector();
          }
        );
      }
      else
        set_field_selector();

      function set_field_selector() {
        optionList = '';
        for (var i=0; i<filter_field_list.length; i++)
          if (selected_farms.indexOf(filter_field_list[i].farm_id+'') != -1)
            optionList += '<option value="'+filter_field_list[i].id+'" selected="true">'+filter_field_list[i].Field+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-field" class="col-lg-2 control-label">'+trHtml.hierarchy_1[3]+'</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-field" multiple>'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#field-selector").empty();
        $("#field-selector").append(sel);

        $("#select-field").change(function() {
          if (!$(this).val()) {
            $(this).val(selected_fields); // set the previous selections
            okDialog(trHtml.selection[0]+" "+trHtml.hierarchy_1[3].toLowerCase()+".");
          }
          else
            fieldsSelected($(this).val());
        });
        selected_fields = $("#select-field").val();
        if (!selected_fields)
          selected_fields = [];

        setup_hierarchy_filters();

        function fieldsSelected(fields) {
          selected_fields = fields;

          filterHierarchyState = 4;
          setup_hierarchy_filters();
        }
      }
    }

    if (filterState == 4) {
      filterHierarchyState = 0;
      report_showReport();
    }
  }

  function
  setup_misc_filters()
  {
    var cmdSql, sel, optionList;

    var filterState = filterMiscState++;
//console.log("setup_misc_filters(): filterState = "+filterState);
    if (filterState == 0) {
      if ('country' in paramJson)
        setup_country_filter(paramJson['country']);
      else
        setup_misc_filters();
    }
    if (filterState == 1) {
      if ('crop' in paramJson)
        setup_crop_filter(paramJson['crop']);
      else if ('crop_list' in paramJson)
        setup_croplist_filter(paramJson['crop_list']);
      else
        setup_misc_filters();
    }
    if (filterState == 2) {
      if ('@crop_variety' in paramSql) // for UG MARKETDATA
        setup_crop_variety_filter(paramJson['crop_variety']);
      else
        setup_misc_filters();
    }
    if (filterState == 3) {
      if ('@market_list' in paramSql) // for Togo
        setup_market_filter();
      else
        setup_misc_filters();
    }
    if (filterState == 4) {
      if ('@product_list' in paramSql) // for Togo
        setup_product_filter();
      else
        setup_misc_filters();
    }
    if (filterState == 5) {
      if ('@sitecountry' in paramSql) // for GIZ_SOIL
        setup_sitecountry_filter();
      else
        setup_misc_filters();
    }
    if (filterState == 6) {
      if ('@educational_level_list' in paramSql) // for GTVP
        setup_educational_level_filter();
      else
        setup_misc_filters();
    }
    if (filterState == 7) {
      if ('@target_group_list' in paramSql) // for GTVP
        setup_target_group_filter();
      else
        setup_misc_filters();
    }
    if (filterState == 8) {
      if ('@gender_list' in paramSql) // for GTVP
        setup_gender_filter();
      else
        setup_misc_filters();
    }
    if (filterState == 9) {
      if ('@trade_area_list' in paramSql) // for GTVP
        setup_trade_area_filter();
      else
        setup_misc_filters();
    }
    if (filterState == 10) {
      filterMiscState = 0;
      report_showReport();
    }
  }

  function
  reset_misc_selectors()
  {
    $("#crop-selector").empty();
    filter_crop_list = [];
    filter_croplist_list = [];
    
    $("#crop-variety-selector").empty();
    filter_crop_variety_list = [];

    $("#market-selector").empty();
    filter_market_list = [];

    $("#product-selector").empty();
    filter_product_list = [];

    $("#country-selector").empty();
    filter_country_list = [];

    $("#view-selector").empty();
    selected_view = null;

    /* GTVP */
    $("#educational_level-selector").empty();
    filter_educational_level_list = [];

    $("#target_group-selector").empty();
    filter_target_group_list = [];

    $("#gender-selector").empty();
    filter_gender_list = [];

    $("#trade_area-selector").empty();
    filter_trade_area_list = [];

    $("#chart-aggregation-selector").empty();
    selected_aggregated_by = null;
 }

  function
  setup_country_filter(countryParam)
  {
      cmdSql = paramSql[countryParam]; // for UG MARKETDATA
      if (!cmdSql) {
        setup_misc_filters();
        return;
      }

      // select Country
      if (filter_country_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_country_list.push(res[i]);

            set_country_selector();
          }
        );
      }
      else
        set_country_selector();

      function set_country_selector() {
        optionList = '';
        for (var i=0; i<filter_country_list.length; i++)
          optionList += '<option value="'+filter_country_list[i].id+ (i == 0 ? '" selected="true':'') + '">'+filter_country_list[i].Country+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-country" class="col-lg-2 control-label">Country</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-country">'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#country-selector").empty();
        $("#country-selector").append(sel);

        $("#select-country").change(function() {countrySelected($(this).val()); });
        selected_country = $("#select-country").val();
        if (!selected_country)
          selected_country = 0;

        setup_misc_filters();

        function countrySelected(cntry) {
          selected_country = cntry;
          report_showReport();
        }
      }
  }

  function
  setup_crop_filter(cropParam)
  {
    cmdSql = paramSql[cropParam];
    if (!cmdSql) {
      setup_misc_filters();
      return;
    }
    // select Crop
    if (filter_crop_list.length == 0) {
      backendCall("tableCmd", { sql: cmdSql },
        function(res,myPar){
          for (var i=0; i<res.length; i++)
            filter_crop_list.push(res[i]);

          set_crop_selector();
        }
      );
    }
    else
      setup_misc_filters();

    function set_crop_selector() {
      optionList = '';
      for (var i=0; i<filter_crop_list.length; i++)
          optionList += '<option value="'+filter_crop_list[i].id+ (i == 0 ? '" selected="true':'') + '">'+filter_crop_list[i].Crop+'</option>';

      sel =   '<div class="form-group row">'
            + '  <label for="select-crop" class="col-lg-2 control-label">'+trHtml.hierarchy_1[4]+'</label>'
            + '  <div class="col-lg-5">'
            + '    <select class="form-control" id="select-crop">'+ optionList +'</select>'
            + '  </div>'
            + '</div>';
      $("#crop-selector").empty();
      $("#crop-selector").append(sel);

      $("#select-crop").change(function() {
        if (!$(this).val()) {
          $(this).val(selected_crop); // set the previous selections
          okDialog(trHtml.selection[0]+" "+trHtml.hierarchy_1[4].toLowerCase()+".");
        }
        else {
          cropSelected($(this).val());
        }
      });
      selected_crop = $("#select-crop").val();
      if (!selected_crop)
        selected_crop = 0;

      setup_misc_filters();

      function cropSelected(crop) {
        selected_crop = crop;

        // update dependent selector
        if ('@crop_variety' in paramSql) // for UG MARKETDATA
        {
//console.log('crop_selector.cropSelected(): selected_crop = '+selected_crop);
          filterMiscState = 2;
          setup_crop_variety_filter(paramJson['crop_variety']);
        }
        else
          report_showReport();
      }
    }
  }

  function
  setup_croplist_filter(cropListParam)
  {
      cmdSql = paramSql[cropListParam];
      if (!cmdSql) {
        setup_misc_filters();
        return;
      }
      // select Crops
      if (filter_croplist_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_croplist_list.push(res[i]);

            set_croplist_selector();
          }
        );
      }
      else {
        setup_misc_filters();
      }

      function set_croplist_selector() {
        optionList = '';
        for (var i=0; i<filter_croplist_list.length; i++)
          optionList += '<option value="'+filter_croplist_list[i].id+'" selected="true">'+filter_croplist_list[i].Crop+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-crop" class="col-lg-2 control-label">'+trHtml.hierarchy_1[4]+'</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-crop" multiple>'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#crop-selector").empty();
        $("#crop-selector").append(sel);

        $("#select-crop").change(function() {
          if (!$(this).val()) {
            $(this).val(selected_crops); // set the previous selections
            okDialog(trHtml.selection[0]+" "+trHtml.hierarchy_1[4].toLowerCase()+".");
          }
          else {
            cropsSelected($(this).val());
          }
        });
        selected_crops = $("#select-crop").val();
        if (!selected_crops)
          selected_crops = [];

        setup_misc_filters();

        function cropsSelected(crops) {
          selected_crops = crops;

          report_showReport();
        }
      }
  }


  function
  setup_crop_variety_filter(cropVarietyParam)
  {
    cmdSql = paramSql[cropVarietyParam];
    if (!cmdSql) {
      setup_misc_filters();
      return;
    }
    // select Crop variety
    if (filter_crop_variety_list.length == 0) {
      backendCall("tableCmd", { sql: cmdSql },
        function(res,myPar){
          for (var i=0; i<res.length; i++)
            filter_crop_variety_list.push(res[i]);
  
          set_crop_variety_selector();
        }
      );
    }
    else 
      set_crop_variety_selector();  

    function set_crop_variety_selector() {
      optionList = '';
      for (var i=0; i<filter_crop_variety_list.length; i++)
        // show only varieties for selected crop
        if (selected_crop == 0 || selected_crop == filter_crop_variety_list[i].Crop)
          optionList += '<option value="'+filter_crop_variety_list[i].id+ (i == 0 ? '" selected="true':'') + '">'+filter_crop_variety_list[i].CropVariety+'</option>';

      sel =   '<div class="form-group row">'
            + '  <label for="select-crop_variety" class="col-lg-2 control-label">'+trHtml.hierarchy_1[5]+'</label>'
            + '  <div class="col-lg-5">'
            + '    <select class="form-control" id="select-crop_variety">'+ optionList +'</select>'
            + '  </div>'
            + '</div>';
      $("#crop-variety-selector").empty();
      $("#crop-variety-selector").append(sel);

      $("#select-crop_variety").change(function() {
        if (!$(this).val()) {
          $(this).val(selected_crop_variety); // set the previous selections
          okDialog(trHtml.selection[0]+" "+trHtml.hierarchy_1[5].toLowerCase()+".");
        }
        else {
          cropVarietySelected($(this).val());
        }
      });
      selected_crop_variety = $("#select-crop_variety").val();
      if (!selected_crop_variety)
        selected_crop_variety = 0;

      setup_misc_filters();

      function cropVarietySelected(variety) {
        selected_crop_variety = variety;

        report_showReport();
      }
    }
  }


  function
  setup_sitecountry_filter()
  {
      cmdSql = paramSql['@sitecountry']; // for GIZ_SOIL
      if (!cmdSql) {
        setup_misc_filters();
        return;
      }

      // select Country
      if (filter_country_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_country_list.push(res[i]);

            set_country_selector();
          }
        );
      }
      else
        set_country_selector();

      function set_country_selector() {
        optionList = '';
        for (var i=0; i<filter_country_list.length; i++)
          optionList += '<option value="'+filter_country_list[i].id+ (i == 0 ? '" selected="true':'') + '">'+filter_country_list[i].Country+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-country" class="col-lg-2 control-label">Country</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-country">'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#country-selector").empty();
        $("#country-selector").append(sel);

        $("#select-country").change(function() {countrySelected($(this).val()); });
        selected_country = $("#select-country").val();
        if (!selected_country)
          selected_country = [];

        setup_misc_filters();

        function countrySelected(cntry) {
          selected_country = cntry;
          report_showReport();
        }
      }
  }

  function
  setup_market_filter()
  {
      cmdSql = paramSql['@market_list'];
      if (!cmdSql) {
        setup_misc_filters();
        return;
      }

      // select Market
      if (filter_market_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_market_list.push(res[i]);

            set_market_selector();
          }
        );
      }
      else
        set_market_selector();

      function set_market_selector() {
        optionList = '';
        for (var i=0; i<filter_market_list.length; i++)
          optionList += '<option value="'+filter_market_list[i].id+ (i == 0 ? '" selected="true':'') + '">'+filter_market_list[i].Market+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-market" class="col-lg-2 control-label">Marché</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-market">'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#product-selector").empty();
        $("#market-selector").empty();
        $("#market-selector").append(sel);

        $("#select-market").change(function() {marketSelected($(this).val()); });
        selected_market = $("#select-market").val();
        if (!selected_market)
          selected_market = 0;

        setup_misc_filters();

        function marketSelected(mkt) {
          selected_market = mkt;
          report_showReport();
        }
      }
  }

  function
  setup_product_filter()
  {
      cmdSql = paramSql['@product_list'];
      if (!cmdSql) {
        setup_misc_filters();
        return;
      }

      // select Market
      if (filter_product_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_product_list.push(res[i]);

            set_product_selector();
          }
        );
      }
      else
        set_product_selector();

      function set_product_selector() {
        optionList = '';
        for (var i=0; i<filter_product_list.length; i++)
          optionList += '<option value="'+filter_product_list[i].id+ (i == 0 ? '" selected="true':'') + '">'+filter_product_list[i].Product+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-product" class="col-lg-2 control-label">Produit</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-product">'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#market-selector").empty();
        $("#product-selector").empty();
        $("#product-selector").append(sel);

        $("#select-product").change(function() {productSelected($(this).val()); });
        selected_product = $("#select-product").val();
        if (!selected_product)
          selected_product = 0;

        setup_misc_filters();

        function productSelected(prod) {
          selected_product = prod;
          report_showReport();
        }
      }
  }


  /* GTVP */

  function
  setup_educational_level_filter()
  {
      cmdSql = paramSql['@educational_level_list'];
      if (!cmdSql) {
        setup_misc_filters();
        return;
      }

      // select Educational Level
      if (filter_educational_level_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_educational_level_list.push(res[i]);

            set_educational_level_selector();
          }
        );
      }
      else
        set_educational_level_selector();

      function set_educational_level_selector() {
        optionList = '';
        for (var i=0; i<filter_educational_level_list.length; i++)
          optionList += '<option value="'+filter_educational_level_list[i].id+ '" selected="true">'+filter_educational_level_list[i].EducationalLevel+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-educational_level" class="col-lg-2 control-label">Educational Level</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-educational_level" multiple>'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#educational_level-selector").empty();
        $("#educational_level-selector").append(sel);

        $("#select-educational_level").change(function() {educationalLevelSelected($(this).val()); });
        selected_educational_level = $("#select-educational_level").val();
        if (!selected_educational_level)
          selected_educational_level = 0;

        setup_misc_filters();

        function educationalLevelSelected(el) {
          selected_educational_level = el;
          report_showReport();
        }
      }
  }

  function
  setup_target_group_filter()
  {
      cmdSql = paramSql['@target_group_list'];
      if (!cmdSql) {
        setup_misc_filters();
        return;
      }

      // select Target Group
      if (filter_target_group_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_target_group_list.push(res[i]);

            set_target_group_selector();
          }
        );
      }
      else
        set_target_group_selector();

      function set_target_group_selector() {
        optionList = '';
        for (var i=0; i<filter_target_group_list.length; i++)
          optionList += '<option value="'+filter_target_group_list[i].id+ '" selected="true">'+filter_target_group_list[i].TargetGroup+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-target_group" class="col-lg-2 control-label">Target Group</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-target_group" multiple>'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#target_group-selector").empty();
        $("#target_group-selector").append(sel);

        $("#select-target_group").change(function() {targetGroupSelected($(this).val()); });
        selected_target_group = $("#select-target_group").val();
        if (!selected_target_group)
          selected_target_group = 0;

        setup_misc_filters();

        function targetGroupSelected(el) {
          selected_target_group = el;
          report_showReport();
        }
      }
  }

  function
  setup_gender_filter()
  {
      cmdSql = paramSql['@gender_list'];
      if (!cmdSql) {
        setup_misc_filters();
        return;
      }

      // select gender
      if (filter_gender_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_gender_list.push(res[i]);

            set_gender_selector();
          }
        );
      }
      else
        set_gender_selector();

      function set_gender_selector() {
        optionList = '';
        for (var i=0; i<filter_gender_list.length; i++)
          optionList += '<option value="'+filter_gender_list[i].id+ '" selected="true">'+filter_gender_list[i].Gender+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-gender" class="col-lg-2 control-label">Gender</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-gender" multiple>'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#gender-selector").empty();
        $("#gender-selector").append(sel);

        $("#select-gender").change(function() {genderSelected($(this).val()); });
        selected_gender = $("#select-gender").val();
        if (!selected_gender)
          selected_gender = 0;

        setup_misc_filters();

        function genderSelected(g) {
          selected_gender = g;
          report_showReport();
        }
      }
  }

  function
  setup_trade_area_filter()
  {
      cmdSql = paramSql['@trade_area_list'];
      if (!cmdSql) {
        setup_misc_filters();
        return;
      }

      // select trade area
      if (filter_trade_area_list.length == 0) {
        backendCall("tableCmd", { sql: cmdSql},
          function(res,myPar){
            for (var i=0; i<res.length; i++)
              filter_trade_area_list.push(res[i]);

            set_trade_area_selector();
          }
        );
      }
      else
        set_trade_area_selector();

      function set_trade_area_selector() {
        optionList = '';
        for (var i=0; i<filter_trade_area_list.length; i++)
          optionList += '<option value="'+filter_trade_area_list[i].id+ '" selected="true">'+filter_trade_area_list[i].TradeArea+'</option>';

        sel =   '<div class="form-group row">'
              + '  <label for="select-trade_area" class="col-lg-2 control-label">Trade Area</label>'
              + '  <div class="col-lg-5">'
              + '    <select class="form-control" id="select-trade_area" multiple>'+ optionList +'</select>'
              + '  </div>'
              + '</div>';
        $("#trade_area-selector").empty();
        $("#trade_area-selector").append(sel);

        $("#select-trade_area").change(function() {tradeAreaSelected($(this).val()); });
        selected_trade_area = $("#select-trade_area").val();
        if (!selected_trade_area)
          selected_trade_area = 0;

        setup_misc_filters();

        function tradeAreaSelected(ta) {
          selected_trade_area = ta;
          report_showReport();
        }
      }
  }

  function
  disable_report_filters(disableValue)
  {
    if ('@year_list' in paramSql) {
      // time period filters
      $("#select-year").prop('disabled', disableValue);
      $("#select-quarter").prop('disabled', disableValue);
      $("#select-month").prop('disabled', disableValue);
    }
    else if ('@year_list_from' in paramSql) {
      // time range filters
      $("#select-year-from").prop('disabled', disableValue);
      $("#select-quarter-from").prop('disabled', disableValue);
      $("#select-month-from").prop('disabled', disableValue);
      $("#select-year-to").prop('disabled', disableValue);
      $("#select-quarter-to").prop('disabled', disableValue);
      $("#select-month-to").prop('disabled', disableValue);

    }
    // hierarchy filters
    if ('@region_list' in paramSql) {
      $("#select-region").prop('disabled', disableValue);
      $("#select-organisation").prop('disabled', disableValue);
      $("#select-farm").prop('disabled', disableValue);
    }

    // country filter
    if ('country' in paramJson) {
      $("#select-country").prop('disabled', disableValue);
    }
    
    // crop filter
    if ('crop_list' in paramJson) {
      $("#select-crop").prop('disabled', disableValue);
    }

    // market filter
    if ('@market_list' in paramSql) {
      $("#select-market").prop('disabled', disableValue);
    }

    // product filter
    if ('@product_list' in paramSql) {
      $("#select-product").prop('disabled', disableValue);
    }

    /* GTVP */
    if ('@educational_level_list' in paramSql) {
      $("#select-educational_level").prop('disabled', disableValue);
    }
    if ('@target_group_list' in paramSql) {
      $("#select-target_group").prop('disabled', disableValue);
    }
    if ('@gender_list' in paramSql) {
      $("#select-gender").prop('disabled', disableValue);
    }
    if ('@trade_area_list' in paramSql) {
      $("#select-trade_area").prop('disabled', disableValue);
    }

  }

  function
  reset_report_selectors()
  {
    reset_time_period_selectors();
    reset_time_range_selectors();
    reset_hierarchy_selectors();
    reset_misc_selectors();
  }

  function
  report_getParameters()
  {
     var state = paramState++;

    if (state == 0) {
      // get the eponymous JSON parameter for the report
      backendCall("tableSelect", { tableName:"kipus_reportparams",
          where:"paramname = '@"+selected_report_row.reportname+"' AND projectid = "+selected_report_row.projectid+" AND paramtype = 'JSON'" },
        function(res, myPar) {
          if (res && res.length > 0) {
            paramJson = JSON.parse(res[0].paramvalue); // at most one param
            // Validate parameters
            var paramErrors = [];
            if (paramJson['filters']) {
              var values = paramJson["filters"];
              for(var i=0; i<values.length; i++)
                values[i] = "'"+values[i].replace(/^\s*/, "").replace(/\s*$/, "")+"'"; // trim whitespace
              paramJson["filters"] = values.join(',');
            }

            if (paramJson['x_type'] && !paramJson['y_type'])
              paramErrors.push("missing parameter 'y_type'");
            if (paramJson['y_type'] && !paramJson['x_type'])
              paramErrors.push("missing parameter 'x_type'");
            if (paramJson['x_type'] && !paramJson['xtype'] == "distinct" && !paramJson['y1'])
              paramErrors.push("missing parameter 'y1'");
            if (paramJson['x_type'] == 'category') {
              if (!paramJson['x_column'] && !paramJson['chart_aggregation'] )
                paramErrors.push("missing parameter 'x_column'");
            }
            else if (paramJson['x_type'] == 'timeseries') {
              if (!paramJson['x_time_column'])
                paramErrors.push("missing parameter 'x_time_column'");
              if (paramJson['chart_aggregation']) {
                if (paramJson['x_column'])
                  log("parameter 'x_column' ignored");
                if (paramJson['x1'])
                  log("parameter 'x1' ignored");
              }
              else {
              if (!paramJson['x_column'] && !paramJson['x1'])
                paramErrors.push("missing parameter - either 'x_column' or 'x1' required");
              }
            }
            else if (paramJson['x_type'] == 'xy')
              paramErrors.push("'xy' not available"); // TODO

            if (paramErrors.length > 0) {
              for (var i=0; i<paramErrors.length; i++)
                log("report configuration error: "+paramErrors[i]);

              return;
            }
          }
          else
            log("report configuration warning: parameter '@"+selected_report_row.reportname+"' not found for report '"+selected_report_row.displayname+"'");

          report_getParameters()
        }
      );
    }

    if (state == 1) {
      // Parameter 'filters'
      if (paramJson['filters']) {
        backendCall("tableSelect", { tableName:"kipus_reportparams",
              where:"paramname IN ("+paramJson['filters']+") AND projectid = "+selected_report_row.projectid+" AND paramtype = 'SQL'" },
          function(res, myPar) {
            if (res) {
              for (var i=0; i<res.length; i++)
                paramSql[res[i].paramname] = res[i].paramvalue.replace(new RegExp('@userlogin', 'g'), "'"+bcUser+"'");
            }

            report_getParameters()
          }
        );
      }
      else
        report_getParameters();

    }

    if (state == 2) {
      // Parameter 'append_totals'
      reportAppendTotals = paramJson['append_totals'] == 'true';

      // Parameter 'hide_filter' (comma separated list of bar,pie,table)
      var hideFilter = [];
      if ('hide_filter' in paramJson)
        hideFilter = paramJson['hide_filter'];
      for (var type in reportHideFilter) {
         if (hideFilter.indexOf(type) != -1)
            reportHideFilter[type] = true;
      }

      // Parameter 'disable_filter' (comma separated list of bar,pie,table)
       var disableFilter = [];
      if ('disable_filter' in paramJson)
        disableFilter = paramJson['disable_filter'];
      for (var type in reportDisableFilter) {
         if (disableFilter.indexOf(type) != -1)
            reportDisableFilter[type] = true;
      }
      report_showReport();
    }
  }

  function
  report_showReport()
  {
    colorHash = null;
    $("#btn-cancelreports").show();
    var state = reportState++;

    if (state == 0) {
      // get report parameters
      for (var item in paramSql) delete paramSql[item];
      for (var item in paramJson) delete paramJson[item];
      paramState = 0;
      report_getParameters();
    }

    if (state == 1) {
      if ('@year_list' in paramSql) {
        // Report parameter @year_list must be defined in table kipus_reportparams
        // and be included in the paramids for the report definition.
        reset_time_range_selectors();
        setup_time_period_filters();
      }
      else if ('@year_list_from' in paramSql) {
        // Report parameter @year_list_from must be defined in table kipus_reportparams
        // and be included in the paramids for the report definition.
        reset_time_period_selectors();
        setup_time_range_filters();
      }
      else {
        reset_time_period_selectors();
        reset_time_range_selectors();
        report_showReport();
      }
    }

    if (state == 2) {
      // Report parameters @region_list, @organisation_list, @farm_list
      // must be defined in table kipus_reportparams and
      // be included in the JSON parameters for the report.
      setup_hierarchy_filters();
    }

    if (state == 3) {
      // misc filter SQL parameters
      setup_misc_filters();
    }

    if (state == 4) {
      set_view_selector();
      $("#columns_distinct-selector").empty();
      $("#columns_distinct-selector").hide();
      var cols = paramJson['columns_distinct'];
      var acols = paramJson['columns_distinct_aggregation'];
      if (cols && acols) {
        var count = 0;
        var optionList = "";
        for (var col in cols) {
          if (acols.indexOf(cols[col]) == -1) {
            count++;
            optionList += '<option selected>'+ cols[col]+'</option>';
          }
        }
        var sel =   '<div class="form-group row">'
                  + '  <label for="select-columns-distinct" class="col-lg-2 control-label">Categories</label>'
                  + '  <div class="col-lg-5">'
                  + '    <select multiple class="form-control" id="select-columns-distinct" >'+ optionList +'</select>'
                  + '  </div>'
                  + '</div>';
        $("#columns_distinct-selector").append(sel);
        $("#columns_distinct-selector").show();
        if (count>1)
          $("#columns_distinct-selector").removeClass("hidden");
        else
          $("#columns_distinct-selector").addClass("hidden");
        $("#columns_distinct-selector").change(function() { 
          show_report(true, show_chart);
        });
      }
    }

    if (state == reportState_Table /* 5 */) {
      reportState = reportState_Table;
      $("#btn-report-hide-empty").find("span.showhide").html("Hide");
      if (reportHideFilter['table'])
        $("div.filter-sel").hide();
      else
        $("div.filter-sel").show();
      if (reportDisableFilter['table'])
        disable_report_filters(true);  // disable
      else
        disable_report_filters(false); // enable
      show_report(false);
      $("#columns_distinct-selector").hide();
      $(".zoom.time").hide();
    }

    if (state == reportState_Bar_Line /* 6 */) {
      reportState = reportState_Bar_Line;
      if (reportHideFilter['bar'] || reportHideFilter['line'] || reportHideFilter['stackedbar'])
        $("div.filter-sel").hide();
      else
        $("div.filter-sel").show();
      if (reportDisableFilter['bar'] || reportDisableFilter['line'] || reportDisableFilter['stackedbar']) {
        disable_report_filters(true);  // disable
        show_chart();
      }
      else {
        disable_report_filters(false); // enable
        show_report(true, show_chart);
      }
    }

    if (state == reportState_Pie /* 7 */) {
      reportState = reportState_Pie;
      if (reportHideFilter['pie'])
        $("div.filter-sel").hide();
      else
        $("div.filter-sel").show();
      if (reportDisableFilter['pie']) {
        disable_report_filters(true);   // disable
        show_chart();
      }
      else {
        disable_report_filters(false);  // enable
        show_report(true, show_chart);
      }
    }

    function show_chart()
    {
      // hide table
      $("#reportbody").hide();
      var chart;
      var zoom = {};
      if (paramJson['chart_aggregation']) {
        var aggParam = paramJson['chart_aggregation'];
        var optionList = '';
        var selectLabel;
        var fieldsHash = {};
        var first = true;
        for (var option in aggParam) {
          var p = aggParam[option];
          var fields = p['fields'].split(',');
          var translation = p['translation']?p['translation'].split(','):null;
          var optNo = translation? translation[1] : option.replace("option","");
          fieldsHash[optNo] = fields;
          var text = translation? trHtml[translation[0]][optNo] : fieldsHash[optNo][0];
          optionList += '<option value="'+optNo+ (first ? '" selected="true">' : '">') +text+'</option>';
          if (first) {
            selectLabel = translation?trHtml[translation[0]] [0]:"Aggregated by";
            first = false;
          }
        }
        var sel =   '<div class="form-group row">'
                  + '  <label for="select-chart-aggregated-by" class="col-lg-2 control-label">'+selectLabel+'</label>'
                  + '  <div class="col-lg-5">'
                  + '    <select class="form-control" id="select-chart-aggregated-by" >'+ optionList +'</select>'
                  + '  </div>'
                  + '</div>';

        if (!selected_aggregated_by) {
          $("#chart-aggregation-selector").empty();
          $("#chart-aggregation-selector").append(sel);
        }
        var aggBy = $("#select-chart-aggregated-by").val();
        $("#select-chart-aggregated-by").change(function() {
          var aggBy = $(this).val();
          show_aggregated_chart(aggBy, $(this).find("option[value="+aggBy+"]").text()); 
          init_zoom();
        });
        show_aggregated_chart(aggBy, $("#select-chart-aggregated-by option[value="+aggBy+"]").text());
      }
      else {
        show_non_aggregated_chart();
      }

      function show_non_aggregated_chart() {
        for (var item in chart_data) delete chart_data[item];
        var yParams = [];
        var pieParams = [];
        // get pie<n> and y<n> chart parameter keys
        var keys = Object.keys(paramJson);
        var regexp_y = /y[1-9][0-9]*/;
        var regexp_pie = /pie[1-9][0-9]*/;
        for (var i=0; i<keys.length; i++) {
          if (keys[i].match(regexp_y))
            yParams.push(keys[i]);
          if (keys[i].match(regexp_pie))
            pieParams.push(keys[i]);
        }
        yParams.sort();
        pieParams.sort();

        var chartType = selected_view;
        if (paramJson['x_type'] == 'distinct')
        {
          $("#columns_distinct-selector").show();
          function getTotals(dim, dim_value) {
            var cols = paramJson['columns_distinct'];
            var o = { };
            for (var id in report_data) {
              if (dim_value && report_data[id][dim] != dim_value)
                continue;
              for (var key in report_data[id]) {
                if (cols.indexOf(key) == -1)
                  continue;
                var val = report_data[id][key];
                if (!val)
                  continue;
                if (dim && key != dim && !dim_value)
                  continue;
                if (dim_value && dim == key)
                  continue;
                if (!o[key])
                  o[key] = {};
                if (!o[key][val])
                  o[key][val]= 0;
                o[key][val]+= paramJson["distinct_value_column"]?report_data[id][paramJson["distinct_value_column"]] : 1;
              }
            }
            if (dim_value)
              return o;
            if (dim) {
              o = o[dim];
              for (var val in o) {
                o[val] = getTotals(dim, val);
              }
            }
            return o;
          }
          var cols = paramJson['columns_distinct'];
          var cols_aggregation = paramJson['columns_distinct_aggregation'];
          var total = cols_aggregation? {} : { "all": getTotals() };
          if (cols_aggregation)
          for (var col in cols_aggregation) {
             total[cols_aggregation[col]] =  getTotals(cols[col]);
          }
          var totalC3 = {};
          for (var dim in total) {
            totalC3[dim] = {};
            for (var id in total[dim]) {
              totalC3[dim][id] = dim == "all"? []:{};
              for (var key in total[dim][id]) {
                if (dim == "all") {
                  totalC3[dim][id].push([key, total[dim][id][key]]);
                  continue;
                }
                totalC3[dim][id][key] = [];
                for (var dim1 in total[dim][id][key]) {
                  totalC3[dim][id][key].push([dim1, total[dim][id][key][dim1]]);
                }

              }
            }
          }
          if (!colorHash) {
            function getColorHash(dim, vals) {
               // colors usually used by C3
               var colArray = ['rgb(31, 119, 180)', 'rgb(255, 127, 14)', 'rgb(44, 160, 44)', 'rgb(140, 86, 75)', 'rgb(127, 127, 127)',
                   'rgb(148, 103, 189)', 'rgb(188, 189, 34)', 'rgb(214, 39, 40)', 'rgb(227, 119, 194)', 'rgb(23, 190, 207)', 'rgb(25, 100, 105)'];

               var vals = cols_aggregation?Object.keys(colorHash[dim]):vals;
               var r = {};
               var colIdx = 0;
               for (var x=0; x<vals.length; x++)
               {
                   if (colIdx>colArray.length)
                     colIdx-= colArray.length;
                   r[vals[x]] = colArray[colIdx];
                   colIdx++;
               }
               return r;
            }
            colorHash = getTotals();
            var colVals = {};
            for (var dim in colorHash) {
              for (var key in colorHash[dim]) {
                colVals[key] = 1;
              }
            }
            for (var dim in colorHash) {
              colorHash[dim].colors = getColorHash(dim, Object.keys(colVals));
            }
          }
        }
        switch (chartType) {
          case 'stackedbar': // fall through to next case
          case 'bar': // fall through to next case
          case 'line':
            var c3definition = {bindto: '#chart-bar-line',
                                padding: {top: 20, bottom: 100},
                                legend: {position: 'right'},
                                size: {height: 800},
                                zoom: {enabled:paramJson['zoom']=='true', rescale: true}
                               };

            if (paramJson['x_type'] == 'category')
            {
             if (report_data.length == 0) {
                $('#chart-bar-line').empty();
                return;
             }
             var dataLength = reportAppendTotals ? report_data.length - 1 : report_data.length;
       
             var x_category = ['x'];
              var yValues = {};
              for (var i=0; i<yParams.length; i++)
                  yValues[yParams[i]] = [paramJson[yParams[i]]['value_column']];

              var xColName = paramJson['x_column'];
              // fill the data
              for(var i=0; i<dataLength; i++) {
                x_category.push(report_data[i][xColName]);

                for (var j=0; j<yParams.length; j++) {
                  var yParam = yParams[j];
                  var yColName = paramJson[yParam]['value_column'];
                  yValues[yParam].push(report_data[i][yColName]);
                }
              }
              var c3data = {x : 'x', type: chartType};
              for (var i=0; i<yParams.length; i++) {
                yParam = yParams[i];
                yColName = paramJson[yParam]['value_column'];
                if (i == 0) { // y1 - left y-axis
                  var axisLabel = paramJson[yParam]['axisLabel'];
                  var c3axis = {x: {type: 'category',
                                tick: {  multiline: false, fit: false } },
                                y: {label: {text: axisLabel, position: 'outer-middle'}}
                               }
                  var c3dataCols = [x_category];
                }
                if (i == 1) { // y2 - right y-axis
                  var c3dataAxes = {};
                  c3dataAxes[yColName] = yParam;
                  c3data['axes'] = c3dataAxes;

                  c3axis[yParam]= {show: true, // show axis
                                  label: {text: yColName, position: 'outer-middle'}
                                  }
                }

                c3dataCols.push(yValues[yParam]);
                c3data['columns'] = c3dataCols;
              }
              c3definition['data'] = c3data;
              c3definition['axis'] = c3axis;
            }
            else if (paramJson['x_type'] == 'timeseries')
            {

              var dataLength = reportAppendTotals ? report_data.length - 1 : report_data.length;
//console.log("non aggregated chart - timeseries");
              // x  and  y column data structures for c3
              var xCols = {};
              var yCols = {};
              var c3xs = {};
              if (report_data.length == 0) {
                $('#chart-bar-line').empty();
                return;
              }
              if ('x_column' in paramJson) {
                var xColName = paramJson['x_column'];
                // ???if (!(xColName in Object.keys(report_data[0])))  does not work???
                for (var i=0; i<Object.keys(report_data[0]).length; i++) {
                  if (xColName == Object.keys(report_data[0])[i])
                    break;
                }
                if (i >= Object.keys(report_data[0]).length) { // xColName not found
                  log("report configuration error: column '"+xColName+"' configured as 'x_column' is not present in the report data");
                  return;
                }

                // Get the distinct data values for column
                for(var i=0; i<dataLength; i++)
                  if (!(report_data[i][xColName] in Object.keys(yCols)))
                    yCols[ report_data[i][xColName] ] = [report_data[i][xColName]];

                var keys = Object.keys(yCols).sort();
                for (var i=0; i<keys.length; i++) {
                  c3xs[keys[i]] = 'x'+(i+1);
                  xCols['x'+(i+1)] = ['x'+(i+1)];
                }
              }
              else {
                // get chart parameter keys matching x[1-9][0-9]*
                var keys = Object.keys(paramJson).sort();
                var regexp = /x[1-9][0-9]*/;
                for (var i=0; i<keys.length; i++) {
                  if (keys[i].match(regexp)) {
                    var yColName = paramJson[keys[i]];
                    // ???if (!(yColName in Object.keys(report_data[0])))  does not work???
                    for (var j=0; j<Object.keys(report_data[0]).length; j++) {
                      if (yColName == Object.keys(report_data[0])[j])
                        break;
                    }
                    if (j >= Object.keys(report_data[0]).length) // yColName not found
                    {
                      log("report configuration error: column '"+yColName+"' configured as '"+keys[i]+"' is not present in the report data");
                      return;
                    }
                    c3xs[yColName] = keys[i];
                    xCols[ keys[i] ] = [keys[i]];
                    yCols[ yColName ] = [yColName];
                  }
                }
              }
              if (jQuery.isEmptyObject(xCols) || jQuery.isEmptyObject(yCols)) {
                log("report configuration error: Either 'x_column' or 'x1', 'x2', ... must be configured");
                return;
              }
              var xTimeColName = paramJson['x_time_column'];
              var y1ColName = paramJson['y1']['value_column'];
              var axisLabel = paramJson['y1']['axisLabel']?paramJson['y1']['axisLabel']:y1ColName;
              var yValues = {};
              // fill the data
              for(var i=0; i<dataLength; i++) {
                if (xColName) {
                  // configured as "x_column"
                  var yName = report_data[i][xColName];
                  var xName = c3xs[yName];
                  var xTime = report_data[i][xTimeColName];
                  var val = report_data[i][y1ColName];
                  //xCols[xName].push(report_data[i][xTimeColName]);
                  if (paramJson['y1']['aggregation']) {
                    if(!yValues[yName])
                      yValues[yName] = {}
                    if(!yValues[yName][xTime])
                      yValues[yName][xTime] = [];
                    yValues[yName][xTime].push(val);
                    if (i==dataLength-1) {
                      // last, aggregate yValues
                      for (var y in yValues) {
                        for (var t in yValues[y]) {
                          xCols[c3xs[y]].push(new Date(t));
                          if (paramJson['y1']['aggregation'] == 'avg')
                            yCols[y].push(get_avg_num(yValues[y][t]));
                          else
                            yCols[y].push(get_sum(yValues[y][t]));
                        }
                      }
                    }
                  } else {
                    xCols[xName].push(new Date(xTime));
                    yCols[yName].push(val);
                  }
                }
                else {
                  // configured as "x1:yCol1", "x2:yCol2", ...
                  var keys = Object.keys(yCols);
                  for (var j=0; j<keys.length; j++) {
                    var yName = keys[j];
                    var xName = c3xs[yName];
                    //xCols[xName].push(report_data[i][xTimeColName]);
                    xCols[xName].push(new Date(report_data[i][xTimeColName]));
                  }
                }
              }
              var c3dataCols = [];
              var keys = Object.keys(xCols);
              for (var i=0; i<keys.length; i++)
                c3dataCols.push(xCols[keys[i]]);

              keys = Object.keys(yCols);
              for (var i=0; i<keys.length; i++)
                c3dataCols.push(yCols[keys[i]]);

              var c3data = {type: chartType};
              c3data['xs'] = c3xs;
              c3data['columns'] = c3dataCols;
              var c3axis = {x: {type: paramJson['x_type'],
                                tick: {format: "%Y-%m-%d",
                                       rotate: 20,
                                       multiline: false},
                                height: 100
                               },
                            y: {label: {text: axisLabel, position: 'outer-middle'} 
                               }
                           };
              if (paramJson['x'])
                Object.assign(c3axis.x, paramJson['x']);
              if (paramJson['y']) {
                Object.assign(c3axis.y, paramJson['y']);
                if (c3axis.y.tick["format_suffix"])
                   c3axis.y.tick.format = function(x) { return x + c3axis.y.tick["format_suffix"]; }
              }
              //console.log(c3data);
              c3definition['data'] = c3data;
              c3definition['axis'] = c3axis;
            }
            else if (paramJson['x_type'] == 'trend')
            {
              // not implemented
            }
            else if (paramJson['x_type'] == 'distinct')
            {
              function create_bar(chart_id, title, data, colors) {
                  if (!data)
                    return;
                  var c3definition =  { bindto: chart_id,
                                        title: {
                                          text: title
                                        },
                                        data: {
                                          columns: data,
                                          colors: colors,
                                          type: "bar"
                                        },
                                        legend: {
                                          position: 'right'
                                        },
                                        zoom: { enabled: paramJson['zoom']=='true', rescale: true }
                                      };
                  if (chartType == "bar") {
                    c3definition.axis= { x: { tick: { values: [''] } } };
                    c3definition.tooltip = {
                      format: {
                          title: function (d) { return  title; },
                          value: function (value, ratio, id) {
                              return value;
                          }
                      }
                    };
                  }
                  else {
                    // stackedbar
                    function convertToStackData(data) {
                        var c3data = {
                                x : 'x',
                                type: 'bar'
                        }
                        c3data.groups = [Object.keys(data)];
                        var cols = ['x'];
                        var xHash = {};
                        var yHash = {};
                        for (var pile in data) {
                          yHash[pile] = [];
                          for (var dim in data[pile]) {
                             for (var val in data[pile][dim])
                               xHash[val] = 1;
                          }
                        }
                        var xList = Object.keys(xHash).sort();
                        for (var i=0;i<xList.length;i++) {
                          cols.push(xList[i]);
                        }

                        for (var pile in data) {
                          for (var dim in data[pile]) {
                            for (var x in xHash) {
                              if (data[pile][dim][x])
                                 yHash[pile].push(data[pile][dim][x]);
                              else
                                 yHash[pile].push(0);

                            }
                          }
                        }
                        c3data.columns = [cols];
                        c3data.colors = colors;
                        var yKeys = Object.keys(yHash);
                        if (paramJson['columns_distinct_aggregation_order'] == 'desc') {
                          yKeys = Object.keys(yHash).reverse();
                        }
                        for (var i=0; i<yKeys.length;i++) {
                          var pile = yKeys[i];
                          var x = yHash[pile];
                          x.unshift(pile);
                          c3data.columns.push(x);
                        }
                        if (paramJson['columns_distinct_aggregation_order'] == "desc")
                          // stack order by data definition, not by sum of values
                          c3data.order = function (t1, t2) {
                              return t1.id > t2.id;
                          }
                        return c3data;
                    }
                    c3definition.data = convertToStackData(data);
                    // custom tooltip (show percentage in stacked bar chart)
                    c3definition.tooltip = {
                        grouped : false,
                        format: {
                            value: function (value, ratio, id, index) {
                                var sum = 0;
                                var totalSum = 0;
                                for (var i=1; i< c3definition.data.columns.length; i++) {
                                  for (var j=1; j< c3definition.data.columns[i].length; j++) {
                                    if (c3definition.data.columns[i][0] == id)
                                      totalSum += c3definition.data.columns[i][j];
                                    if (index == j-1)
                                      sum += c3definition.data.columns[i][j];
                                  }
                                }
                                var ratio = sum?value/sum:0;
                                var totalRatio = totalSum?value/totalSum:0;
                                return value + " ("+d3.format("%")(ratio)+(totalRatio<1?", " + d3.format("%")(totalRatio) + " total)":")");
                            }
                      }
                    };


                    c3definition.axis = { x: { type: 'category' ,
                                               tick: {  multiline: false, fit: false }}};
                  }
                  if (paramJson['y1'] && paramJson['y1']['axisLabel']) {
                    c3definition.axis.y = {label: {text: paramJson['y1']['axisLabel'], position: 'outer-middle'}};
                  }

                  chart = c3.generate(c3definition);
              }
              $("#chart-bar-line").empty();
              $("#chart-bar-line").css("margin-bottom", "20px");
              function is_empty(o) {
                 for (var i0=0; i0<o.length; i0++)
                   if (o[i0].length > 1 && o[i0][1] != 0)
                     return false;
                 return true;  
              }
              var i = 0;
              if (chartType == "stackedbar") {
                for (var dim in totalC3) {
                  $("#chart-bar-line").append("<div id='chart-bar"+i+"' class='c3'></div>");
                  create_bar("#chart-bar"+i, dim, total[dim], colorHash[dim]?colorHash[dim].colors:[]);
                  i++;
                }
              } else {
                var flexWidth = $("#select-columns-distinct").length > 0 ? 100 / $("#select-columns-distinct").val().length: 33;
                for (var dim in totalC3) {
                   for (var key in totalC3[dim]) {
                      if (dim == "all") {
                        if (is_empty(totalC3[dim][key]))
                          continue;
                        $("#chart-bar-line").append("<div style='width: "+flexWith + "%;'><div id='chart-bar"+i+"' class='c3 flex'></div></div>");
                        create_bar("#chart-bar"+i, key, totalC3[dim][key], colorHash[key]?colorHash[key].colors:[]);
                        i++;
                      }
                      else
                      for (var dim1 in totalC3[dim][key]) {
                        if ($("#select-columns-distinct").val() == null || $("#select-columns-distinct").val().indexOf(dim1) == -1)
                          continue;
                        if (is_empty(totalC3[dim][key][dim1]))
                          continue;
                        $("#chart-bar-line").append("<div style='width: "+flexWidth + "%;'><div id='chart-bar"+i+"' class='c3 flex'></div></div>");
                        create_bar("#chart-bar"+i, dim1 +" for " + dim  + " = "+key, totalC3[dim][key][dim1], colorHash[dim1]?colorHash[dim1].colors:[]);
                        i++;
                      }
                   }
                }

              }
            }

            if (paramJson['x_type'] != 'distinct')
              chart = c3.generate(c3definition);
            break;

          case 'pie':
            function create_pie(chart_id, title, data, colors) {
                if (!data)
                  return;
                var c3definition =  { bindto: chart_id,
                                      title: {
                                        text: title,
                                        position: 'top-center'
                                      },
                                      data: {
                                        columns: data,
                                        colors: colors,
                                        type: "pie"
                                      },
                                      legend: {
                                        position: 'bottom'
                                      },
                                      tooltip: {
                                        format: {
                                            title: function (d) { return  d; },
                                            value: function (value, ratio, id) {
                                                return d3.format("%")(ratio)+( paramJson["distinct_value_column"]?  " (sum:":" (total:")+value+")";
                                            }
                                        }
                                      }
                                    };
                var pieChart = c3.generate(c3definition);
            }
            if (paramJson['x_type'] != 'distinct')
              return;
            $("#chart-pie").empty();
            $("#chart-pie").css("margin-bottom", "20px");
            function is_empty(o) {
               for (var i0=0; i0<o.length; i0++)
                 if (o[i0].length > 1 && o[i0][1] != 0)
                   return false;
               return true;  
            }

            var i = 0;
            var flexWidth = $("#select-columns-distinct").length > 0 ? 100 / $("#select-columns-distinct").val().length: 33;
            for (var dim in totalC3) {
               for (var key in totalC3[dim]) {
                  if (dim == "all") {
                    if (is_empty(totalC3[dim][key]))
                       continue;
                    $("#chart-pie").append("<div style='width: "+flexWidth+"%'><div id='chart-pie"+i+"' class='c3 flex'></div></div>");
                    create_pie("#chart-pie"+i, key, totalC3[dim][key], colorHash[key]?colorHash[key].colors:[]);
                    i++;
                  }
                  else
                  for (var dim1 in totalC3[dim][key]) {
                    if ($("#select-columns-distinct").val() == null || $("#select-columns-distinct").val().indexOf(dim1) == -1)
                      continue;
                    if (is_empty(totalC3[dim][key][dim1]))
                       continue;
                    $("#chart-pie").append("<div style='width: "+flexWidth+"%'><div id='chart-pie"+i+"' class='c3 flex'></div></div>");
                    create_pie("#chart-pie"+i, dim1 +" for " + dim  + " "+key, totalC3[dim][key][dim1], colorHash[dim1]?colorHash[dim1].colors:[]);
                    i++;
                  }
               }
            }
            break;

          default: break; // do nothing
        } // switch
      }

      function show_aggregated_chart(aggBy, aggTitle) {
        selected_aggregated_by = aggBy;
        for (var item in chart_data) delete chart_data[item];
        var yParams = [];
        var pieParams = [];
        // get pie<n> and y<n> chart parameter keys
        var keys = Object.keys(paramJson);
        var regexp_y = /y[1-9][0-9]*/;
        var regexp_pie = /pie[1-9][0-9]*/;
        for (var i=0; i<keys.length; i++) {
          if (keys[i].match(regexp_y))
            yParams.push(keys[i]);
          if (keys[i].match(regexp_pie))
            pieParams.push(keys[i]);
        }
        yParams.sort();
        pieParams.sort();
        var dataLength = reportAppendTotals ? report_data.length - 1 : report_data.length;
        var aggBySeparator = '::: ';
        var valueCounts = {};
        if (paramJson['x_type'] == 'timeseries')
          var xTimeColName = paramJson['x_time_column'];

        for(var i=0; i<dataLength; i++) {
          var aggregatedBy = '';
          for (var j=0; j<fieldsHash[selected_aggregated_by].length; j++)
            aggregatedBy += (j==0 ? '' : aggBySeparator) + report_data[i][fieldsHash[selected_aggregated_by][j]];

          if (chart_data[aggregatedBy]) {
            var valueFields = chart_data[aggregatedBy];
            if (paramJson['x_type'] == 'timeseries' // retain max 'x_time_column' value
                && report_data[i][xTimeColName] > valueFields[xTimeColName])
              valueFields[xTimeColName] = report_data[i][xTimeColName];
            for (var j=0; j<yParams.length; j++) {
              var yColName = paramJson[yParams[j]]['value_column'];
              valueFields[yColName] = valueFields[yColName] + parseFloat(report_data[i][yColName]);
            }
            for (var j=0; j<pieParams.length; j++) {
              var pieColName = paramJson[pieParams[j]]['value_column'];
              if (!(pieColName in valueFields))
                valueFields[pieColName] = valueFields[pieColName] + parseFloat(report_data[i][pieColName]);
            }
            valueCounts[aggregatedBy] = valueCounts[aggregatedBy] + 1;
          }
          else {
            var valueFields = {};
            if (paramJson['x_type'] == 'timeseries')
              valueFields[xTimeColName] = report_data[i][xTimeColName];
            for (var j=0; j<yParams.length; j++) {
              var yColName = paramJson[yParams[j]]['value_column'];
              valueFields[yColName] = parseFloat(report_data[i][yColName]);
            }
            for (var j=0; j<pieParams.length; j++) {
              var pieColName = paramJson[pieParams[j]]['value_column'];
              if (!(pieColName in valueFields))
                valueFields[pieColName] = parseFloat(report_data[i][pieColName]);
            }
            valueCounts[aggregatedBy] = 1;
          }

          chart_data[aggregatedBy] = valueFields;
        }
//console.log("chart_data: ");console.log(chart_data);

        var chartType = selected_view;
        switch (chartType) {
          case 'bar': // fall through to next case
          case 'line':
            var c3definition = {bindto: '#chart-bar-line',
                                padding: {top: 20, bottom: 100},
                                legend: {position: 'right'},
                                size: {height: 800},
                                zoom: {enabled: paramJson['zoom']=='true', rescale: true}
                               };

            if (paramJson['x_type'] == 'category')
            {
              var x_category = ['x'];
              var yValues = {};
              for (var i=0; i<yParams.length; i++)
                  yValues[yParams[i]] = [paramJson[yParams[i]]['value_column']];

              for (var item in chart_data) {
                x_category.push(item.replace(new RegExp(aggBySeparator, 'g'),  ': '));

                for (var i=0; i<yParams.length; i++) {
                  var yParam = yParams[i];
                  var yColName = paramJson[yParam]['value_column'];
                  if (paramJson[yParam]['aggregation'] == 'avg')
                    yValues[yParam].push(Math.round(chart_data[item][yColName]/valueCounts[item] * 100) / 100);
                  else
                    yValues[yParam].push(chart_data[item][yColName]);

                }
              }

              var c3data = {x : 'x', type: chartType};
              var chars = x_category.reduce(function(total, txt) {
                if (txt == 'x')
                  return total;
                return total + txt.length;
              }, 0);
              for (var i=0; i<yParams.length; i++) {
                yParam = yParams[i];
                yColName = paramJson[yParam]['value_column'];
                if (i == 0) { // y1 - left y-axis
                  // detect length of x-axis to rotate to avoid overlap
                  var axisLabel = paramJson[yParam]['axisLabel'];
                  var c3axis = {x: {type: 'category',
                                tick: {  multiline: false} },
                                y: {label: {text: axisLabel, position: 'outer-middle'}}
                               };
                  if (x_category.length > 2 && chars > 200)
                    c3axis.x.tick.rotate = 20;
                  var c3dataCols = [x_category];
                }
                if (i == 1) { // y2 - right y-axis
                  var c3dataAxes = {};
                  c3dataAxes[yColName] = yParam;
                  c3data['axes'] = c3dataAxes;

                  c3axis[yParam]= {show: true, // show axis
                                  label: {text: yColName, position: 'outer-middle'}
                                  }
                }

                c3dataCols.push(yValues[yParam]);
                c3data['columns'] = c3dataCols;
              }

              c3definition['data'] = c3data;
              c3definition['axis'] = c3axis;
              if (aggTitle)
                c3definition['title'] =  { text: (paramJson['title']?paramJson['title']:'Aggregated' )+ ' by ' + aggTitle };
            }
            else if (paramJson['x_type'] == 'timeseries')
            {

//console.log("aggregated chart - timeseries");
             // x  and  y column data structures for c3
              var xCols = {};
              var yCols = {};
              var c3xs = {};

              // Get the distinct data values for the (aggregated) x column
              var chartKeys = Object.keys(chart_data);
              for(var i=0; i<chartKeys.length; i++)
                if (!(chartKeys[i] in Object.keys(yCols)))
                  yCols[chartKeys[i]] = [chartKeys[i]];

              var keys = Object.keys(yCols).sort();
              for (var i=0; i<keys.length; i++) {
                c3xs[keys[i]] = 'x'+(i+1);
                xCols['x'+(i+1)] = ['x'+(i+1)];
              }

              if (jQuery.isEmptyObject(xCols) || jQuery.isEmptyObject(yCols)) {
                log("report error: No aggregated data to display");
                return;
              }

              var xTimeColName = paramJson['x_time_column'];

              // fill the data
              for (var i=0; i<yParams.length; i++) {
                yParam = yParams[i];
                if (i == 0)
                  var yColName = paramJson[yParam]['value_column'];
                else // only 1 y-parameter for timeseries
                  log("report configuration warning: parameter '"+yParam+"' ignored for report '"+selected_report_row.displayname+"'");
              }
              for(var i=0; i<chartKeys.length; i++) {
                var keys = Object.keys(yCols);
                for (var j=0; j<keys.length; j++) {
                  var yName = keys[j];
                  var xName = c3xs[yName];
                  xCols[xName].push(chart_data[chartKeys[i]][xTimeColName]);
                  yCols[yName].push(chart_data[chartKeys[i]][yColName]);
                }
              }

              var c3dataCols = [];
              var keys = Object.keys(xCols);
              for (var i=0; i<keys.length; i++)
                c3dataCols.push(xCols[keys[i]]);

              keys = Object.keys(yCols);
              for (var i=0; i<keys.length; i++)
                c3dataCols.push(yCols[keys[i]]);

              var c3data = {type: chartType};
              c3data['xs'] = c3xs;
              c3data['columns'] = c3dataCols;

              var c3axis = {x: {type: paramJson['x_type'],
                                tick: {format: "%Y-%m-%d",
                                       rotate: 20,
                                       multiline: false},
                                height: 100
                               },
                            y: {label: {text: yColName, position: 'outer-middle'} }
                           };
              c3definition['data'] = c3data;
              c3definition['axis'] = c3axis;
            }
            else if (paramJson['x_type'] == 'trend')
            {
//TODO -  create newly aggregated table 'chart_report_data' from 'report_data'
//        and use it to feed multiple graphs based on agg (region, farm)
//        display the new table by calling  show_reportbody(chart_report_data, csvFile, ...)
            }

//console.log("c3definition: "+JSON.stringify(c3definition));console.log(c3definition);
            chart = c3.generate(c3definition);
            break;

          case 'pie':
//            if (paramJson['@chart_pie_quantity'])
//              var pieParam = JSON.parse(paramJson['@chart_pie_quantity']);
//            else if (paramJson['@chart_pie_quantity_nursery'])
//              var pieParam = JSON.parse(paramJson['@chart_pie_quantity_nursery']);
//            else if (paramJson['@chart_pie_quantity_greenhouse'])
//              var pieParam = JSON.parse(paramJson['@chart_pie_quantity_greenhouse']);
//            var pie_valueField = pieParam['valueField'];
            if (pieParams.length == 0) {
              log("report configuration error: missing parameter pie<n> for pie chart");
              return;
            }
            var pie_chart_num = 0;
            for (var item in pie_charts) {
              $(item).remove();
              delete pie_charts[item];
//console.log("piecChart discarded for "+item);
            }
            for (var i=0; i<pieParams.length; i++) {
              var pieParam = pieParams[i];
              var pieColName = paramJson[pieParam]['value_column'];
              var previousTitle, previousSlice;
              var pie_columns = [];
              keys = Object.keys(chart_data).sort();
              for (var j=0; j<keys.length; j++) {
                var key = keys[j];
                var separatorIndex = key.lastIndexOf(aggBySeparator);
                var pieSliceIndex = separatorIndex + aggBySeparator.length;
                var pieTitle = key.substring(0, separatorIndex).replace(new RegExp(aggBySeparator, 'g'),  ': ') + " - " + pieColName;
                if (previousTitle && pieTitle != previousTitle)
                  show_pie(previousTitle);

                previousTitle = pieTitle;
                var pieSlice = key.substr(pieSliceIndex, key.length - pieSliceIndex);
//console.log("Adding pieTitle = "+pieTitle + " pieSlice = "+pieSlice + " " + pieColName + " = "+chart_data[key][pieColName]);
                if (!previousSlice || pieSlice != previousSlice) {
                  var sliceColumn = [pieSlice, chart_data[key][pieColName]];
                  pie_columns.push(sliceColumn);
                }
                else
                  sliceColumn.push(chart_data[key][pieColName]);
//console.log("j = "+j+ " pie_columns.length = "+pie_columns.length+" added sliceColumn = ");console.log(sliceColumn);
              }

              // Show the last pie
              show_pie(pieTitle);
              previousTitle = null;
              previousSlice = null;
            }
            break;

          default: break; // do nothing
        } // switch

        function show_pie(title) {
          var chart_id = 'chart-pie' + pie_chart_num++;
          var chart_id_tag = '#'+chart_id;
          if (!(chart_id_tag in pie_charts)) {
            $("#chart-pie").append('<div id="'+chart_id+'"></div>');

            var c3definition =  { bindto: chart_id_tag,
                                  title: {
                                    text: title
                                  },
                                  data: {
                                    columns: pie_columns,
                                    type: chartType
                                  },
                                  legend: {
                                    position: 'right'
                                  }
                                };
//console.log("c3definition: "+JSON.stringify(c3definition));
//console.log(c3definition);
            var pieChart = c3.generate(c3definition);
            pie_charts[chart_id_tag] = pieChart;
//console.log("piecChart added for "+chart_id_tag+": title = "+title);
          }
          else {
            var pieChart = pie_charts[chart_id_tag];
            pieChart.unload(); // unload all data
//console.log("piecChart "+chart_id_tag+": reload: pieTitle = "+title+" pie_columns = "); console.log(pie_columns);
            pieChart.load({columns: pie_columns});
          }

          pie_columns = [];
        }

      }
      function update_zbuttons() {
        $(".zoom.zminus, .zoom.zplus").removeClass("inactive");
        if ((zoom.zdomain[0] instanceof Date && zoom.zdomain[1] instanceof Date && zoom.zdomain[0].getTime() == zoom.min_domain.getTime()
             && zoom.zdomain[1].getTime() == zoom.max_domain.getTime()) ||
            zoom.zdomain[0] == zoom.min_domain && zoom.zdomain[1] == zoom.max_domain) {
          $(".zoom.zminus").addClass("inactive");
        }
        if ((zoom.zdomain[0] instanceof Date && zoom.zdomain[1] instanceof Date && 
             zoom.zdomain[1].getTime() - zoom.zdomain[0].getTime() <= zoom.zstep*2) ||
             zoom.zdomain[1] - zoom.zdomain[0] <= zoom.zstep*2)
          $(".zoom.zplus").addClass("inactive");
      }
      $(".zoom.zplus").unbind("click").click(function() {
        if (!chart)
          return;
        var a = zoom.zdomain[0] instanceof Date?new Date(zoom.zdomain[0].getTime()+zoom.zstep):zoom.zdomain[0]+zoom.zstep;
        var b = zoom.zdomain[1] instanceof Date?new Date(zoom.zdomain[1].getTime()-zoom.zstep):zoom.zdomain[1]-zoom.zstep;
        if ((a instanceof Date && b instanceof Date && a.getTime() == b.getTime())
             || b < zoom.min_domain || a > zoom.max_domain || a > b) {
          $(".zoom.zplus").addClass("inactive");
          return;
        }
        log("zplus"); 
        zoom.zdomain = [ a, b ];
        chart.zoom(zoom.zdomain);
        update_zbuttons();
      });
      $(".zoom.zminus").unbind("click").click(function() {
        if (!chart)
          return;
        var a = zoom.zdomain[0] instanceof Date?new Date(zoom.zdomain[0].getTime()-zoom.zstep):zoom.zdomain[0]-zoom.zstep;
        var b = zoom.zdomain[1] instanceof Date?new Date(zoom.zdomain[1].getTime()+zoom.zstep):zoom.zdomain[1]+zoom.zstep;
        if ((a instanceof Date && b instanceof Date && a.getTime() == b.getTime()) 
           || a < zoom.min_domain || b > zoom.max_domain || a > b) {
          $(".zoom.zminus").addClass("inactive");
          return;
        }
        log("zminus");
        zoom.zdomain = [ a, b ];
        chart.zoom(zoom.zdomain);
        update_zbuttons();
      });
      function init_zoom() {
        $(".zoom.time").show();
        if (chart) {
          zoom.min_domain = chart.internal.orgXDomain[0];
          zoom.max_domain = chart.internal.orgXDomain[1];
          zoom.zdomain = [zoom.min_domain, zoom.max_domain];
          zoom.zstep = Math.round((zoom.max_domain-zoom.min_domain) / 20);
          if (zoom.zstep == 0) {
            $(".zoom.time").hide();
            return;
          }
          update_zbuttons();
        }
      }
      
      if (paramJson['zoom']=='true')
        init_zoom();
    }

    function show_report(show_later, callbackFn) {
      if (!show_later)
        $("#reportbody").show();
      $(".headtitle span.waiting").show();
      // get the SQL for the report header and body replacing implicit parameter @userlogin
      var headerSql = selected_report_row.headersql.replace(new RegExp('@userlogin', 'g'), "'"+bcUser+"'");
      var selectedRegions = "'"+selected_regions.join("','")+"'";
      var selectedRegexpRegions = "^("+selected_regions.join("|") + ")";
      selectedRegexpRegions = selectedRegexpRegions.replace(/,/g,"[[.comma.]]");
      var selectedOrganisations = "'"+selected_organisations.join("','")+"'";
      var selectedFarms = "'"+selected_farms.join("','")+"'";
      var selectedCrops = "'"+selected_crops.join("','")+"'";
      // compose date from selected_year/quarter/month
      var selectedRegexpDate = "";
      function calcRegexpDate(selected_year, selected_quarter, selected_month) {
        var result = ".*";
        function pad(n, width, z) {
          // leading zeros
          z = z || '0';
          n = n + '';
          return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
        }
        if (selected_year > 0 )  {
          if (selected_quarter > 0) {
            if (selected_month > 0) {
              return "^("+selected_year + "-" + pad(selected_month,2)+"-)";
            } else { // only quarter is set
              var end = selected_quarter*3;
              var months = [];
              for (var i=end-2; i<=end; i++) {
                months.push(selected_year + "-" + pad(i, 2));
              }
              return "^("+months.join("|") + ")";
            }
          } else { // only year is set
            return "^("+selected_year + "-)";
          }
        }
        return result;
      }
      selectedRegexpDate = calcRegexpDate(selected_year, selected_quarter, selected_month);
      var selectedRegexpFrom = calcRegexpDate(selected_year_from, selected_quarter_from, selected_month_from);
      var selectedRegexpTo = calcRegexpDate(selected_year_to, selected_quarter_to, selected_month_to);
      if (selectedRegexpFrom == ".*")
        selectedRegexpFrom = "1970-01-01"; // from beginning of time
      else  {
        var i = selectedRegexpFrom.indexOf("|");
        selectedRegexpFrom = selectedRegexpFrom.substring(2, i > 0? i: selectedRegexpFrom.indexOf(")"));
        if (selectedRegexpFrom.length == 5)
          selectedRegexpFrom += "01";
      }
      if (selectedRegexpTo == ".*")
        selectedRegexpTo = "2199-01-01";    // end of time
      else {
        var i = selectedRegexpTo.indexOf("|");
        selectedRegexpTo = selectedRegexpTo.substring(2, i > 0? i: selectedRegexpTo.indexOf(")"));
        if (selectedRegexpTo.length == 5)
          selectedRegexpTo += "12";
      }
      var dateStringFrom = new Date(selectedRegexpFrom).toISOString().substring(0,10);
      var dateStringTo = new Date(selectedRegexpTo).toISOString().substring(0,10);
        
      var reportSql = selected_report_row.reportsql
                        .replace(new RegExp('@userlogin', 'g'), "'"+bcUser+"'")
                        .replace(new RegExp('@selected_year_from', 'g'), selected_year_from)
                        .replace(new RegExp('@selected_quarter_from', 'g'), selected_quarter_from)
                        .replace(new RegExp('@selected_month_from', 'g'), selected_month_from)
                        .replace(new RegExp('@selected_year_to', 'g'), selected_year_to)
                        .replace(new RegExp('@selected_quarter_to', 'g'), selected_quarter_to)
                        .replace(new RegExp('@selected_month_to', 'g'), selected_month_to)
                        .replace(new RegExp('@selected_year', 'g'), selected_year)
                        .replace(new RegExp('@selected_quarter', 'g'), selected_quarter)
                        .replace(new RegExp('@selected_month', 'g'), selected_month)
                        .replace(new RegExp('@selected_country', 'g'), selected_country)
                        .replace(new RegExp('@selected_regions', 'g'), selectedRegions)
                        .replace(new RegExp('@selected_regexp_regions', 'g'), selectedRegexpRegions)
                        .replace(new RegExp('@selected_regexp_date', 'g'), selectedRegexpDate)
                        .replace(new RegExp('@selected_date_from', 'g'), dateStringFrom)
                        .replace(new RegExp('@selected_date_to', 'g'), dateStringTo)
                        .replace(new RegExp('@selected_organisations', 'g'), selectedOrganisations)
                        .replace(new RegExp('@selected_farms', 'g'), selectedFarms)
                        .replace(new RegExp('@selected_crop_variety', 'g'), selected_crop_variety)
                        .replace(new RegExp('@selected_crops', 'g'), selectedCrops)
                        .replace(new RegExp('@selected_crop', 'g'), selected_crop)
                        .replace(new RegExp('@selected_market', 'g'), selected_market)
                        .replace(new RegExp('@selected_product', 'g'), selected_product)
                        .replace(new RegExp('@selected_educational_level', 'g'), selected_educational_level)
                        .replace(new RegExp('@selected_target_group', 'g'), selected_target_group)
                        .replace(new RegExp('@selected_gender', 'g'), selected_gender)
                        .replace(new RegExp('@selected_trade_area', 'g'), selected_trade_area)
                      ;
//console.log("report_showReport().show_report(): reportSql = " + reportSql);

      // show report filter parameters
      //$("#reportparams").show();

      // show report header
      backendCall("tableCmd", { sql: headerSql },
        function(res_hdr,myPar){
          if (res_hdr.length > 0) {
            if (window.location.hash && getQueryVariable("reportid"))
              $("#reportheader").hide();
            else
              show_reportheader(res_hdr);
          }
          // show report body
          report_data.length = 0;
          backendCall("tableCmd", { sql: reportSql },
            function(res_body,myPar){
              $(".headtitle span.waiting").hide();
              if (res_body) {
                // When reportSql contains multiple SQL statements,
                // the last statement is a SELECT which provides the report data
                if (res_body.length > 0 && res_body[res_body.length-1] instanceof Array)
                  report_data = res_body[res_body.length-1];
                else
                  report_data = res_body;
              }
              var par = {};
              par.selected_country = selected_country;
              par.selected_report_row = selected_report_row;
              par.selected_crop = selected_crop;
              par.selected_crop_variety = selected_crop_variety;
              par.reportSql = reportSql;
              par.headerSql = headerSql;
              par.show_later = show_later;
              par.callbackFn = callbackFn;
              par.insertScores = par.selected_report_row.report_type == 'Scores';
              if (selected_report_row.postprocessfn) {
                eval(selected_report_row.postprocessfn+"(report_data, par, callback_show_reportbody)");
              }
              else {
                show_reportbody(report_data, par);
                if (callbackFn)
                  callbackFn();
              }
              if (window.location.hash && getQueryVariable("reportid")) { // quick hack to hide reportparams when report is called from iframe
                  $("#reportparams").hide();
                  $("div.btn-toolbar").hide();
              } else {
                  $("#reportparams").show();
                  $("div.btn-toolbar").show();
              }
          });
      
      });

      
      function callback_show_reportbody(reportData, par) {
        if (reportData)
          report_data = reportData;
        show_reportbody(report_data, par);
        if (callbackFn)
          callbackFn();
        if (par.callbackFn)
          par.callbackFn();
      }
    }
  }
  // =============================================================================
  // =============================================================================

  function
  report_showRingchart(selectedrow, res)
  {
    var r = res[selectedrow], id2d={};
    $("#reportparams")
          .html("<div class='ringchart'><ul class='rc_breadcrumb'></ul></div>");
    $("#reportparams").show();

    $(".headtitle span.waiting").show();
    backendCall("tableCmd", { sql: r.headersql.replace(new RegExp('@userlogin', 'g'), "'"+bcUser+"'") },
    function(hdrdata,myPar){
      var hdr;
      for(var i1 in hdrdata[0])
        hdr = i1.split(',');

      backendCall("tableCmd", { sql: r.reportsql.replace(new RegExp('@userlogin', 'g'), "'"+bcUser+"'") },
      function(reportdata,myPar){
        $(".headtitle span.waiting").hide();
        $("#btn-cancelreports").show();
        var lData={}, hm1 = hdr.length-1, hm2 = hdr.length-2, cid=1;
        for(var i1=0; i1<reportdata.length; i1++) {
          var d = reportdata[i1], p = lData;
          for(var i2=0; i2<hm2; i2++) {
            var n = d[hdr[i2]];
            if(p[n] == undefined)
              p[n] = {};
            p = p[n];
          }
          var n = d[hdr[hm2]]
          if(p[n] == undefined)
            p[n] = 0;
          p[n] += d[hdr[hm1]];
        }

        function
        convData(name, data)
        {
          if(typeof data != "object") {
            var r = { name:name, size:data, id:cid++ };
            id2d[r.id] = r;
            return r;
          }

          var children = [];
          for(var o in data)
            children.push(convData(o, data[o]));

          var r = { name:name, children:children, id:cid++ };
          id2d[r.id] = r;
          return r;
        }
        var d3d = convData("Total", lData);
        render(d3d);
        setBC(d3d);
      });
    });

    var width=600, height=600, radius=290;
    var x = d3.scale.linear().range([0, 2 * Math.PI]);
    var y = d3.scale.sqrt().range([0, radius]);
    var color = d3.scale.category20c();  // 10, 20, 20b, 20c

    var svg = d3.select("div.ringchart")
              .append("svg")
                .attr("width", width)
                .attr("height", height)
              .append("g")
                .attr("transform", "translate("+width/2+","+(height/2+10)+")");
    var partition = d3.layout.partition()
        .sort(null)
        .value(function(d) { return d.size; });
    var arc = d3.svg.arc()
        .startAngle(function(d){ return Math.max(0, Math.min(2*Math.PI,x(d.x)));})
        .endAngle(  function(d){ return Math.max(0,
                                              Math.min(2*Math.PI,x(d.x+d.dx))); })
        .innerRadius(function(d) { return Math.max(0, y(d.y)); })
        .outerRadius(function(d) { return Math.max(0, y(d.y + d.dy)); });

    // Keep track of the node that is currently being displayed as the root.
    var node, path;
    function
    render(jsonData)
    {
      node = jsonData;
      path = svg.datum(jsonData).selectAll("path")
        .data(partition.nodes)
        .enter().append("path")
          .attr("d", arc)
          .style("fill",function(d){return color((d.children?d:d.parent).name);})
          .on("mouseover", mouseover)
          .on("click", click)
          .each(stash);
      d3.select(self.frameElement).style("height", height + "px");
    }

    function
    setBC(d)
    {
      function
      doSum(n)
      {
        if(n.size)
          return n.size;
        var sum = 0;
        for(var i1=0; i1<n.children.length; i1++)
          sum += doSum(n.children[i1]);
        return sum;
      }

      var str='<li class="value"><a href="#">'+doSum(d)+' kg</a></li>', anc=[];
      while(d) {
        var c =  color((d.children?d:d.parent).name);
        var name = (d.name.length > 20 ? (d.name.substr(0,20)+"...") : d.name);
        str = '<li class="arrow" data-id="'+d.id+'">'+
              '<a href="#" style="background:'+c+'">'+
              '<div class="a_before"></div>'+
              '<div class="a_after" style="border-left-color:'+c+'"></div>'+
              name+'</a></li>'+str;
        anc.push(d.id);
        d = d.parent;
      }
      $("#reportparams .rc_breadcrumb").html(str);
      $("#reportparams .rc_breadcrumb").find("li[data-id]").click(function(){
        click(id2d[$(this).attr("data-id")]);
      });
      return anc;
    }

    function
    mouseover(d)
    {
      var anc = setBC(d);
      svg.selectAll("path").style("opacity", 0.3);
      svg.selectAll("path")
        .filter(function(node) { return anc.indexOf(node.id) >= 0; })
        .style("opacity", 1);
    }

    function
    click(d) {
      node = d;
      path.transition()
        .duration(1000)
        .attrTween("d", arcTweenZoom(d));
    }


    // Setup for switching data: stash the old values for transition.
    function
    stash(d)
    {
      d.x0 = d.x;
      d.dx0 = d.dx;
    }

    // When switching data: interpolate the arcs in data space.
    function
    arcTweenData(a, i)
    {
      var oi = d3.interpolate({x: a.x0, dx: a.dx0}, a);
      function tween(t) {
        var b = oi(t);
        a.x0 = b.x;
        a.dx0 = b.dx;
        return arc(b);
      }
      if (i == 0) {
       // If we are on the first arc, adjust the x domain to match the root node
       // at the current zoom level. (We only need to do this once.)
        var xd = d3.interpolate(x.domain(), [node.x, node.x + node.dx]);
        return function(t) {
          x.domain(xd(t));
          return tween(t);
        };
      } else {
        return tween;
      }
    }

    // When zooming: interpolate the scales.
    function
    arcTweenZoom(d) {
      var xd = d3.interpolate(x.domain(), [d.x, d.x + d.dx]),
          yd = d3.interpolate(y.domain(), [d.y, 1]),
          yr = d3.interpolate(y.range(), [d.y ? 20 : 0, radius]);
      return function(d, i) {
        return i
            ? function(t) { return arc(d); }
            : function(t) { x.domain(xd(t)); y.domain(yd(t)).range(yr(t));
                            return arc(d); };
      };
    }
  }

  // show report header
  function
  show_reportheader(data)
  {
      if (!data)
         return;

      var colnames = Object.keys(data[0]);
      $("#reportheader").show();
      $("#reportheader >thead").empty().append("<tr></tr>");
      $("#reportheader >tbody").empty().append("<tr></tr>");
      for (var i=0; i<colnames.length; i++) {
        if (colnames[i] == "Specification" || colnames[i] == "Calculation")
          continue; 
        var th = "<th>"+colnames[i]+"</th>";
        $('#reportheader >thead tr').append(th);
        var td = "<td>"+data[0][colnames[i]]+"</td>";
        $('#reportheader >tbody tr').append(td);
      }
  }

  function
  render_score(score)
  {
     var result = '<div class="smileys-result">';
     for (var i=1; i<6; i++) {
       if (score == i) {
         result += '<div class="smiley small"><img src="css/images/smiley_'+i+'.jpg"></div>';
       } else {
         result += '<div class="smiley small"><img src="css/images/smiley_blank.jpg"></div>';
       }
     }
     result += "</div>";
     return result;
  }

  // show report body
  function
  show_reportbody(data, par)
  {
      function appendShowSqlButton(thead, tbody) {
        function show_clicked(el) {
          var isQuery = $(el.currentTarget).find("span").hasClass("reportSql")
          if (!isQuery) 
            backendCall("tableCmd", { sql: par.headerSql },
              function(res,myPar){
              showClicked(res[0].Specification?res[0].Specification:"tbd");
            });
          else
            showClicked(par.reportSql);
          function showClicked(text) {
            var txt = $(thead).find("th span.showhide").html();
            $(thead).find("th span.showhide").html(txt=="Show"?"Hide":"Show");
            $(tbody).find("tr.pre").remove();
            if (txt == "Show") {
              $(tbody).find("tr").hide();
              $(thead).find("th").hide();
              $(thead).find("th:last").show();
              $(tbody).append('<tr class="pre" colspan="42"><td>'+(isQuery?'Report query:':'Report specification:')+'</td></tr><tr class="pre" colspan="42"><td><span><pre>'+
                 text+'</pre></span></td></tr>');
              if (isQuery) {
                $(thead).find("th span.showhide.reportSql").parent().show();
                $(thead).find("th span.showhide.reportSpec").parent().hide();
              } else {
                $(thead).find("th span.showhide.reportSql").parent().hide();
                $(thead).find("th span.showhide.reportSpec").parent().show();
              }
            } else {
              $(thead).find("th").show();
              $(tbody).find("tr").show();
              $(thead).find("th span.showhide").parent().show();
            }
          }
        }
        $(thead).find("th span.showhide").parent().remove();
        var inner = $(thead).html();
        $(thead).html(inner.replace("</th></tr>", (hasProjectRight("AdminAll", "read")?" <a style='cursor:pointer;'>(<span class='showhide reportSql'>Show</span> query)</a>":"")+
        " <a style='cursor:pointer;'>(<span class='showhide reportSpec'>Show</span> specification)</a></th></tr>"));
        $(thead).find("a").click(show_clicked);
      }
      if (!par.show_later)
        $("#reportbody").show();
      $("#reportbody >tbody tr").remove();
      $("#reportbody >thead tr").empty();
      if (!data || data.length == 0) {
        var txt = "No matches found.";
        if (prefLang.toLowerCase() == "vi")
           txt = "Không có dữ liệu phù hợp"; 
        $("#reportbody >thead tr").append("<th colspan='42'>"+txt+"</th>");
        appendShowSqlButton($("#reportbody >thead"), $("#reportbody >tbody"));
        return;
      }
      // get colnames (to support variable columns, e.g. created by postprocessfn)
      var cols = {};
      for (var i in data) {
        var r = data[i];
        for (var col in r) {
          cols[col] = 1;
        }
      }
      function orderAfter(list, e1, e2) {
        var l = [];
        var idx = 0;
        for (var i=0; i<list.length; i++) {
          if (list[i] == e1) 
            idx = i+1;
          if (list[i] != e2)
            l.push(list[i]); 
        }
        l.splice(idx, 0, e2); 
        return l;
      }
      var colnames = Object.keys(cols);
      if (par.orderAfter) {
        for (var col in par.orderAfter) {
          var destCol = par.orderAfter[col];
          if (!cols[col] || !cols[destCol])
            continue;
          colnames = orderAfter(colnames, destCol, col);
        }
      }
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
      for (var i=0; i<colnames.length; i++) {
        //var th = "<th><span style='padding-right:5px'>"+
        var th = "<th"+(par.hidden && par.hidden[colnames[i]] == true ?" class='hidden'":"")+">"+
        (par.colImages && par.colImages[colnames[i]] != null?"<img src='"+pointer2image(par.colImages[colnames[i]])+"'>":"")+colnames[i]+
                      //"</span><i class='btn-link glyphicon glyphicon-sort-by-attributes '" +
                      "<i class='btn-link glyphicon glyphicon-sort-by-attributes '" +
                      "onclick='sort_tablerows(this)'></i></th>";
        $('#reportbody >thead tr').append(th);
      }
      var dataLength = reportAppendTotals ? data.length - 1 : data.length;
      function n(x) { if(x != undefined && x != null) return x; return ""; } // avoid undefined and null as string
      for(var i=0; i<dataLength; i++) {
        var row = "<tr>"
        for (var j=0; j<colnames.length; j++) {
          if (par.insertScores && colnames[j] == "Score")
            row += "<td>"+render_score(data[i][colnames[j]])+"</td>";
          else
            row += "<td"+(par.hidden && par.hidden[colnames[j]] == true ?" class='hidden'":"")+">"+ n(data[i][colnames[j]]) + "</td>";
        }
        row += "</tr>"
        $('#reportbody').find('tbody:last').append(row);
      }

      $("#reportbody >tfoot tr").remove();
      if (reportAppendTotals) {
        var row = "<tr>"
        for (var j=0; j<colnames.length; j++) {
          if (par.insertScores && colnames[j] == "Score")
            row += "<td>"+render_score(data[i][colnames[j]])+"</td>";
          else
            row += "<td>"+ data[i][colnames[j]] + "</td>";
        }
        row += "</tr>"
        $('#reportbody').find('tfoot:last').append(row);

      }
      if (par.postrenderfn)
        par.postrenderfn();
      appendShowSqlButton($("#reportheader >thead"), $("#reportheader >tbody"));

      $("#btn-report-hide-empty").unbind("click").click (function() {
          var txt = $(this).find("span.showhide").html();
          $("#btn-report-hide-empty").find("span.showhide").html(txt=="Show"?"Hide":"Show");
          if (txt == "Show") {
            $("#reportbody").find(".hidden").removeClass("hidden");
          } else {
            function tr_is_empty(tr) {
              var is_empty = true;
              $(tr).find("td:not(:first-child)").each(function() {
                if ($(this).html() != "") {
                  is_empty = false;
                  return false;
                }
              });
              return is_empty;
            }
            $("#reportbody tbody tr").each(function() {
              // hide rows
              if (tr_is_empty(this)) {
                $(this).addClass("hidden");
              }
            });
            var cols = {};
            $("#reportbody tbody tr:not(.hidden) td").each(function() {
              if ($(this).html() != "") {
                 var col = $(this).parent().children().index($(this));
                 cols[col] = 1;
              }
            });
            $("#reportbody thead th").each(function() {
               var col = $(this).index();
               if (col == 0)
                 return true;
               if (cols[col] != 1)
                 $(this).addClass("hidden");
            });
            $("#reportbody tbody tr:not(.hidden) td").each(function() {
               var col = $(this).parent().children().index($(this));
               if (!cols[col])
                 $(this).addClass("hidden");
            });
          }
         
      });

      $("#btn-report-csvexport").unbind("click").click (function() { csvexport_report(); });
      $("#btn-report-csvexport").show();

      function
      csvexport_report() {

        function
        createCsvString(separator) {
          // create csv data
          var csv = '';
          if(report_data.length > 0) {
            var colnames = Object.keys(report_data[0]);
            for (var i=0; i<colnames.length; i++)
              csv += escapeCSV(colnames[i], separator) + separator;
            csv = csv.substring(0, csv.length - 1) + "\r\n";
            for(var i=0; i<report_data.length; i++) {
              for (var j=0; j<colnames.length; j++) {
                csv += escapeCSV(report_data[i][colnames[j]], separator) + separator;
              }
              csv = csv.substring(0, csv.length - 1) + "\r\n";
            }
          }
          return csv;
        }


        function
        escapeCSV(value, separator) {
          // Returns a string value for a CSV column enclosed in double quotes, if required.
          // If value contains a separator, newline or double quote, then
          // any double quote characters in value are escaped with another double quote
          // and the string value is returned enclosed in double quotes.
          //
          // If the value does not contain a separator, newline or double quote, then
          // the string value is returned unchanged.
          if (!separator)
            separator = ',';
          var strValue = String(value);
          if (strValue) {
            //log("escapeCSV before: '"+strValue+"'");
            if (strValue.indexOf(separator) != -1 || strValue.indexOf('\n') != -1 || strValue.indexOf('"') != -1) {
              strValue = strValue.replace(/\\\"/g, '\"\"');
              strValue = '"' + strValue + '"';

            }
            //log("escapeCSV  after: '"+strValue+"'");
          }
          return strValue;
        }

        log("csvexport_report:");
        var separator = '\t';
        var csv = createCsvString(separator);
        var bom = '\ufeff';
        backendCall("writeFile", 
          { encoding: 'utf16le', content:bom+csv+"\r\n", prefix:"ReportData_", suffix:".csv" },
        function(ret) {
           var path = location.href.substring(0, location.href.lastIndexOf('/'));
           downloadFile(path+ret.fileName);
        });
      }

      $("#btn-report-svgexport").unbind("click").click (function() {svgexport_report(); });

      function
      svgexport_report() {
        function getStyles(doc) {
          var styles = [],
              styleSheets = doc.styleSheets;

          if (styleSheets) {
            for (var i = 0; i < styleSheets.length; i++) {
              // only load c3 stylesheet
              if (styleSheets[i].href && (styleSheets[i].href.endsWith("c3.min.css") || styleSheets[i].href.endsWith("c3.css")))
                processStyleSheet(styleSheets[i]);
            }
          }

          function processStyleSheet(ss) {
            if (ss.cssRules) {
              for (var i = 0; i < ss.cssRules.length; i++) {
                var rule = ss.cssRules[i];
                if (rule.type === 3) {
                  // Import Rule
                  processStyleSheet(rule.styleSheet);
                } else {
                  // hack for illustrator crashing on descendent selectors
                  if (rule.selectorText) {
                    if (rule.selectorText.indexOf(">") === -1) {
                      styles.push(rule.cssText);
                    }
                  }
                }
              }
            }
          }
          return styles;
        }

        function downloadSvg(svgEl) {
          var filename = $(svgEl).find("text.c3-title").html();
          var svg = $(svgEl).clone();
          $(svg).find("[clip-path]").each(function() {
            var clipPath = $(this).attr("clip-path");
            clipPath = clipPath.replace(/^url\(.*(#c3.*)\)/g,"url($1)");
            $(this).attr("clip-path", clipPath);
          });
          $(svg).attr("version", "1.1");
          $(svg).attr("xmlns", "http://www.w3.org/2000/svg");
          $(svg).attr("xmlns:xlink", "http://www.w3.org/1999/xlink");
          $(svg).prepend("<defs><style><![CDATA["+getStyles(window.document).join("\n")+
                         "\n.domain, line { fill: none; stroke: black; stroke-width; 1; } ]]></style></defs>");

          var doctype = '<?xml version="1.0" standalone="no"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">';
          var source = doctype + $(svg)[0].outerHTML;
          var url = window.URL.createObjectURL(new Blob([source], { "type" : "text\/xml" }));

          var a = document.createElement("a");
          document.body.appendChild(a);
          a.setAttribute("download", filename + ".svg");
          a.setAttribute("href", url);
          a.style["display"] = "none";
          a.click();

          setTimeout(function() {
            window.URL.revokeObjectURL(url);
          }, 10);
        }

        log("svgexport_report");
        $("#chart-pie:visible,#chart-bar-line:visible").find("svg").each(function() {
            downloadSvg($(this));
        });
      }

  }
}

function
hasReportViewerRights(rights)
{
  //log("hasReportViewerRights " + rights);
   if (!rights)
     return false;
   var rolesWithReportViewerRights = [];
   for (var i=0; i<roles.length; i++) {
     var admin_right = roles[i].admin_rights;
     if (admin_right.lastIndexOf("Reports=") == 0)
       rolesWithReportViewerRights.push(""+roles[i].id+"");
   }
   var rightList = rights.split(" ");
   for (var i=0; i<rightList.length; i++)
   {
     var roleId = rightList[i].split(":")[0];
     if (!roleId)
       continue;
     if ($.inArray(roleId, rolesWithReportViewerRights) != -1)
       return true;
   }
   return false;
}

function
view_public_reports()
{
  log("View public reports started!");
  login('public_reports','Public_Reports');
}


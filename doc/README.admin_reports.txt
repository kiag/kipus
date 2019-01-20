in table kipus_reports, the reports are stored which can be called from
Admin Dashboard -> Reports

Permissions:
- User with AdminAll can see all Reports
- User can have permissions to individual report

Reports 
- open with Dashboard -> Reports
  -> Project -> Report Name
  if all reports belong to the same project,
  the Projects Screen is directly called with this project
  on the second level

Report:
- reports are stored in the kipus_reports table,
  each row represents one report, with the following columns:


    kipus_reports table and the most important columns
    +---------------+-------------------------------------------------+------+-----+---------------+----------------+
    | Field         | Type          | Null | Key | Default       | Extra          | column details
    +---------------+-------------------------------------------------+------+-----+---------------+----------------+
    | id            | int(11)       | NO   | PRI | NULL          | auto_increment | 
    | projectid     | int(11)       | YES  | MUL | NULL          |                | the reference to the project the report belongs to
    | language      | varchar(255)  | YES  |     | NULL          |                | language of the report , e.g. 'en' for english or 'vi' for vietnamese
    | category      | varchar(255)  | YES  |     | NULL          |                | category the report is grouped visually in the report overview in Dashboard
    | reportname    | varchar(255)  | NO   |     | NULL          |                | internal name, used to connect the report with it's params:
                                                                                    kipus_reports.reportname -> kipus_reportparams.@reportname (@ is important)
                                                                                    also see report_params.txt
    | reportnumber  | varchar(255)  | YES  |     | NULL          |                | Nr column in report overview
    | displayname   | varchar(255)  | NO   |     | NULL          |                | Name column in report overview
    | description   | varchar(2000) | YES  |     | NULL          |                | Description column in report overview
    | headersql     | text          | NO   |     | NULL          |                | SQL for the report header (usually Title, Description, Date)
    | reportsql     | text          | NO   |     | NULL          |                | SQL for the report data (the actually data for the report)
    | postprocessfn | varchar(255)  | YES  |     | NULL          |                | javascript method that is called to postprocess the data
                                                                                    the method has to exist or to be writte in adminMods/<project>/bi_reportparams.js
    | modified      | char(19)      | NO   |     | NULL          |                | timestamp of the creation/modified time
    | modifiedby    | varchar(255)  | NO   |     | NULL          |                | user who created/modified the report
    +---------------+-------------------------------------------------+------+-----+---------------+----------------+
    UNIQUE (projectid, reportname),                                              -> combination of projectid+reportname has to be unique
    FOREIGN KEY (projectid) REFERENCES kipus_projects(id) ON DELETE CASCADE      -> projectid has to be a valid id in table kipus_projects

Examples for the report training_voucher, two table inserts have to be made:

// reportsql
set @tv_query := "
           select bc.DISPLAYNAME as 'Target Group'
            , g.DISPLAYNAME as 'Gender'
            , h0.DISPLAYNAME as 'Region'
            , ta.DISPLAYNAME as 'Trade Area'
            , tu.TU_PROF_LEVEL as 'Course Level'
            , DATE_FORMAT(b1.CO_START_DATE, \"%Y-%m%-%d\") as 'Course Start Date'
            , count(*) as 'Number'
            from GB_BENEFICIARIES b 
            inner join GI_COURSE_REQUEST b0 on b.bookid = b0.bookid
            inner join GI_COURSE b1 on b0.GCR_COURSE = concat(b1.bookid,'/0')
            inner join GM_REGIONAL_HIERARCHY h0 on b.GB_REGION = h0.id
            INNER JOIN GM_BENEFICIARY_CATEGORY bc ON b.GB_CATEGORY = bc.id
            INNER JOIN GM_GENDER g ON b.GB_GENDER = g.id
            INNER JOIN GM_TRADE_AREA ta ON b1.CO_TRADE_AREA = ta.id
            INNER JOIN GI_TRAINING_UNITS tu ON b1.CO_TRAINING_UNIT = tu.id
            WHERE h0.HIERARCHYPATH REGEXP \"@selected_regexp_regions\"
              AND  b1.CO_START_DATE REGEXP \"@selected_regexp_date\"
              AND  b.GB_CATEGORY IN (@selected_target_group)
              AND  b.GB_GENDER IN (@selected_gender)
              AND  b.GB_TRADE_AREA IN (@selected_trade_area)
              AND  b0.GCR_VOUCHER IS NOT NULL
              AND  b1.CO_VOUCHER_GENERATED = 1
            GROUP BY bc.DISPLAYNAME, g.DISPLAYNAME, h0.DISPLAYNAME, ta.DISPLAYNAME, tu.TU_PROF_LEVEL, 
                     DATE_FORMAT(b1.CO_START_DATE, \"%Y-%m%-%d\")
";
INSERT INTO kipus_reports(projectid, category, report_type, reportname, reportnumber, displayname, description, headersql, reportsql, modified, modifiedby)
VALUES (@projectid, 'Report for interactive analysis', 'Table', 'training_voucher', '7', 'Training Vouchers issued by Trade Area'
        ,  'No. of training vouchers generated '
        -- headersql
        ,  'SELECT  ''Training vouchers issued by Trade Area''  AS ''Title''
        ,           ''No. of training vouchers generated '' AS ''Description''
        ,           substr(CURDATE(), 1, 10) AS ''Date'';'
        -- reportsql
        , @tv_query
        , CURDATE()
        , 'system');

INSERT INTO kipus_reportparams(projectid, displayname, paramname, paramtype, paramvalue, modified, modifiedby)
VALUES (@projectid, 'Report parameters', '@training_voucher' , 'JSON'
        , '{"filters": ["@year_list","@region_list","@target_group_list","@gender_list","@trade_area_list"],
            "append_totals": "false",
            "hide_filter": ["bar","pie","table"],
            "x_type": "distinct",
            "y_type": ["pie","bar"],
            "columns_distinct": [ "Trade Area", "Target Group", "Gender", "Region"],
            "columns_distinct_aggregation": [ "Trade Area" ],
            "distinct_value_column": "Number"
           }'
        , CURDATE()
        , 'system');


Translation:
- language column in kipus_reports defines which reports are loaded,
  if user has language setting='en', only reports with language ='en' are shown (if he has the permission)
  

Report params:
  Report params are used to control the representation of the report, e.g. BarChart, x-Axis, etc.
  Even if only Table representation is needed, a report param has to exist, but with an empty JSON object,

  Example:
  INSERT INTO kipus_reportparams(projectid, displayname, paramname, paramtype, paramvalue, modified, modifiedby)
VALUES (@projectid, 'Report parameters', '@other_usage_in_store' , 'JSON'
        , '{}'
        , CURDATE()
        , 'system');
  
 The report is referenced with the report param via the reportname column:
 kipus_reports.reportname -> kipus_reportparams.@reportname (@ is important)
 also see report_params.txt for detailed paramters

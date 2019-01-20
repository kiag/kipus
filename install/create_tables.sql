SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS kipus_user;
create table kipus_user (
  login          varchar(255) collate utf8_general_ci primary key,
  displayname    varchar(255) NOT NULL,
  address        varchar(255),
  email          varchar(255),
  messengerid    varchar(64) NULL,
  zalo           varchar(64) NULL,
  phonenumber    varchar(32) NULL,
  alwaysLogin    enum('YES','NO') NOT NULL,
  pwhash         varchar(255),
  rights         varchar(2048),
  usertype       varchar(255),
  language       varchar(255) NULL,
  locale         varchar(2048) NULL,
  status         enum('LOCKED','DEFAULT') NULL,
  statusModified char(19)     NULL,
  lastSync       char(19)     NULL,
  modified       char(19)     NOT NULL,
  modifiedby     varchar(255) NOT NULL
);

# Password is kipusadmin
insert into kipus_user values ('admin', 'System Admin','','','' ,'','','YES','sha512;d87436e506b0a0fe12a4cef819fa70cdf16880571eb0ed8401b56924a17798699a80e89f4f7a5bb7267e681f5301e03ec58ff935694c42c471d808965d963f3a', '1:', '', '', '', 'DEFAULT', '', '', '2014-04-29 16:49:00', 'initial');


DROP TABLE IF EXISTS kipus_projects;
create table kipus_projects (
  id                    int primary key auto_increment,
  name                  varchar(255) NOT NULL,
  prefix                varchar(255) NOT NULL,
  title                 varchar(255) NOT NULL,
  isDefault             enum('NO','YES') NOT NULL,
  isOffline             enum('NO','YES') NOT NULL,
  rightdef              varchar(2048),
  sourcelang            varchar(255) default 'en',
  defaultlang           varchar(255) default 'en',
  advancedMenuPw        varchar(255),
  short_name            varchar(255),
  description           varchar(2048),
  internal_responsible  varchar(255),
  external_partner      varchar(255),
  explain_abbreviation  varchar(255),
  created               char(19),
  modified              char(19),
  modifiedby            varchar(255)
);

DROP TABLE IF EXISTS kipus_roles;
create table kipus_roles (
  id             int primary key auto_increment,
  projectid      int,
  name           varchar(255) NOT NULL,
  displayname    varchar(255) NOT NULL,
  bookdef_rights varchar(2048),
  admin_rights   varchar(2048) NOT NULL,
  admin_parameters varchar(255),
  modified       char(19),
  modifiedby     varchar(255),
  FOREIGN KEY (projectid) REFERENCES kipus_projects(id)
);

INSERT INTO kipus_roles (name, displayname, bookdef_rights, admin_rights, modified, modifiedby) VALUES
('AdminAll',                   'AdminAll',                    '', 'AdminAll=write',                    '2015-09-28 14:00:00', 'dba'),
('DataMaintenanceBooks',       'DataMaintenanceBooks',        '', 'DataMaintenanceBooks=write',        '2016-03-30 03:30:00', 'rko'),
('DataMaintenanceLookupTables','DataMaintenanceLookupTables', '', 'DataMaintenanceLookupTables=write', '2016-03-30 03:30:00', 'rko'),
('Projects',                   'Projects',                    '', 'Projects=write',                    '2016-03-30 03:30:00', 'rko'),
('RoleAdministration',         'RoleAdministration',          '', 'RoleAdministration=write',          '2016-03-30 03:30:00', 'rko'),
('UserAdministration',         'UserAdministration',          '', 'UserAdministration=write',          '2016-03-30 03:30:00', 'rko'),
('Reports',                    'Reports',                     '', 'Reports=write',                     '2016-03-30 03:30:00', 'rko'),
('PublicReports',              'PublicReports',               '', 'Reports=read',                      '2016-03-30 03:30:00', 'rko');


DROP TABLE IF EXISTS kipus_userprojects;
create table kipus_userprojects (
  login        varchar(255) collate utf8_general_ci,
  projectid    int,
  modified     char(19),
  modifiedby   varchar(255),

  UNIQUE(login,projectid),
  FOREIGN KEY (login) REFERENCES kipus_user(login),
  FOREIGN KEY (projectid) REFERENCES kipus_projects(id)
);


DROP TABLE IF EXISTS kipus_bookdefinition;
create table kipus_bookdefinition (
  id           int primary key auto_increment,
  name         varchar(255),
  title        varchar(255),
  helptext     varchar(255),
  hidden       enum('NO','YES') NOT NULL,
  autocreate   enum('NO','YES') NOT NULL,
  parentbookid int,
  showif       varchar(255),
  bi_params    varchar(255) default 'none',
  modified     char(19),
  modifiedby   varchar(255),
  FOREIGN KEY (parentbookid) REFERENCES kipus_bookdefinition(id)
);

DROP TABLE IF EXISTS kipus_projectbooks;
create table kipus_projectbooks (
  projectid    int,
  bookdefid    int,
  modified     char(19),
  modifiedby   varchar(255),

  UNIQUE(projectid,bookdefid),
  FOREIGN KEY (projectid) REFERENCES kipus_projects(id),
  FOREIGN KEY (bookdefid) REFERENCES kipus_bookdefinition(id)
);

DROP TABLE IF EXISTS kipus_pagedefinition;
create table kipus_pagedefinition (
  id              int primary key auto_increment,
  tablename       varchar(255) NOT NULL,
  displayname     varchar(255) NOT NULL,
  helptext        varchar(255),
  pagetype        enum('HEADER','BODY','SUBPAGE','LOOKUP',
                       'EXTERNAL','CP_LOOKUP') NOT NULL,
  uniquecols      varchar(255),    -- Col1,Col2,...
  subpageparam    varchar(255),    -- ColumnName:ColumnValue
  longtitle       varchar(4096),
  shorttitle      varchar(4096),
  sortby          varchar(255),
  importOverwrite enum('YES','NO') DEFAULT 'YES',
  modified        char(19),
  modifiedby      varchar(255)
);

DROP TABLE IF EXISTS kipus_pageattributes;
create table kipus_pageattributes (
  pagedefid          int NOT NULL,
  columnname         varchar(255) NOT NULL,
  displayname        varchar(255) NOT NULL,
  helptext           varchar(4096),
  columnorder        int NOT NULL,
  columnmaxlength    varchar(3),
  constrainttype     varchar(255),
  constraintparam    varchar(4096),
  inputtype          enum('visible','hidden','readonly','createonly',
                          'mandatory','modifiablehdrcol',
                          'mandatory_modifiablehdrcol') NOT NULL,
  suffix             varchar(255),
  defaultvalue       varchar(255),
  placeholder        varchar(255),
  javascriptonchange text,
  javascriptonsave   text,
  showif             varchar(255),
  gluewithnext       enum('NO','SAMEROW','NEWROW') NOT NULL,
  corrective         enum('NO','YES') NOT NULL,
  scoretype          enum('info','simple', 'important', 'critical') NOT NULL,
  longhelp           text,
  i18n               enum('NO','YES') NOT NULL,
  bi_params          varchar(255) default 'none',
  modified           char(19),
  modifiedby         varchar(255),

  UNIQUE(pagedefid,columnname),
  FOREIGN KEY (pagedefid) REFERENCES kipus_pagedefinition(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS kipus_bookpages;
create table kipus_bookpages (
  bookdefid    int,
  pagedefid    int,
  modified     char(19),
  modifiedby   varchar(255),

  UNIQUE(bookdefid,pagedefid),
  FOREIGN KEY (bookdefid) REFERENCES kipus_bookdefinition(id),
  FOREIGN KEY (pagedefid) REFERENCES kipus_pagedefinition(id)
);

DROP TABLE IF EXISTS kipus_rows;
create table kipus_rows (
  id             int primary key auto_increment,
  bookid         varchar(255) NOT NULL,
  rootbookid     varchar(255) NOT NULL,
  bookdefid      varchar(255) NOT NULL,
  foreignRowId   varchar(255) NOT NULL,
  foreignSyncId  varchar(255) NOT NULL,
  foreignCreated char(19),
  modified       char(19),
  modifiedby     varchar(255)
);
create index IX_K_ROWS_FOREIGNROWID_BOOKID ON kipus_rows (foreignRowId, bookid);
alter table kipus_rows add unique (bookid,bookdefid,foreignrowid);

DROP TABLE IF EXISTS kipus_bigdata;
create table kipus_bigdata (
  dataid          varchar(255)   PRIMARY KEY,    -- TABLE/row/COLUMN
  comment         varchar(10000) NOT NULL,
  importOverwrite enum('YES','NO') DEFAULT 'YES',
  icon            mediumblob,
  bigdata         mediumblob     NOT NULL,
  modified        char(19)       NOT NULL,
  modifiedby      varchar(255)   NOT NULL
);

DROP TABLE IF EXISTS kipus_debugInfo;
create table kipus_debugInfo (
  id             int primary key auto_increment,
  data           varchar(4096),
  modified       char(19),
  modifiedby     varchar(255)
);

DROP TABLE IF EXISTS kipus_serverErrors;
create table kipus_serverErrors (
  id             int primary key auto_increment,
  data           varchar(4096),
  modified       char(19),
  modifiedby     varchar(255)
);

DROP TABLE IF EXISTS kipus_reports;
create table kipus_reports (
  id             int primary key auto_increment,
  projectid      int,
  language       varchar(255)   NULL,
  category       varchar(255)   NULL,
  report_type    enum('Table', 'Ringchart', 'Scores', 'Javascript'),
  access_type    enum('authenticated', 'public') default 'authenticated',
  reportname     varchar(255)   NOT NULL, 
  reportnumber   varchar(255),
  displayname    varchar(255)   NOT NULL,
  description    varchar(2000),
  headersql      text           NOT NULL,
  reportsql      text           NOT NULL,
  paramids       varchar(255),  -- comma separated reportparams.id
  postprocessfn  varchar(255),
  modified       char(19)       NOT NULL,
  modifiedby     varchar(255)   NOT NULL,
  UNIQUE (projectid, reportname),
  FOREIGN KEY (projectid) REFERENCES kipus_projects(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS kipus_reportparams;
create table kipus_reportparams (
  id             int primary key auto_increment,
  projectid      int,
  displayname    varchar(255)   NOT NULL,
  description    varchar(255),
  paramname      varchar(255)   NOT NULL,
  paramtype      enum('SQL','JSON') NOT NULL,
  paramvalue     text           NOT NULL,
  modified       char(19)       NOT NULL,
  modifiedby     varchar(255)   NOT NULL,
  UNIQUE (projectid, paramname),
  FOREIGN KEY (projectid) REFERENCES kipus_projects(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS kipus_scores;
create table kipus_scores (
  bookdefid    varchar(255) NOT NULL,
  bookid       varchar(255) NOT NULL,
  tablename    varchar(255),
  rowid        int NOT NULL,
  level        enum('entry','group','attribute') NOT NULL,
  columnname   varchar(255)   null,
  scoreLast    int NOT NULL,
  scoreTotal   int NOT NULL,
  critical     int NOT NULL,
  groupname    varchar(255)
);

DROP TABLE IF EXISTS kipus_external;
create table kipus_external (
  id           int primary key auto_increment,
  projectid    int NOT NULL,
  destination  varchar(255) default 'local',
  direction    enum('PUSH','PULL') default 'PUSH',
  src_table    varchar(255) NOT NULL,
  dst_table    varchar(255) NOT NULL,
  columns      varchar(4096) NOT NULL,
  filter       varchar(255),
  modified     char(19)       NOT NULL,
  modifiedby   varchar(255)   NOT NULL
);

DROP TABLE IF EXISTS kipus_adminStructChanges;
create table kipus_adminStructChanges (
  id           int primary key auto_increment,
  action       varchar(255)  NOT NULL,
  context      varchar(255)  NOT NULL,
  modified     char(19)      NOT NULL,
  modifiedby   varchar(255)  NOT NULL
);

DROP TABLE IF EXISTS kipus_mobileStructChanges;
create table kipus_mobileStructChanges (
  id           int primary key auto_increment,
  projectid    int           NOT NULL,
  version      varchar(255)  NOT NULL,
  jscode       varchar(4096) NOT NULL,
  modified     char(19)      NOT NULL,
  modifiedby   varchar(255)  NOT NULL
);



DROP TABLE IF EXISTS kipus_generateduserbookids;
create table kipus_generateduserbookids (
  login        varchar(255) NOT NULL collate utf8_general_ci,
  rootbookid   varchar(255) NOT NULL,
  projectName  varchar(255) NOT NULL,
  UNIQUE(login,rootbookid),
  FOREIGN KEY (login) REFERENCES kipus_user(login)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

DROP TABLE IF EXISTS WEATHER_HISTORIC;
create table WEATHER_HISTORIC (
  ID           VARCHAR(255) NOT NULL,
  date         CHAR(8)      NOT NULL,
  temp0_avg    VARCHAR(255) NULL,
  temp0_min    VARCHAR(255) NULL,
  temp0_max    VARCHAR(255) NULL,
  temp1_avg    VARCHAR(255) NULL,
  moist0_avg   VARCHAR(255) NULL,
  moist1_avg   VARCHAR(255) NULL,
  hum0_avg     VARCHAR(255) NULL,
  precip0_sum  VARCHAR(255) NULL,
  press0_avg   VARCHAR(255) NULL,
  PRIMARY KEY(id, date)
);

DROP TABLE IF EXISTS WEATHER_FORECAST;
create table WEATHER_FORECAST (
  ID           VARCHAR(255) NOT NULL,
  date         CHAR(8)      NOT NULL,
  temp0_avg    VARCHAR(255) NULL,
  temp0_min    VARCHAR(255) NULL,
  temp0_max    VARCHAR(255) NULL,
  precip0_sum  VARCHAR(255) NULL,
  press0_avg   VARCHAR(255) NULL,
  PRIMARY KEY(id, date)
);


-- **********************************************************************************
--  Create and populate the SQL table 'time_dimension' (needed for pentaho reporting)
--  by executing the SQL commands from the file 'create_time_dimension.sql'
-- **********************************************************************************
-- \. create_time_dimension.sql

-- *********************************************************************
-- Create a table for the 'All' display value
-- which is UNIONed with the LU_ tables for the drop-down lists
-- for Pentaho parameterised reports.
-- NOTE: Cannot use VIEW or a sub-select with literal values,
--       as Penthaho requires a primary key field
-- *********************************************************************
DROP TABLE IF EXISTS kipus_bi_all;
create table kipus_bi_all (
  id           int          primary key,
  all_text     varchar(255) not null
);
insert into kipus_bi_all values (0,'All');


DROP TABLE IF EXISTS kipus_lock;
create table kipus_lock (
  lockName     varchar(255) primary key,
  modified     char(19)     NOT NULL,
  modifiedby   varchar(255) NOT NULL
);


DROP TABLE IF EXISTS kipus_clientinfo;
create table kipus_clientinfo (
  clientinfo   varchar(4096),
  modified     char(19)     NOT NULL,
  modifiedby   varchar(255) NOT NULL
);

DROP TABLE IF EXISTS kipus_pushtoken;
create table kipus_pushtoken (
  login        varchar(255)  NOT NULL collate utf8_general_ci,
  token        varchar(4096) NOT NULL,
  clientinfo   varchar(4096),
  modified     char(19)      NOT NULL,
  modifiedby   varchar(255)  NOT NULL,

  FOREIGN KEY (login) REFERENCES kipus_user(login)
);

DROP TABLE IF EXISTS kipus_pushtopics;
create table kipus_pushtopics (
  topic        varchar(255)  NOT NULL UNIQUE,
  displayname  varchar(255),
  description  longtext,
  modified     char(19)      NOT NULL,
  modifiedby   varchar(255)  NOT NULL
);

DROP TABLE IF EXISTS kipus_usertopics;
create table kipus_usertopics (
  login        varchar(255)  NOT NULL collate utf8_general_ci,
  topic        varchar(255)  NOT NULL,
  modified     char(19),
  modifiedby   varchar(255),

  UNIQUE(login,topic),
  FOREIGN KEY (login) REFERENCES kipus_user(login),
  FOREIGN KEY (topic) REFERENCES kipus_pushtopics(topic)
);

DROP TABLE IF EXISTS kipus_pushmessage_history;
create table kipus_pushmessage_history (
  topic        varchar(255)  NOT NULL,
  title        varchar(255)  NOT NULL,
  message      varchar(4096)  NOT NULL,
  
  modified     char(19),
  modifiedby   varchar(255)
);

DROP TABLE IF EXISTS kipus_structChanges_history;
create table kipus_structChanges_history (
  id             int primary key auto_increment,
  action         varchar(255)  NOT NULL,
  context        varchar(4096) NOT NULL,
  modified       char(19),
  modifiedby     varchar(255)
);

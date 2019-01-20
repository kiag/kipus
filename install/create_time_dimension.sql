-- $Id: create_time_dimension.sql 1681 2016-06-16 11:27:41Z sdl $
CREATE TABLE `T` (
  `n` int(11)
);


insert into T (n) values (0);       --    1
insert into T (select * from T);    --    2
insert into T (select * from T);    --    4
insert into T (select * from T);    --    8
insert into T (select * from T);    --   16
insert into T (select * from T);    --   32
insert into T (select * from T);    --   64
insert into T (select * from T);    --  128
insert into T (select * from T);    --  256
insert into T (select * from T);    --  512
insert into T (select * from T);    -- 1024
insert into T (select * from T);    -- 2048
insert into T (select * from T);    -- 4096
insert into T (select * from T);    -- 8192

-- time span
SET @d0 = "2014-01-01";
SET @d1 = "2030-12-31";

SET @date = date_sub(@d0, interval 1 day);

-- set up the time dimension table
DROP TABLE IF EXISTS time_dimension;
CREATE TABLE `time_dimension` (
  `date` date DEFAULT NULL,
  `id` int NOT NULL,
  `y` smallint DEFAULT NULL,
  `m` smallint DEFAULT NULL,
  `d` smallint DEFAULT NULL,
  `yw` smallint DEFAULT NULL,
  `w` smallint DEFAULT NULL,
  `q` smallint DEFAULT NULL,
  `wd` smallint DEFAULT NULL,
  `m_name`  char(10) DEFAULT NULL,
  `wd_name` char(10) DEFAULT NULL,
  PRIMARY KEY (`id`)
);

CREATE UNIQUE INDEX ix_date ON time_dimension( date );

-- populate the table with dates
INSERT INTO time_dimension
SELECT @date := date_add(@date, interval 1 day) as date,
    date_format(@date, "%Y%m%d") as id, -- integer ID, human comprehensible
    year(@date) as y,
    month(@date) as m,
    day(@date) as d,
    date_format(@date, "%x") as yw,
    week(@date, 3) as w,
    quarter(@date) as q,
    weekday(@date)+1 as wd,
    monthname(@date) as m_name,
    dayname(@date) as wd_name
FROM T
WHERE date_add(@date, interval 1 day) <= @d1
ORDER BY date
;

DROP TABLE T;

-- The corresponding definition of the Time dimension is:
-- 	<Dimension name="Time" type="TimeDimension">
-- 		<Hierarchy hasAll="true" allMemberName="All Periods" primaryKey="id">
-- 			<Table name="time_dimension"/>
-- 			<Level name="Year" column="y" uniqueMembers="true" levelType="TimeYears" type="Numeric"/>
-- 			<Level name="Quarter" column="q" uniqueMembers="false" levelType="TimeQuarters"/>
-- 			<Level name="Month" column="m" uniqueMembers="false" ordinalColumn="m" nameColumn="m_name" levelType="TimeMonths" type="Numeric"/>
-- 			<Level name="Week" column="w" uniqueMembers="false" levelType="TimeWeeks"/>
-- 			<Level name="Day" column="wd" uniqueMembers="false" ordinalColumn="wd" nameColumn="wd_name" levelType="TimeDays" type="Numeric"/>
-- 		</Hierarchy>
-- 	</Dimension>

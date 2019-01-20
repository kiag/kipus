This document describes the format of the KIPUS project export zip file.

Content
=======
The .zip file contains a subdirectory named after the project, with following
files:

- <projectname>.kipus
  Contains the complete description of the project, in JSON format.
  See below for details.

- <projectname>.datadump.csv
  Contains pictures, project specific .css and .js files, XLIFF files,
  etc,  belonging to the project. It is a dump of the kipus_bigdata table.

- *.csv
  List of files containing lookup tables, with a separate file for each table.

- user/*.csv
  Dist Directory with its file is optional (exported if the user clicked on
  "Include user-data"), and contains the data entered on the mobile client and
  synced back to the database (up to the images, which are contained in the
  <projectname>.datadump.csv file, see above


Short HOWTO Import the data
===========================
- start with the "HEADER" tables from the user directory.
- the "BODY" tables are linked to the header tables via the bookid column.
- the lookups are joined with their respective id columns.
- the name and type of the tables should be known from the project description,
  but can also be extracted from the <projectname>.kipus file, see below.
- to join a lookup table used for "column": search for "column" in the
  <projectname>.kipus file. Join the table found in constraintparam with
  <this>.column = lookuptable.id
Special case:
- if a BODY table is part of another BODY table (referenced in a dataRows
  widget), then the <prefix>_TARGETID column has to be used for joining with
  the correct parent BODY entry.



Following is the description of each filetype.

*.csv
=====
  - the first line contains the semicolon separated column names
  - each following line contains a row in the corresponding table, the columns
    separated by semicolon (;) and enclosed in "" if necessary (MS-Excel style
    CSV)
  - each row contains the following columns:
    - id (unique id)
    - modified (timestamp in the format YYYY-MM-DD HH:MM:SS)
    - modifiedby (username)


user/*.csv
==========
  - just like a "generic" *.csv described above, with the following additioanl
    columns
  - rowid
    id in the kipus_rows table, where additional data is stored.
  - bookid
    the "client" bookid of the book, consisting of a timestamp in milliseconds.
  - rootbookid
    the bookid of the top book, in case the hierarchy contains more than one
    book.


<projectname>.datadump.csv
==========================
  - contains an image or file in each line.
  - each line consists of the columns (semicolon separated)
    - dataid
      this is the id used to reference the picture in the other data sets
    - comment
    - importOverwrite
    - icon
      if the data is an image, then it contains a downsampled version
    - original data
    - modified
    - modified by


<projectname>.kipus
=====================
  This is JSON data, describing the project.  The following is the simplified
  hierarchical structure of any KIPUS project:
      project
        book (one or more)
          page (one or more, represented by a DB table)
            attribute (represented by a DB column)

  Note: the entries described here are not necessarily stored in the same order
  in the file. Not described entries are probably irrelevant or unused.

  projects
  ========
    Short Description of the project itself. Fields:
    - prefix
      each table in this project will have this prefix, to enable
      deploying a copy of the same project to the same database.
    - isDefault
      if set to "YES", no need to specify the project name in the client
    - isOffline
      if set to "YES", the client downloads all data needed to operate without
      internet connection at startup.
    - sourcelang
      the text entered in the configuration was entered in this language.
      Other translations are stored as XLIFF file in the kipus_bigdata table
      (<projectname>.datadump.csv, see above)
    - defaultlang
      the client will show this language at first contact, the user may change
      it if there is more than one language available.

  bookdefinition
  ==============
    Array of books in the project.
    - autocreate
      set to YES if the book should be automatically created, whenever an
      instance of its parent is created
    - parentbookid
      id of the book definition if there is more than one book in the hierarchy

  bookpages
  =========
    List of book to page associations.

  pagedefinition
  ==============
    Description of the pages. A page corresponds to a table, with some
    additional attributes.
    - tablename
    - pagetype
      one of:
      HEADER:   each book has exactly one HEADER page, the data is filled by the
                user.
      BODY:     there is normally one BODY table without subpageparam, the data
                is filled by the user
      LOOKUP:   lookup table, the data is filled on the server by the project
                configurator
      CP_LOOKUP:Cross-Project Lookup: Table defined in another project, handled
                like a lookup-project in this project.
      EXTERNAL: table stored in another database
    - subpageparam
      BODY table only. If set, this table is used to complement a HEADER or
      a BODY table without subpageparam, see above the "Special case"
    - uniquecols
      coma separated list of columns that have to be unique in the whole table
      (HEADER or BODY without subpageparam) or for a given entry (BODY with
      subpageparam).
    - longtitle/shorttitle
      HTML formatted text, representing a page-entry
    - shorttitle
      unformatted text, representing a page-entry
    - sortby
      column used to sort this table. If not set, sort by shorttitle.
    - importOverwrite
      Overwrite this table at import. Used to maintain local lookup tables, and
      still be able to update other tables.

  pageattributes
  ==============
    Description of the columns in the tables.
    - columnname
    - displayname
      used on the client
    - helptext
      used on the client
    - columnorder
      order of display on the client, numeric
    - constrainttype
      type of widget on the client.
    - constraintparam (aka cp)
      additional parameters for a given widget.
      Known widget types are:
      - text
      - file
      - date
      - dateTime
      - gps
      - groupheader (for display structuring only, contains no data)
      - groupend (for display structuring only, contains no data)
      - hiddentimestamp
      - infotext
      - multiline
      - multifromarg (comma separated list, source taken from the cp)
      - multifromtable (comma separated list, source tablename from the cp)
      - num (number, with min, max, precision taken from the cp)
      - foto (cp contains maximum width x height)
      - qrcode
      - regexp (text with some sanity check)
      - signature
      - singlefromarg (list, source taken from cp)
      - singlefromtable (list, source tablename is first parameter of cp)
      - tableCopy (copy existing data into a separate table)
      - tableRows (enter multiple values in another BODY table)
    - inputtype
      one of: visible, hidden, readonly, createonly, mandatory
              modifiablehdrcol, mandatory_modifiablehdrcol
    - suffix
      display only
    - defaultvalue
    - placeholder
      display only
    - javascriptonchange
      executed when the widget is changed
    - javascriptonsave
      executed before the data is saved
    - showif
      display this widget if the condition is true
    - gluewithnext
      display only
    - i18n
      field should be translated

  kipus_rows
  ==========
     A table connecting the client-data with the server data:
     - id
       the server unique id for an "entity", which may consist of data in
       multiple tables. Usually it represents data entered on the client in one
       dialog.
     - bookdefid
       The id of the definition for this book (see books). Search the
       bookdefinition to find out which tables should contain the "real" data
       for this entry.
     - bookid
       the client unique id for a book.
     - foreignRowId
       Id of the bookentry on the client. A book consists of a header page
       (mandatory, id 0) and multiple book pages (optional, id > 0).  A unique
       bookid/foreignRowId combination corresponds to a single id (see above).
     - foreignSyncId
       timestamp of the synchronization
     - foreignCreated
       timestamp of the creation date on the client

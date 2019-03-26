const fs = require('fs');
//const sql = require('mssql');
const path = require('path');
//const request = require('request');
const xmlParser = require('xml-js');
var ftpConfig = {};
const configFileName = 'config.json'
var debug = 0


/*
TODO:
0. Uncomment SQL stuffs
1. Change insertJSONDataIntoSQL SQL statement to reflect actual procedure that will parse the JSON and handle the INSUPD.
2. Change sqlLoggingFunction to import into correct table in DB
3. Test importing into DB.
4. Test error logging to DB.
*/

function sqlLoggingFunction(msg, retval){
    try{
        if(msg > ''){
            console.log(msg)
            console.log(retval)
            /*if(!retval)retval = 1
            if(sql){
                sql.close();
            }
            var dbConfig = Object.assign(JSON.parse(fs.readFileSync('config.json')), dbConfig)
            dbConfig = dbConfig.db
            return sql.connect(dbConfig) 
            .then((data) =>{
                var jsdate = new Date();
                var sqlInsertStatement = 'INSERT INTO your_log_table (date, message, retval)'
                + ' VALUES(@parm1, @parm2, @parm3)' 
                var request = new sql.Request()
                request.input('parm1',sql.DateTime, jsdate)
                request.input('parm2',sql.NVarChar(100), msg)
                request.input('parm3',sql.Int, retval)
                return request.query(sqlInsertStatement)   
            })
            .then((data) =>{
                //sql.close(); //not sure if necessary but can try this way
                return resolve(data)
            })*/
        }
    }
    catch(err){ //log errors here
        if(debug==1)console.log(err)
    }
}

function defineFTPConfigInfo(configFileName){ //PARSES CONFIG FILE TO GET FTP INFO.
    var promise = new Promise((resolve, reject) => {
        try{
            ftpConfig = Object.assign(JSON.parse(fs.readFileSync(configFileName)), ftpConfig)
            resolve(ftpConfig.ftp)
        }
        catch(err){ //log errors here
            if(debug==1)console.log(err)
            return sqlLoggingFunction('Error From NodeBot: ' + err,-1)
        }
    })
    return promise;
}

function accessAndPullFromFTPServerWithCreds(ftpConfig){ //RETURNS FILES IN THE FTP SERVER THAT MATCH THE BEGINNING OF FILE IN CONFIG FILE
    var promise = new Promise((resolve, reject) => {
        var dirPath = path.resolve(ftpConfig.fileDirectoryPath); // path to your directory goes here
        var fileList;
        if(debug == 1)console.log(dirPath)
        try{
            return fs.readdir(dirPath, function(err, files){
                fileList = files.filter(function(e){
                    return path.extname(e).toLowerCase() === ftpConfig.fileType //Looks to see if file is XML type and returns that file if it is. Can build off of csv OR json in future.
                });
                ftpConfig.fileList = fileList
                resolve(ftpConfig);
                });
        }
        catch(err){ //log errors here
            if(debug==1)console.log(err)
            return sqlLoggingFunction('Error From NodeBot: ' + err,-1)
        }
        
    })
    return promise;
}

function returnJSONObjectProperly(jsonObject){
    var promise = new Promise((resolve, reject) => {
        var newArray = [{}]
        try{
            //return console.log(jsonObject.data)
            if(jsonObject){

                for(var i = 0; i < jsonObject.data.length; i++){
                    for  ( key  in jsonObject.data[i] ){
                        jsonObject.data[i][key] = jsonObject.data[i][key]._text
                    }
                }
                return resolve(jsonObject)
            }
        }
        catch(err){ //log errors here
            if(debug==1)console.log(err)
            return sqlLoggingFunction('Error From NodeBot: ' + err,-1)
        }
    })
    return promise
}

function readFileAndParseInfoIntoJSON(fileDirPath, fileName){ //READS FILE > BRINGS IN XML > PARSES XML TO JSON > MAPS TO NEW JSON OBJECT
    var jsonObjectToReturn = {}
    var promise = new Promise((resolve, reject) => {
        try{
            var readFromPath = fileDirPath + fileName //file path PLUS file name
            var xml = fs.readFileSync(readFromPath) 
            var jsonParsedFromXML = xmlParser.xml2json(xml, {compact: true, spaces: 4});
            var newJson = JSON.parse(jsonParsedFromXML)
            var data = newJson.app

            /* Our own mapping for json object returned from XML */
            jsonObjectToReturn.data = data.data.customer
            jsonObjectToReturn.appName = data._attributes.name
            jsonObjectToReturn.apiKey = data.apikey._attributes.key
            jsonObjectToReturn.method = data.batchimport._attributes.method
            jsonObjectToReturn.entity = data.batchimport._attributes.entity
            jsonObjectToReturn.fileName = fileName
            returnJSONObjectProperly(jsonObjectToReturn)
            .then((jsonObjectProper)=>{
                return resolve(jsonObjectProper)
            })
        }
        catch(err){ //log errors here
            if(debug==1)console.log(err)
            return sqlLoggingFunction('Error From NodeBot: ' + err,-1)
        }
    })
    return promise;
}

function insertJSONDataIntoSQL(jsonObject){ //INSERTD INTO DB
    console.log(jsonObject)
    var jsonArray = jsonObject.data
    //console.log(jsonArray)
    //INSERT json data into sql using mssql
    var promise = new Promise((resolve, reject) => {
        try{
            var dbConfig = Object.assign(JSON.parse(fs.readFileSync('config.json')), dbConfig)
            dbConfig = dbConfig.db
            return resolve(1) //resolving retval from DB

            //Use dbConfig to exec statement to import stuffs!
            //RETURN results 0=nothing happened,1=works, -1=failed
            /* if(sql){
                sql.close();
            }
            return sql.connect(dbConfig) 
            .then((data) =>{
                var sqlExecStatement = 'EXEC spImportIntoCustomer @json = ' + jsonArray + ', @method = @parm1, @entity = @parm2' 
                var request = new sql.Request()
                request.input('parm1',sql.NVarChar(100), jsonObject.data.method)
                request.input('parm2',sql.NVarChar(100), jsonObject.data.entity)
                return request.query(sqlExecStatement)   
            })
            .then((data) =>{
                //sql.close(); //not sure if necessary but can try this way
                return resolve(data)
            })
            */  
        }
        catch(err){ //log errors here
            if(debug==1)console.log(err)
            return sqlLoggingFunction('Error From NodeBot: ' + err,-1)
        }      
    })
    return promise
}

function mainBotFunction(){ //MAIN FUNCTION THAT PULLS OTHER FUNCTIONS TOGETHER
    return defineFTPConfigInfo(configFileName)
    .then((ftpConfig)=>{
        return accessAndPullFromFTPServerWithCreds(ftpConfig)
    })
    .then((newFTPConfitWithFiles)=>{
        //ToDO: LOOP THRU files and import data from here before we conintue in loop
        var errorMessage = ''
        var importCount = 0
        function recursiveLoopThruFilesToImportXMLFiles(fileArray, i, fileDirPath){ //recursive loop to import every file
            if(fileArray[i]){
                readFileAndParseInfoIntoJSON(fileDirPath, fileArray[i]) //reads and parses xml file to json
                .then((jsonObject)=>{
                    return insertJSONDataIntoSQL(jsonObject) //inserts into SQL DB from JSON object
                })
                .then((returnedSqlData)=>{ //deal with return from DB
                    if(returnedSqlData == 1){ //imported successfully
                        importCount = importCount + 1
                        if(debug == 1)console.log('Import worked for file count: ' + importCount)
                    }else if(returnedSqlData==-1){ //handle sql errors if necessary
                        sqlLoggingFunction('Error From NodeBot: Something went wrong with sql import', -1)
                    }else{
                        //nothing happened
                    }
                    return recursiveLoopThruFilesToImportXMLFiles(fileArray, i + 1) //begins next recursive call
                })
                .catch((err)=>{ //log errors here
                    if(debug==1)console.log(err)
                    return sqlLoggingFunction('Error From NodeBot: ' + err, -1)
                })
            }
            else{ //donw with recursive looping
                if(debug==1)console.log('done with looping!')
                return sqlLoggingFunction('finished importing: ' + importCount + ' file.', 1)
            }
        }
        return recursiveLoopThruFilesToImportXMLFiles(newFTPConfitWithFiles.fileList,0, newFTPConfitWithFiles.fileDirectoryPath)
    })
}



function runJobOnInterval(runInterval){ //FUNCTION THAT USES INTERVALS TO RUN BOT
    let newDate = new Date();
    return mainBotFunction()
    .then(()=>{
        //allow more  functions/thens to be run
            let currDate = new Date();
            let waitTime = (currDate - newDate) / 1000
            if(waitTime >= runInterval){
                return runJobOnInterval(runInterval)
            }
            else{
                return setTimeout(runJobOnInterval, Math.max(runInterval - waitTime, 0), runInterval );
            }
    })
    .catch((err)=>{
        //log errors here
        if(debug == 1)console.log(err)
        return sqlLoggingFunction('Error From NodeBot: ' + err, -1)
    })
    
}


return runJobOnInterval(60000) //RUNS BOT

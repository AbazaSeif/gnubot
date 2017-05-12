/*
# GNUBot for GNUSocial/postActiv

## How to Install:
1. ```npm install``` to get depends
2. put rive files in ```brain``` folder
3. Then run the bot: ```node index.js &``` (It will create a log file for you to see the output!)
4. Profit?

## Current features:
- rivescript
- Auto random posting every x milliseconds (You choose between which numbers. rand_post1 MUST be lower than rand_post2!!)
- Auto respond to users (this works off rivescript, so most everything supported by rivescript works here.)
- Now includes insperational quotes from forismatic.com
## Requires:
- GNUSocial or postActiv Account
- The instance this is connecting to NEEDS qvitter as that is the api this bot uses!

*/
//Configuration

var username = "gsmbot";
var password = "password";
var host = "instance_url.com"; //No http or https is needed here as we force https connection, if your instance, or the instance this is going to be connecting to does not support SSL on default port 443, please contact the admin to have them enable it!
var handle = "@gsmbot";
var master = "https://instance_url.com/your_username";
var check = 60000; //check for stuff every 60 seconds
var rand_post1 = 1800000;//30 minutes //Initial Random poster... (will post randomly between this and rand_post2)
var rand_post2 = 7200000;//2 hours
//Do not edit past this point
//Bot time!
var sessionId = null;
var querystring = require('querystring');
var https = require('https');
var htmlspecialchars = require('htmlspecialchars');
var RiveScript = require("rivescript");
var bot = new RiveScript();
var last_response = "";
log("Initializing the bot now....");
bot.loadDirectory("brain", loading_done, loading_error);
//Check credentials!
var auth = 'Basic ' + new Buffer(username+":"+password).toString('base64');


/*
function for the bot.. Includes ALL THE THINGS
*/
function loading_done (batch_num) {
    log("Batch #" + batch_num + " has finished loading!");
    // Now the replies must be sorted! 
    bot.sortReplies();
	log("Checking credentials now...");
	login();
}
function loading_error (error) {
    log("Error when loading files: " + error);
}
function login() {
	fs = require('fs');
  performRequest('/api/qvitter/hello.json', 'POST', {
    
  }, function(data) {
    log(data);
	if(data == "\"hello\""){
		log("Logged in!");
		keepAlive();
		post_random();
	} else {
		log("Could not login! Please check your credentials!");
		process.exit(1);
	}
  });
}
function update(string, id = null){
	data1 = {};
	if(id === null){
		data1 = {status:string};
	} else {
		data1 = {status:string,in_reply_to_status_id:id};
	}
	performRequest('/api/statuses/update.json', 'POST', data1, function(data) {
		log(data);
	});
}
function post_random(){
	how = Math.floor(Math.random() * rand_post2) + rand_post1;
	textArray = [
    	'What\'s up?',
    	'Hi!',
    	'Tell me a joke!',
    	'gnurandompostplease',
    	'getJSONapiQuote'
	];
	randomNumber = Math.floor(Math.random()*textArray.length);
	if(textArray[randomNumber] == 'getJSONapiQuote'){
		apiText = "";
		//http://api.forismatic.com/api/1.0/?method=getQuote&key=457653&format=json&lang=en
		performApiQuoteRequest('/api/1.0/', 'POST', {method:'getQuote',key:'457653',format:'json',lang:'en'}, function(data) {
			log(data);
			quote = "";
			try{
				quote = JSON.parse(data);
				update(quote.quoteText);
			}catch(e){
				log("ERROR: " + e);
			}
		});
		
	}else {
		bret = bot.reply("self_bot_reply_vroom_1_no_modify", textArray[randomNumber]);
		update(bret);
	}
	log("Next random post in " + how + " milliseconds...");	
	setTimeout(post_random, how);
}
function check_mentions(){
	performRequest('/api/statuses/mentions.json', 'POST', {
    
  }, function(data) {
	//parse here
	try{
		var mentions = JSON.parse(data);
		if(fs.existsSync("latest")){
			var latest = fs.readFileSync("latest");
		} else {
			var latest = "0";
		}
		
		//Let's begin doing some stuff with the statuses....
		for(var i = 0; i < mentions.length; i++) {
			id = mentions[i].id;
			text = mentions[i].text;
			reply1 = mentions[i].user.screen_name;
			botuser1 = mentions[i].user.statusnet_profile_url;
			botuser1 = botuser1.replace("https://","");
			botuser1 = botuser1.replace("http://","");
			botuser1 = botuser1.replace("/",".");
			reply = botuser1;
			if(latest >= id){
				//When we reach the before tweet, break so we do not process more tweets...
				log("No more statuses to read...");
				break;
			}
			//do stuff with the new tweet...
			log("REPLY TO: @" + reply + ": " + id);
			//Process here...
			textr = text.replace(handle, "");
			getUserData(botuser1,reply);
			botre = bot.reply(reply, textr);
			poc = 10;
			//We want to keep proccessing output until we get something different. But we will limit it to 10 times to check then attempt to post if nothing.
			while(botre == last_response){
				botre = bot.reply(reply, textr);
				poc = poc - 1;
				if(poc === 0){
					//Break if we processed 10 times. Don't want to get stuck in an infinate while loop.
					break;
				}
			}
			if(textr.indexOf("bye") > -1){
				//We forget all user variables for now, but first save to disk. More Disk I/O but saves on RAM later.
				writeUserData(botuser1, reply);
				bot.clearUservars(reply);
				
			}
			last_response = botre;
			if(textr.indexOf("forget me please") > -1){
				//Maybe do final cleans, etc. since the reply was sent, maybe clean some shit.
				bot.clearUservars(reply);
				deleteUserData(botuser1);
				update("@" + reply1 + ": All data that pertains to you has been removed from the server. Thank you for chatting!", id);
			} else {
				update("@" + reply1 + ": " + botre, id);
				writeUserData(botuser1, reply);
				bot.clearUservars(reply);
			}
			
		}
		log("Finished batch!");
		//Write the latest tweet id to file when done looping...
		fs.writeFileSync("latest",mentions[0].id,{"flag":"w"});
	}catch(e){
		log("ERROR: " + e);
	}
  });
}
function getUserData(botuser, reply) {
    filename = "./users/" + botuser + ".json";

    // See if the bot knows this user yet (in its current memory).
    var userData = bot.getUservars(reply);
    if (!userData) {
        try {
            var stats = fs.statSync(filename);
            if (stats) {
                var jsonText = fs.readFileSync(filename);
                userData = JSON.parse(jsonText);
                bot.setUservars(reply, userData);
            }
        } catch(e) {
        	
        }
    }
}
function deleteUserData(botuser) {
    filename = "./users/" + botuser + ".json";
    try {
        var stats = fs.statSync(filename);
        if (stats) {
            fs.unlinkSync(filename);
            log("DELETEED USER DATA: " + botuser);
            return true;
        }
        return true;
    } catch(e) {
    	return false;
    }
}
function writeUserData(botuser, reply){
	filename = "./users/" + botuser + ".json";
	userData = bot.getUservars(reply);
    fs.writeFile(filename, JSON.stringify(userData, null, 2), function(err) {
        if (err) {
            log("Failed to write file: " + filename + err);
        }
	});
}
function keepAlive(){
	check_mentions();
	setTimeout(keepAlive, check);
}
function log(s1){
	fs = require('fs');
	date = getDate();
	time = getDateTime();
	data = "["+time+"]: " + s1 + "\n";
	if(!fs.existsSync("./logs")){
		fs.mkdirSync("./logs");
	}
	console.log(data);
	fs.writeFileSync("./logs/"+date+".log",data,{"flag":"a"});
}
function getDateTime() {
    var date = new Date();
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    return year + "/" + month + "/" + day + "-" + hour + ":" + min + ":" + sec;
}
function getDate() {
    var date = new Date();
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    return year + "-" + month + "-" + day;
}
function performRequest(endpoint, method, data, success, isJSON = true) {
  log("SENDING DATA: '" + JSON.stringify(data) + "' TO '" + endpoint + "'!");
  var dataString = JSON.stringify(data);
  var headers = {};
  endpoint += '?' + querystring.stringify(data);
  if (method == 'GET') {
    endpoint += '?' + querystring.stringify(data);
  }
  else {
	  type = "text/plain";
	  if(isJSON){
		  type = "application/json";
	  }
    headers = {
      'Content-Type': type,
	  'Authorization':auth
    };
  }
  var options = {
    host: host,
    path: endpoint,
    method: method,
    headers: headers,
	auth: username + ':' + password
  };

  var req = https.request(options, function(res) {
    res.setEncoding('utf-8');

    var responseString = '';

    res.on('data', function(data) {
      responseString += data;
    });
	res.on('error', function(err) {
		log("ERROR:" + err);
	});
    res.on('end', function() {
		success(responseString);
    });
  });

  req.write(dataString);
  req.end();
}
function performApiQuoteRequest(endpoint, method, data, success, isJSON = true) {
  log("SENDING DATA: '" + JSON.stringify(data) + "' TO '" + endpoint + "'!");
  var dataString = JSON.stringify(data);
  var headers = {};
  endpoint += '?' + querystring.stringify(data);
  if (method == 'GET') {
    endpoint += '?' + querystring.stringify(data);
  }
  else {
	  type = "text/plain";
	  if(isJSON){
		  type = "application/json";
	  }
    headers = {
      'Content-Type': type
    };
  }
  var options = {
    host: 'api.forismatic.com',
    path: endpoint,
    method: method,
    headers: headers,
  };

  var req = https.request(options, function(res) {
    res.setEncoding('utf-8');

    var responseString = '';

    res.on('data', function(data) {
      responseString += data;
    });
	res.on('error', function(err) {
		log("ERROR:" + err);
	});
    res.on('end', function() {
		success(responseString);
    });
  });

  req.write(dataString);
  req.end();
}
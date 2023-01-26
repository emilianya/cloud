var express  = require('express')
  , session  = require('express-session')
  , passport = require('passport')
  , multer = require("multer")
  , cors = require("cors")
  , LocalStrategy = require('passport-local').Strategy
  , app      = express();
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
	  cb(null, '/share/wcloud')
	},
	filename: function (req, file, cb) {
		db.createFile(req.user._id ? req.user : req.user[0], req.headers["w-private"] ? true : req.body["w-private"] ? true : false, file.originalname, file.mimetype, file.size, res => {
			if (res.error) return cb(res.error)
			let desiredName = res.name
			cb(null, desiredName)
		}) // this creates an entry in the database for the file to store the uploader, size, if file is private, date and name, and supplies multer with the filename consisting of _id.extension
	}
})
const upload = multer({ storage: storage })
const crypto = require("crypto");
require("dotenv").config();
var cookieParser = require('cookie-parser')
var flash = require('express-flash')
const csrf = require("csurf")
var fs = require("fs")
const MongoDBStore = require("connect-mongodb-session")(session);
var store = new MongoDBStore({
	uri: process.env.MONGODB_HOST,
	collection: 'sessions',
	clear_interval: 3600
});
var db = require('./db')
passport.serializeUser(function(user, done) {
  done(null, user);
});
passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

app.set("view egine", "ejs")

passport.use(new LocalStrategy(function verify(username, password, cb) {
	db.login(username, function(err, data) {
	  if (err) { return cb(err); }
	  if (!data) { return cb(null, false, { message: 'Incorrect email address.' }); }
	  crypto.pbkdf2(password, data.salt, 310000, 32, 'sha256', function(err, hashedInput) {
		if (err) { return cb(err); }
		if (!crypto.timingSafeEqual(data.passwordHash, hashedInput)) {
		  return cb(null, false, { message: 'Incorrect password.' });
		}
		return cb(null, data);
	  });
	});
  }));

app.use(session({
	secret: process.env.SESSION_SECRET,
	resave: true,
	saveUninitialized: true,
	store: store,
	expires: Date(Date.now() + (365 * 86400 * 1000))
}));

app.use(cors())
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use("/resources", express.static('public/resources'))
app.use(express.urlencoded({extended:true}));
app.use(express.json())
app.use(cookieParser())
app.use(csrf({cookie: true, sessionKey: process.env.SESSION_SECRET}))
app.use(function (err, req, res, next) {
	if (err.code !== 'EBADCSRFTOKEN') return next(err)
	let csrfWhitelist = ["/upload", "/api/files", "/shortener"]
	if (req.url.startsWith("/file")) return next();
	if(!csrfWhitelist.includes(req.url)) return res.send("Couldn't verify Cross Site Request Forgery prevention")
	if(csrfWhitelist.includes(req.url)) return next()
})
app.set('trust proxy', 1);
function popupMid(req, res, next) {
	next()
}

app.get('/', (req, res) => {
	res.render(`${__dirname}/public/index.ejs`, {csrfToken: req.csrfToken(), user: req.isAuthenticated() ? req.user : null})
});

app.get('/login', (req, res) => {
	res.render(`${__dirname}/public/login.ejs`, {csrfToken: req.csrfToken(), user: req.isAuthenticated() ? req.user : null})
});

app.get('/register', (req, res) => {
	res.render(`${__dirname}/public/register.ejs`, {csrfToken: req.csrfToken(), user: req.isAuthenticated() ? req.user : null})
});

app.get("/sharex.sxcu", checkAuth, (req, res) => {
	let private = req.query?.private;
	if (!private) private = false;
	let content = `{
	"Version": "13.7.0",
	"Name": "Wanderer's Cloud",
	"DestinationType": "ImageUploader, TextUploader, FileUploader",
	"RequestMethod": "POST",
	"RequestURL": "https://wanderers.cloud/upload",
	"Headers": {
	"authentication": "${req.user.uploadKey}"${private ? `",\nw-private": "true"` : ""}
	},
	"Body": "MultipartFormData",
	"FileFormName": "upload",
	"URL": "$response$?preview=true"
}`		
	res.contentType("application/octet-stream")
	res.send(content)
})

app.post("/create_account", (req, res) => {
	if(!req.body.email.includes("@") || !req.body.email.includes(".")) return res.status(400).send("Invalid email address");
	if(req.body.username.trim().length < 3) return res.status(400).send("Username must be at least 3 characters long");
	if(req.body.password.trim().length < 8) return res.status(400).send("Password must be at least 8 characters long");
	if(req.body.password !== req.body.password2) return res.status(400).send("Passwords do not match");
	db.checkEmail(req.body.email, resp => {
		if (resp) {
			if (resp == "used") return res.status(400).send("An account is already registered to this email address");
			return res.status(500).send("Internal server error, please try again later");
		}
		db.checkInvite(req.body.invite, resp => {
			if(resp.error) {
				if(resp.error == "used") return res.status(400).send("Invite code has already been used");
				if(resp.error == "invalid") return res.status(400).send("Invite code is not valid");
				return res.status(500).send("Internal server error, please try again later");
			}
			let salt = crypto.randomBytes(16);
			crypto.pbkdf2(req.body.password, salt, 310000, 32, 'sha256', (err, pwd) => {
				db.createAccount(req.body.email, req.body.username, pwd, salt, req.body.invite, data => {
					//data tells us if it errored or worked
					if(data.error) return res.status(500).send(data.error);
					if(data.success) return res.sendStatus(200)
				});
			});
		})
	})
})

app.post('/login/password', passport.authenticate('local', {
	successReturnToOrRedirect: '/my',
	failureRedirect: '/login',
	failureFlash: true
}));

app.get('/admin', checkAuth, (req, res) => { 
	let user = req.user._id ? req.user : req.user[0]
	db.getUser(user._id, user => {
		if(!user.admin) return res.status(403).send("You do not have permission to access this page.")
		res.render(__dirname + '/public/admin.ejs', {user: user, csrfToken: req.csrfToken()});
	})
})

app.get('/test', checkAuth, (req, res) => { 
	let user = req.user._id ? req.user : req.user[0]
	db.getUser(user._id, user => {
		if(!user.admin) return res.status(403).send("You do not have permission to access this page.")
		res.render(__dirname + '/public/test.ejs', {user: user, csrfToken: req.csrfToken()});
	})
})

app.post('/admin', checkAuth, (req, res) => {
	let user = req.user._id ? req.user : req.user[0]
	db.getUser(user._id, user => {
		if(!user.admin) return res.status(403).send({error: "You do not have permission to do this.", success: null})
		switch (req.body.action) {
			case "createInvite":
				db.createInvite(user, invite => {
					res.send(invite)
				})
				break;
		}
	})
})

app.get("/profile", checkAuth, popupMid, function (req, res) {
	let user = req.isAuthenticated() ? req.user._id ? req.user : req.user[0] : null
	res.render(__dirname + '/public/profile.ejs', {user: user});
});

app.get("/editProfile", checkAuth, popupMid, function (req, res) { 
	let user = req.isAuthenticated() ? req.user._id ? req.user : req.user[0] : null
	res.render(__dirname + '/public/editProfile.ejs', {user: user, csrfToken: req.csrfToken()});
})

app.post("/editProfile", checkAuth, function(req, res) {
	if(req.body.username != "") {
	  db.changeUsername(req.user, req.body.username)
	  req.session.passport.user.username = req.body.username
	}
	res.redirect("/profile")
})

app.get('/privacy', function(req, res){
	res.redirect('/resources/privacy.html');
});

app.get('/terms', function(req, res){
	res.redirect('/resources/terms.html');
});

app.get('/delete', checkAuth, function(req,res) {
	user = req.user._id ? req.user : req.user[0]
	res.render(__dirname + "/public/deleteConfirm.ejs", {csrfToken: req.csrfToken()})
})

app.post('/upload', checkUploadAuth, upload.any(), async (req, res) => {
	let many = false
	let manyArray = []
	let domain = req.headers["w-domain"] || "wanderers.cloud";
	if (req.headers["w-domains"]) {
		domain = req.headers["w-domains"].split(";")
		domain = domain[Math.floor(Math.random()*domain.length)];
	}
	if(req.files.length > 1) many = true
	if(req.files.length < 1) return res.sendStatus(204)
	req.files.forEach(file => {
		let fileId = file.filename
		let hideUrl = !req.headers["w-show"]
		if (!many) res.send(`${hideUrl ? "" : "﻿‌‌‌​​‌‌⁠‌‌​​‌​‌⁠‌‌​​​‌‌⁠‌‌‌​​‌​⁠‌‌​​‌​‌⁠‌‌‌​‌​​⁠‌‌‌​​‌‌⁠‌​​​​​⁠‌‌‌​‌‌⁠‌​​‌‌‌‌﻿ "}https://${domain}/file/${fileId}`);
		if (many) manyArray.push(`${hideUrl ? "" : "﻿‌‌‌​​‌‌⁠‌‌​​‌​‌⁠‌‌​​​‌‌⁠‌‌‌​​‌​⁠‌‌​​‌​‌⁠‌‌‌​‌​​⁠‌‌‌​​‌‌⁠‌​​​​​⁠‌‌‌​‌‌⁠‌​​‌‌‌‌﻿ "}https://${domain}/file/${fileId}`);
	})
	if (many) res.send(manyArray);
})

app.post("/delete", checkAuth, function(req, res) {
	user = req.user._id ? req.user : req.user[0]
	db.deleteUser(user, function(result) {
		if(result == 500) {
			res.redirect('/resources/500.html');
		} else {
			req.logout(err => {
				res.redirect('/resources/deleted.html');
			});
		}
	});
})

	/*if(req.session.redirectTo) {
		let dest = req.session.redirectTo;
		req.session.redirectTo = "/"
		res.redirect(dest) 
	} else {
		res.redirect('/')
	}*/

app.get('/logout', function(req, res) {
	req.logout(err => {
		req.session.destroy(e => {
			if (e) console.log(e)
			if (err) console.log(err)
			res.redirect('/');
		})
	});
});

function checkAuth(req, res, next) {
	let user = req.isAuthenticated() ? req.user._id ? req.user : req.user[0] : null
	if(user) return next();
	req.session.redirectTo = req.path;
	res.redirect(`/login`)
}

function checkUploadAuth(req, res, next) {
	let user = req.isAuthenticated() ? req.user._id ? req.user : req.user[0] : null
	if(user) return next();
	if(!req.headers["authentication"]) return res.sendStatus(403);
	db.checkUploadKey(req.headers["authentication"], user => {
		if(!user) return res.sendStatus(403);
		req.user = user;
		return next();
	});
}

function checkUploadKey(req, cb) {
	let user = req.isAuthenticated() ? req.user._id ? req.user : req.user[0] : null
	if(user) return cb(user);
	if(!req.headers["authentication"]) return cb(null);
	db.checkUploadKey(req.headers["authentication"], user => {
		if(!user) return cb(null);
		return cb(user);
	});
}

app.use(function (err, req, res, next) {
	console.error(err.stack);
	if(err.message == 'Invalid "code" in request.') {
		return res.status(500).render(`${__dirname}/public/error.ejs`, { stacktrace: null, friendlyError: "It looks like we couldn't log you in. Would you mind <a href='/login'>trying that again</a>?", user: req.isAuthenticated() ? req.user : null});
	}
	res.status(500).render(`${__dirname}/public/error.ejs`, { stacktrace: err.stack, friendlyError: null, user: req.isAuthenticated() ? req.user : null});
});

app.get('/.well-known/security.txt', function (req, res) {
    res.type('text/plain');
    res.send("Contact: mailto:contact@wanderers.cloud");
});

app.get("/my", checkAuth, (req, res) => {
	let user = req.user._id ? req.user : req.user[0]
	db.getUserFiles(req.user._id, (req.query.page || 0) * 21, (files, count) => {
		if (!files || !count) return res.sendStatus(500);
		res.render(`${__dirname}/public/my.ejs`, {files, count, csrfToken: req.csrfToken(), user: user, ww: req.headers["x-requested-with"] == "cloud.wanderers.wc"})
	})
})

app.get("/file/:id", (req, res) => {
	let download = false
	if(req.query?.download) download = true;
	let id = req.params.id
	if (id.includes(".")) id = id.split(".")[0]
	db.getFile(id, file => {
		if(!file) return res.status(404).send("File not found or error occurred")
		let filename = file.fileName;
		const sendRes = () => {
			if (file.mime.includes("html")) download = true;
			if (!download) {
				res.contentType(file.mime);
				res.append("Content-Disposition", `filename="${file.originalName}"`)
				res.sendFile(`/share/wcloud/${filename}`)
			} else {
				res.download(`/share/wcloud/${filename}`, file.originalName)
			}
		}
		if(file.private) {
			checkUploadKey(req, user => {
				if(!user) return res.status(403).send("You do not have permission to access this file.")
				if(file.uploadedBy.toString() != user._id.toString()) return res.status(403).send("You do not have permission to access this file.")	
				sendRes();
			})
		} else {
			sendRes();
		}
	})
})

app.get("/api/files", checkUploadAuth, (req, res) => {
	db.getUserFiles(req.user._id, files => {
		if(!files) return res.status(500).send("Error occurred")
		res.contentType("application/json");
		res.send(files)
	})
})

app.post("/api/deletefile", checkUploadAuth, (req, res) => {
	let id = req.body.id
	if(!id) return res.status(400).send({error: "No file id provided"})
	db.deleteFile(id, req.user, result => {
		if(result.code == 500) return res.status(500).send({error: "Internal server error"})
		if(result.code == 404) return res.status(404).send({error: "No such file exists"})
		if(result.code == 403) return res.status(403).send({error: "That file is not yours"})
		fs.unlinkSync(`/share/wcloud/${result.file.fileName}`)
		res.status(200).send({error: null})
	})
})

const URL = require("url").URL;
const stringIsAValidUrl = (s) => {
	try {
		new URL(s);
		return true;
	} catch (err) {
		return false;
	}
};

app.get("/s", (req, res) => {
	res.render(`${__dirname}/public/shortener.ejs`);
})

app.get("/s/:id", (req, res) => {
	let Url = db.getUrl()
	Url.findOne({shortId: req.params.id}, (err, url) => {
		if (err) return res.status(500).send("Internal server error")
		if (!url) return res.status(404).send("No such short url exists")
		res.redirect(url.originalUrl);
	})
})

app.post("/shortener", (req, res) => {
	let url = req.body.url
	if (!url) return res.status(400).send({error: "No url provided"})
	if (!stringIsAValidUrl(url)) return res.status(400).send({error: "Invalid URL"})
	let Url = db.getUrl();
	let newUrl = new Url({
		originalUrl: url,
		shortId: crypto.randomBytes(4).toString("base64url"),
		createdAt: new Date()
	})
	newUrl.save((err, url) => {
		if (err) {
			console.error(err)
			return res.status(500).send({error: "Internal server error"})
		}
		let urls = [
			`https://wanderers.cloud/s/${url.shortId}`,
			`https://toilet.blob.gay/s/${url.shortId}`,
			`https://trash.vukky.net/s/${url.shortId}`,
			`https://toilet.vukky.net/s/${url.shortId}`,
			`https://toilet.brisance.me/s/${url.shortId}`,
			`https://files.brisance.me/s/${url.shortId}`,
			`https://my.lettuce.systems/s/${url.shortId}`
		]
		res.status(200).send({error: null, urls})
	})
})

app.delete("/file/:id", checkUploadAuth, (req, res ) => {
	if (!req.params.id) return res.status(400).json({error: "no file id provided"});
	db.deleteFileShort(req.params.id, req.user, result => {
		if(result.code == 500) return res.status(500).send({error: "Internal server error"})
		if(result.code == 404) return res.status(404).send({error: "No such file exists"})
		if(result.code == 403) return res.status(403).send({error: "That file is not yours"})
		fs.unlinkSync(`/share/wcloud/${result.file.fileName}`)
		res.status(200).send({error: null})
	})
})

app.get('/favicon.ico', (req, res) => {
	res.sendFile(`${__dirname}/public/favicon.ico`);
})

app.get('*', function(req, res){
	res.status(404).render(`${__dirname}/public/404.ejs`, {csrfToken: req.csrfToken(), user: req.isAuthenticated() ? req.user : null});
});

var http = require('http');
const {isValidObjectId} = require("mongoose");

const httpServer = http.createServer(app);

httpServer.listen(8888, () => {
	console.log('HTTP Server running on port 8888');
});

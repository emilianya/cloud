var express  = require('express')
  , session  = require('express-session')
  , passport = require('passport')
  , fileUpload = require("express-fileupload")
  , LocalStrategy = require('passport-local').Strategy
  , app      = express();
const crypto = require("crypto");
require("dotenv").config();
var cookieParser = require('cookie-parser')
var flash = require('express-flash')
const csrf = require("csurf")
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
	store: store
}));

app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use("/resources", express.static('public/resources'))
app.use(express.urlencoded({extended:true}));
app.use(express.json())
app.use(cookieParser())
app.use(csrf({cookie: true, sessionKey: process.env.SESSION_SECRET}))
app.use(fileUpload({fileSize: 10 * 1024 * 1024 * 1024, useTempFiles: true, tempFileDir: '/share/temp'}))
app.use(function (err, req, res, next) {
	if (err.code !== 'EBADCSRFTOKEN') return next(err)
	let csrfWhitelist = ["/upload"]
	if(!csrfWhitelist.includes(req.url)) return res.send("Couldn't verify Cross Site Request Forgery prevention")
	if(csrfWhitelist.includes(req.url)) return next()
})
app.set('trust proxy', 1);
function popupMid(req, res, next) {
	next()
}

app.get('/', (req, res) => {
	res.render(`${__dirname}/public/index.ejs`)
});

app.get('/login', (req, res) => {
	res.render(`${__dirname}/public/login.ejs`, {csrfToken: req.csrfToken()})
});

app.get('/register', (req, res) => {
	res.render(`${__dirname}/public/register.ejs`, {csrfToken: req.csrfToken()})
});

app.post("/create_account", (req, res) => {
	let user = req.user._id ? req.user : req.user[0]
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
	successReturnToOrRedirect: '/profile',
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
	res.render(__dirname + "/public/deleteConfirm.ejs", {csrfToken: req.csrfToken(), twoFactor: user.twoFactor})
})

app.get('/upload', (req, res) => {
	res.render(__dirname + "/public/upload.ejs")
})

app.post('/upload', (req, res) => {
	console.log(req.body)
	console.log(req.files)
	req.files.forEach(async file => {
		await file.mv(`/share/${file.name}`)
		res.sendStatus(200);
	})
})

app.post("/delete", checkAuth, function(req, res) {
	user = req.user._id ? req.user : req.user[0]
	db.deleteUser(user, function(result) {
		if(result == 500) {
			res.redirect('/resources/500.html');
		} else {
			req.logout();
			res.redirect('/resources/deleted.html');
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
	req.logout();
	res.redirect('/');
});

function checkAuth(req, res, next) {
	let user = req.isAuthenticated() ? req.user._id ? req.user : req.user[0] : null
	if(user) return next();
	req.session.redirectTo = req.path;
	res.redirect(`/login`)
}

app.use(function (err, req, res, next) {
	console.error(err.stack);
	if(err.message == 'Invalid "code" in request.') {
		return res.status(500).render(`${__dirname}/public/error.ejs`, { stacktrace: null, friendlyError: "It looks like we couldn't log you in. Would you mind <a href='/login'>trying that again</a>?" });
	}
	res.status(500).render(`${__dirname}/public/error.ejs`, { stacktrace: err.stack, friendlyError: null });
});

app.get('/.well-known/security.txt', function (req, res) {
    res.type('text/plain');
    res.send("Contact: mailto:contact@wanderers.cloud");
});

app.get('*', function(req, res){
	res.status(404).render(`${__dirname}/public/404.ejs`);
});

var http = require('http');

const httpServer = http.createServer(app);

httpServer.listen(8888, () => {
	console.log('HTTP Server running on port 8888');
});
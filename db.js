const mongoose = require('mongoose');
require("dotenv").config();
mongoose.connect(process.env.MONGODB_HOST);
const crypto = require("crypto");
const path = require("path");
//const nodemailer = require("nodemailer");
//deal with email later

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
var User
var File
var Invite
db.once('open', function() {
	const userSchema = new mongoose.Schema({
	  email: String,
	  username: String,
	  passwordHash: Buffer,
	  salt: Buffer,
	  admin: Boolean,
	  uploadKey: String
	});
	User = mongoose.model('User', userSchema);
	const fileSchema = new mongoose.Schema({
		originalName: String,
		fileName: String,
		size: Number,
		uploadedBy: String,
		uploadedAt: Date,
		mime: String,
		persistent: Boolean,
		private: Boolean
	  });
	File = mongoose.model('File', fileSchema);
	const inviteSchema = new mongoose.Schema({
	  createdBy: String,
	  usedBy: String,
	  code: String,
	  createdAt: Date,
	  usedAt: Date
	});
	Invite = mongoose.model('Invite', inviteSchema);
});


/*async function sendEmail(user, emailContent, emailSubject) {
	let parsedEmailContent = emailContent.replaceAll("$username", user.username)
	if(user.emailCode) parsedEmailContent = parsedEmailContent.replaceAll("$emailRecoveryCode", user.emailCode)
	let info = await transporter.sendMail({
		from: '"Vukkybox" <vukkybox@litdevs.org>',
		to: user.primaryEmail,
		subject: emailSubject,
		html: parsedEmailContent
	  });
}  repurpose this code from vukkybox later */

function login(email, callback) {
    User.findOne({email: email.toLowerCase()}, function (err, user) {
        if (err) return (callback(err, null));
        callback(null, user);
    });
}

function createAccount(email, username, password, salt, invite, cb) {
	let user = new User({
		email: email,
        username:username,
        passwordHash:password,
        salt:salt,
		uploadKey: crypto.randomBytes(16).toString("hex")
    })
    user.save(function (err, user) {
        if (err) {
			cb({error: err, success: null})
			return console.error(err);
		}
		useCode(invite, user, ccb => {
			// useCode was initially designed to be used differently, but i was really tired when i did that and it would realistically never be able to work like that
			if(ccb) {
				User.deleteOne({_id: user._id});
				return cb({error: ccb, success: null})
			}
			return cb({error: null, success: true})
		})
    });
}

function changeUsername(user, newUsername) {
	User.findById({_id: user._id}, function (err, doc) {
		if(err) throw err;
		doc.username = newUsername
		doc.save()
	})
}

function getUser(userId, callback) {
	User.findById({_id: userId}, function (err, doc) {
		if(err) {
			callback(null, err)
			console.log(err)
		};
		if(!doc.RVNid) doc.RVNid = doc._id.toString().substr(8); doc.save();
		callback(doc, null)
	})
}

function deleteUser(profile, callback) {
	User.deleteOne({_id:profile._id}, function(err, res) {
		if(err) {
			callback(500)
			return console.error(err);
		}
		callback("deleted")
	})
}

function createInvite(creator, cb) {
	/*
	  createdBy: String,
	  usedBy: String,
	  code: String,
	  createdAt: Date,
	  usedAt: Date
	*/
	let code = crypto.randomBytes(6).toString("hex");
	Invite.count({code: code}, (err, count) => {
		if (count > 0) {
			return createInvite(creator, cb)
		}
		let invite = new Invite({
			createdBy: creator._id,
			createdAt: new Date(),
			code: code
		})
		invite.save(function (err, invite) {
			if (err) {
				cb({error: err, success: null})
				return console.error(err);
			}
			cb({error: null, success: invite.code})
		})
	})
}

function checkInvite(code, cb) {
	Invite.findOne({code: code}, (err, res) => {
		if(!res) return cb({error: "invalid", success: null})
		if(err) {
			cb({error: err, success: null})
			return console.error(err);
		}
		if (res.usedAt || res.usedBy) return cb({error: "used", success: null})
		cb({error: null, success: true})
	})
}

function useCode(code, user, cb) {
	Invite.findOne({code: code}, (err, res) => {
		if(!res) return cb("invalid")
		if(err) {
			cb(err)
			return console.error(err);
		}
		if (res.usedAt || res.usedBy) return cb("used")
		res.usedBy = user._id
		res.usedAt = new Date()
		res.save(function (err, invite) {
			if (err) {
				cb(err)
				return console.error(err);
			}
			cb(null)
		});
	})
}

function checkEmail(email, cb) {
	User.findOne({email:email}, (err, res) => {
		if (err) {
			cb(true)
			return console.error(err);
		}
		if(res) return cb("used")
		cb(null)
	})
}

function createFile(user, private, originalFileName, mime, size, cb) {
	let parsedOriginalFileName = originalFileName
	if(originalFileName.length > 255) {
		if (originalFileName.split(".").length > 1) {
			let split = originalFileName.split(".")
			let extension = split[split.length - 1]
			split.pop()
			let name = split.join(".")
			parsedOriginalFileName = name.substr(0, 254 - extension.length - 1) + "." + extension
		}  else {//There is probably a better way to do this
			parsedOriginalFileName = originalFileName.substr(0, 254)
		}
	}
	let file = new File({
		originalName: parsedOriginalFileName,
		size: size,
		mime, mime,
		uploadedBy: user._id,
		uploadedAt: new Date(),
		private: private
	})
	file.save(function (err, doc) {
		if(err) {
			cb({error: err})
			return console.error(err);
		}
		doc.fileName = doc._id.toString() + path.extname(originalFileName)
		doc.save()
		cb({name: doc.fileName})
	})
}

function checkUploadKey(key, cb) {
	User.findOne({uploadKey: key}, (err, user) => {
		if (err) console.error(err);
		cb(user);
	})
}

function getFile(fileId, cb) {
	File.findOne({_id: fileId}, (err, doc) => {
		if(err) {
			cb(null)
			return console.error(err);
		}
		cb(doc)
	})
}

function getUserFiles(userId, cb) {
	File.find({uploadedBy: userId}, (err, docs) => {
		if(err) {
			cb(null)
			return console.error(err);
		}
		cb(docs)
	}) //blame copilot if this breaks
}

module.exports = {
	login,
	createInvite,
	createAccount,
	changeUsername,
	getUser,
	deleteUser,
	checkInvite,
	useCode,
	checkEmail,
	createFile,
	checkUploadKey,
	getFile,
	getUserFiles
}

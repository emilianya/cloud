const mongoose = require('mongoose');
require("dotenv").config();
mongoose.connect(process.env.MONGODB_HOST);
const crypto = require("crypto");
const path = require("path");
const {isValidObjectId} = require("mongoose");
//const nodemailer = require("nodemailer");
//deal with email later

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
var User
var File
var Invite
var Url
db.once('open', function() {
	const userSchema = new mongoose.Schema({
	  email: String,
	  username: String,
	  passwordHash: Buffer,
	  salt: Buffer,
	  admin: Boolean,
	  uploadKey: String,
	  persistAll: Boolean
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
		private: Boolean,
		shortId: String
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
	const urlSchema = new mongoose.Schema({
		originalUrl: String,
		shortId: String,
		createdAt: Date,
		createdBy: String
	})
	Url = mongoose.model('Url', urlSchema);
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
		}
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
			if (extension.length > 10) extension = "long" 
			split.pop()
			let name = split.join(".")
			parsedOriginalFileName = name.substr(0, 255 - extension.length - 1) + "." + extension
		}  else {//There is probably a better way to do this
			parsedOriginalFileName = originalFileName.substr(0, 255)
		}
	}
	if(originalFileName.length < 1) parsedOriginalFileName = "unknwon"
	let file = new File({
		originalName: parsedOriginalFileName,
		size: size,
		mime, mime,
		uploadedBy: user._id,
		uploadedAt: new Date(),
		private: private,
		shortId: crypto.randomBytes(4).toString("base64url")
	})
	if (user)
	file.save(function (err, doc) {
		if(err) {
			cb({error: err})
			return console.error(err);
		}
		doc.fileName = doc.shortId + path.extname(originalFileName)
		if(user?.persistAll) doc.persistent = true;
		doc.save()
		cb({name: doc.fileName, shortName: doc.shortId})
	})
}

function checkUploadKey(key, cb) {
	User.findOne({uploadKey: key}, (err, user) => {
		if (err) console.error(err);
		cb(user);
	})
}

function getFile(fileId, cb) {
	if (isValidObjectId(fileId)) {
		File.findOne({_id: fileId}, (err, doc) => {
			if(err) {
				cb(null)
				return console.error(err);
			}
			cb(doc)
		})
	} else {
		if (fileId.includes(".")) fileId = id.split(".")[0]
		File.findOne({shortId: fileId}, (err, doc) => {
			if(err) {
				cb(null)
				return console.error(err);
			}
			cb(doc)
		})
	}
}

async function getUserFiles(userId, pageLimit, cb) {
	try {
		let docs = await File.find({uploadedBy: userId}) //blame copilot if this breaks
			.sort({uploadedAt: -1})
			.limit(21)
			.skip(pageLimit)
		let docsCount = await File.countDocuments({uploadedBy: userId})
		cb(docs, docsCount)
	} catch (e) {
		cb(null, null)
		return console.error(e);
	}
}

function deleteFile(fileId, user, cb) {
	// cb: {code: 404 or 403 or 500 or null, file: file}
	File.findOne({_id: fileId}, (err, file) => {
		if (!file) return cb({code: 404, file: null})
		if (file.uploadedBy != user._id) return cb({code: 403, file: null})
		if (err) {
			console.error(err);
			return cb({code: 500, file: null})
		}
		File.deleteOne({_id: fileId}, (err, res) => {
			if (err) {
				console.error(err);
				return cb({code: 500, file: null})
			}
			cb({code: null, file: file})
		});
	})
}
function deleteFileShort(fileId, user, cb) {
	// cb: {code: 404 or 403 or 500 or null, file: file}
	File.findOne({shortId: fileId}, (err, file) => {
		if (!file) return cb({code: 404, file: null})
		if (file.uploadedBy != user._id) return cb({code: 403, file: null})
		if (err) {
			console.error(err);
			return cb({code: 500, file: null})
		}
		File.deleteOne({shortId: fileId}, (err, res) => {
			if (err) {
				console.error(err);
				return cb({code: 500, file: null})
			}
			cb({code: null, file: file})
		});
	})
}

function getUrl() {
	return Url;
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
	getUserFiles,
	deleteFile,
	deleteFileShort,
	getUrl
}

const mongoose = require('mongoose');
require("dotenv").config();
mongoose.connect(process.env.MONGODB_HOST);
//const nodemailer = require("nodemailer");
//deal with email later

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
var User
var Code
db.once('open', function() {
  const userSchema = new mongoose.Schema({
	primaryEmail: String,
	username: String,
    passwordHash: Buffer,
    salt: Buffer
  });
  User = mongoose.model('User', userSchema);
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

function login(username, callback) {
    User.findOne({username: username}, function (err, user) {
        if (err) return (callback(err, null));
        callback(null, user);
    });
}

function createAccount(username, password, salt) {
	let user = new User({
        username:username,
        passwordHash:password,
        salt:salt
    })
    user.save(function (err, user) {
        if (err) return console.error(err);
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

module.exports = {
	findOrCreate,
	changeUsername,
	getUser,
	deleteUser,
	listEmails,
	resetPopup,
	checkPopup,
	acceptPopup
}

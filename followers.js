var util = require('util'),
	EventEmitter = require('events').EventEmitter;

function Followers(credentials, twitchAPI, storage) {
	this.mostRecent = null;

	this.credentials = credentials;
	this.twitchAPI = twitchAPI;
	this.storage = storage;


	setInterval(this.checkFollowers.bind(this), (1000 * 10));
}
util.inherits(Followers, EventEmitter);


Followers.prototype.checkFollowers = function () {
	var bot = this;

	bot.twitchAPI.getFollowersOf(bot.credentials.channel, function (error, response) {
		if (response && response.follows) {
			if (bot.mostRecent === null) {
				bot.mostRecent = new Date(response.follows[0].created_at);
			}
			var newMostRecent = null;
			for (var i = 0; i < response.follows.length; i++) {
				var followedAt = new Date(response.follows[i].created_at);

				if (followedAt > bot.mostRecent) {
					bot.newFollower(response.follows[i].user);
					newMostRecent = (followedAt > newMostRecent ? followedAt : newMostRecent);
				}
			}
			bot.mostRecent = (newMostRecent ? newMostRecent : bot.mostRecent);
		}
	});
};


Followers.prototype.newFollower = function (user) {
	this.upsertUser(user.name, {'following': true});
	this.emit('follower', user);
	console.log('\nNEW FOLLOW: ' + user.display_name);
};


Followers.prototype.upsertUser = function (username, values) {
	var bot = this;

	bot.storage.findOne({'_id': username}, function (error, record) {
		// If the user has never visited before, add basic information to their record.
		if (!record || !record.firstVisit) {
			bot.storage.update({'_id': username}, {$set: {'firstVisit': new Date()}}, {upsert: true});
		}

		if (values.hasOwnProperty('following')) {
			bot.storage.update({'_id': username}, {
				$set: {
					following: values.following,
					followingChecked: new Date()
				}
			}, {upsert: true});
		}
	});
};

module.exports = Followers;
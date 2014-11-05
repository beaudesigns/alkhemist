var irc = require('irc'),
	util = require('util'),
	EventEmitter = require('events').EventEmitter;

function IrcBot(credentials, twitchAPI, storage) {
	this.credentials = credentials;
	this.twitchAPI = twitchAPI;
	this.storage = storage;

	var botConfig = {
		channels: ['#' + credentials.channel],
		server: 'irc.twitch.tv',
		userName: credentials.username,
		realName: credentials.username,
		password: credentials.password,
		port: 6667,
		secure: false,
		debug: false,
		showErrors: false,
		autoRejoin: true,
		autoConnect: true
	};

	this.client = new irc.Client(botConfig.server, botConfig.userName, botConfig);
	this.bindEvents();
	setInterval(this.everyMinute.bind(this), (1000 * 60));
}
util.inherits(IrcBot, EventEmitter);

IrcBot.prototype.everyMinute = function () {
	var bot = this;
	bot.twitchAPI.getStream(bot.credentials.channel, function (error, response) {
		if (response.stream) {
			bot.storage.update({watching: true}, {$inc: {minutesWatched: 1}}, {multi: true});
		}
	});
};

IrcBot.prototype.bindEvents = function () {
	var bot = this;
	bot.client
		.addListener('error', function (message) {
			console.log('error: ', message);
		})

		.addListener('join', function (channel, who) {
			if (who === bot.credentials.username.toLowerCase() || who === bot.credentials.channel.toLowerCase()) {
				return;
			}

			// Find the user.
			bot.storage.findOne({'_id': who}, function (error, record) {
				var notification = {
					username: who,
					joins: 0,
					minutesWatched: 0,
					following: false,
					checkFollowing: true
				};
				if (record && record.joins) {
					notification.joins = record.joins + 1;
					notification.minutesWatched = record.minutesWatched;
					notification.following = record.following;
					notification.checkFollowing = (record.followingChecked && ((new Date) - record.followingChecked) < (1000 * 60 * 60 * 24 * 7) ? true : false);
				}

				bot.upsertUser(who, {'joins': true, 'watching': true});
				if (notification.checkFollowing) {
					bot.twitchAPI.userFollowsChannel(who, bot.credentials.channel, function (error, response) {
						notification.following = (response ? true : false);
						bot.upsertUser(notification.username, {
							'joins': true,
							'watching': true,
							'following': notification.following
						});

						console.log('JOIN: ' + who + ' – ' + notification.joins + ' joins – ' + notification.minutesWatched + ' minutes watched.' + (notification.following ? '' : ' – "Remember to follow!"'));
						bot.emit('join', notification);
					});
				} else {
					bot.upsertUser(notification.username, {'joins': true, 'watching': true});

					console.log('JOIN: ' + who + ' – ' + notification.joins + ' joins – ' + notification.minutesWatched + ' minutes watched.' + (notification.following ? '' : ' – "Remember to follow!"'));
					bot.emit('join', notification);
				}
			});
		})

		.addListener('part', function (channel, who) {
			bot.upsertUser(who, {'watching': false});
		})

		.addListener('names', function (channel, names) {
			for (var key in names) {
				if (names.hasOwnProperty(key)) {
					this.emit('join', channel, key);
				}
			}
		})
		.addListener('message', function (from, to, message) {
			bot.upsertUser(from, {'messages': true});
		});
};


IrcBot.prototype.upsertUser = function (username, values) {
	var bot = this;

	// If the user is the broadcaster, or the bot, or JTV, skip.
	if (username === 'jtv' || username === bot.credentials.username.toLowerCase() || username === bot.credentials.channel.toLowerCase()) {
		return;
	}

	bot.storage.findOne({'_id': username}, function (error, record) {
		// If the user has never visited before, add basic information to their record.
		if (!record || !record.firstVisit) {
			bot.storage.update({'_id': username}, {$set: {'firstVisit': new Date()}}, {upsert: true});
		}

		if (values.hasOwnProperty('joins')) {
			bot.storage.update({'_id': username}, {$inc: {joins: 1}}, {upsert: true});
		}
		if (values.hasOwnProperty('messages')) {
			bot.storage.update({'_id': username}, {$inc: {messages: 1}}, {upsert: true});
		}
		if (values.hasOwnProperty('watching')) {
			bot.storage.update({'_id': username}, {$set: {watching: values.watching}}, {upsert: true});
		}
		if (values.hasOwnProperty('minutesWatched')) {
			bot.storage.update({'_id': username}, {$inc: {minutesWatched: 1}}, {upsert: true});
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

module.exports = IrcBot;
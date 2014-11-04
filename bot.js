var irc = require('irc');

module.exports = {
	credentials: {},
	client: undefined,
	twitchAPI: undefined,
	storage: undefined,

	initialize: function (credentials, twitchAPI, storage) {
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
	},

	everyMinute: function () {
		var bot = this;
		bot.twitchAPI.getStream(bot.credentials.channel, function (error, response) {
			if (response.body.stream) {
				console.log('UPDATE: Minutes + 1');
				bot.storage.update({watching: true}, {$inc: {minutesWatched: 1}}, {multi: true});
			}
		});
	},

	bindEvents: function () {
		var bot = this;

		this.client
			.addListener('error', function (message) {
				console.log('error: ', message);
			})

			.addListener('join', function (channel, who) {
				if (who === bot.credentials.username.toLowerCase() || who === bot.credentials.channel.toLowerCase()) {
					return;
				}

				bot.twitchAPI.userFollowsChannel(who, bot.credentials.channel, function (error, response) {
					var following = (response ? true : false);

					bot.storage.findOne({'_id': who}, function (error, record) {
						if (record) {
							console.log('JOIN: ' + who + ' – ' + (record.joins + 1 || 0) + ' joins – ' + (record.minutesWatched || 0) + ' minutes watched. – Following: ' + (following ? 'YES' : 'NO'));
						} else {
							console.log('JOIN: ' + who + ' – FIRST VISIT');
						}

						bot.upsertUser(who, {'joins': true, 'watching': true, 'following': following});

						// TODO: Fire an event to show a notification.
					});
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
	},

	upsertUser: function (username, values) {
		var bot = this;

		// If the user is the broadcaster, or the bot, or JTV, skip.
		if (username === 'jtv' || username === bot.credentials.username.toLowerCase() || username === bot.credentials.channel.toLowerCase()) {
			return;
		}

		bot.storage.findOne({'_id': username}, function (error, record) {

			// If the user has never visited before, add basic information to their record.
			if (!record || !record.firstVisit) {
				bot.storage.update({'_id': username}, {
					$set: {
						'firstVisit': new Date(),
						'following': false
					}
				}, {upsert: true});
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
				bot.storage.update({'_id': username}, {$set: {following: values.following}}, {upsert: true});
			}
		});
	}
};
	
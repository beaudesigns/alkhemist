var fs = require('fs'),
	path = require('path'),
	prompt = require('prompt'),

	express = require('express'),
	app = express(),
	server = require('http').Server(app),
	io = require('socket.io')(server),

	Twitchy = require('twitchy'),
	Datastore = require('nedb'),
	storage = new Datastore({
		filename: path.resolve(__dirname, 'storage.nedb'),
		autoload: true
	}),
	IrcBot = require('./bot.js'),
	Followers = require('./followers.js');

// Get or create the IRC credentials.
if (fs.existsSync('.credentials')) {
	var credentials = JSON.parse(fs.readFileSync('.credentials'));
	var twitchAPI = new Twitchy({
		key: credentials.client_id,
		secret: credentials.client_secret,
		access_token: (credentials.access_token ? credentials.access_token : null),
		scope: [
			'user_read',
			'channel_read',
			'channel_subscriptions',
			'channel_check_subscription',
			'chat_login'
		]
	});

	// Authenticate to the Twitch API.
	twitchAPI.auth(function (error, access_token) {
		if (error) {
			console.log(error);
			return;
		}

		console.log('Authenticated using token: ' + access_token);
		if (!credentials.access_token) {
			credentials.access_token = access_token;
			fs.writeFileSync('.credentials', JSON.stringify(credentials));
		}

		// Initialize the IRC bot.
		storage.update({watching: true}, {$set: {watching: false}}, {multi: true}, function () {
			var bot = new IrcBot(credentials, twitchAPI, storage);
			var followers = new Followers(credentials, twitchAPI, storage);

			// Set up the client notification socket.
			io.on('connection', function (socket) {
				socket.emit('connected', true);

				bot.on('join', function (data) {
					socket.emit('join', data);
				});
				followers.on('follower', function (data) {
					socket.emit('follower', data);
				});
			});
		});
	});
} else {
	console.log('\nThere is no .credentials file\n');
	createCredentialsFile();
}


// Set up the page listeners.
server.listen(11211);
app
	.get('/', function (request, response) {
		response.send('Choose a notification in the ./public folder.');
	})
	.use(express.static(__dirname + '/node_modules/velocity-animate'))
	.use(express.static(__dirname + '/public'));

// Create the IRC Credentials
function createCredentialsFile() {
	prompt.start();
	prompt.get({
		properties: {
			username: {
				description: 'Your Twitch.tv username',
				required: true
			},
			password: {
				description: 'Your Twitch.tv OAUTH token (http://www.twitchapps.com/tmi/)',
				required: true,
				hidden: false
			},
			channel: {
				description: 'Twitch.tv channel to join',
				required: true
			},
			client_id: {
				description: 'Twitch API Client ID',
				required: true
			},
			client_secret: {
				description: 'Twitch API Client Secret',
				required: true
			}
		}
	}, function (err, result) {
		var credentials = {
			'username': result.username,
			'password': result.password,
			'channel': result.channel,
			'client_id': result.client_id,
			'client_secret': result.client_secret
		};
		fs.writeFileSync('.credentials', JSON.stringify(credentials));

		console.log('Created credentials file. Restart the application\n');
		process.exit();
	});
}
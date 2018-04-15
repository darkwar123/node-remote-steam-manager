/**
 * Modules
 * @private
 * */
const SteamManager = require('node-steam-manager');
const OpskinsManager = require('node-opskins-manager');
const debug = require('debug')('node-remote-steam-manager');

/**
 * Constructor(options)
 * @param {Number} [port] - socket.io port that will be used, default 3333.
 * @param {String[]} [allowedIP] - allowed ip addresses, default ['127.0.0.1', '::1'].
 * @param {Object[]} [accounts] - array of steam account for SteamManger.
 * @constructor
 * */
function RemoteManager({ port, accounts, allowedIP } = { }) {
	port = Number.isInteger(port) ? port : 3333;
	accounts = Array.isArray(accounts) ? accounts : [ ];
	allowedIP = Array.isArray(allowedIP) ? allowedIP : [ '127.0.0.1', '::1' ];

	/* Creates socket.io server */
	this.connection = this.setConnection({
		io: require('socket.io')(),
		allowedIP,
	});

	/* Creates array of SteamManagers */
	this.managers = this.setManagers({
		io: this.connection,
		accounts,
	});

	debug('listen on ' + port);
	this.connection['listen'](port);
}

/**
 * Creates SteamManager instance for all accounts and attach SteamManager events to io
 * @param {Object} io
 * @param {Object[]} accounts
 * @private
 * */
RemoteManager.prototype.setManagers = function setManagers({ io, accounts }) {
	return accounts.map(function createSteamManager(account) {
		let manager = new SteamManager(account);
		let steamID = account.steamID;

		/* Emit to clients that new items was received */
		manager['on']('newItems', (data) => {
			io['emit']('newItems', Object.assign(data, steamID));
		});

		/* Emit to clients sentOfferChanged event */
		manager['on']('sentOfferChanged', (offer, oldState) => {
			io['emit']('sentOfferChanged', Object.assign({ offer, oldState }, steamID));
		});

		/* Emit to clients receivedOfferChanged event */
		manager['on']('receivedOfferChanged', (offer, oldState) => {
			io['emit']('receivedOfferChanged', Object.assign({ offer, oldState }, steamID));
		});

		return manager;
	});
};

/**
 * Creates io connection with authorization
 * @param {Object} io
 * @param {String[]} allowedIP
 * @return {Object}
 * @private
 * */
RemoteManager.prototype.setConnection = function setConnection({ io, allowedIP }) {
	/* Authorization by allowedIP array goes here */
	io['use'](function authorization(socket, next) {
		let socketIP = socket['handshake']['headers']['x-forwarded-for']
			|| socket['handshake']['address'];

		debug('new connection by #' + socket.id + ' from ' + socketIP);

		if (
			!socketIP
			|| allowedIP.indexOf(socketIP) === -1
		) {
			if (allowedIP.indexOf(''+socketIP.replace(/[^\d.]/g, '')) === -1) {
				debug('connection from ' + socketIP + ' is denied');

				return socket.disconnect();
			}
		}

		next();
	});

	/* Set socket.on events here */
	io['use']((socket, next) => {
		this.setEvents({ socket });

		next();
	});

	return io;
};

/**
 * Finds manager by steamID
 * @param {String} steamID
 * @return {undefined|Object}
 * @private
 * */
RemoteManager.prototype.findBySteamID = function findBySteamID(steamID) {
	return this.managers.find((element) => element.steamID['getSteamID64']() === steamID);
};

/**
 * Set events on socket
 * @param {String} socket
 * @private
 * */
RemoteManager.prototype.setEvents = function setEvents({ socket }) {
	/* Event's names and manager functions names for sockets */
	const events = [ 'createOffer', 'loadInventory' ];

	/* Callback function for each socket event */
	const callback = (method, { steamID, args } = { }, cb = () => { }) => {
		const manager = this.findBySteamID(steamID);
		args = args || { };

		if (!manager) {
			return cb('manager wasn\'t found');
		}

		manager[method](args).then((data) => {
			cb(null, data);
		}).catch((err) => cb(err.message));
	};

	/* Check if event exists */
	socket['use'](([ event = '', args = { }, cb = () => { } ] = [ ], next) => {
		debug('new event by #' + socket.id + ' %o', { event, args });

		if (events.indexOf(event) === -1) {
			return cb('method isn\'t allowed');
		}

		next();
	});

	/* Set up socket.on events and callback functions for them */
	events.forEach((event) => socket['on'](event, callback.bind(this, event)));
};

module.exports = RemoteManager;
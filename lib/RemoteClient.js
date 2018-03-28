/**
 * Modules
 * @private
 * */
const Manager = require('socket.io-client');

/**
 * Constructor(options)
 * @param {String} [host]
 * @param {Number} [port]
 * @param {String[]} [steamIDs] - array of each manager steamID
 * @param {Number} [requestTimeout] - request timeout for connection.emit in ms, default 30000 ms (30 seconds).
 * @constructor
 * */
function RemoteClient({ host, port, steamIDs, requestTimeout } = { }) {
	host = host ? host : '127.0.0.1';
	port = Number.isInteger(port) ? port : 3333;
	steamIDs = Array.isArray(steamIDs) ? steamIDs : [ ];

	/* Set up requestTimeout */
	this.requestTimeout = requestTimeout || 30000;
	/* Set up out connection to the server */
	this.connection = this.setConnection(new Manager('ws://' + host + ':' + port));

	this.setManagers(steamIDs);
}

RemoteClient.prototype.setManagers = function setManagers(steamIDs) {
	/* Method's names names for managers */
	const methods = [ 'createOffer', 'loadInventory' ];

	/* Set steamIDs to RemoteClient */
	this.steamIDs = steamIDs;
	
	steamIDs.forEach((steamID) => {
		/* Create new manager */
		this[steamID] = { };

		methods.forEach((method) => {
			/* Bind request function to manager function */
			this[steamID][method] = this.request.bind(this, {
				event: method,
				steamID,
			});
		});
	});
};

/**
 * Set up io connection
 * @param {Object} io
 * @return {Object}
 * @private
 * */
RemoteClient.prototype.setConnection = function setConnection(io) {
	io['on']('error', () => io['emit']('disconnect'));
	io['on']('connect_error', () => io['emit']('disconnect'));
	io['on']('connect_timeout', () => io['emit']('disconnect'));

	io['on']('disconnect', () => {
		io.disconnect();
		setTimeout(() => io.open(), 1000);
	});

	return io;
};

/**
 * Make request to RemoteManager
 * @param {String} steamID
 * @param {String} event
 * @param {Object} args
 * @return {Promise}
 * @private
 * */
RemoteClient.prototype.request = function request({ steamID = '', event = '' } = { }, args = { }) {
	return new Promise((resolve, reject) => {
		let timeout = setTimeout(() => {
			let err = new Error('Request Timeout');

			timeout = null;
			return reject(err);
		}, this.requestTimeout);

		this.connection['emit'](event, { steamID, args }, (err, data) => {
			if (timeout !== null) {
				clearTimeout(timeout);

				if (err) {
					err = new Error(err);

					return reject(err);
				}

				resolve(data);
			}
		});
	});
};

module.exports = RemoteClient;
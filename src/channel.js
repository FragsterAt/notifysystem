module.exports = class ChannelManager {
    constructor(){
        this.channels = {};
        this.subscribers = [];
    }
    /**
     * 
     * @param {String} channel 
     * @param {*} filter 
     * @param {WebSocket} client 
     */
    subscribe(channel, filter, client) {
        if (!this.channels[channel]) {
            this.channels = [];
        }
        this.channels.push({filter, client});
    }
    send(channel, filter, message) {
        if (!this.channels[channel]) { return; }
        this.channels[channel].forEach(el => {
            if (!el.filter) el.client.send(message)
            else if (!filter) el.client.send(message)
            else if (isArray(filter) && !isArray(el.filter) && filter.includes(el.filter)) el.client.send(message)
            else if (!isArray(filter) && isArray(el.filter) && el.filter.includes(filter)) el.client.send(message)
            else if (isArray(filter) && isArray(el.filter) && filter.some(f => el.filter.includes(f))) el.client.send(message)
        })
    }
    unsubscribeClient(client) {
        Object.keys(this.channels).forEach(key => {
            this.channels[key] = this.channels[key].filter(el => el.client !== client);
        })
    }
}
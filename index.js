const WebSocket = require('ws');
const http = require('http');
const { REFUSED } = require('dns');

const { getRequestBody } = require('./src/support.js')

const server = http.createServer(requestListener);
const wss = new WebSocket.Server({ server });

function requestListener (request, response) {

    if (request.method == 'GET') {
        console.log('GET')
        // возвращаем json со статусом
        statusResponse(response);
    } else if (request.method == 'POST') {

        processPostMessage(request, response);

    };
}

function statusResponse (response) {
    let status = { status: 'OK' };
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(status));
}

async function processPostMessage (request, response) {
    try {
        const requestBody = await getRequestBody(request)
        console.log(requestBody)
        const {params, messages} = JSON.parse(requestBody)
        
        messages.forEach(msg => {

            switch (msg.type) {
                case 'message':
                    broadcast(params.filter, msg.data)
                    break;
                }
            

        })

        
        response.writeHead(200, { 'Content-Type': 'application/json' })

        let status = { status: 'OK' };
        response.end(JSON.stringify(status));
    } catch (error) {
        console.error(error)
        response.writeHead(500)
        response.end(error.message);
    }
}

const waitParams = new Set;

const lockQuery = [];
const channels = [];

server.listen(0x1c1c); // 7196


wss.on('connection', function connection (ws) {

    waitParams.add(ws);
    ws.filter = undefined;

    ws.on('message', function incoming (message) {

        try {
            
        } catch (error) {
            
        }
        console.log('received: %s', message);


        let msg = JSON.parse(message);
        switch (msg.type) {
            case 'params':
                waitParams.delete(ws);
                ws.filter = msg.filter
                break;

            case 'message':
                broadcast(msg.filter, msg.data)
                break;

            case 'notify-changed':
            case 'notify-type-changed':
            case 'notify':
                broadcast(msg.filter, msg.data)
                break;

            case 'subscribe':
                ChannelManager.subscribe(msg.channel, msg.filter, ws)

            case 'channel':
                ChannelManager.send(msg.channel, msg.filter, msg.message)

            default:
                break;
        }
    });

    ws.on('close', function () {
        waitParams.delete(ws);
        ChannelManager.unsubscribeClient(ws)
    });

    ws.send('wait for params');
});

function broadcast (filter, data) {
    wss.clients.forEach(function each (client) {
        if (client.filter === filter) {
            client.send(data);
        }
    });
}
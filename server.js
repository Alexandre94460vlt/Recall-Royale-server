const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 10000;

// 1. Serveur HTTP de base pour rassurer le "Health Check" de Render
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Serveur Relais Recall Royale Actif 🟢');
});

// 2. On attache le serveur WebSocket par-dessus
const wss = new WebSocketServer({ server });

let hostWs = null;
let controllers = {}; // Liste des manettes: { id -> { ws, name, color } }
let nextId = 1;

console.log(`🚀 Démarrage du serveur...`);

wss.on('connection', (ws) => {
    console.log("📡 Nouvelle connexion entrante...");

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Gérer les enregistrements (Register)
            if (data.type === 'register') {
                if (data.role === 'host') {
                    hostWs = ws;
                    console.log("🖥️ Jeu Principal (Host) connecté !");
                } 
                else if (data.role === 'controller') {
                    const playerId = nextId++;
                    controllers[playerId] = { ws, name: data.name, color: data.color };
                    console.log(`🎮 Manette connectée: ${data.name} (ID: ${playerId})`);

                    ws.send(JSON.stringify({ type: 'assign_id', id: playerId }));
                    ws.send(JSON.stringify({ type: 'player_color', color: data.color }));

                    if (hostWs && hostWs.readyState === 1) {
                        hostWs.send(JSON.stringify({
                            type: 'player_joined',
                            peer_id: playerId,
                            player_name: data.name,
                            player_color: data.color
                        }));
                    }
                }
                return;
            }

            // 2. Le Jeu Principal (Host) parle aux Manettes
            if (ws === hostWs) {
                if (data.target === 'all') {
                    Object.values(controllers).forEach(c => {
                        if (c.ws.readyState === 1) c.ws.send(JSON.stringify(data.payload));
                    });
                }
                else if (data.target && controllers[data.target]) {
                    const targetWs = controllers[data.target].ws;
                    if (targetWs.readyState === 1) {
                        targetWs.send(JSON.stringify(data.payload));
                    }
                }
                return;
            }

            // 3. Les Manettes parlent au Jeu Principal
            let senderId = null;
            for (const [id, c] of Object.entries(controllers)) {
                if (c.ws === ws) {
                    senderId = id;
                    break;
                }
            }

            if (senderId && hostWs && hostWs.readyState === 1) {
                data.peer_id = parseInt(senderId);
                hostWs.send(JSON.stringify(data));
            }

        } catch (err) {
            console.error("Erreur JSON:", err);
        }
    });

    // 4. Gérer les déconnexions
    ws.on('close', () => {
        if (ws === hostWs) {
            console.log("🖥️ Le Jeu Principal a été déconnecté.");
            hostWs = null;
        } else {
            for (const [id, c] of Object.entries(controllers)) {
                if (c.ws === ws) {
                    console.log(`❌ Manette déconnectée (ID: ${id})`);
                    if (hostWs && hostWs.readyState === 1) {
                        hostWs.send(JSON.stringify({ type: 'player_left', peer_id: parseInt(id) }));
                    }
                    delete controllers[id];
                    break;
                }
            }
        }
    });
});

// 3. On écoute sur le port assigné par Render
server.listen(PORT, () => {
    console.log(`✅ Serveur HTTP et WebSocket actifs sur le port ${PORT}`);
});

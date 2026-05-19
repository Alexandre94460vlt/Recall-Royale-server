const { WebSocketServer } = require('ws');

// Render assigne un port dynamiquement, sinon on utilise 10000 en local
const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });

let hostWs = null;
let controllers = {}; // Liste des manettes: { id -> { ws, name, color } }
let nextId = 1;

console.log(`🚀 Serveur Node.js WebSocket démarré sur le port ${PORT}`);

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

                    // Le serveur répond directement à la manette
                    ws.send(JSON.stringify({ type: 'assign_id', id: playerId }));
                    ws.send(JSON.stringify({ type: 'player_color', color: data.color }));

                    // Le serveur prévient le Jeu Principal qu'un joueur a rejoint
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
                // S'il veut parler à tout le monde
                if (data.target === 'all') {
                    Object.values(controllers).forEach(c => {
                        if (c.ws.readyState === 1) c.ws.send(JSON.stringify(data.payload));
                    });
                }
                // S'il veut parler à une manette spécifique
                else if (data.target && controllers[data.target]) {
                    const targetWs = controllers[data.target].ws;
                    if (targetWs.readyState === 1) {
                        targetWs.send(JSON.stringify(data.payload));
                    }
                }
                return;
            }

            // 3. Les Manettes parlent au Jeu Principal (input, saboteur_choice...)
            // On identifie qui parle
            let senderId = null;
            for (const [id, c] of Object.entries(controllers)) {
                if (c.ws === ws) {
                    senderId = id;
                    break;
                }
            }

            if (senderId && hostWs && hostWs.readyState === 1) {
                // On ajoute l'ID pour que le Jeu sache qui a envoyé le message
                data.peer_id = parseInt(senderId);
                hostWs.send(JSON.stringify(data));
            }

        } catch (err) {
            console.error("Erreur de parsing JSON:", err);
        }
    });

    // 4. Gérer les déconnexions
    ws.on('close', () => {
        if (ws === hostWs) {
            console.log("🖥️ Le Jeu Principal a été déconnecté.");
            hostWs = null;
        } else {
            // Chercher la manette qui s'est déconnectée
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
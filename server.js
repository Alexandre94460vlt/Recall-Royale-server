const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 10000;

// 1. Serveur HTTP de base pour rassurer le "Health Check" de Render
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Serveur Relais Multi-Rooms Recall Royale Actif 🟢');
});

// 2. On attache le serveur WebSocket par-dessus
const wss = new WebSocketServer({ server });

// NOUVEAU : Structure de stockage par salon (Room)
// Chaque clé sera un code de room (ex: "XFGT") contenant son host et ses manettes
let rooms = {}; 
let nextId = 1;

console.log(`🚀 Démarrage du serveur multi-rooms...`);

wss.on('connection', (ws) => {
    // On attache des propriétés personnalisées au socket pour s'en souvenir lors de la déconnexion
    ws.myRole = null;
    ws.myRoomCode = null;
    ws.myPlayerId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Gérer les enregistrements (Register)
            if (data.type === 'register') {
                const roomCode = data.room ? data.room.toUpperCase() : null;

                if (!roomCode) {
                    console.log("⚠️ Tentative de connexion sans code de session spécifié.");
                    return;
                }

                ws.myRoomCode = roomCode;

                // ── CAS 1 : C'est le Jeu Principal (Host) ──
                if (data.role === 'host') {
                    ws.myRole = 'host';
                    
                    // Si la room n'existe pas, on la crée
                    if (!rooms[roomCode]) {
                        rooms[roomCode] = { hostWs: null, controllers: {} };
                    }
                    
                    rooms[roomCode].hostWs = ws;
                    console.log(`🖥️ Salon [${roomCode}] : Jeu Principal (Host) connecté !`);
                } 
                
                // ── CAS 2 : C'est une Manette (Controller) ──
                else if (data.role === 'controller') {
                    ws.myRole = 'controller';
                    const playerId = nextId++;
                    ws.myPlayerId = playerId;

                    // Si le salon n'existe pas encore (la manette est en avance sur l'hôte)
                    if (!rooms[roomCode]) {
                        rooms[roomCode] = { hostWs: null, controllers: {} };
                    }

                    rooms[roomCode].controllers[playerId] = { ws, name: data.name, color: data.color };
                    console.log(`🎮 Salon [${roomCode}] : Manette connectée -> ${data.name} (ID: ${playerId})`);

                    // Envoyer les identifiants à la manette
                    ws.send(JSON.stringify({ type: 'assign_id', id: playerId }));
                    ws.send(JSON.stringify({ type: 'player_color', color: data.color }));

                    // Alerter l'hôte de ce salon spécifique
                    const currentRoom = rooms[roomCode];
                    if (currentRoom.hostWs && currentRoom.hostWs.readyState === 1) {
                        currentRoom.hostWs.send(JSON.stringify({
                            type: 'player_joined',
                            peer_id: playerId,
                            player_name: data.name,
                            player_color: data.color
                        }));
                    }
                }
                return;
            }

            // Récupérer le salon associé à la connexion actuelle
            const roomCode = ws.myRoomCode;
            const currentRoom = rooms[roomCode];
            if (!currentRoom) return;

            // 2. Le Jeu Principal (Host) parle aux Manettes de SA room
            if (ws.myRole === 'host') {
                if (data.target === 'all') {
                    Object.values(currentRoom.controllers).forEach(c => {
                        if (c.ws.readyState === 1) c.ws.send(JSON.stringify(data.payload));
                    });
                }
                else if (data.target && currentRoom.controllers[data.target]) {
                    const targetWs = currentRoom.controllers[data.target].ws;
                    if (targetWs.readyState === 1) {
                        targetWs.send(JSON.stringify(data.payload));
                    }
                }
                return;
            }

            // 3. Les Manettes parlent au Jeu Principal de LEUR room
            if (ws.myRole === 'controller' && ws.myPlayerId) {
                const hostWs = currentRoom.hostWs;
                if (hostWs && hostWs.readyState === 1) {
                    data.peer_id = parseInt(ws.myPlayerId);
                    hostWs.send(JSON.stringify(data));
                }
            }

        } catch (err) {
            console.error("Erreur de traitement du message :", err);
        }
    });

    // 4. Gérer les déconnexions de manière ciblée
    ws.on('close', () => {
        const roomCode = ws.myRoomCode;
        const currentRoom = rooms[roomCode];

        if (!currentRoom) return;

        if (ws.myRole === 'host') {
            console.log(`🖥️ Salon [${roomCode}] : Le Jeu Principal a été déconnecté.`);
            currentRoom.hostWs = null;
            
            // Optionnel : Si plus aucun joueur n'est là et l'hôte est parti, on nettoie la room
            if (Object.keys(currentRoom.controllers).length === 0) {
                delete rooms[roomCode];
            }
        } 
        else if (ws.myRole === 'controller' && ws.myPlayerId) {
            const id = ws.myPlayerId;
            if (currentRoom.controllers[id]) {
                console.log(`❌ Salon [${roomCode}] : Manette déconnectée (ID: ${id})`);
                
                if (currentRoom.hostWs && currentRoom.hostWs.readyState === 1) {
                    currentRoom.hostWs.send(JSON.stringify({ type: 'player_left', peer_id: parseInt(id) }));
                }
                
                delete currentRoom.controllers[id];
            }

            // Si le salon est complètement vide (plus d'hôte ni de manette), on le supprime de la mémoire
            if (!currentRoom.hostWs && Object.keys(currentRoom.controllers).length === 0) {
                delete rooms[roomCode];
            }
        }
    });
});

// 3. On écoute sur le port assigné par Render
server.listen(PORT, () => {
    console.log(`✅ Serveur de salons actifs sur le port ${PORT}`);
});

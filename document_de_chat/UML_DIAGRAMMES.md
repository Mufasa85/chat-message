# 📐 Diagrammes UML — Arcane Chat

> Syntaxe **Mermaid** — rendu automatique sur GitHub, GitLab, Notion, ou https://mermaid.live

---

## 1. 🎯 Diagramme de Cas d'Utilisation

```mermaid
flowchart TD
    Visiteur((Visiteur))
    User((Utilisateur))
    Admin((Administrateur))

    Visiteur --> UC0[S'inscrire]
    Visiteur --> UC1[Se connecter]
    Visiteur --> UC2[Continuer en tant qu'invité]

    User --> UC3[Rejoindre un salon]
    User --> UC4[Envoyer un message texte]
    User --> UC5[Envoyer un fichier / image]
    User --> UC6[Envoyer un message vocal]
    User --> UC7[Envoyer un GIF Giphy]
    User --> UC8[Répondre à un message]
    User --> UC9[Réagir avec un emoji]
    User --> UC10[Supprimer / modifier un message]
    User --> UC11[Envoyer un message éphémère]
    User --> UC12[Créer un salon]
    User --> UC13[Voir les membres en ligne]
    User --> UC14[Envoyer un message privé DM]
    User --> UC15[Lancer un appel audio]
    User --> UC16[Lancer un appel vidéo]
    User --> UC17[Accepter / Refuser un appel]
    User --> UC18[Couper micro / caméra]
    User --> UC19[Modifier son profil]
    User --> UC20[Se déconnecter]

    Admin --> UC3
    Admin --> UC4
    Admin --> UC21[Accéder au backoffice admin]
    Admin --> UC22[Gérer les utilisateurs - ban / disable / rôle]
    Admin --> UC23[Gérer les salons - créer / supprimer]
    Admin --> UC24[Supprimer des messages]
    Admin --> UC25[Voir les statistiques]
    Admin --> UC26[Réinitialiser un mot de passe]

    UC15 -.inclut.-> UC17
    UC16 -.inclut.-> UC17
    UC5 -.inclut.-> UC5a[Upload Cloudinary / local]
    UC6 -.inclut.-> UC5a
```

---

## 2. 🗂️ Diagramme de Classes

```mermaid
classDiagram

    class User {
        +ObjectId _id
        +String username
        +String password
        +String role : user|admin
        +String avatar
        +String bio
        +String fullName
        +String email
        +String phone
        +String status : online|busy|invisible|offline
        +String profilePicture
        +Boolean isDisabled
        +Boolean isBanned
        +Boolean isOnline
        +Date lastSeen
        +Date createdAt
        +comparePassword(candidate) Boolean
        +toJSON() Object
    }

    class Room {
        +ObjectId _id
        +String name
        +String description
        +String type : public|private
        +ObjectId createdBy
        +ObjectId[] members
        +Date createdAt
    }

    class Message {
        +ObjectId _id
        +ObjectId room
        +ObjectId author
        +String content
        +String type : text|system|giphy|image|video|file|audio
        +Date createdAt
        +Boolean ephemeral
        +Number ttl
        +Date expiresAt
        +ReplyTo replyTo
        +Map reactions
        +Attachment attachment
        +createEphemeral(data, ttl)$ Message
    }

    class Attachment {
        +String url
        +String secureUrl
        +String publicId
        +String resourceType
        +String format
        +Number bytes
        +Number width
        +Number height
        +String filename
        +String giphyId
        +String giphyTitle
    }

    class ReplyTo {
        +String _id
        +String content
        +String type
        +String author.username
    }

    class DirectMessage {
        +ObjectId _id
        +ObjectId from
        +ObjectId to
        +String content
        +String type : text|image|file|audio
        +Attachment attachment
        +Boolean read
        +Date createdAt
    }

    class WsServer {
        +Map clients
        +Map rooms
        +Map onlineUsers
        +Map userSockets
        +handleConnection(ws, req)
        +handleSendMessage(ws, data)
        +handleJoinRoom(ws, data)
        +handleCallOffer(ws, data)
        +handleCallAnswer(ws, data)
        +handleIceCandidate(ws, data)
        +handleTyping(ws, data)
        +broadcast(roomId, event, data)
        +send(ws, event, data)
        +sendToUser(userId, event, data)
    }

    class AuthMiddleware {
        +verify(req, res, next)
    }

    class CheckRole {
        +checkRole(...roles) Middleware
    }

    class UploadMiddleware {
        +CloudinaryStorage cloudinaryStorage
        +DiskStorage localDiskStorage
        +getResourceType(mimetype) String
        +upload Multer
    }

    class CleanupService {
        +start(intervalMs)
        +deleteExpiredMessages()
    }

    User "1" --> "0..*" Room : createdBy
    User "0..*" --> "0..*" Room : members
    Room "1" --> "0..*" Message : contient
    User "1" --> "0..*" Message : author
    Message "1" --> "1" Attachment : attachment
    Message "1" --> "0..1" ReplyTo : replyTo
    User "1" --> "0..*" DirectMessage : from
    User "1" --> "0..*" DirectMessage : to
    WsServer --> AuthMiddleware : utilise
    WsServer --> Message : crée / lit
    WsServer --> Room : gère
    WsServer --> User : authentifie
    CleanupService --> Message : supprime expirés
    UploadMiddleware --> Attachment : génère
```

---

## 3. 🔄 Diagrammes de Séquence

### 3a. Authentification (Login)

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant FE as React (AuthPage)
    participant API as Express /api/auth/login
    participant DB as MongoDB (User)

    U->>FE: Saisit username + password
    FE->>API: POST /api/auth/login { username, password }
    API->>DB: User.findOne({ username })
    DB-->>API: user document
    API->>API: bcrypt.compare(password, user.password)
    alt Mot de passe valide
        API->>API: jwt.sign({ userId }) → token JWT
        API-->>FE: 200 { token, user }
        FE->>FE: localStorage.setItem(token, user)
        FE-->>U: Redirige vers ChatPage
    else Mot de passe invalide
        API-->>FE: 401 { error: "Identifiants invalides" }
        FE-->>U: Affiche message d'erreur
    end
```

---

### 3b. Envoi d'un message texte

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant FE as React (ChatPage)
    participant WS as WebSocket Client
    participant WSS as WsServer
    participant DB as MongoDB (Message)
    actor U2 as Autres membres

    U->>FE: Tape un message + clique Envoyer
    FE->>WS: emit('send_message', { roomId, content, type })
    WS->>WSS: [WS] send_message
    WSS->>WSS: Vérifie auth + membership
    WSS->>DB: Message.create({ room, author, content, type })
    DB-->>WSS: message sauvegardé
    WSS->>WS: broadcast(roomId, 'new_message', message)
    WS-->>FE: new_message reçu
    FE-->>U: Affiche le message
    WSS-->>U2: new_message (tous les membres connectés)
```

---

### 3c. Upload d'un fichier (PDF, image, audio...)

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant FE as useFileUpload (XHR)
    participant API as Express /api/upload
    participant MID as Multer Middleware
    participant CDN as Cloudinary
    participant DISK as Serveur local /uploads
    participant DB as MongoDB (Message)
    participant WS as WebSocket broadcast

    U->>FE: Sélectionne un fichier
    FE->>API: POST /api/upload (FormData: file + roomId) + JWT
    API->>MID: Multer intercepte
    MID->>MID: getResourceType(mimetype)
    alt image / audio / vidéo
        MID->>CDN: Upload vers Cloudinary
        CDN-->>MID: { url, secureUrl, publicId }
    else PDF / Word / Excel / ZIP
        MID->>DISK: Sauvegarde dans /uploads/
        DISK-->>MID: { filename, path }
    end
    MID-->>API: req.file rempli
    API->>API: buildFileUrl() → URL publique
    API->>DB: Message.create({ type, attachment })
    DB-->>API: message
    API-->>FE: 201 { message }
    FE->>WS: addMessage(message) → WebSocket broadcast
    WS-->>U: Affiche MessageBubble avec fichier
```

---

### 3d. Appel vidéo WebRTC (de bout en bout)

```mermaid
sequenceDiagram
    actor Alice
    participant FA as useWebRTC (Alice)
    participant WSS as WsServer (signaling)
    participant FB as useWebRTC (Bob)
    actor Bob

    Alice->>FA: startCall(Bob, 'video')
    FA->>FA: getUserMedia({ video, audio })
    FA->>FA: createPeerConnection() + STUN/TURN
    FA->>FA: pc.createOffer() + setLocalDescription()
    FA->>WSS: emit('call_offer', { sdp, callType: 'video' })
    WSS->>FB: sendToUser(Bob, 'call_offer', { sdp, callType })
    FB->>Bob: callState = 'incoming' → CallModal sonne

    alt Bob accepte
        Bob->>FB: acceptCall()
        FB->>FB: getUserMedia({ video, audio })
        FB->>FB: pc.setRemoteDescription(sdp offre)
        FB->>FB: pc.createAnswer() + setLocalDescription()
        FB->>WSS: emit('call_answer', { sdp, accepted: true })
        WSS->>FA: sendToUser(Alice, 'call_answer', { sdp })
        FA->>FA: pc.setRemoteDescription(sdp réponse)

        loop Échange ICE candidates
            FA->>WSS: emit('ice_candidate', { candidate })
            WSS->>FB: sendToUser(Bob, 'ice_candidate')
            FB->>FB: pc.addIceCandidate()
            FB->>WSS: emit('ice_candidate', { candidate })
            WSS->>FA: sendToUser(Alice, 'ice_candidate')
            FA->>FA: pc.addIceCandidate()
        end

        FA-->>FB: Flux audio/vidéo P2P direct (DTLS-SRTP)
        FB-->>FA: Flux audio/vidéo P2P direct
        Alice-->>Bob: Appel actif ✅

    else Bob refuse
        Bob->>FB: rejectCall()
        FB->>WSS: emit('call_answer', { accepted: false })
        WSS->>FA: sendToUser(Alice, 'call_answer', { accepted: false })
        FA->>FA: hangUp() → cleanup streams
        Alice-->>Alice: "Appel refusé"
    end
```

---

### 3e. Message privé DM

```mermaid
sequenceDiagram
    actor Alice
    participant FA as React (DMPage)
    participant WSS as WsServer
    participant DB as MongoDB (DirectMessage)
    actor Bob

    Alice->>FA: Ouvre conversation avec Bob
    FA->>WSS: emit('join_dm', { targetUserId: Bob._id })
    FA->>FA: GET /api/dm/:userId/messages → historique

    Alice->>FA: Envoie un message
    FA->>WSS: emit('send_dm', { targetUserId, content })
    WSS->>DB: DirectMessage.create({ from: Alice, to: Bob, content })
    DB-->>WSS: message sauvegardé
    WSS->>FA: send(Alice.ws, 'new_dm', message)
    WSS->>Bob: sendToUser(Bob, 'new_dm', message)
    Bob-->>Bob: Notification + badge non lu
```

// =====================================================
//  JamSync - WebRTC Real-Time Music Jam Platform
//  WebRTC peer-to-peer logic using PeerJS
// =====================================================

// --- State ---
let peer = null;
let localStream = null;
let activeConnections = {}; // peerId -> { call, dataChannel }

// --- DOM Elements ---
const myPeerIdEl = document.getElementById('my-peer-id');
const connectionStatusEl = document.getElementById('connection-status');
const statusDotEl = document.querySelector('.status-dot');
const copyIdBtn = document.getElementById('copy-id-btn');
const remotePeerIdInput = document.getElementById('remote-peer-id');
const callBtn = document.getElementById('call-btn');
const endCallBtn = document.getElementById('end-call-btn');
const toggleAudioBtn = document.getElementById('toggle-audio-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const toggleScreenBtn = document.getElementById('toggle-screen-btn');
const localVideo = document.getElementById('local-video');
const videoGrid = document.getElementById('video-grid');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatStatus = document.getElementById('chat-status');

// --- Helpers ---
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const note = document.createElement('div');
    note.classList.add('notification', type);

    const iconMap = { info: 'fa-info-circle', success: 'fa-check-circle', error: 'fa-exclamation-circle' };
    note.innerHTML = `<i class="fas ${iconMap[type]}"></i><span>${message}</span>`;
    container.appendChild(note);

    setTimeout(() => {
        note.classList.add('fade-out');
        setTimeout(() => note.remove(), 300);
    }, 3500);
}

function setStatus(text, state) {
    connectionStatusEl.textContent = text;
    statusDotEl.className = 'status-dot';
    if (state) statusDotEl.classList.add(state);
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.classList.add('system-message');
    div.innerHTML = `<div class="message-content"><i class="fas fa-info-circle"></i><p>${text}</p></div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addChatMessage(text, sender = 'You', type = 'sent') {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    div.classList.add('message', type);
    div.innerHTML = `
        <span class="message-sender">${sender}</span>
        <div class="message-bubble">${escapeHtml(text)}</div>
        <span class="message-time">${time}</span>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(text));
    return d.innerHTML;
}

function updateChatUI(enabled) {
    chatInput.disabled = !enabled;
    sendBtn.disabled = !enabled;
    chatStatus.textContent = enabled ? 'Online' : 'Offline';
    chatStatus.className = 'chat-status' + (enabled ? ' active' : '');
}

// --- Video Management ---
function addRemoteVideo(stream, peerId) {
    if (document.getElementById(`video-${peerId}`)) return;

    const wrapper = document.createElement('div');
    wrapper.classList.add('video-wrapper');
    wrapper.id = `video-${peerId}`;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsinline = true;

    const label = document.createElement('div');
    label.classList.add('video-label');
    label.innerHTML = `<i class="fas fa-user"></i> Peer`;

    const audioInd = document.createElement('div');
    audioInd.classList.add('audio-indicator');
    audioInd.innerHTML = `<i class="fas fa-microphone"></i>`;

    wrapper.appendChild(video);
    wrapper.appendChild(label);
    wrapper.appendChild(audioInd);
    videoGrid.appendChild(wrapper);

    updateGridLayout();
}

function removeRemoteVideo(peerId) {
    const el = document.getElementById(`video-${peerId}`);
    if (el) el.remove();
    updateGridLayout();
}

function updateGridLayout() {
    const count = videoGrid.children.length;
    videoGrid.className = 'video-grid';
    if (count === 2) videoGrid.classList.add('layout-2');
}

// --- Media Controls ---
let audioEnabled = true;
let videoEnabled = true;
let isScreenSharing = false;
let screenStream = null;

toggleAudioBtn.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    if (localStream) {
        localStream.getAudioTracks().forEach(t => { t.enabled = audioEnabled; });
    }
    toggleAudioBtn.classList.toggle('active', audioEnabled);
    toggleAudioBtn.classList.toggle('inactive', !audioEnabled);
    toggleAudioBtn.innerHTML = audioEnabled
        ? '<i class="fas fa-microphone"></i>'
        : '<i class="fas fa-microphone-slash"></i>';
    toggleAudioBtn.title = audioEnabled ? 'Mute Microphone' : 'Unmute Microphone';

    // Update local audio indicator
    const localAudioIndicator = document.querySelector('#local-video-wrapper .audio-indicator');
    if (localAudioIndicator) {
        localAudioIndicator.classList.toggle('muted', !audioEnabled);
    }
});

toggleVideoBtn.addEventListener('click', () => {
    videoEnabled = !videoEnabled;
    if (localStream) {
        localStream.getVideoTracks().forEach(t => { t.enabled = videoEnabled; });
    }
    toggleVideoBtn.classList.toggle('active', videoEnabled);
    toggleVideoBtn.classList.toggle('inactive', !videoEnabled);
    toggleVideoBtn.innerHTML = videoEnabled
        ? '<i class="fas fa-video"></i>'
        : '<i class="fas fa-video-slash"></i>';
    toggleVideoBtn.title = videoEnabled ? 'Turn Camera Off' : 'Turn Camera On';
    localVideo.style.opacity = videoEnabled ? '1' : '0.3';
});

toggleScreenBtn.addEventListener('click', async () => {
    if (!isScreenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            
            // Replace video track for all active connections
            for (const id in activeConnections) {
                const call = activeConnections[id].call;
                if (call && call.peerConnection) {
                    const sender = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack).catch(err => console.error(err));
                }
            }
            
            // Switch local video to screen stream
            localVideo.srcObject = screenStream;
            localVideo.style.opacity = '1'; // ensure fully visible
            
            // Optionally remove mirror effect if any CSS applies to local-video
            const localVideoWrapper = document.getElementById('local-video-wrapper');
            if (localVideoWrapper) localVideoWrapper.classList.remove('local-video');
            
            isScreenSharing = true;
            toggleScreenBtn.classList.remove('active');
            toggleScreenBtn.classList.add('inactive');
            toggleScreenBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
            toggleScreenBtn.title = 'Stop Sharing';
            showNotification('Screen sharing started', 'info');
            
            screenTrack.onended = stopScreenShare;
        } catch (err) {
            console.error('Error sharing screen:', err);
            // user might have cancelled the prompt
        }
    } else {
        stopScreenShare();
    }
});

function stopScreenShare() {
    if (!isScreenSharing) return;
    
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
    }
    
    // Revert local view to camera
    localVideo.srcObject = localStream;
    localVideo.style.opacity = videoEnabled ? '1' : '0.3';
    
    const localVideoWrapper = document.getElementById('local-video-wrapper');
    if (localVideoWrapper) localVideoWrapper.classList.add('local-video');
    
    // Switch tracks back for peers
    const videoTrack = localStream ? localStream.getVideoTracks()[0] : null;
    if (videoTrack) {
        for (const id in activeConnections) {
            const call = activeConnections[id].call;
            if (call && call.peerConnection) {
                const sender = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(videoTrack).catch(e => console.warn(e));
            }
        }
    }
    
    isScreenSharing = false;
    toggleScreenBtn.classList.remove('inactive');
    toggleScreenBtn.classList.add('active');
    toggleScreenBtn.innerHTML = '<i class="fas fa-desktop"></i>';
    toggleScreenBtn.title = 'Share Screen';
    showNotification('Screen sharing stopped', 'info');
}

// --- Copy Peer ID ---
copyIdBtn.addEventListener('click', () => {
    const id = myPeerIdEl.textContent;
    if (id && id !== '.......') {
        navigator.clipboard.writeText(id).then(() => {
            showNotification('Jam ID copied to clipboard!', 'success');
            copyIdBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => { copyIdBtn.innerHTML = '<i class="fas fa-copy"></i>'; }, 2000);
        });
    }
});

// --- Chat ---
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    let sent = false;
    for (const id in activeConnections) {
        const dc = activeConnections[id].dataChannel;
        if (dc && dc.open) {
            dc.send(JSON.stringify({ type: 'chat', text, sender: 'You (Peer)' }));
            sent = true;
        }
    }

    if (sent) {
        addChatMessage(text, 'You', 'sent');
        chatInput.value = '';
    } else {
        showNotification('No connected peers to send message to.', 'error');
    }
}

// --- Call Management ---
function handleCall(call, dataConn) {
    call.on('stream', (remoteStream) => {
        addRemoteVideo(remoteStream, call.peer);
        showNotification(`🎸 Peer connected!`, 'success');
        addSystemMessage(`Peer joined the jam session.`);
    });

    call.on('close', () => {
        removeRemoteVideo(call.peer);
        delete activeConnections[call.peer];
        updateCallUI(Object.keys(activeConnections).length > 0);
        addSystemMessage(`A peer has left the session.`);
        showNotification('Peer disconnected.', 'info');
    });

    call.on('error', (err) => {
        console.error('Call error:', err);
        showNotification('Call error: ' + err.message, 'error');
    });
}

function handleDataConnection(conn) {
    if (!activeConnections[conn.peer]) {
        activeConnections[conn.peer] = {};
    }
    activeConnections[conn.peer].dataChannel = conn;

    conn.on('open', () => {
        updateChatUI(true);
    });

    conn.on('data', (rawData) => {
        try {
            const data = JSON.parse(rawData);
            if (data.type === 'chat') {
                addChatMessage(data.text, 'Peer', 'received');
            }
        } catch(e) {
            console.warn('Non-JSON message received:', rawData);
        }
    });

    conn.on('close', () => {
        if (Object.keys(activeConnections).length === 0) {
            updateChatUI(false);
        }
    });
}

function updateCallUI(inCall) {
    callBtn.classList.toggle('hidden', inCall);
    endCallBtn.classList.toggle('hidden', !inCall);
    remotePeerIdInput.disabled = inCall;
}

// --- Connect to a remote peer ---
callBtn.addEventListener('click', () => {
    const remoteId = remotePeerIdInput.value.trim();
    if (!remoteId) {
        showNotification('Please enter a Jam ID to connect.', 'error');
        return;
    }
    if (remoteId === myPeerIdEl.textContent) {
        showNotification('You cannot connect to yourself!', 'error');
        return;
    }
    if (!localStream) {
        showNotification('Camera/Mic not available. Please allow access.', 'error');
        return;
    }

    showNotification('Connecting to peer...', 'info');

    // Make the media call
    let streamToCall = localStream;
    if (isScreenSharing && screenStream) {
        streamToCall = new MediaStream([
            localStream.getAudioTracks()[0],
            screenStream.getVideoTracks()[0]
        ].filter(Boolean));
    }
    const call = peer.call(remoteId, streamToCall);
    if (!activeConnections[remoteId]) activeConnections[remoteId] = {};
    activeConnections[remoteId].call = call;
    handleCall(call);

    // Open data connection for chat
    const dataConn = peer.connect(remoteId, { reliable: true });
    activeConnections[remoteId].dataChannel = dataConn;
    handleDataConnection(dataConn);

    updateCallUI(true);
});

// --- Hang Up ---
endCallBtn.addEventListener('click', () => {
    for (const id in activeConnections) {
        const conn = activeConnections[id];
        if (conn.call) conn.call.close();
        if (conn.dataChannel && conn.dataChannel.open) conn.dataChannel.close();
        removeRemoteVideo(id);
    }
    activeConnections = {};
    updateCallUI(false);
    updateChatUI(false);
    addSystemMessage('You ended the session.');
    showNotification('Session ended.', 'info');
});

// --- Initialization ---
async function init() {
    setStatus('Requesting media...', null);

    // Get local media
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        showNotification('Camera & microphone ready!', 'success');
    } catch (err) {
        console.warn('Could not get full media, trying audio-only:', err);
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            localVideo.srcObject = null;
            showNotification('Video unavailable. Audio-only mode.', 'info');
            toggleVideoBtn.classList.add('inactive');
            toggleVideoBtn.disabled = true;
        } catch (audioErr) {
            showNotification('Could not access camera or mic. Check browser permissions.', 'error');
            localStream = null;
        }
    }

    setStatus('Connecting to server...', null);

    // Initialize PeerJS
    peer = new Peer(undefined, {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        debug: 1,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', (id) => {
        myPeerIdEl.textContent = id;
        myPeerIdEl.classList.remove('skeleton-text');
        setStatus('Ready to Jam!', 'connected');
        showNotification('Connected! Share your ID to start a session.', 'success');
    });

    // Handle incoming media calls
    peer.on('call', (call) => {
        if (!localStream) {
            showNotification('Cannot accept call - no media stream.', 'error');
            return;
        }
        if (!activeConnections[call.peer]) activeConnections[call.peer] = {};
        activeConnections[call.peer].call = call;
        
        let streamToAnswer = localStream;
        if (isScreenSharing && screenStream) {
            streamToAnswer = new MediaStream([
                localStream.getAudioTracks()[0],
                screenStream.getVideoTracks()[0]
            ].filter(Boolean));
        }
        call.answer(streamToAnswer);
        
        handleCall(call);
        updateCallUI(true);
        showNotification('Incoming connection accepted!', 'success');
        addSystemMessage('A peer joined your session!');
    });

    // Handle incoming data connections
    peer.on('connection', (conn) => {
        handleDataConnection(conn);
    });

    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        let msg = 'Connection error.';
        if (err.type === 'peer-unavailable') msg = 'Peer not found. Check the Jam ID.';
        else if (err.type === 'unavailable-id') msg = 'ID unavailable, retrying...';
        else if (err.type === 'network') msg = 'Network error. Check your connection.';
        showNotification(msg, 'error');
        setStatus('Error', 'error');
    });

    peer.on('disconnected', () => {
        setStatus('Disconnected – reconnecting...', null);
        peer.reconnect();
    });

    peer.on('close', () => {
        setStatus('Connection closed', 'error');
    });
}

// Start the app
init();

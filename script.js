// =====================================================
//  JamSync - WebRTC Real-Time Music Jam Platform
//  WebRTC peer-to-peer logic using PeerJS
//  Advanced Features: Raise Hand, Emoji Reactions,
//  Meeting Timer, Fullscreen, Typing Indicator,
//  Emoji Picker, Sound Notifications
// =====================================================

// --- State ---
let peer = null;
let localStream = null;
let activeConnections = {}; // peerId -> { call, dataChannel }
let isHandRaised = false;
let isScreenSharing = false;
let screenStream = null;
let meetingTimerInterval = null;
let meetingSeconds = 0;
let typingTimeout = null;
let peerTypingTimeout = null;

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
const raiseHandBtn = document.getElementById('raise-hand-btn');
const emojiReactionBtn = document.getElementById('emoji-reaction-btn');
const reactionPicker = document.getElementById('reaction-picker');
const localVideo = document.getElementById('local-video');
const videoGrid = document.getElementById('video-grid');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatStatus = document.getElementById('chat-status');
const reactionsOverlay = document.getElementById('reactions-overlay');
const meetingTimerEl = document.getElementById('meeting-timer');
const timerDisplayEl = document.getElementById('timer-display');
const participantNumberEl = document.getElementById('participant-number');
const typingIndicator = document.getElementById('typing-indicator');
const chatEmojiBtn = document.getElementById('chat-emoji-btn');
const chatEmojiPicker = document.getElementById('chat-emoji-picker');
const emojiPickerGrid = document.getElementById('emoji-picker-grid');
const localHandIndicator = document.getElementById('local-hand-indicator');

// --- Sound Effects (Web Audio API) ---
let audioContext = null;

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

function playSound(type) {
    try {
        const ctx = getAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        if (type === 'join') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.3);
        } else if (type === 'leave') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(660, ctx.currentTime);
            oscillator.frequency.setValueAtTime(440, ctx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.3);
        } else if (type === 'hand') {
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(523, ctx.currentTime);
            oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.08);
            oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.16);
            gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.35);
        } else if (type === 'reaction') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(1200, ctx.currentTime);
            gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.15);
        }
    } catch (e) {
        // Audio not available — fail silently
    }
}

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

// --- Meeting Timer ---
function startMeetingTimer() {
    if (meetingTimerInterval) return;
    meetingSeconds = 0;
    meetingTimerEl.classList.remove('hidden');
    timerDisplayEl.textContent = '00:00';
    meetingTimerInterval = setInterval(() => {
        meetingSeconds++;
        const mins = Math.floor(meetingSeconds / 60).toString().padStart(2, '0');
        const secs = (meetingSeconds % 60).toString().padStart(2, '0');
        timerDisplayEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopMeetingTimer() {
    if (meetingTimerInterval) {
        clearInterval(meetingTimerInterval);
        meetingTimerInterval = null;
    }
    meetingTimerEl.classList.add('hidden');
    meetingSeconds = 0;
}

// --- Participant Count ---
function updateParticipantCount() {
    const count = Object.keys(activeConnections).length + 1; // +1 for yourself
    participantNumberEl.textContent = count;
}

// --- Video Management ---
function addRemoteVideo(stream, peerId) {
    let existingWrapper = document.getElementById(`video-${peerId}`);
    if (existingWrapper) {
        const existingVideo = existingWrapper.querySelector('video');
        if (existingVideo) {
            existingVideo.srcObject = stream;
            existingVideo.play().catch(() => {});
        }
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.classList.add('video-wrapper');
    wrapper.id = `video-${peerId}`;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsinline = true;
    video.play().catch(() => {});

    const label = document.createElement('div');
    label.classList.add('video-label');
    label.innerHTML = `<i class="fas fa-user"></i> Peer`;

    const audioInd = document.createElement('div');
    audioInd.classList.add('audio-indicator');
    audioInd.innerHTML = `<i class="fas fa-microphone"></i>`;

    // Hand raised indicator for remote peer
    const handInd = document.createElement('div');
    handInd.classList.add('hand-raised-indicator', 'hidden');
    handInd.id = `hand-indicator-${peerId}`;
    handInd.innerHTML = `<span>✋</span>`;

    wrapper.appendChild(video);
    wrapper.appendChild(label);
    wrapper.appendChild(audioInd);
    wrapper.appendChild(handInd);
    videoGrid.appendChild(wrapper);

    // Double-click to fullscreen
    wrapper.addEventListener('dblclick', () => {
        toggleFullscreen(wrapper);
    });

    updateGridLayout();
    updateParticipantCount();
}

function removeRemoteVideo(peerId) {
    const el = document.getElementById(`video-${peerId}`);
    if (el) el.remove();
    updateGridLayout();
    updateParticipantCount();
}

function updateGridLayout() {
    const count = videoGrid.children.length;
    videoGrid.className = 'video-grid';
    if (count === 2) videoGrid.classList.add('layout-2');
}

// --- Fullscreen ---
function toggleFullscreen(element) {
    if (!document.fullscreenElement) {
        element.requestFullscreen().catch(err => {
            console.warn('Fullscreen error:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// Double-click local video for fullscreen
document.getElementById('local-video-wrapper').addEventListener('dblclick', () => {
    toggleFullscreen(document.getElementById('local-video-wrapper'));
});

// --- Media Controls ---
let audioEnabled = true;
let videoEnabled = true;

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

    const localAudioIndicator = document.querySelector('#local-video-wrapper .audio-indicator');
    if (localAudioIndicator) {
        localAudioIndicator.classList.toggle('muted', !audioEnabled);
    }
});

toggleVideoBtn.addEventListener('click', () => {
    if (isScreenSharing) {
        stopScreenShare();
    }

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

// --- Screen Sharing ---
toggleScreenBtn.addEventListener('click', async () => {
    if (!isScreenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];

            for (const id in activeConnections) {
                const call = activeConnections[id].call;
                if (call && call.peerConnection) {
                    const senders = call.peerConnection.getSenders();
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video') ||
                                        senders.find(s => !s.track || s.track.kind === 'video');
                    if (videoSender) {
                        videoSender.replaceTrack(screenTrack).catch(err => console.error(err));
                    }
                }
            }

            localVideo.srcObject = screenStream;
            localVideo.style.opacity = '1';

            const localVideoWrapper = document.getElementById('local-video-wrapper');
            if (localVideoWrapper) localVideoWrapper.classList.remove('local-video');

            isScreenSharing = true;
            toggleScreenBtn.classList.remove('active');
            toggleScreenBtn.classList.add('screen-sharing');
            toggleScreenBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
            toggleScreenBtn.title = 'Stop Screen Sharing';
            showNotification('Screen sharing started!', 'success');

            screenTrack.onended = () => stopScreenShare();
        } catch (err) {
            console.error('Error starting screen share:', err);
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

    localVideo.srcObject = localStream;
    localVideo.style.opacity = videoEnabled ? '1' : '0.3';

    const localVideoWrapper = document.getElementById('local-video-wrapper');
    if (localVideoWrapper) localVideoWrapper.classList.add('local-video');

    const cameraTrack = localStream ? localStream.getVideoTracks()[0] : null;
    for (const id in activeConnections) {
        const call = activeConnections[id].call;
        if (call && call.peerConnection) {
            const senders = call.peerConnection.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video') ||
                                senders.find(s => !s.track || s.track.kind === 'video');
            if (videoSender && cameraTrack) {
                videoSender.replaceTrack(cameraTrack).catch(e => console.warn(e));
            }
        }
    }

    isScreenSharing = false;
    toggleScreenBtn.classList.remove('screen-sharing');
    toggleScreenBtn.classList.add('active');
    toggleScreenBtn.innerHTML = '<i class="fas fa-desktop"></i>';
    toggleScreenBtn.title = 'Share Screen';
    showNotification('Screen sharing stopped.', 'info');
}

// --- Raise Hand ---
raiseHandBtn.addEventListener('click', () => {
    isHandRaised = !isHandRaised;

    // Update local UI
    localHandIndicator.classList.toggle('hidden', !isHandRaised);
    raiseHandBtn.classList.toggle('hand-active', isHandRaised);
    raiseHandBtn.title = isHandRaised ? 'Lower Hand' : 'Raise Hand';

    if (isHandRaised) {
        playSound('hand');
    }

    // Send to all peers
    broadcastData({ type: 'raise-hand', raised: isHandRaised });

    showNotification(isHandRaised ? '✋ Hand raised!' : 'Hand lowered.', 'info');
});

// --- Emoji Reactions ---
emojiReactionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    reactionPicker.classList.toggle('hidden');
});

// Close reaction picker when clicking outside
document.addEventListener('click', (e) => {
    if (!reactionPicker.contains(e.target) && e.target !== emojiReactionBtn) {
        reactionPicker.classList.add('hidden');
    }
    if (!chatEmojiPicker.contains(e.target) && e.target !== chatEmojiBtn && !chatEmojiBtn.contains(e.target)) {
        chatEmojiPicker.classList.add('hidden');
    }
});

// Handle reaction emoji click
document.querySelectorAll('.reaction-emoji').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const emoji = btn.dataset.emoji;
        createFloatingEmoji(emoji);
        playSound('reaction');
        broadcastData({ type: 'emoji-reaction', emoji });
        reactionPicker.classList.add('hidden');
    });
});

function createFloatingEmoji(emoji) {
    const el = document.createElement('div');
    el.classList.add('floating-emoji');
    el.textContent = emoji;

    // Randomize horizontal position
    const xPos = Math.random() * 80 + 10; // 10% to 90%
    el.style.left = xPos + '%';

    reactionsOverlay.appendChild(el);

    // Remove after animation completes
    el.addEventListener('animationend', () => el.remove());
}

// --- Chat Emoji Picker ---
const chatEmojis = [
    '😀', '😂', '😍', '🥰', '😎', '🤩', '😇', '🤔',
    '😮', '😢', '😡', '🤯', '🥳', '😴', '🤮', '👻',
    '👏', '🙌', '🤝', '✌️', '🤟', '🤘', '👍', '👎',
    '❤️', '🔥', '⭐', '🎵', '🎸', '🥁', '🎹', '🎤',
    '🎧', '🎺', '🎻', '🪗', '🎷', '🪘', '🎼', '🏆'
];

function initEmojiPicker() {
    emojiPickerGrid.innerHTML = '';
    chatEmojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.classList.add('emoji-item');
        btn.textContent = emoji;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            chatInput.value += emoji;
            chatInput.focus();
        });
        emojiPickerGrid.appendChild(btn);
    });
}

chatEmojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chatEmojiPicker.classList.toggle('hidden');
});

initEmojiPicker();

// --- Typing Indicator ---
chatInput.addEventListener('input', () => {
    // Broadcast typing to peers
    broadcastData({ type: 'typing', isTyping: true });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        broadcastData({ type: 'typing', isTyping: false });
    }, 1500);
});

function showTypingIndicator(show) {
    typingIndicator.classList.toggle('hidden', !show);
    if (show) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
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
        // Stop typing indicator
        broadcastData({ type: 'typing', isTyping: false });
    } else {
        showNotification('No connected peers to send message to.', 'error');
    }
}

// --- Broadcast data to all peers ---
function broadcastData(data) {
    const msg = JSON.stringify(data);
    for (const id in activeConnections) {
        const dc = activeConnections[id].dataChannel;
        if (dc && dc.open) {
            dc.send(msg);
        }
    }
}

// --- Call Management ---
function handleCall(call) {
    call.on('stream', (remoteStream) => {
        addRemoteVideo(remoteStream, call.peer);
        playSound('join');
        showNotification(`🎸 Peer connected!`, 'success');
        addSystemMessage(`Peer joined the jam session.`);
        startMeetingTimer();
    });

    call.on('close', () => {
        removeRemoteVideo(call.peer);
        delete activeConnections[call.peer];
        updateParticipantCount();
        updateCallUI(Object.keys(activeConnections).length > 0);
        if (Object.keys(activeConnections).length === 0) {
            stopMeetingTimer();
        }
        playSound('leave');
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

            switch (data.type) {
                case 'chat':
                    addChatMessage(data.text, 'Peer', 'received');
                    showTypingIndicator(false);
                    break;

                case 'raise-hand':
                    handleRemoteHandRaise(conn.peer, data.raised);
                    break;

                case 'emoji-reaction':
                    createFloatingEmoji(data.emoji);
                    playSound('reaction');
                    break;

                case 'typing':
                    clearTimeout(peerTypingTimeout);
                    if (data.isTyping) {
                        showTypingIndicator(true);
                        peerTypingTimeout = setTimeout(() => {
                            showTypingIndicator(false);
                        }, 3000);
                    } else {
                        showTypingIndicator(false);
                    }
                    break;

                default:
                    break;
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

function handleRemoteHandRaise(peerId, raised) {
    const handIndicator = document.getElementById(`hand-indicator-${peerId}`);
    if (handIndicator) {
        handIndicator.classList.toggle('hidden', !raised);
    }
    if (raised) {
        playSound('hand');
        showNotification('✋ A peer raised their hand!', 'info');
    }
}

function updateCallUI(inCall) {
    callBtn.classList.toggle('hidden', inCall);
    endCallBtn.classList.toggle('hidden', !inCall);
    remotePeerIdInput.disabled = inCall;
}

// Helper: get current outgoing stream
function getCurrentOutgoingStream() {
    if (isScreenSharing && screenStream) {
        const tracks = [];
        if (localStream && localStream.getAudioTracks().length > 0) {
            tracks.push(localStream.getAudioTracks()[0]);
        }
        if (screenStream.getVideoTracks().length > 0) {
            tracks.push(screenStream.getVideoTracks()[0]);
        }
        return new MediaStream(tracks);
    }
    return localStream;
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

    const streamToCall = getCurrentOutgoingStream();
    const call = peer.call(remoteId, streamToCall);
    if (!activeConnections[remoteId]) activeConnections[remoteId] = {};
    activeConnections[remoteId].call = call;
    handleCall(call);

    const dataConn = peer.connect(remoteId, { reliable: true });
    activeConnections[remoteId].dataChannel = dataConn;
    handleDataConnection(dataConn);

    updateCallUI(true);
});

// --- Hang Up ---
endCallBtn.addEventListener('click', () => {
    if (isScreenSharing) stopScreenShare();
    if (isHandRaised) {
        isHandRaised = false;
        localHandIndicator.classList.add('hidden');
        raiseHandBtn.classList.remove('hand-active');
    }

    for (const id in activeConnections) {
        const conn = activeConnections[id];
        if (conn.call) conn.call.close();
        if (conn.dataChannel && conn.dataChannel.open) conn.dataChannel.close();
        removeRemoteVideo(id);
    }
    activeConnections = {};
    updateCallUI(false);
    updateChatUI(false);
    stopMeetingTimer();
    updateParticipantCount();
    showTypingIndicator(false);
    addSystemMessage('You ended the session.');
    showNotification('Session ended.', 'info');
});

// --- Initialization ---
async function init() {
    setStatus('Requesting media...', null);

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        localVideo.play().catch(() => {});
        showNotification('Camera & microphone ready!', 'success');
    } catch (err) {
        console.warn('Could not get full media, trying audio-only:', err);
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            localVideo.srcObject = null;
            showNotification('Video unavailable. Audio-only mode.', 'info');
            toggleVideoBtn.classList.add('inactive');
            toggleVideoBtn.disabled = true;
            toggleScreenBtn.disabled = true;
            toggleScreenBtn.style.opacity = '0.4';
        } catch (audioErr) {
            showNotification('Could not access camera or mic. Check browser permissions.', 'error');
            localStream = null;
        }
    }

    setStatus('Connecting to server...', null);

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

    peer.on('call', (call) => {
        if (!localStream) {
            showNotification('Cannot accept call - no media stream.', 'error');
            return;
        }
        if (!activeConnections[call.peer]) activeConnections[call.peer] = {};
        activeConnections[call.peer].call = call;

        const streamToAnswer = getCurrentOutgoingStream();
        call.answer(streamToAnswer);

        handleCall(call);
        updateCallUI(true);
        showNotification('Incoming connection accepted!', 'success');
        addSystemMessage('A peer joined your session!');
    });

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

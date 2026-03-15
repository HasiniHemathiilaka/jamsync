// =====================================================
//  JamSync - WebRTC Real-Time Music Jam Platform
//  WebRTC peer-to-peer logic using PeerJS
//  Advanced Features: Raise Hand, Emoji Reactions,
//  Meeting Timer, Fullscreen, Typing Indicator,
//  Emoji Picker, Sound Notifications, Session Recording
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
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingCanvas = null;
let recordingCtx = null;
let recordingAnimFrame = null;
let recordingMixedStream = null;
let localUsername = 'You';
let remoteUsernames = {}; // peerId -> username

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
const recordBtn = document.getElementById('record-btn');
const usernameModal = document.getElementById('username-modal');
const usernameInput = document.getElementById('username-input');
const joinJamBtn = document.getElementById('join-jam-btn');

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

// --- Recording ---
recordBtn.addEventListener('click', () => {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
});

function startRecording() {
    try {
        // Create an offscreen canvas for compositing videos
        recordingCanvas = document.createElement('canvas');
        recordingCanvas.width = 1280;
        recordingCanvas.height = 720;
        recordingCtx = recordingCanvas.getContext('2d');

        // Draw loop: composite local + remote videos onto canvas
        function drawFrame() {
            recordingCtx.fillStyle = '#0f172a';
            recordingCtx.fillRect(0, 0, 1280, 720);

            const videos = document.querySelectorAll('#video-grid video');
            if (videos.length === 1) {
                // Single video — full canvas
                drawVideoToCanvas(videos[0], 0, 0, 1280, 720);
            } else if (videos.length === 2) {
                // Side by side
                drawVideoToCanvas(videos[0], 0, 0, 640, 720);
                drawVideoToCanvas(videos[1], 640, 0, 640, 720);
            } else if (videos.length > 2) {
                // Grid layout
                const cols = Math.ceil(Math.sqrt(videos.length));
                const rows = Math.ceil(videos.length / cols);
                const w = Math.floor(1280 / cols);
                const h = Math.floor(720 / rows);
                videos.forEach((vid, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    drawVideoToCanvas(vid, col * w, row * h, w, h);
                });
            }

            // Add recording indicator
            recordingCtx.fillStyle = '#ef4444';
            recordingCtx.beginPath();
            recordingCtx.arc(30, 30, 10, 0, Math.PI * 2);
            recordingCtx.fill();
            recordingCtx.fillStyle = '#ffffff';
            recordingCtx.font = '16px Inter, sans-serif';
            recordingCtx.fillText('REC', 48, 36);

            // Add timestamp
            const now = new Date();
            const timeStr = now.toLocaleTimeString();
            recordingCtx.fillStyle = 'rgba(0,0,0,0.6)';
            recordingCtx.fillRect(1280 - 120, 10, 110, 30);
            recordingCtx.fillStyle = '#ffffff';
            recordingCtx.font = '14px monospace';
            recordingCtx.fillText(timeStr, 1280 - 112, 30);

            recordingAnimFrame = requestAnimationFrame(drawFrame);
        }

        function drawVideoToCanvas(videoEl, x, y, w, h) {
            try {
                if (videoEl.readyState >= 2) {
                    // Maintain aspect ratio
                    const vw = videoEl.videoWidth || w;
                    const vh = videoEl.videoHeight || h;
                    const scale = Math.min(w / vw, h / vh);
                    const dw = vw * scale;
                    const dh = vh * scale;
                    const dx = x + (w - dw) / 2;
                    const dy = y + (h - dh) / 2;
                    recordingCtx.drawImage(videoEl, dx, dy, dw, dh);
                }
            } catch (e) {
                // Cross-origin or not ready — draw placeholder
                recordingCtx.fillStyle = '#1e293b';
                recordingCtx.fillRect(x, y, w, h);
            }
        }

        drawFrame();

        // Get canvas video stream
        const canvasStream = recordingCanvas.captureStream(30); // 30fps

        // Mix all audio tracks using AudioContext
        const mixCtx = getAudioContext();
        const destination = mixCtx.createMediaStreamDestination();

        // Add local audio
        if (localStream) {
            const localAudioTracks = localStream.getAudioTracks();
            if (localAudioTracks.length > 0) {
                const localSource = mixCtx.createMediaStreamSource(
                    new MediaStream([localAudioTracks[0]])
                );
                localSource.connect(destination);
            }
        }

        // Add remote audio from all peers
        for (const id in activeConnections) {
            const call = activeConnections[id].call;
            if (call && call.remoteStream) {
                const remoteAudioTracks = call.remoteStream.getAudioTracks();
                if (remoteAudioTracks.length > 0) {
                    const remoteSource = mixCtx.createMediaStreamSource(
                        new MediaStream([remoteAudioTracks[0]])
                    );
                    remoteSource.connect(destination);
                }
            }
        }

        // Also try getting remote audio from video elements
        document.querySelectorAll('#video-grid video').forEach(vid => {
            if (vid.id !== 'local-video' && vid.srcObject) {
                const audioTracks = vid.srcObject.getAudioTracks();
                if (audioTracks.length > 0) {
                    try {
                        const src = mixCtx.createMediaStreamSource(
                            new MediaStream([audioTracks[0]])
                        );
                        src.connect(destination);
                    } catch(e) { /* already connected or unavailable */ }
                }
            }
        });

        // Combine canvas video + mixed audio into one stream
        recordingMixedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...destination.stream.getAudioTracks()
        ]);

        // Start MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
                ? 'video/webm;codecs=vp8,opus'
                : 'video/webm';

        recordedChunks = [];
        mediaRecorder = new MediaRecorder(recordingMixedStream, {
            mimeType,
            videoBitsPerSecond: 2500000  // 2.5 Mbps
        });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.href = url;
            a.download = `JamSync-Recording-${timestamp}.webm`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            showNotification('Recording saved!', 'success');
        };

        mediaRecorder.start(1000); // Collect data every second
        isRecording = true;

        recordBtn.classList.add('recording');
        recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
        recordBtn.title = 'Stop Recording';
        showNotification('🔴 Recording started!', 'info');
        addSystemMessage('Recording started.');

    } catch (err) {
        console.error('Recording error:', err);
        showNotification('Could not start recording: ' + err.message, 'error');
    }
}

function stopRecording() {
    if (!isRecording) return;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    if (recordingAnimFrame) {
        cancelAnimationFrame(recordingAnimFrame);
        recordingAnimFrame = null;
    }

    if (recordingMixedStream) {
        recordingMixedStream.getTracks().forEach(t => t.stop());
        recordingMixedStream = null;
    }

    recordingCanvas = null;
    recordingCtx = null;
    isRecording = false;

    recordBtn.classList.remove('recording');
    recordBtn.innerHTML = '<i class="fas fa-circle"></i>';
    recordBtn.title = 'Record Session';
    showNotification('Recording stopped. File downloading...', 'info');
    addSystemMessage('Recording saved.');
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

    const userName = remoteUsernames[peerId] || 'Peer';
    const label = document.createElement('div');
    label.classList.add('video-label');
    label.innerHTML = `<i class="fas fa-user"></i> <span id="label-${peerId}">${escapeHtml(userName)}</span>`;

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
            dc.send(JSON.stringify({ type: 'chat', text, sender: localUsername }));
            sent = true;
        }
    }

    if (sent) {
        addChatMessage(text, localUsername, 'sent');
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
        const name = remoteUsernames[call.peer] || 'Peer';
        showNotification(`🎸 ${escapeHtml(name)} connected!`, 'success');
        addSystemMessage(`${escapeHtml(name)} joined the jam session.`);
        startMeetingTimer();
    });

    call.on('close', () => {
        const name = remoteUsernames[call.peer] || 'A peer';
        removeRemoteVideo(call.peer);
        delete activeConnections[call.peer];
        delete remoteUsernames[call.peer];
        updateParticipantCount();
        updateCallUI(Object.keys(activeConnections).length > 0);
        if (Object.keys(activeConnections).length === 0) {
            stopMeetingTimer();
        }
        playSound('leave');
        addSystemMessage(`${escapeHtml(name)} has left the session.`);
        showNotification(`${escapeHtml(name)} disconnected.`, 'info');
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
        // Share our username right away
        conn.send(JSON.stringify({ type: 'user-info', username: localUsername }));
    });

    conn.on('data', (rawData) => {
        try {
            const data = JSON.parse(rawData);

            switch (data.type) {
                case 'user-info':
                    remoteUsernames[conn.peer] = data.username;
                    const labelSpan = document.getElementById(`label-${conn.peer}`);
                    if (labelSpan) {
                        labelSpan.textContent = data.username;
                    }
                    break;

                case 'chat':
                    const senderName = data.sender || remoteUsernames[conn.peer] || 'Peer';
                    addChatMessage(data.text, senderName, 'received');
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
                        const senderName = remoteUsernames[conn.peer] || 'Peer';
                        document.querySelector('.typing-text').textContent = `${escapeHtml(senderName)} is typing`;
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
    if (isRecording) stopRecording();
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

// --- Entry Point ---
joinJamBtn.addEventListener('click', startApp);
usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startApp();
});

function startApp() {
    const name = usernameInput.value.trim();
    if (name) {
        localUsername = name;
        const localVideoLabel = document.querySelector('#local-video-wrapper .video-label');
        if (localVideoLabel) {
            localVideoLabel.innerHTML = `<i class="fas fa-user"></i> ${escapeHtml(localUsername)} (You)`;
        }
        usernameModal.classList.add('hidden');
        init();
    } else {
        usernameInput.classList.add('error-shake');
        setTimeout(() => usernameInput.classList.remove('error-shake'), 400);
        usernameInput.focus();
    }
}


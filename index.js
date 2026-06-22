require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadContentFromMessage, jidNormalizedUser, Browsers, delay } = require('@whiskeysockets/baileys');
const P = require('pino');
const { OpenAI } = require('openai');

// Import Commands
const commands = {
    song: require('./commands/song'),
    video: require('./commands/video'),
    kick: require('./commands/kick'),
    private: require('./commands/private'),
    public: require('./commands/public'),
    owner: require('./commands/owner'),
    ai: require('./commands/ai'),
    antilink: require('./commands/antilink'),
    anticall: require('./commands/anticall'),
    status: require('./commands/status'),
    antidelete: require('./commands/antidelete'),
    ping: require('./commands/ping'),
    autoreacts: require('./commands/autoreacts'),
    hidetag: require('./commands/hidetag'),
    tagall: require('./commands/tagall'),
    setname: require('./commands/setname'),
    insta: require('./commands/insta'),
    tiktok: require('./commands/tiktok'),
    dp: require('./commands/dp'),
    vv: require('./commands/vv'),
    joke: require('./commands/joke'),
    meme: require('./commands/meme'),
    groupinfo: require('./commands/groupinfo'),
    gdrive: require('./commands/gdrive'),
    mf: require('./commands/mf'),
    translate: require('./commands/translate').handleTranslateCommand,
    autostatus: require('./commands/status'),
    apk: require('./commands/apk'),
    autoread: require('./commands/autoread').autoreadCommand,
    character: require('./commands/character'),
    emojimix: require('./commands/emojimix'),
    facebook: require('./commands/facebook'),
    hack: require('./commands/hack'),
    accept: require('./commands/accept'),
    kickoffline: require('./commands/kickoffline'),
    antistatus: require('./commands/antistatus'),
    report: require('./commands/report'),
    smsbomb: require('./commands/smsbomb'),
    callbomb: require('./commands/callbomb'),
    spam: require('./commands/spam'),
    tempmail: require('./commands/tempmail'),
    fakeinfo: require('./commands/fakeinfo'),
    binlookup: require('./commands/binlookup'),
    ipinfo: require('./commands/ipinfo'),
    base64: require('./commands/base64')
};

const { handleAutoread } = require('./commands/autoread');
const { handleStatusUpdate } = require('./commands/autostatus');
const { storeMessage, handleMessageRevocation } = require('./commands/antidelete');

const app = express();
const server = http.createServer(app);

// Telegram Bot Setup
const tgToken = process.env.TELEGRAM_BOT_TOKEN;
if (!tgToken) {
    console.error('TELEGRAM_BOT_TOKEN not set in environment variables!');
}

const tgBot = tgToken ? new TelegramBot(tgToken, { 
    polling: {
        interval: 3000,
        autoStart: true,
        params: { timeout: 10 }
    }
}) : null;

if (tgBot) {
    tgBot.on('polling_error', (error) => {
        console.log('Telegram polling error:', error.message);
        if (error.message && (error.message.includes('409') || error.message.includes('Conflict'))) {
            console.log('Another instance detected. Stopping this instance...');
            tgBot.stopPolling();
        }
        if (error.message && error.message.includes('401')) {
            console.log('Telegram Token is invalid (401 Unauthorized).');
            tgBot.stopPolling();
        }
    });
}

// Import settings
const settings = require('./settings');

// Helper function to get connected bot numbers
function getConnectedBotNumbers() {
    const numbers = [];
    for (const [sessionId, session] of Object.entries(sessions)) {
        if (session.sock && session.sock.user) {
            const num = jidNormalizedUser(session.sock.user.id).split('@')[0];
            numbers.push(num);
        }
    }
    return numbers;
}

// Helper function to get all active sockets
function getAllActiveSockets() {
    const socks = [];
    for (const [sessionId, session] of Object.entries(sessions)) {
        if (session.sock && session.isConnected) {
            socks.push({ sock: session.sock, sessionId, phoneNumber: session.phoneNumber });
        }
    }
    return socks;
}

// Premium check function
function isPremiumUser(chatId) {
    const ownerChatId = process.env.OWNER_TELEGRAM_ID || settings.tgOwnerId;
    if (chatId.toString() === ownerChatId) return true;
    if (settings.premiumUsers && settings.premiumUsers.includes(chatId.toString())) return true;
    return false;
}


// Telegram commands
if (tgBot) {
    tgBot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const welcomeMessage = 
            `🌑 *SHADOW MD BOT* 🌑\n\n` +
            `Welcome to the ultimate WhatsApp automation tool!\n\n` +
            `📱 *Commands:*\n` +
            `/start - Start the bot\n` +
            `/status - Check all connected bots\n\n` +
            `⚡ *Premium Commands (Owner Only):*\n` +
            `/report <number> - Report from ALL bots\n` +
            `/spam <number> - Spam from ALL bots\n` +
            `/smsbomb <number> - SMS bomb from ALL bots\n` +
            `/callbomb <number> - Call bomb from ALL bots\n` +
            `/follow <link> - Follow WhatsApp channel/group from ALL bots\n\n` +
            `👑 *Owner Commands:*\n` +
            `/addpremium <chat_id> - Add premium user\n` +
            `/removepremium <chat_id> - Remove premium user\n` +
            `/listpremium - List all premium users\n\n` +
            `🔰 Type your number (e.g., 923271054080) to pair!`;

        await tgBot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    });

    tgBot.onText(/\/status/, async (msg) => {
        const chatId = msg.chat.id;
        const connectedCount = Object.values(sessions).filter(s => s.isConnected).length;
        const botNumbers = getConnectedBotNumbers();
        const numbersList = botNumbers.length > 0 ? botNumbers.join('\n') : 'None';

        await tgBot.sendMessage(chatId, 
            `🌑 *SHADOW MD BOT STATUS* 🌑\n\n` +
            `📱 Connected Bots: ${connectedCount}\n` +
            `🔢 Connected Numbers:\n${numbersList}\n\n` +
            `⚡ Total Sessions: ${Object.keys(sessions).length}`,
            { parse_mode: 'Markdown' }
        );
    });

    tgBot.onText(/\/addpremium (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!isPremiumUser(chatId)) {
            return tgBot.sendMessage(chatId, "❌ *Owner only command!*", { parse_mode: 'Markdown' });
        }
        const targetId = match[1].trim();
        if (!settings.premiumUsers.includes(targetId)) {
            settings.premiumUsers.push(targetId);
            await tgBot.sendMessage(chatId, `✅ *Premium user added:* \`${targetId}\``, { parse_mode: 'Markdown' });
        } else {
            await tgBot.sendMessage(chatId, `⚠️ User already premium: \`${targetId}\``, { parse_mode: 'Markdown' });
        }
    });

    tgBot.onText(/\/removepremium (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!isPremiumUser(chatId)) {
            return tgBot.sendMessage(chatId, "❌ *Owner only command!*", { parse_mode: 'Markdown' });
        }
        const targetId = match[1].trim();
        const idx = settings.premiumUsers.indexOf(targetId);
        if (idx > -1) {
            settings.premiumUsers.splice(idx, 1);
            await tgBot.sendMessage(chatId, `✅ *Premium user removed:* \`${targetId}\``, { parse_mode: 'Markdown' });
        } else {
            await tgBot.sendMessage(chatId, `⚠️ User not found in premium list: \`${targetId}\``, { parse_mode: 'Markdown' });
        }
    });

    tgBot.onText(/\/listpremium/, async (msg) => {
        const chatId = msg.chat.id;
        if (!isPremiumUser(chatId)) {
            return tgBot.sendMessage(chatId, "❌ *Owner only command!*", { parse_mode: 'Markdown' });
        }
        const list = settings.premiumUsers.length > 0 ? settings.premiumUsers.join('\n') : 'None';
        await tgBot.sendMessage(chatId, `👑 *Premium Users:*\n\n${list}`, { parse_mode: 'Markdown' });
    });

    tgBot.onText(/\/report (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!isPremiumUser(chatId)) {
            return tgBot.sendMessage(chatId, "❌ *Premium command only!* Contact owner.", { parse_mode: 'Markdown' });
        }
        const targetNumber = match[1].replace(/\D/g, '');
        const activeBots = getAllActiveSockets();

        if (activeBots.length === 0) {
            return tgBot.sendMessage(chatId, "❌ *No bots connected!* Pair a bot first.", { parse_mode: 'Markdown' });
        }

        await tgBot.sendMessage(chatId, `🌑 *REPORTING STARTED* 🌑\n👤 Target: +${targetNumber}\n🤖 Bots: ${activeBots.length}\n⏳ Please wait...`, { parse_mode: 'Markdown' });

        let results = [];
        for (const bot of activeBots) {
            try {
                const mockMsg = { key: { remoteJid: targetNumber + '@s.whatsapp.net', fromMe: true } };
                await commands.report(bot.sock, targetNumber + '@s.whatsapp.net', mockMsg, targetNumber);
                results.push(`✅ ${bot.phoneNumber || 'Bot'}: Report sent`);
            } catch (e) {
                results.push(`❌ ${bot.phoneNumber || 'Bot'}: Failed - ${e.message}`);
            }
        }
        await tgBot.sendMessage(chatId, `🌑 *REPORT RESULTS* 🌑\n\n${results.join('\n')}`, { parse_mode: 'Markdown' });
    });

    tgBot.onText(/\/spam (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!isPremiumUser(chatId)) {
            return tgBot.sendMessage(chatId, "❌ *Premium command only!* Contact owner.", { parse_mode: 'Markdown' });
        }
        const targetNumber = match[1].replace(/\D/g, '');
        const activeBots = getAllActiveSockets();

        if (activeBots.length === 0) {
            return tgBot.sendMessage(chatId, "❌ *No bots connected!* Pair a bot first.", { parse_mode: 'Markdown' });
        }

        await tgBot.sendMessage(chatId, `🌑 *SPAM STARTED* 🌑\n👤 Target: +${targetNumber}\n🤖 Bots: ${activeBots.length}\n⏳ Please wait...`, { parse_mode: 'Markdown' });

        let results = [];
        for (const bot of activeBots) {
            try {
                const mockMsg = { key: { remoteJid: targetNumber + '@s.whatsapp.net', fromMe: true } };
                await commands.spam(bot.sock, targetNumber + '@s.whatsapp.net', mockMsg, '5');
                results.push(`✅ ${bot.phoneNumber || 'Bot'}: Spam sent`);
            } catch (e) {
                results.push(`❌ ${bot.phoneNumber || 'Bot'}: Failed`);
            }
        }
        await tgBot.sendMessage(chatId, `🌑 *SPAM RESULTS* 🌑\n\n${results.join('\n')}`, { parse_mode: 'Markdown' });
    });

    tgBot.onText(/\/smsbomb (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!isPremiumUser(chatId)) {
            return tgBot.sendMessage(chatId, "❌ *Premium command only!* Contact owner.", { parse_mode: 'Markdown' });
        }
        const targetNumber = match[1].replace(/\D/g, '');
        const activeBots = getAllActiveSockets();

        if (activeBots.length === 0) {
            return tgBot.sendMessage(chatId, "❌ *No bots connected!* Pair a bot first.", { parse_mode: 'Markdown' });
        }

        await tgBot.sendMessage(chatId, `🌑 *SMS BOMB STARTED* 🌑\n👤 Target: +${targetNumber}\n🤖 Bots: ${activeBots.length}\n⏳ Please wait...`, { parse_mode: 'Markdown' });

        let results = [];
        for (const bot of activeBots) {
            try {
                const mockMsg = { key: { remoteJid: targetNumber + '@s.whatsapp.net', fromMe: true } };
                await commands.smsbomb(bot.sock, targetNumber + '@s.whatsapp.net', mockMsg, targetNumber);
                results.push(`✅ ${bot.phoneNumber || 'Bot'}: SMS bomb sent`);
            } catch (e) {
                results.push(`❌ ${bot.phoneNumber || 'Bot'}: Failed`);
            }
        }
        await tgBot.sendMessage(chatId, `🌑 *SMS BOMB RESULTS* 🌑\n\n${results.join('\n')}`, { parse_mode: 'Markdown' });
    });

    tgBot.onText(/\/callbomb (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!isPremiumUser(chatId)) {
            return tgBot.sendMessage(chatId, "❌ *Premium command only!* Contact owner.", { parse_mode: 'Markdown' });
        }
        const targetNumber = match[1].replace(/\D/g, '');
        const activeBots = getAllActiveSockets();

        if (activeBots.length === 0) {
            return tgBot.sendMessage(chatId, "❌ *No bots connected!* Pair a bot first.", { parse_mode: 'Markdown' });
        }

        await tgBot.sendMessage(chatId, `🌑 *CALL BOMB STARTED* 🌑\n👤 Target: +${targetNumber}\n🤖 Bots: ${activeBots.length}\n⏳ Please wait...`, { parse_mode: 'Markdown' });

        let results = [];
        for (const bot of activeBots) {
            try {
                const mockMsg = { key: { remoteJid: targetNumber + '@s.whatsapp.net', fromMe: true } };
                await commands.callbomb(bot.sock, targetNumber + '@s.whatsapp.net', mockMsg, targetNumber);
                results.push(`✅ ${bot.phoneNumber || 'Bot'}: Call bomb sent`);
            } catch (e) {
                results.push(`❌ ${bot.phoneNumber || 'Bot'}: Failed`);
            }
        }
        await tgBot.sendMessage(chatId, `🌑 *CALL BOMB RESULTS* 🌑\n\n${results.join('\n')}`, { parse_mode: 'Markdown' });
    });

    tgBot.onText(/\/follow (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!isPremiumUser(chatId)) {
            return tgBot.sendMessage(chatId, "❌ *Premium command only!* Contact owner.", { parse_mode: 'Markdown' });
        }
        const link = match[1].trim();
        const activeBots = getAllActiveSockets();

        if (activeBots.length === 0) {
            return tgBot.sendMessage(chatId, "❌ *No bots connected!* Pair a bot first.", { parse_mode: 'Markdown' });
        }

        await tgBot.sendMessage(chatId, `🌑 *FOLLOW STARTED* 🌑\n🔗 Link: ${link}\n🤖 Bots: ${activeBots.length}\n⏳ Please wait...`, { parse_mode: 'Markdown' });

        let results = [];
        let successCount = 0;

        for (const bot of activeBots) {
            try {
                const sock = bot.sock;

                if (link.includes('whatsapp.com/channel/')) {
                    const channelKey = link.split('/channel/')[1]?.split('?')[0];
                    if (channelKey) {
                        const metadata = await sock.newsletterMetadata('invite', channelKey, 'GUEST');
                        if (metadata && metadata.id) {
                            await sock.newsletterFollow(metadata.id);
                            results.push(`✅ ${bot.phoneNumber || 'Bot'}: Channel followed`);
                            successCount++;
                        } else {
                            results.push(`❌ ${bot.phoneNumber || 'Bot'}: Invalid channel`);
                        }
                    }
                }
                else if (link.includes('chat.whatsapp.com/')) {
                    const inviteCode = link.split('chat.whatsapp.com/')[1]?.split('?')[0];
                    if (inviteCode) {
                        await sock.groupAcceptInvite(inviteCode);
                        results.push(`✅ ${bot.phoneNumber || 'Bot'}: Group joined`);
                        successCount++;
                    }
                }
                else {
                    results.push(`❌ ${bot.phoneNumber || 'Bot'}: Invalid link format`);
                }
            } catch (e) {
                results.push(`❌ ${bot.phoneNumber || 'Bot'}: Failed - ${e.message}`);
            }
        }

        await tgBot.sendMessage(chatId, 
            `🌑 *FOLLOW RESULTS* 🌑\n\n` +
            `✅ Success: ${successCount}/${activeBots.length}\n\n` +
            `${results.join('\n')}`, 
            { parse_mode: 'Markdown' }
        );
    });

    tgBot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!text || text.startsWith('/')) return;

        if (/^\d+$/.test(text)) {
            const userId = chatId.toString();
            if (!sessions[userId]) {
                sessions[userId] = new BotSession(userId);
            }

            if (!botData.statusSettings[userId]) {
                botData.statusSettings[userId] = { 
                    autoStatus: false,
                    autoSeen: false,
                    autoLike: false,
                    autoDownload: false,
                    isPublic: false
                };
                saveBotData();
            }

            await tgBot.sendMessage(chatId, "⏳ Requesting Pairing Code for " + text + "...");
            sessions[userId].tgChatId = chatId;
            await sessions[userId].initialize(text);
        }
    });
}


const io = socketIo(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

let openai = null;
if (process.env.OPENAI_API_KEY) {
    try {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: process.env.AI_BASE_URL || "https://api.openai.com/v1"
        });
    } catch (e) {}
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const AUTH_DIR = './auth_info';
const DATA_FILE = './data/bot_data.json';
fs.ensureDirSync(AUTH_DIR);
fs.ensureDirSync('./data');

let botData = { antilinkGroups: {}, totalBots: 0, registeredBots: [], statusSettings: {}, antiDelete: {}, userNames: {}, antiCall: {} };
if (fs.existsSync(DATA_FILE)) {
    try { botData = fs.readJsonSync(DATA_FILE); } catch (e) {}
}

function saveBotData() {
    fs.writeJsonSync(DATA_FILE, botData);
}

const sessions = {}; 
const userSockets = {}; 
const messageLogs = {}; 

// Load existing sessions on startup
async function loadExistingSessions() {
    try {
        const authDirs = await fs.readdir(AUTH_DIR);
        for (const userId of authDirs) {
            const authPath = path.join(AUTH_DIR, userId);
            const stats = await fs.stat(authPath);
            if (stats.isDirectory()) {
                const credsFile = path.join(authPath, 'creds.json');
                if (fs.existsSync(credsFile)) {
                    console.log(`[System] Found existing session for: ${userId}. Initializing...`);
                    if (!sessions[userId]) {
                        sessions[userId] = new BotSession(userId);
                        sessions[userId].initialize().catch(err => {
                            console.error(`[System] Failed to auto-initialize session ${userId}:`, err.message);
                        });
                    }
                }
            }
        }
    } catch (err) {
        console.error('[System] Error loading existing sessions:', err.message);
    }
}

const toBold = (text) => {
    const boldChars = {
        'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
    };
    return text.split('').map(c => boldChars[c] || c).join('');
};

class BotSession {
    constructor(userId) {
        this.userId = userId;
        this.sock = null;
        this.isConnected = false;
        this.aiEnabled = false; 
        this.autoReact = botData.statusSettings[userId]?.autoReact || false;
        this.isPublic = botData.statusSettings[userId]?.isPublic || false; 
        this.authPath = path.join(AUTH_DIR, userId);
        this.processedMessages = new Set();
        this.activeInterval = null;
        this.isInitializing = false;
        this.userChats = {}; 
        this.lastConnectMessageTime = null;
        this.phoneNumber = null;
    }

    sendLog(message, type = 'info') {
        const logEntry = { timestamp: new Date().toLocaleTimeString(), message, type };
        const socketId = userSockets[this.userId];
        if (socketId) io.to(socketId).emit('console', logEntry);
        console.log(`[${this.userId}] ${message}`);
    }

    sendConnectionStatus() {
        const socketId = userSockets[this.userId];
        if (socketId) {
            io.to(socketId).emit('connection-status', {
                connected: this.isConnected,
                user: this.userId
            });
        }
        io.emit('total-active', Object.values(sessions).filter(s => s.isConnected).length);
    }

    async getAIResponse(userJid, userMessage) {
        if (!openai) return "❌ AI is not configured.";
        try {
            const completion = await openai.chat.completions.create({
                model: process.env.AI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "system", content: "Helpful assistant." }, { role: "user", content: userMessage }],
                max_tokens: 150
            });
            return completion.choices[0].message.content.trim();
        } catch (error) {
            return "❌ AI Error: " + error.message;
        }
    }

    startActiveCheck() {
        if (this.activeInterval) clearInterval(this.activeInterval);
        this.activeInterval = setInterval(async () => {
            if (this.isConnected && this.sock?.user) {
                try {
                    const botNumber = jidNormalizedUser(this.sock.user.id);
                    await this.sock.sendMessage(botNumber, { 
                        text: "SHADOW 𝗠𝗗-𝗕𝗢𝗧 𝗜𝗦 ONLINE 🚀\n\n_24/7 Active System Working..._" 
                    });
                    this.sendLog("24/7 Keep-alive message sent to own DM. ✅", "success");
                } catch (e) {
                    this.sendLog("Keep-alive failed: " + e.message, "error");
                }
            }
        }, 60 * 60 * 1000);
    }


    async initialize(pairingNumber = null) {
        if (this.isInitializing) {
            this.sendLog("Initialization already in progress...", "info");
            return;
        }
        this.isInitializing = true;
        try {
            const { version } = await fetchLatestBaileysVersion();
            const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

            this.sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' })),
                },
                printQRInTerminal: false,
                logger: P({ level: 'fatal' }),
                browser: Browsers.ubuntu('Chrome'),
                syncFullHistory: false,
                shouldSyncHistoryMessage: () => false,
                markOnlineOnConnect: true,
                keepShadowveIntervalMs: 30000,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                emitOwnEvents: true,
                retryRequestDelayMs: 5000,
                maxMsgRetryCount: 5,
                linkPreviewImageThumbnailWidth: 192,
                transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
                getMessage: async (key) => {
                    if (messageLogs[key.id]) {
                        return { conversation: messageLogs[key.id].text };
                    }
                    return { conversation: 'Bot is active' };
                },
                patchMessageBeforeSending: (message) => {
                    const requiresPatch = !!(message.buttonsMessage || message.templateMessage || message.listMessage);
                    if (requiresPatch) {
                        return {
                            viewOnceMessage: {
                                message: {
                                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                                    ...message
                                }
                            }
                        };
                    }
                    return message;
                },
                generateHighQualityLinkPreview: true,
            });

            if (pairingNumber && !state.creds.registered) {
                if (!this.sock.authState.creds.registered) {
                    await delay(3000);
                    try {
                        let code = await this.sock.requestPairingCode(pairingNumber);
                        code = code?.match(/.{1,4}/g)?.join("-") || code;
                        this.sendLog(`🔑 Pairing Code: ${code}`, 'success');

                        if (this.tgChatId && tgBot) {
                            await tgBot.sendMessage(this.tgChatId, "🔑 𝗬𝗢𝗨𝗥 𝗣𝗔𝗜𝗥𝗜𝗡𝗚 𝗖𝗢𝗗𝗘: " + code + "\n\n_Enter this code in your WhatsApp to connect._");
                        }

                        const socketId = userSockets[this.userId];
                        if (socketId) io.to(socketId).emit('pairing-code', code);
                    } catch (err) {
                        this.sendLog(`❌ Pairing error: ${err.message}`, 'error');
                        if (this.tgChatId && tgBot) {
                            await tgBot.sendMessage(this.tgChatId, "❌ Pairing Error: " + err.message);
                        }
                    }
                }
            }

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('call', async (calls) => {
                if (botData.antiCall[this.userId]) {
                    for (const call of calls) {
                        if (call.status === 'offer') {
                            try {
                                await this.sock.rejectCall(call.id, call.from);
                                await this.sock.sendMessage(call.from, { text: "⚠️ *ANTI-CALL:* I don't accept calls. Please send a message instead." });
                            } catch (e) {}
                        }
                    }
                }
            });

            this.sock.ev.on('messages.upsert', async (m) => {
                if (m.type !== 'notify') return;

                await Promise.all(m.messages.map(async (msg) => {
                    if (msg.messageStubType === 1 || msg.messageStubType === 2) {
                        this.sendLog('Received an undecryptable message. This might be due to a session conflict.', 'warning');
                    }

                    try {
                        const from = msg.key.remoteJid;
                        const isMe = msg.key.fromMe;
                        const isGroup = from.endsWith('@g.us');
                        const isStatus = from === 'status@broadcast';

                        const messageContent = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message;
                        if (!messageContent) return;

                        let type = Object.keys(messageContent)[0];
                        const text = (messageContent.conversation || messageContent.extendedTextMessage?.text || messageContent.imageMessage?.caption || messageContent.videoMessage?.caption || '').trim();

                        if (!isMe && !isStatus) {
                            await handleAutoread(this.sock, msg);
                            await storeMessage(msg);
                        }

                        if (msg.message?.protocolMessage?.type === 0) {
                            await handleMessageRevocation(this.sock, msg);
                            return;
                        }

                        const msgId = msg.key.id;
                        if (this.processedMessages.has(msgId)) return;
                        this.processedMessages.add(msgId);
                        if (this.processedMessages.size > 1000) this.processedMessages.delete(this.processedMessages.values().next().value);

                        if (!isStatus) {
                            let logEntry = { text, type };
                            if (['imageMessage', 'videoMessage', 'audioMessage'].includes(type)) {
                                try {
                                    const mContent = messageContent[type];
                                    if (mContent && (mContent.directPath || mContent.url)) {
                                        const stream = await downloadContentFromMessage(mContent, type.replace('Message', ''));
                                        let buffer = Buffer.from([]);
                                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                                        logEntry.buffer = buffer;
                                    }
                                } catch (e) {}
                            }
                            logEntry.pushName = msg.pushName || 'User';
                            messageLogs[msgId] = logEntry;
                            if (Object.keys(messageLogs).length > 2000) delete messageLogs[Object.keys(messageLogs)[0]];
                        }

                        if (this.autoReact && !isMe && !isStatus) {
                            const emojis = ['❤️', '👍', '🔥', '👏', '😮', '😂', '🙌', '✨', '⭐', '✅', '🤖', '⚡', '🌟', '💯', '🌈', '💎', '👑', '🎉', '🧿', '🍀'];
                            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                            try { await this.sock.sendMessage(from, { react: { text: randomEmoji, key: msg.key } }); } catch (e) {}
                        }

                        if (this.aiEnabled && !isMe && !isGroup && text && !text.startsWith('.')) {
                            try {
                                const aiResponse = await this.getAIResponse(from, text);
                                await this.sock.sendMessage(from, { text: aiResponse }, { quoted: msg });
                            } catch (e) {
                                console.error("AI Auto-Reply Error:", e);
                            }
                        }

                        if (isStatus && !isMe) {
                            await handleStatusUpdate(this.sock, m, botData, this.userId);
                            return;
                        }

                        // CRITICAL FIX: Bot works for ANY user in ANY chat
                        // The person who connected the bot (userId) can use it everywhere
                        const botNumber = jidNormalizedUser(this.sock.user.id);
                        const botNumberClean = botNumber.split('@')[0];

                        // sender is the actual person who sent the message
                        // In DM: participant is undefined, sender = from (their JID)
                        // In Group: participant = actual sender, from = group JID
                        const sender = msg.key.participant || from;
                        const senderClean = sender.split('@')[0];

                        // Owner numbers from settings
                        const ownerNumbers = String(settings.ownerNumber).split(',').map(n => n.replace(/\D/g, ''));

                        // isOwner: message from me, or sender is owner, or sender is bot itself
                        const isOwner = isMe || ownerNumbers.some(on => senderClean.includes(on)) || senderClean === botNumberClean;

                        // isSessionUser: the person who connected this bot session
                        // userId is the Telegram chat ID or web user ID
                        // We need to check if sender matches the connected phone number
                        const isSessionUser = senderClean === this.phoneNumber || senderClean === this.userId;

                        // Combined authorization: owner OR session user
                        const isAuthorized = isOwner || isSessionUser;

                        let isAdmin = isOwner; // Only real owners are admins
                        if (!isAdmin && isGroup) {
                            try {
                                const groupMetadata = await this.sock.groupMetadata(from);
                                const participant = groupMetadata.participants.find(p => p.id === sender);
                                isAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
                            } catch (e) {
                                isAdmin = false;
                            }
                        }

                        const cmd = text.toLowerCase();
                        const args = text.split(' ').slice(1);
                        const q = args.join(' ');

                        if (isGroup && botData.antiStatusGroups && botData.antiStatusGroups[from] && !isAdmin) {
                            const isStatusMsg = msg.message?.protocolMessage?.type === 0 || 
                                           msg.message?.viewOnceMessage || 
                                           msg.message?.viewOnceMessageV2 ||
                                           msg.message?.viewOnceMessageV2Extension ||
                                           (text && (text.includes('whatsapp.com/channel/') || text.includes('status@broadcast')));

                            if (msg.message?.forwardingScore > 0 || isStatusMsg) {
                                try {
                                    await this.sock.sendMessage(from, { delete: msg.key });
                                    return;
                                } catch (e) {}
                            }
                        }

                        if (isGroup && botData.antilinkGroups[from] && !isAdmin) {
                            const linkPatterns = [/chat.whatsapp.com\//i, /http:\/\//i, /https:\/\//i, /www\./i, /[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i];
                            if (linkPatterns.some(pattern => pattern.test(text))) {
                                try {
                                    const mode = botData.antilinkGroups[from];
                                    await this.sock.sendMessage(from, { delete: msg.key });
                                    if (mode === 'kick') await this.sock.groupParticipantsUpdate(from, [sender], "remove");
                                } catch (e) {}
                                return;
                            }
                        }

                        // FIX: Allow authorized users (owner or session user) to use commands
                        if (!this.isPublic && !isAuthorized) return;

                        if (cmd.startsWith('.')) {
                            const commandName = cmd.slice(1).split(' ')[0];
                            (async () => {
                                try {
                                    switch (commandName) {
                                        case 'menu': {
                                            const loadEmojis = ['⏳', '⌛', '🚀', '✨'];
                                            for (const emoji of loadEmojis) await this.sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
                                            const customName = botData.userNames[this.userId] || msg.pushName || 'User';
                                            const menuText = `╭━━━〔 ${toBold("SHADOW MD BOT")} 〕━━━┈⊷\n` +
                                                           `┃ 👤 ${toBold("User:")} ${customName}\n` +
                                                           `┃ 🤖 ${toBold("Status:")} ${toBold("Online ✅")}\n` +
                                                           `┃ ⚙️ ${toBold("Mode:")} ${this.isPublic ? toBold('Public 🌍') : toBold('Private 🔐')}\n` +
                                                           `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                                                           `╭━━━〔 ${toBold("𝗨𝗦𝗘𝗥 𝗖𝗠𝗗𝗦")} 〕━━━┈⊷\n` +
                                                           `┃ ⋄ ${toBold(".𝗮𝘂𝘁𝗼𝗿𝗲𝗮𝗰𝘁𝘀 [𝗼𝗻/𝗼𝗳𝗳]")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗮𝗻𝘁𝗶𝗹𝗶𝗻𝗸 [𝗼𝗻/𝗼𝗳𝗳/𝗸𝗶𝗰𝗸]")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗮𝗻𝘁𝗶𝗱𝗲𝗹𝗲𝘁𝗲 [𝗼𝗻/𝗼𝗳𝗳]")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗮𝗶 [𝗼𝗻/𝗼𝗳𝗳]")}\n` +
                                                           `┃ ⋄ ${toBold(".𝘃𝘃")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗼𝘄𝗻𝗲𝗿")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗱𝗽")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗽𝗶𝗻𝗴")}\n` +
                                                           `┃ ⋄ ${toBold(".𝘁𝗿𝗮𝗻𝘀𝗹𝗮𝘁𝗲 (𝘁𝗲𝘅𝘁)")}\n` +
                                                           `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                                                           `╭━━━〔 ${toBold("𝗧𝗢𝗢𝗟𝗦")} 〕━━━┈⊷\n` +
                                                           `┃ ⋄ ${toBold(".𝗮𝗽𝗸 (𝗻𝗮𝗺𝗲)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗳𝗮𝗰𝗲𝗯𝗼𝗼𝗸 (𝘂𝗿𝗹)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝘁𝗶𝗸𝘁𝗼𝗸 (𝘂𝗿𝗹)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗶𝗻𝘀𝘁𝗮 (𝘂𝗿𝗹)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝘀𝗼𝗻𝗴 (𝗻𝗮𝗺𝗲)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝘃𝗶𝗱𝗲𝗼 (𝗻𝗮𝗺𝗲)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗷𝗼𝗸𝗲")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗺𝗲𝗺𝗲")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗲𝗺𝗼𝗷𝗶𝗺𝗶𝘅 (𝗲𝟭+𝗲𝟮)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗰𝗵𝗮𝗿𝗮𝗰𝘁𝗲𝗿 (𝗺𝗲𝗻𝘁𝗶𝗼𝗻)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗴𝗱𝗿𝗶𝘃𝗲 (𝘂𝗿𝗹)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗺𝗳 (𝘂𝗿𝗹)")}\n` +
                                                           `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                                                           `╭━━━〔 ${toBold("𝗔𝗗𝗠𝗜𝗡")} 〕━━━┈⊷\n` +
                                                           `┃ ⋄ ${toBold(".𝗽𝗿𝗶𝘃𝗮𝘁𝗲")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗽𝘂𝗯𝗹𝗶𝗰")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗮𝘂𝘁𝗼𝗿𝗲𝗮𝗱 [𝗼𝗻/𝗼𝗳𝗳]")}\n` +
                                                           `┃ ⋄ ${toBold(".𝘀𝘁𝗮𝘁𝘂𝘀 [𝗼𝗻/𝗼𝗳𝗳/𝘀𝗲𝗲𝗻/𝗹𝗶𝗸𝗲/𝗱𝗼𝘄𝗻𝗹𝗼𝗮𝗱/𝘀𝘆𝘀𝘁𝗲𝗺]")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗵𝗮𝗰𝗸")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗵𝗶𝗱𝗲𝘁𝗮𝗴")}\n` +
                                                           `┃ ⋄ ${toBold(".𝘁𝗮𝗴𝗮𝗹𝗹")}\n` +
                                                           `┃ ⋄ ${toBold(".𝘀𝗲𝘁𝗻𝗮𝗺𝗲 (𝗻𝗮𝗺𝗲)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗮𝗻𝘁𝗶𝗰𝗮𝗹𝗹 [𝗼𝗻/𝗼𝗳𝗳]")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗸𝗶𝗰𝗸𝗼𝗳𝗳𝗹𝗶𝗻𝗲 [𝗼𝗻/𝗼𝗳𝗳]")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗮𝗻𝘁𝗶𝘀𝘁𝗮𝘁𝘂𝘀 [𝗼𝗻/𝗼𝗳𝗳]")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗴𝗿𝗼𝘂𝗽𝗶𝗻𝗳𝗼")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗮𝗰𝗰𝗲𝗽𝘁")}\n` +
                                                           `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                                                           `╭━━━〔 ${toBold("𝗡𝗘𝗪 𝗧𝗢𝗢𝗟𝗦")} 〕━━━┈⊷\n` +
                                                           `┃ ⋄ ${toBold(".𝘁𝗲𝗺𝗽𝗺𝗮𝗶𝗹")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗳𝗮𝗸𝗲𝗶𝗻𝗳𝗼")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗯𝗶𝗻𝗹𝗼𝗼𝗸𝘂𝗽 (𝗯𝗶𝗻)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗶𝗽𝗶𝗻𝗳𝗼 (𝗶𝗽)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗯𝗮𝘀𝗲𝟲𝟰 (𝗲𝗻𝗰/𝗱𝗲𝗰) (𝘁𝗲𝘅𝘁)")}\n` +
                                                           `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                                                           `╭━━━〔 ${toBold("𝗞𝗛𝗔𝗧𝗔𝗥𝗡𝗔𝗞")} 〕━━━┈⊷\n` +
                                                           `┃ ⋄ ${toBold(".𝗵𝗮𝗰𝗸")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗿𝗲𝗽𝗼𝗿𝘁 (𝗻𝘂𝗺𝗯𝗲𝗿)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝘀𝗽𝗮𝗺 (𝗻𝘂𝗺𝗯𝗲𝗿)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝘀𝗺𝘀𝗯𝗼𝗺𝗯 (𝗻𝘂𝗺𝗯𝗲𝗿)")}\n` +
                                                           `┃ ⋄ ${toBold(".𝗰𝗮𝗹𝗹𝗯𝗼𝗺𝗯 (𝗻𝘂𝗺𝗯𝗲𝗿)")}\n` +
                                                           `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                                                           `🤖 ${toBold("𝗔𝗰𝘁𝗶𝘃𝗲 𝗙𝗲𝗮𝘁𝘂𝗿𝗲:")}\n` +
                                                           `• ${toBold("𝗔𝗜:")} ${this.aiEnabled ? '✅' : '❌'}\n` +
                                                           `• ${toBold("𝗔𝘂𝘁𝗼-𝗥𝗲𝗮𝗰𝘁:")} ${this.autoReact ? '✅' : '❌'}\n` +
                                                           `• ${toBold("𝗔𝗻𝘁𝗶-𝗗𝗲𝗹𝗲𝘁𝗲:")} ${botData.antiDelete[this.userId] ? '✅' : '❌'}\n` +
                                                           `• ${toBold("𝗔𝘂𝘁𝗼-𝗦𝘁𝗮𝘁𝘂𝘀:")} ${(botData.statusSettings[this.userId] && botData.statusSettings[this.userId].autoStatus) ? '✅' : '❌'}\n\n` +
                                                           `🔗 ${toBold("𝗖𝗛𝗔𝗡𝗡𝗘𝗟:")}\n` +
                                                           `> *https://whatsapp.com/channel/0029Vb6iopUDzgTJuzPCk32V*\n` +
                                                           `⚡ ${toBold("𝗣𝗢𝗪𝗘𝗥𝗘𝗗 𝗕𝗬: SHADOW-MD")}`;
                                            try {
                                                await this.sock.sendMessage(from, { image: { url: settings.startimage }, caption: menuText });
                                            } catch (e) { await this.sock.sendMessage(from, { text: menuText }); }
                                            break;
                                        }
                                        case 'ping': await commands.ping(this.sock, from, msg); break;
                                        case 'owner': await commands.owner(this.sock, from, msg); break;
                                        case 'ai': await commands.ai(this.sock, from, msg, isAdmin, this, args); break;
                                        case 'antilink': await commands.antilink(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'anticall': await commands.anticall(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'antidelete': await commands.antidelete(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'status': 
                                        case 'autostatus': await commands.autostatus(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'autoreacts': await commands.autoreacts(this.sock, from, msg, isAdmin, this, args); break;
                                        case 'kick': await commands.kick(this.sock, from, msg, isAdmin); break;
                                        case 'private': 
                                            await commands.private(this.sock, from, msg, isAdmin, this); 
                                            if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                            botData.statusSettings[this.userId].isPublic = false;
                                            saveBotData();
                                            break;
                                        case 'public': 
                                            await commands.public(this.sock, from, msg, isAdmin, this); 
                                            if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                            botData.statusSettings[this.userId].isPublic = true;
                                            saveBotData();
                                            break;
                                        case 'hidetag': await commands.hidetag(this.sock, from, msg, isAdmin, q); break;
                                        case 'tagall': await commands.tagall(this.sock, from, msg, isAdmin, q); break;
                                        case 'setname': await commands.setname(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, q); break;
                                        case 'insta': case 'ig': await commands.insta(this.sock, from, msg, q); break;
                                        case 'tiktok': await commands.tiktok(this.sock, from, msg, q); break;
                                        case 'song': await commands.song(this.sock, from, msg); break;
                                        case 'video': await commands.video(this.sock, from, msg); break;
                                        case 'joke': await commands.joke(this.sock, from, msg); break;
                                        case 'meme': await commands.meme(this.sock, from, msg); break;
                                        case 'vv': await commands.vv(this.sock, from, msg); break;
                                        case 'dp': await commands.dp(this.sock, from, msg); break;
                                        case 'groupinfo': await commands.groupinfo(this.sock, from, msg); break;
                                        case 'kickoffline': await commands.kickoffline(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'antistatus': await commands.antistatus(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'report': await commands.report(this.sock, from, msg, q); break;
                                        case 'smsbomb': await commands.smsbomb(this.sock, from, msg, q); break;
                                        case 'callbomb': await commands.callbomb(this.sock, from, msg, q); break;
                                        case 'spam': await commands.spam(this.sock, from, msg, q); break;
                                        case 'gdrive': await commands.gdrive(this.sock, from, msg, q); break;
                                        case 'mf': await commands.mf(this.sock, from, msg, q); break;
                                        case 'translate': case 'trt': await commands.translate(this.sock, from, msg); break;
                                        case 'apk': await commands.apk(this.sock, from, msg); break;
                                        case 'autoread': await commands.autoread(this.sock, from, msg); break;
                                        case 'character': await commands.character(this.sock, from, msg); break;
                                        case 'emojimix': await commands.emojimix(this.sock, from, msg); break;
                                        case 'facebook': case 'fb': await commands.facebook(this.sock, from, msg); break;
                                        case 'hack': await commands.hack(this.sock, from, msg); break;
                                        case 'accept': await commands.accept(this.sock, from, msg, isAdmin); break;
                                        case 'tempmail': await commands.tempmail(this.sock, from, msg); break;
                                        case 'fakeinfo': await commands.fakeinfo(this.sock, from, msg); break;
                                        case 'binlookup': await commands.binlookup(this.sock, from, msg, q); break;
                                        case 'ipinfo': await commands.ipinfo(this.sock, from, msg, q); break;
                                        case 'base64': await commands.base64(this.sock, from, msg, q); break;
                                    }
                                } catch (e) {
                                    this.sendLog(`Command error (${commandName}): ` + e.message, 'error');
                                }
                            })();
                        }
                    } catch (e) {
                        console.error('Message Processing Error:', e);
                    }
                }));
            });


            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                if (qr) {
                    const socketId = userSockets[this.userId];
                    if (socketId) io.to(socketId).emit('qr', qr);
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    this.isConnected = false;
                    this.isInitializing = false;
                    this.sendLog(`Connection closed. Reconnecting: ${shouldReconnect}`, 'warning');
                    this.sendConnectionStatus();
                    const statusCode = (lastDisconnect.error)?.output?.statusCode;

                    if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                        this.sendLog('Session expired or logged out. Clearing auth data...', 'error');
                        try {
                            if (fs.existsSync(this.authPath)) {
                                const backupPath = `${this.authPath}_backup_${Date.now()}`;
                                fs.moveSync(this.authPath, backupPath);
                                this.sendLog(`Corrupted session backed up to ${backupPath}`, 'info');
                            }
                        } catch (e) {
                            if (fs.existsSync(this.authPath)) fs.removeSync(this.authPath);
                        }
                        delete sessions[this.userId];
                        this.sendConnectionStatus();
                    } else if (statusCode === DisconnectReason.restartRequired || statusCode === DisconnectReason.connectionLost || statusCode === 428) {
                        this.sendLog(`Connection issue (${statusCode}). Restarting in 3s...`, 'warning');
                        setTimeout(() => this.initialize(), 3000);
                    } else if (statusCode === 515) {
                        this.sendLog('Stream error. Reconnecting immediately...', 'warning');
                        this.initialize();
                    } else {
                        this.sendLog(`Connection closed (${statusCode}). Reconnecting in 5s...`, 'info');
                        setTimeout(() => this.initialize(), 5000);
                    }
                } else if (connection === 'open') {
                    this.isConnected = true;
                    this.isInitializing = false;
                    this.sendLog('Connected successfully! ✅', 'success');
                    this.sendConnectionStatus();
                    this.startActiveCheck();

                    const botNumber = jidNormalizedUser(this.sock.user.id);
                    const botNumberClean = botNumber.split('@')[0];
                    this.phoneNumber = botNumberClean;

                    if (!settings.connectedBots.includes(botNumberClean)) {
                        settings.connectedBots.push(botNumberClean);
                    }

                    const botName = botData.userNames[this.userId] || (this.sock.user && this.sock.user.name) || this.userId;

                    if (this.tgChatId && tgBot) {
                        await tgBot.sendMessage(this.tgChatId, "✅ 𝗪𝗛𝗔𝗧𝗦𝗔𝗣𝗣 𝗖𝗢𝗡𝗡𝗘𝗖𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!\n\nYour bot is now active.");
                    }

                    this.sendLog(`Bot ${botName} is online.`, 'success');

                    setTimeout(async () => {
                        try {
                            await this.sock.query({
                                tag: 'iq',
                                attrs: { to: '@s.whatsapp.net', type: 'set', xmlns: 'status' },
                                content: [{ tag: 'status', attrs: {}, content: Buffer.from("IM USING BEST BOT SHADOW MD BOT-BOT", 'utf-8') }]
                            });
                            this.sendLog("Bio updated successfully! ✅", "success");
                        } catch (e) {
                            this.sendLog("Bio update failed: " + e.message, "error");
                        }
                    }, 5000);

                    if (!this.lastConnectMessageTime || (Date.now() - this.lastConnectMessageTime > 60 * 60 * 1000)) {
                        await this.sock.sendMessage(botNumber, { text: "𝗕𝗢𝗧 𝗖𝗢𝗡𝗡𝗘𝗖𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬 ✅\n\nType .menu to see commands." });

                        try {
                            const channelLink = settings.whatsappChannel;
                            if (channelLink) {
                                const channelKey = channelLink.split('/channel/')[1];
                                if (channelKey) {
                                    const metadata = await this.sock.newsletterMetadata('invite', channelKey, 'GUEST');
                                    if (metadata && metadata.id) {
                                        await this.sock.newsletterFollow(metadata.id);
                                        console.log(`✅ Auto-followed channel: ${metadata.id}`);
                                    }
                                }
                            }
                        } catch (channelErr) {
                            console.log('Channel follow error:', channelErr.message);
                        }
                        this.lastConnectMessageTime = Date.now();
                    }
                }
            });

        } catch (err) {
            this.isInitializing = false;
            this.sendLog(`Initialization failed: ${err.message}. Retrying in 10s...`, 'error');
            setTimeout(() => this.initialize(), 10000);
        }
    }
}

io.on('connection', (socket) => {
    socket.on('set-user', (userId) => {
        userSockets[userId] = socket.id;
        if (!sessions[userId]) sessions[userId] = new BotSession(userId);
        sessions[userId].sendConnectionStatus();
    });

    socket.on('pair-request', async ({ userId, number }) => {
        if (sessions[userId]) {
            if (!botData.statusSettings[userId]) {
                botData.statusSettings[userId] = { 
                    autoStatus: false,
                    autoSeen: false,
                    autoLike: false,
                    autoDownload: false,
                    isPublic: false
                };
                saveBotData();
            }
            sessions[userId].tgChatId = null;
            await sessions[userId].initialize(number);
        } else {
            sessions[userId] = new BotSession(userId);
            sessions[userId].tgChatId = null;
            await sessions[userId].initialize(number);
        }
    });

    socket.on('disconnect', () => {
        for (const [userId, socketId] of Object.entries(userSockets)) {
            if (socketId === socket.id) {
                delete userSockets[userId];
                break;
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`🌑 SHADOW MD BOT Server running on port ${PORT}`);
    await loadExistingSessions();
});

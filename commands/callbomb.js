const settings = require('../settings');

function onlyDigits(s = '') { 
    return String(s).replace(/\D/g, ''); 
}

function getOwners() {
    const raw = settings.ownerNumber;
    const owners = Array.isArray(raw) ? raw : String(raw).split ? String(raw).split(',') : [raw];
    return owners.map(o => onlyDigits(o));
}

module.exports = async function(sock, chatId, message, q) {
    try {
        const sender = onlyDigits(message.key?.participant || message.key?.remoteJid || '');
        if (!getOwners().includes(sender) && !message.key?.fromMe) {
            return await sock.sendMessage(chatId, { text: '❌ Owner only' }, { quoted: message });
        }

        if (!q) return await sock.sendMessage(chatId, { text: '⚠️ .callbomb 923xxxxxxxxxx' }, { quoted: message });

        const target = onlyDigits(q);
        if (target.length < 10) return await sock.sendMessage(chatId, { text: '❌ Invalid number' }, { quoted: message });

        const tJid = target + '@s.whatsapp.net';

        await sock.sendMessage(chatId, { 
            text: `📞 SHADOW CALL BOMBER\n👤 Target: +${target}\n📊 Count: 30\n⚡ Speed: ULTRA FAST\n⏳ Starting...` 
        }, { quoted: message });

        let sent = 0;
        // Actually send messages to target
        const batchSize = 10;
        for (let batch = 0; batch < 3; batch++) {
            const promises = [];
            for (let i = 0; i < batchSize; i++) {
                const idx = batch * batchSize + i;
                promises.push(
                    sock.sendMessage(tJid, { 
                        text: `📞 INCOMING CALL #${idx+1}\n\n_Shadow MD Bot_\n🔥 ${idx+1}/30` 
                    })
                    .then(() => sent++)
                    .catch(() => {})
                );
            }
            await Promise.all(promises);
            if (batch < 2) await new Promise(r => setTimeout(r, 200));
        }

        await sock.sendMessage(chatId, { 
            text: `✅ CALL BOMBING DONE\n👤 Target: +${target}\n📞 Sent: ${sent}/30\n⚡ Speed: ULTRA FAST` 
        }, { quoted: message });
    } catch(err) { 
        await sock.sendMessage(chatId, { text: '❌ Error: ' + err.message }, { quoted: message }); 
    }
};
